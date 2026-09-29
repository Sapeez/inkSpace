// Mirrors server/services/folders.ts's `Folder` and server/services/storage.ts's
// `AttachmentSummary` until the client and server share generated types
// (typescript-standard.md §2.7).
export interface WorkspaceFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceAttachment {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}
