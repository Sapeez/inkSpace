import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveAttachment,
  validateFolderName,
} from '../server/services/folders.js';
import { supabase } from '../server/lib/supabaseClient.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';

const BUCKET = process.env.STORAGE_BUCKET;
const CAN_RUN = Boolean(BUCKET && HAS_AUTH_TEST_CREDS);

test('validateFolderName rejects empty and over-length names, accepts everything else', () => {
  assert.equal(validateFolderName(''), 'Required field');
  assert.equal(validateFolderName('   '), 'Required field');
  assert.equal(validateFolderName('a'.repeat(101)), '100 characters maximum');
  assert.equal(validateFolderName('a'.repeat(100)), null);
});

test(
  'WF2-WF4: folder CRUD, nesting, and ownership scoping against a real workspace',
  { skip: !CAN_RUN && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const bucket = BUCKET as string;
    const owner = await createTestSession();
    const stranger = await createTestSession();

    try {
      let topFolderId = '';
      let subFolderId = '';

      await t.test('WF2: a folder can be created at the top level, and listed back', async () => {
        const folder = await createFolder({ workspaceId: owner.userId, name: 'Contracts', parentFolderId: null });
        topFolderId = folder.id;
        assert.equal(folder.name, 'Contracts');
        assert.equal(folder.parentFolderId, null);

        const list = await listFolders(owner.userId);
        assert.ok(list.some((f) => f.id === topFolderId));
      });

      await t.test('a nested folder can be created under an owned parent', async () => {
        const sub = await createFolder({ workspaceId: owner.userId, name: '2026', parentFolderId: topFolderId });
        subFolderId = sub.id;
        assert.equal(sub.parentFolderId, topFolderId);
      });

      await t.test('4.4/Risk R4: a stranger cannot create a folder nested under someone else\'s folder', async () => {
        await assert.rejects(
          () => createFolder({ workspaceId: stranger.userId, name: 'Intrusion', parentFolderId: topFolderId }),
          (err: unknown) => (err as { status: number }).status === 403,
        );
      });

      await t.test('WF2: renaming a folder works for its owner', async () => {
        const renamed = await renameFolder(owner.userId, topFolderId, 'Renamed Contracts');
        assert.equal(renamed.name, 'Renamed Contracts');
      });

      await t.test('4.4/Risk R4: a stranger renaming or deleting someone else\'s folder gets 403, not a silent no-op', async () => {
        await assert.rejects(
          () => renameFolder(stranger.userId, topFolderId, 'Hijacked'),
          (err: unknown) => (err as { status: number }).status === 403,
        );
        await assert.rejects(
          () => deleteFolder(stranger.userId, topFolderId),
          (err: unknown) => (err as { status: number }).status === 403,
        );
      });

      await t.test('renaming/deleting a genuinely nonexistent folder id is 404, not 403', async () => {
        await assert.rejects(
          () => renameFolder(owner.userId, randomUUID(), 'Ghost'),
          (err: unknown) => (err as { status: number }).status === 404,
        );
        await assert.rejects(
          () => deleteFolder(owner.userId, randomUUID()),
          (err: unknown) => (err as { status: number }).status === 404,
        );
      });

      let attachmentId = '';
      const storagePath = `scratch-tests/folders-${randomUUID()}.pdf`;

      await t.test('WF4/R3: deleting a folder returns its files to the top level instead of deleting them', async () => {
        const upload = await supabase.storage
          .from(bucket)
          .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
        assert.equal(upload.error, null);

        const insert = await supabase
          .from('attachments')
          .insert({
            owner_id: owner.userId,
            filename: 'in-folder.pdf',
            storage_path: storagePath,
            mime_type: 'application/pdf',
            byte_size: 21,
            page_count: 1,
            folder_id: topFolderId,
          })
          .select('id')
          .single();
        assert.equal(insert.error, null);
        attachmentId = insert.data.id as string;

        await deleteFolder(owner.userId, topFolderId);

        const { data: survivor, error } = await supabase
          .from('attachments')
          .select('id, folder_id')
          .eq('id', attachmentId)
          .single();
        assert.equal(error, null);
        assert.ok(survivor, 'the attachment row must still exist after its folder is deleted');
        assert.equal(survivor.folder_id, null);

        // The subfolder nested under the deleted top-level folder must be
        // gone too (folders cascade; only files are protected).
        const remainingFolders = await listFolders(owner.userId);
        assert.ok(!remainingFolders.some((f) => f.id === subFolderId));
        assert.ok(!remainingFolders.some((f) => f.id === topFolderId));
      });

      await t.test('WF3: moving a file into a folder works for its owner, and is denied for a stranger', async () => {
        const destination = await createFolder({ workspaceId: owner.userId, name: 'Destination', parentFolderId: null });

        await assert.rejects(
          () => moveAttachment(stranger.userId, attachmentId, destination.id),
          (err: unknown) => (err as { status: number }).status === 403,
        );

        await moveAttachment(owner.userId, attachmentId, destination.id);
        const { data: moved } = await supabase.from('attachments').select('folder_id').eq('id', attachmentId).single();
        assert.equal(moved?.folder_id, destination.id);

        await moveAttachment(owner.userId, attachmentId, null);
        const { data: backToTop } = await supabase.from('attachments').select('folder_id').eq('id', attachmentId).single();
        assert.equal(backToTop?.folder_id, null);
      });

      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
    } finally {
      await owner.cleanup();
      await stranger.cleanup();
    }
  },
);
