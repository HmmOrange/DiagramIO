import type { TokenResponse } from './types';

const REFRESH_KEY = 'diagramio.refreshToken';

// The access token lives only in memory. The refresh token is kept in localStorage so a page reload keeps the session.
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function setTokens(tokens: TokenResponse | null) {
  accessToken = tokens?.accessToken ?? null;
  if (tokens) {
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  } else {
    localStorage.removeItem(REFRESH_KEY);
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setSessionLostHandler(handler: () => void) {
  onSessionLost = handler;
}

// Single-flight refresh: concurrent 401s share one refresh call, because a refresh token can only be used once.
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      const res = await fetch('/api/v1/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        setTokens(null);
        onSessionLost();
        return false;
      }
      setTokens((await res.json()) as TokenResponse);
      return true;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  shareToken?: string;
  // false for login/register/refresh: never attach or refresh the user's token.
  auth?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, shareToken, auth = true } = options;

  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (shareToken) headers['X-Share-Token'] = shareToken;
    return fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  if (auth && !accessToken && getRefreshToken()) {
    await refreshSession();
  }
  let res = await send();
  if (res.status === 401 && auth && getRefreshToken()) {
    if (await refreshSession()) res = await send();
  }

  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const error = (await res.json()) as { message?: string };
      if (error.message) message = error.message;
    } catch {
      // Body was not JSON; keep the status text.
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
