// Mirrors the backend DTOs in src/main/java/com/diagramio/api/**/dto.

export type DiagramType = 'UML' | 'ERD';
export type ShareRole = 'view' | 'edit';

export interface StoredNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label?: string; content?: string };
}

export interface StoredEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface DiagramData {
  nodes: StoredNode[];
  edges: StoredEdge[];
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface DiagramSummary {
  id: string;
  title: string;
  diagramType: DiagramType;
  version: number;
  isPublic: boolean;
  ownerId: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Diagram extends DiagramSummary {
  data: DiagramData;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SharedDiagram {
  id: string;
  title: string;
  diagramType: DiagramType;
  data: DiagramData;
  role: ShareRole;
  version: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Share {
  id: string;
  diagramId: string;
  shareToken: string;
  shareUrl: string;
  role: ShareRole;
  createdAt: string;
}

export interface VersionSummary {
  id: string;
  versionNumber: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Version {
  id: string;
  diagramId: string;
  versionNumber: number;
  note: string | null;
  data: DiagramData;
  createdBy: string | null;
  createdAt: string;
}

export interface RestoreResult {
  diagramId: string;
  title: string;
  diagramType: DiagramType;
  data: DiagramData;
  version: number;
  updatedAt: string;
  backupVersion: VersionSummary;
}
