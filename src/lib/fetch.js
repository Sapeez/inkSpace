import { request } from './http.js';

/** fetch — read one or many resources */
export function fetchAttachment(id) {
  return request(`/api/attachments/${encodeURIComponent(id)}`);
}

export function fetchAttachments(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/attachments${query ? `?${query}` : ''}`);
}

// 4.4/4.6: lists the current shares (P1) for the ShareModal's owner-only view.
export function fetchShares(attachmentId) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/shares`);
}

// WF2: flat list of every folder in the caller's own workspace — the client
// (FolderTree.tsx) builds the tree from `parentFolderId`.
export function fetchFolders() {
  return request('/api/folders');
}

export function fetchWorkspace() {
  return request('/api/workspace');
}
