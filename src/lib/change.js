import { request } from './http.js';

/** change — update existing resources */
export function changeAttachment(id, payload) {
  return request(`/api/attachments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// Document editor: replaces the file's pages. `uploads` are base64 PDFs;
// `pages` is the full new page list (see server/services/documentEdit.ts).
export function editDocumentPages(attachmentId, payload) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/pages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveDraft(attachmentId, pages) {
  return request(`/api/attachments/${encodeURIComponent(attachmentId)}/draft`, {
    method: 'PUT',
    body: JSON.stringify({ pages }),
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

