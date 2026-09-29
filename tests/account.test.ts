import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { deleteAccountCascade } from '../server/services/account.js';
import { supabase } from '../server/lib/supabaseClient.js';
import { createFolder } from '../server/services/folders.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';

const BUCKET = process.env.STORAGE_BUCKET;
const CAN_RUN = Boolean(BUCKET && HAS_AUTH_TEST_CREDS);

test(
  '3.6/US5/R2/code-review.md §4.4: account deletion cascades workspace, folders, attachments (DB + Storage), and the auth user — in order, nothing orphaned',
  { skip: !CAN_RUN && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const bucket = BUCKET as string;
    const user = await createTestSession();
    const storagePath = `scratch-tests/account-cascade-${randomUUID()}.pdf`;

    const folder = await createFolder({ workspaceId: user.userId, name: 'To be deleted', parentFolderId: null });

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: user.userId,
        filename: 'cascade-me.pdf',
        storage_path: storagePath,
        mime_type: 'application/pdf',
        byte_size: 21,
        page_count: 1,
        folder_id: folder.id,
      })
      .select('id')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data.id as string;

    await deleteAccountCascade(user.userId);

    await t.test('the attachment row and its Storage object are both gone', async () => {
      const { data: attachmentRow } = await supabase.from('attachments').select('id').eq('id', attachmentId).maybeSingle();
      assert.equal(attachmentRow, null);

      const { data: download, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
      assert.equal(download, null);
      assert.ok(downloadError, 'the Storage object must no longer be downloadable');
    });

    await t.test('the folder row is gone', async () => {
      const { data: folderRow } = await supabase.from('folders').select('id').eq('id', folder.id).maybeSingle();
      assert.equal(folderRow, null);
    });

    await t.test('the workspace row is gone', async () => {
      const { data: workspaceRow } = await supabase.from('workspaces').select('id').eq('id', user.userId).maybeSingle();
      assert.equal(workspaceRow, null);
    });

    await t.test('the auth.users row itself is gone', async () => {
      const { data, error } = await supabase.auth.admin.getUserById(user.userId);
      assert.ok(error || !data.user, 'the auth user must no longer be retrievable after account deletion');
    });
  },
);
