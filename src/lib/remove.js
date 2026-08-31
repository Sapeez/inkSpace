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

export function removePermission(attachmentId, permissionId) {
  return request(
    `/api/attachments/${encodeURIComponent(attachmentId)}/permissions/${encodeURIComponent(permissionId)}`,
    {
      method: 'DELETE',
    }
  );
}
