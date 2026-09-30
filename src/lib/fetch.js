import { request } from './http.js';

/** fetch — read one or many resources */
export function fetchAttachment(id) {
  return request(`/api/attachments/${encodeURIComponent(id)}`);
}

// Autosaved annotation draft: `{ pages, updatedAt }` (`pages: []`/`updatedAt: null` when none).
export function fetchDraft(attachmentId) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/draft`);
}

export function fetchAttachments(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/attachments${query ? `?${query}` : ''}`);
}

// WF2: flat list of every folder in the caller's own workspace — the client
// (FolderTree.tsx) builds the tree from `parentFolderId`.
export function fetchFolders() {
  return request('/api/folders');
}
