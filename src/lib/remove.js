import { request } from './http.js';

/** remove — delete resources */
export function removeAttachment(id) {
  return request(`/api/attachments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function removeAnnotation(attachmentId, annotationId) {
  return request(
    `/api/attachments/${encodeURIComponent(attachmentId)}/annotations/${encodeURIComponent(annotationId)}`,
    {
      method: 'DELETE',
    }
  );
}

// 4.4/4.6: revokes a share (owner only, enforced server-side).
export function removeShare(attachmentId, shareId) {
  return request(
    `/api/attachments/${encodeURIComponent(attachmentId)}/shares/${encodeURIComponent(shareId)}`,
    {
      method: 'DELETE',
    }
  );
}
