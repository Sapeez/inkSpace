import { supabase } from '../lib/supabaseClient.js';
import { validateDraftPages } from './draftValidation.js';
import type { DraftPages } from './draftValidation.js';

export interface Draft {
  pages: DraftPages;
  updatedAt: string;
}

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

// The caller (route) has already proven ownership via `requirePermission`.
export async function getDraft(attachmentId: string): Promise<Draft | null> {
  const { data, error } = await supabase
    .from('attachment_drafts')
    .select('pages, updated_at')
    .eq('attachment_id', attachmentId)
    .maybeSingle();
  if (error) throw httpError(`Could not load draft: ${error.message}`, 500);
  if (!data) return null;
  return { pages: data.pages as unknown as DraftPages, updatedAt: data.updated_at };
}

// Upsert: last write wins. Doesn't touch `attachments`, so the file's
// "Last modified" is unaffected by autosave.
export async function saveDraft(attachmentId: string, pages: unknown): Promise<Draft> {
  const validationError = validateDraftPages(pages);
  if (validationError) throw httpError(validationError, 400);

  const { data, error } = await supabase
    .from('attachment_drafts')
    .upsert(
      { attachment_id: attachmentId, pages: pages as never, updated_at: new Date().toISOString() },
      { onConflict: 'attachment_id' },
    )
    .select('pages, updated_at')
    .single();
  if (error) throw httpError(`Could not save draft: ${error.message}`, 500);
  return { pages: data.pages as unknown as DraftPages, updatedAt: data.updated_at };
}
