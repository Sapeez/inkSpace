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

export function createPermission(attachmentId, payload) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/permissions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
