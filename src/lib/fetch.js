import { request } from './http.js';

/** fetch — read one or many resources */
export function fetchAttachment(id) {
  return request(`/api/attachments/${encodeURIComponent(id)}`);
}

export function fetchAttachments(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/attachments${query ? `?${query}` : ''}`);
}

export function fetchPermissions(attachmentId) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/permissions`);
}
