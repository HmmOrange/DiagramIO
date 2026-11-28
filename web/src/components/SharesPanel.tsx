import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Share, ShareRole } from '../api/types';

function shareLink(share: Share): string {
  return `${window.location.origin}/s/${share.shareToken}`;
}

export default function SharesPanel({ diagramId }: { diagramId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [role, setRole] = useState<ShareRole>('view');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShares(await api<Share[]>(`/diagrams/${diagramId}/shares`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [diagramId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const create = () => run(() => api(`/diagrams/${diagramId}/shares`, { method: 'POST', body: { role } }));

  const changeRole = (share: Share, newRole: ShareRole) =>
    run(() => api(`/diagrams/${diagramId}/shares/${share.id}`, { method: 'PATCH', body: { role: newRole } }));

  const revoke = (share: Share) => {
    if (!confirm('Revoke this link? Anyone using it loses access immediately.')) return;
    run(() => api(`/diagrams/${diagramId}/shares/${share.id}`, { method: 'DELETE' }));
  };

  return (
    <section>
      <h2>Sharing</h2>
      <div className="row">
        <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
          <option value="view">Can view</option>
          <option value="edit">Can edit</option>
        </select>
        <button type="button" onClick={create}>
          Create link
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {shares.length === 0 ? (
        <p>No links.</p>
      ) : (
        <ul className="list">
          {shares.map((share) => (
            <li key={share.id}>
              <input readOnly value={shareLink(share)} onFocus={(e) => e.target.select()} />
              <div className="row">
                {navigator.clipboard && (
                  <button type="button" onClick={() => navigator.clipboard.writeText(shareLink(share))}>
                    Copy
                  </button>
                )}
                <select value={share.role} onChange={(e) => changeRole(share, e.target.value as ShareRole)}>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button type="button" className="danger" onClick={() => revoke(share)}>
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
