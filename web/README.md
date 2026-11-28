# DiagramIO Web

Browser client for the DiagramIO REST API: React + TypeScript, built with Vite. Diagrams are drawn with [React Flow](https://reactflow.dev) (`@xyflow/react`).

## Requirements

- Node.js 20.19 or newer (includes npm).
- The backend running on `http://localhost:8080`. See section 5 of the [root README](../README.md) (`docker compose up -d --build` after setting `JWT_SECRET` in `.env`).

## Run in development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173.

The Vite dev server forwards every `/api` request to `http://127.0.0.1:8080` (see [vite.config.ts](vite.config.ts)), so the browser and the API share one origin and no CORS setup is needed. It uses `127.0.0.1` rather than `localhost` because `localhost` may resolve to IPv6 `::1` first. On Windows with WSL running, WSL's port relay can hold `::1:8080` and return an empty reply instead of reaching the Docker container. If the backend runs on another address, change the `proxy` target in `vite.config.ts`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload on port 5173 |
| `npm run build` | Type-check and build static files into `dist/` |
| `npm run preview` | Serve the built `dist/` locally (uses the same `/api` proxy) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |

Run `npm run lint` and `npm run build` before opening a pull request.

## Deploying the build

`npm run build` produces plain static files in `dist/`. The server that hosts them must:

- serve `index.html` for any path that is not a file (the app uses client-side routes such as `/diagrams/{id}` and `/s/{token}`);
- forward `/api` to the backend on the same origin.

## Pages

| Path | Page |
|---|---|
| `/login`, `/register` | Log in, create an account |
| `/` | My diagrams: create (UML or ERD), search by title, filter by type, delete |
| `/public` | Public diagrams |
| `/account` | Account details, change password |
| `/diagrams/{id}` | Diagram editor: add classes/tables, connect them, edit names, members and labels, save; versions; sharing (owner only) |
| `/s/{token}` | Open a diagram through a share link (view or edit, depending on the link) |

## Notes

- The access token is kept only in memory. The refresh token is stored in `localStorage` so a reload keeps you logged in. When several requests get a 401 at once, they wait for a single refresh, because each refresh token can be used only once.
- Saving sends the diagram `version` that was loaded. If someone else saved first, the API returns 409 and the editor asks you to reload instead of overwriting their changes.
- Share links built by the app have the form `http://<web host>/s/{token}`. The `shareUrl` field returned by the API still points at `/api/v1/shares/{token}` (CHECKLIST H7), so the app does not use it.
- Buttons are hidden based on your role (owner, editor, viewer) only for convenience; the backend enforces every permission.
