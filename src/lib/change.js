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

// WF2: renames a folder the caller owns.
export function changeFolder(folderId, payload) {
  return request(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// WF3: moves a file into `folderId`, or back to the top level when
// `folderId` is `null`.
export function moveAttachmentToFolder(attachmentId, folderId) {
  return request(`/api/folders/move-file/${encodeURIComponent(attachmentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId }),
  });
}

