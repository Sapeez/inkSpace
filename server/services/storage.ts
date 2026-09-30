import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '../lib/supabaseClient.js';
import type { Database } from '../../src/lib/database.types.js';

// Hand-maintained until `supabase gen types` is run for this table (typescript-standard.md §2.7).
interface AttachmentRow {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  page_count: number | null;
}

type AttachmentListRow = Pick<
  Database['public']['Tables']['attachments']['Row'],
  'id' | 'filename' | 'mime_type' | 'page_count' | 'byte_size' | 'folder_id' | 'created_at' | 'updated_at'
>;

export interface AttachmentSummary {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  byteSize: number;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
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

// WF1: scoped to `ownerId` unconditionally — there is no admin/cross-account
// path that lists another workspace's attachments. `folderFilter === 'root'`
// lists only unfiled (top-level) attachments; a specific folder id scopes to
// that folder; omitting it entirely returns every attachment in the caller's
// workspace regardless of folder, which is what `RecentSection.tsx` (WF7)
// and the search bar (WF11) need — the folder-scoped grid/list view is the
// one that passes `folderFilter`.
export async function listAttachments(ownerId: string, folderFilter?: string): Promise<AttachmentSummary[]> {
  let query = supabase
    .from('attachments')
    .select('id, filename, mime_type, page_count, byte_size, folder_id, created_at, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });

  if (folderFilter === 'root') {
    query = query.is('folder_id', null);
  } else if (folderFilter) {
    query = query.eq('folder_id', folderFilter);
  }

  const { data, error } = await query;
  if (error) {
    throw Object.assign(new Error(`Could not list attachments: ${error.message}`), { status: 500 });
  }

  return (data as AttachmentListRow[]).map((row) => ({
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    pageCount: row.page_count,
    byteSize: row.byte_size,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// WF9: deletes the Storage object before the DB row (same ordering
// reasoning as `server/services/account.ts`'s cascade — a failed/partial
// Storage removal would be unrecoverable once the row holding `storage_path`
// is gone).
export async function deleteAttachment(attachmentId: string): Promise<void> {
  const { data, error: attachmentError } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .maybeSingle();

  // Found in review (same class of bug already fixed in folders.ts's
  // `checkFolderOwnership`): a real DB error must not be folded into the
  // same 404 branch as a genuinely missing attachment — `maybeSingle()`
  // (unlike `.single()`) returns `{ data: null, error: null }` for a
  // legitimate miss, so `error` truthy here only ever means a real failure.
  if (attachmentError) {
    throw Object.assign(new Error(`Could not look up attachment: ${attachmentError.message}`), { status: 500 });
  }
  if (!data) {
    throw Object.assign(new Error(`Attachment not found: ${attachmentId}`), { status: 404 });
  }

  const bucket = requireBucket();
  const { error: removeError } = await supabase.storage.from(bucket).remove([(data as { storage_path: string }).storage_path]);
  if (removeError) {
    throw Object.assign(new Error(`Could not delete attachment storage object: ${removeError.message}`), { status: 500 });
  }

  const { error: deleteError } = await supabase.from('attachments').delete().eq('id', attachmentId);
  if (deleteError) {
    throw Object.assign(new Error(`Could not delete attachment row: ${deleteError.message}`), { status: 500 });
  }
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
