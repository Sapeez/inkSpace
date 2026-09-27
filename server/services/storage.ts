import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
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

function requireBucket(): string {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('STORAGE_BUCKET must be set');
  }
  return bucket;
}

export interface SaveAttachmentPayload {
  ownerId: string;
  filename: string;
  // Burned-in PDF bytes (task 3.2's output), base64-encoded — this route
  // never receives an unburned/raw file, so there's no separate burn-in step
  // here (S3: burn-in happens before this is ever called).
  pdfBase64: string;
}

export interface SavedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  createdAt: string;
}

// S3/S7: always inserts a *new* attachments row — this function has no path
// that updates or overwrites an existing one, so "save as new attachment" is
// structurally guaranteed, not just a convention callers have to follow.
export async function saveAttachment({ ownerId, filename, pdfBase64 }: SaveAttachmentPayload): Promise<SavedAttachment> {
  const bytes = Buffer.from(pdfBase64, 'base64');
  const pageCount = (await PDFDocument.load(bytes)).getPageCount();

  const bucket = requireBucket();
  const storagePath = `attachments/${ownerId}/${randomUUID()}.pdf`;

  const upload = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: 'application/pdf' });
  if (upload.error) {
    throw Object.assign(new Error(`Could not upload attachment: ${upload.error.message}`), { status: 500 });
  }

  const insert = await supabase
    .from('attachments')
    .insert({
      owner_id: ownerId,
      filename,
      storage_path: storagePath,
      mime_type: 'application/pdf',
      byte_size: bytes.length,
      page_count: pageCount,
    })
    .select('id, filename, mime_type, page_count, created_at')
    .single();

  if (insert.error || !insert.data) {
    await supabase.storage.from(bucket).remove([storagePath]);
    throw Object.assign(new Error(`Could not create attachment row: ${insert.error?.message}`), { status: 500 });
  }

  const row = insert.data as AttachmentRow & { created_at: string };
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    pageCount: row.page_count,
    createdAt: row.created_at,
  };
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
  const bucket = requireBucket();

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

// Task 3.2 (burn-in): unlike `downloadAttachment`, this fetches the actual
// file bytes server-side (not a signed URL for the browser) — pdf-lib needs
// the real bytes to load and mutate the PDF in `burn-in.ts`.
export async function downloadAttachmentBytes(attachmentId: string): Promise<{ filename: string; bytes: Uint8Array }> {
  const { data, error: attachmentError } = await supabase
    .from('attachments')
    .select('filename, storage_path')
    .eq('id', attachmentId)
    .single();

  if (attachmentError || !data) {
    throw Object.assign(new Error(`Attachment not found: ${attachmentId}`), { status: 404 });
  }

  const attachment = data as Pick<AttachmentRow, 'filename' | 'storage_path'>;
  const bucket = requireBucket();

  const { data: file, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(attachment.storage_path);

  if (downloadError || !file) {
    throw Object.assign(new Error(`Could not download attachment: ${attachmentId}`), { status: 500 });
  }

  const arrayBuffer = await file.arrayBuffer();
  return { filename: attachment.filename, bytes: new Uint8Array(arrayBuffer) };
}

export async function saveAnnotations(
  _attachmentId: string,
  _annotations: unknown[],
): Promise<{ count: number }> {
  // TODO: upsert annotation JSON to attachments row or child table
  return { count: _annotations.length };
}
