import { request } from './http.js';

/** create — add new resources */
export function createAttachment(payload) {
  return request('/api/attachments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createAnnotation(attachmentId, payload) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/annotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 4.4: grants edit|view access by email (owner only, enforced server-side).
export function createShare(attachmentId, payload) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/shares`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Task 3.2/3.3 (Download & Save): burns the given per-page annotation JSON
// into a copy of the original PDF and returns it as base64 JSON
// (`{ filename, mimeType, pdfBase64 }`) — shared by Download (decodes it to
// a Blob directly) and Save (forwards `pdfBase64` on to `createAttachment`).
export function burnInAttachment(attachmentId, pages) {
  return request(`/api/burn-in/${encodeURIComponent(attachmentId)}`, {
    method: 'POST',
    body: JSON.stringify({ pages }),
  });
}
