import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../api/client';
import type { Diagram, SharedDiagram, ShareRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import DiagramEditor from '../editor/DiagramEditor';

// Serves both /diagrams/:id and /s/:token (a share link). With a token, every request sends it as X-Share-Token.
export default function DiagramPage() {
  const { id, token } = useParams();
  const location = useLocation();
  const { user, loading } = useAuth();
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [shareRole, setShareRole] = useState<ShareRole | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let diagramId = id;
        if (!token) {
          setShareRole(null);
        } else {
          const shared = await api<SharedDiagram>(`/shares/${encodeURIComponent(token)}`, { auth: false });
          if (cancelled) return;
          setShareRole(shared.role);
          diagramId = shared.id;
        }
        const loaded = await api<Diagram>(`/diagrams/${diagramId}`, { shareToken: token });
        if (cancelled) return;
        setDiagram(loaded);
        setError(null);
        setLoadCount((n) => n + 1);
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token, reloadKey]);

  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <p className="page">{token ? 'This link is invalid or has been revoked.' : 'Diagram not found.'}</p>;
    }
    if (error instanceof ApiError && error.status === 401) {
      return (
        <p className="page">
          <Link to="/login" state={{ from: location.pathname }}>
            Log in
          </Link>{' '}
          to view this diagram.
        </p>
      );
    }
    return <p className="page error">{errorMessage(error)}</p>;
  }
  if (!diagram || loading) return <p className="page">Loading…</p>;

  const isOwner = user !== null && user.id === diagram.ownerId;
  const canEdit = isOwner || shareRole === 'edit';
  const canViewHistory = isOwner || shareRole !== null;

  return (
    <DiagramEditor
      key={loadCount}
      diagram={diagram}
      shareToken={token}
      isOwner={isOwner}
      canEdit={canEdit}
      canViewHistory={canViewHistory}
      onReload={() => setReloadKey((n) => n + 1)}
    />
  );
}
