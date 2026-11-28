import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Background, ReactFlow } from '@xyflow/react';
import { api, errorMessage } from '../api/client';
import type { DiagramType, Version, VersionSummary } from '../api/types';
import { nodeTypes } from '../editor/BoxNode';
import { toFlow } from '../editor/convert';

interface Props {
  diagramId: string;
  diagramType: DiagramType;
  shareToken?: string;
  canEdit: boolean;
  currentVersion: number;
  dirty: boolean;
  onRestored: () => void;
}

export default function VersionsPanel({
  diagramId,
  diagramType,
  shareToken,
  canEdit,
  currentVersion,
  dirty,
  onRestored,
}: Props) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Version | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setVersions(await api<VersionSummary[]>(`/diagrams/${diagramId}/versions`, { shareToken }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [diagramId, shareToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/diagrams/${diagramId}/versions`, {
        method: 'POST',
        shareToken,
        body: { note: note.trim() || null, version: currentVersion },
      });
      setNote('');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleView = async (versionId: string) => {
    try {
      setPreview(await api<Version>(`/diagrams/${diagramId}/versions/${versionId}`, { shareToken }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleRestore = async (version: VersionSummary) => {
    const warning = dirty ? ' Your unsaved changes will be lost.' : '';
    if (!confirm(`Restore version ${version.versionNumber}? The current state is saved as a backup version first.${warning}`)) {
      return;
    }
    try {
      await api(`/diagrams/${diagramId}/versions/${version.id}/restore`, { method: 'POST', shareToken });
      onRestored();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section>
      <h2>Versions</h2>
      {canEdit && (
        <form className="form" onSubmit={handleCreate}>
          <input placeholder="Note" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" disabled={busy || dirty}>
            Save version
          </button>
          {dirty && <p>Save your changes before saving a version.</p>}
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {versions.length === 0 ? (
        <p>No versions.</p>
      ) : (
        <ul className="list">
          {versions.map((version) => (
            <li key={version.id}>
              <div>
                <strong>v{version.versionNumber}</strong> {version.note}
              </div>
              <div className="muted">{new Date(version.createdAt).toLocaleString()}</div>
              <div className="row">
                <button type="button" onClick={() => handleView(version.id)}>
                  View
                </button>
                {canEdit && (
                  <button type="button" onClick={() => handleRestore(version)}>
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <div className="modal" onClick={() => setPreview(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="toolbar">
              <h2>
                Version {preview.versionNumber}
                {preview.note ? `: ${preview.note}` : ''}
              </h2>
              <button type="button" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
            <div className="canvas">
              <ReactFlow
                {...toFlow(preview.data, diagramType)}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
              >
                <Background />
              </ReactFlow>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
