import { request } from './http.js';

/** change — update existing resources */
export function changeAttachment(id, payload) {
  return request(`/api/attachments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function changeAnnotation(attachmentId, annotationId, payload) {
  return request(
    `/api/attachments/${encodeURIComponent(attachmentId)}/annotations/${encodeURIComponent(annotationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

