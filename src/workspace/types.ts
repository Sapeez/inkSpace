// Mirrors server/services/storage.ts's `AttachmentSummary` until the client and server share generated types
// (typescript-standard.md §2.7).
export interface WorkspaceAttachment {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  byteSize: number;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  draftUpdatedAt?: string | null;
}

// Recency for the Recent grid: the later of the file's own last change and its
// autosaved draft's last change, so a file you just annotated floats to the top.
export function lastActivityTime(file: WorkspaceAttachment): number {
  const modified = new Date(file.updatedAt).getTime();
  const draft = file.draftUpdatedAt ? new Date(file.draftUpdatedAt).getTime() : 0;
  return Math.max(modified, draft);
}
