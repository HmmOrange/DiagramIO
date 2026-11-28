import type { Edge } from '@xyflow/react';
import type { DiagramData, DiagramType, StoredEdge, StoredNode } from '../api/types';
import type { BoxNode } from './BoxNode';

export const MAX_DATA_BYTES = 2 * 1024 * 1024;

export function nodeTypeFor(diagramType: DiagramType): string {
  return diagramType === 'ERD' ? 'erdTable' : 'umlClass';
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Stored data may come from any API client, so read it defensively.
export function toFlow(data: unknown, diagramType: DiagramType): { nodes: BoxNode[]; edges: Edge[] } {
  const raw = (data ?? {}) as { nodes?: unknown; edges?: unknown };
  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as Partial<StoredNode>[]) : [];
  const rawEdges = Array.isArray(raw.edges) ? (raw.edges as Partial<StoredEdge>[]) : [];

  const nodes: BoxNode[] = rawNodes
    .filter((n) => typeof n?.id === 'string')
    .map((n) => ({
      id: n.id!,
      type: nodeTypeFor(diagramType),
      position: {
        x: Number(n.position?.x) || 0,
        y: Number(n.position?.y) || 0,
      },
      data: {
        label: String(n.data?.label ?? ''),
        content: String(n.data?.content ?? ''),
      },
    }));

  const edges: Edge[] = rawEdges
    .filter((e) => typeof e?.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string')
    .map((e) => ({
      id: e.id!,
      source: e.source!,
      target: e.target!,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: e.label ?? '',
    }));

  return { nodes, edges };
}

export function fromFlow(nodes: BoxNode[], edges: Edge[]): DiagramData {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: { label: n.data.label, content: n.data.content },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: typeof e.label === 'string' ? e.label : '',
    })),
  };
}

export function byteSize(data: DiagramData): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}
