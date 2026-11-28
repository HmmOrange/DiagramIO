import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import { api, ApiError, errorMessage } from '../api/client';
import type { Diagram } from '../api/types';
import SharesPanel from '../components/SharesPanel';
import VersionsPanel from '../components/VersionsPanel';
import { nodeTypes, type BoxNode, type BoxNodeData } from './BoxNode';
import { byteSize, fromFlow, MAX_DATA_BYTES, newId, nodeTypeFor, toFlow } from './convert';

const EDITING_CHANGES = new Set(['position', 'add', 'remove', 'replace']);
const DEFAULT_EDGE_OPTIONS = { markerEnd: { type: MarkerType.ArrowClosed } };

interface Props {
  diagram: Diagram;
  shareToken?: string;
  isOwner: boolean;
  canEdit: boolean;
  canViewHistory: boolean;
  onReload: () => void;
}

export default function DiagramEditor({ diagram, shareToken, isOwner, canEdit, canViewHistory, onReload }: Props) {
  const isErd = diagram.diagramType === 'ERD';
  const initial = useMemo(() => toFlow(diagram.data, diagram.diagramType), [diagram]);
  const [nodes, setNodes, applyNodeChanges] = useNodesState<BoxNode>(initial.nodes);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<Edge>(initial.edges);
  const [title, setTitle] = useState(diagram.title);
  const [isPublic, setIsPublic] = useState(diagram.isPublic);
  const [version, setVersion] = useState(diagram.version);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flow = useRef<ReactFlowInstance<BoxNode, Edge> | null>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<BoxNode>[]) => {
      applyNodeChanges(changes);
      if (changes.some((c) => EDITING_CHANGES.has(c.type))) markDirty();
    },
    [applyNodeChanges],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      applyEdgeChanges(changes);
      if (changes.some((c) => EDITING_CHANGES.has(c.type))) markDirty();
    },
    [applyEdgeChanges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge({ ...connection, id: newId('e'), label: '' }, current));
      markDirty();
    },
    [setEdges],
  );

  const addNode = () => {
    const rect = canvas.current?.getBoundingClientRect();
    const position =
      flow.current && rect
        ? flow.current.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
    const node: BoxNode = {
      id: newId('n'),
      type: nodeTypeFor(diagram.diagramType),
      position,
      data: { label: isErd ? 'Table' : 'Class', content: '' },
      selected: true,
    };
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), node]);
    setEdges((current) => current.map((e) => ({ ...e, selected: false })));
    markDirty();
  };

  const updateNode = (id: string, patch: Partial<BoxNodeData>) => {
    setNodes((current) => current.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    markDirty();
  };

  const updateEdgeLabel = (id: string, label: string) => {
    setEdges((current) => current.map((e) => (e.id === id ? { ...e, label } : e)));
    markDirty();
  };

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);

  const deleteSelected = () => {
    flow.current?.deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  };

  const save = async () => {
    const data = fromFlow(nodes, edges);
    if (byteSize(data) > MAX_DATA_BYTES) {
      setError('The diagram is larger than 2 MB and cannot be saved.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Diagram>(`/diagrams/${diagram.id}`, {
        method: 'PUT',
        shareToken,
        body: { title, diagramType: diagram.diagramType, version, data, isPublic },
      });
      setVersion(updated.version);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const hasSidebar = canEdit || canViewHistory || isOwner;

  return (
    <div className="editor">
      <div className="toolbar">
        {canEdit ? (
          <input
            className="title-input"
            value={title}
            maxLength={255}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
          />
        ) : (
          <h1>{title}</h1>
        )}
        <span>{diagram.diagramType}</span>
        {isOwner && (
          <label className="inline">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => {
                setIsPublic(e.target.checked);
                markDirty();
              }}
            />
            Public
          </label>
        )}
        {canEdit && (
          <>
            <button type="button" onClick={addNode}>
              Add {isErd ? 'table' : 'class'}
            </button>
            <button type="button" onClick={save} disabled={saving || !dirty || !title.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {dirty && <span>Unsaved changes</span>}
            {saved && <span>Saved</span>}
          </>
        )}
      </div>

      {conflict && (
        <div className="error-box">
          Someone else changed this diagram. Reload to get the latest version; your unsaved changes will be lost.{' '}
          <button type="button" onClick={onReload}>
            Reload
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="editor-body">
        <div className="canvas" ref={canvas}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => {
              flow.current = instance;
            }}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {hasSidebar && (
          <aside className="sidebar">
            {canEdit && (
              <section>
                <h2>Selection</h2>
                {selectedNodes.length === 1 && selectedEdges.length === 0 ? (
                  <div className="form">
                    <label>
                      Name
                      <input
                        value={selectedNodes[0].data.label}
                        onChange={(e) => updateNode(selectedNodes[0].id, { label: e.target.value })}
                      />
                    </label>
                    <label>
                      {isErd ? 'Columns' : 'Attributes and methods'}
                      <textarea
                        rows={8}
                        value={selectedNodes[0].data.content}
                        placeholder={isErd ? 'id: uuid PK\nname: varchar' : '- name: String\n+ getName(): String'}
                        onChange={(e) => updateNode(selectedNodes[0].id, { content: e.target.value })}
                      />
                    </label>
                  </div>
                ) : selectedEdges.length === 1 && selectedNodes.length === 0 ? (
                  <div className="form">
                    <label>
                      Label
                      <input
                        value={typeof selectedEdges[0].label === 'string' ? selectedEdges[0].label : ''}
                        placeholder={isErd ? '1..*' : 'extends'}
                        onChange={(e) => updateEdgeLabel(selectedEdges[0].id, e.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <p>Select one {isErd ? 'table' : 'class'} or connection to edit it.</p>
                )}
                {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
                  <button type="button" className="danger" onClick={deleteSelected}>
                    Delete selected
                  </button>
                )}
              </section>
            )}
            {canViewHistory && (
              <VersionsPanel
                diagramId={diagram.id}
                diagramType={diagram.diagramType}
                shareToken={shareToken}
                canEdit={canEdit}
                currentVersion={version}
                dirty={dirty}
                onRestored={onReload}
              />
            )}
            {isOwner && <SharesPanel diagramId={diagram.id} />}
          </aside>
        )}
      </div>
    </div>
  );
}
