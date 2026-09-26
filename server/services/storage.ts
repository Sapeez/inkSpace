import { supabase } from '../lib/supabaseClient.js';

// Hand-maintained until `supabase gen types` is run for this table (typescript-standard.md §2.7).
interface AttachmentRow {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  page_count: number | null;
}

interface AttachmentDownload {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  url: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 5;

export async function saveAttachment(_payload: unknown): Promise<{ id: string; savedAt: string }> {
  // TODO: persist metadata + storage path via Supabase — task 3.3
  return { id: 'placeholder', savedAt: new Date().toISOString() };
}

export async function downloadAttachment(attachmentId: string): Promise<AttachmentDownload> {
  const { data, error: attachmentError } = await supabase
    .from('attachments')
    .select('id, filename, storage_path, mime_type, page_count')
    .eq('id', attachmentId)
    .single();

  if (attachmentError || !data) {
    throw Object.assign(new Error(`Attachment not found: ${attachmentId}`), { status: 404 });
  }

  const attachment = data as AttachmentRow;

  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('STORAGE_BUCKET must be set');
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed) {
    throw Object.assign(new Error(`Could not generate signed URL for attachment: ${attachmentId}`), { status: 500 });
  }

  return {
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mime_type,
    pageCount: attachment.page_count,
    url: signed.signedUrl,
  };
}

export async function saveAnnotations(
  _attachmentId: string,
  _annotations: unknown[],
): Promise<{ count: number }> {
  // TODO: upsert annotation JSON to attachments row or child table
  return { count: _annotations.length };
}
