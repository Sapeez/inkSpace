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

// WF4/R3: deleting a folder never deletes the files inside it — enforced
// server-side (attachments.folder_id `on delete set null`), not just here.
export function removeFolder(folderId) {
  return request(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
}
