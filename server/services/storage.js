/**
 * Save / download logic for attachments and burned-in exports.
 */

export async function saveAttachment(_payload) {
  // TODO: persist metadata + storage path via Supabase
  return { id: 'placeholder', savedAt: new Date().toISOString() };
}

export async function downloadAttachment(_attachmentId, _options = {}) {
  // TODO: stream file from storage; optionally include burn-in layer
  return { url: null, filename: 'download.bin' };
}

export async function saveAnnotations(_attachmentId, _annotations) {
  // TODO: upsert annotation JSON to attachments row or child table
  return { count: _annotations.length };
}
