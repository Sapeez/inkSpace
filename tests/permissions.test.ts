import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { canRead, canWrite, isOwner, getAttachmentRole } from '../server/middleware/permissions.js';
import { supabase } from '../server/lib/supabaseClient.js';

const OWNER_ID = process.env.TEST_OWNER_USER_ID;
const BUCKET = process.env.STORAGE_BUCKET;
const CAN_RUN = Boolean(OWNER_ID && BUCKET && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test(
  'permissions middleware enforces ownership and shares against a real attachment',
  { skip: !CAN_RUN && 'requires TEST_OWNER_USER_ID, STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  async (t) => {
    const ownerId = OWNER_ID as string;
    const bucket = BUCKET as string;
    const storagePath = `scratch-tests/permissions-${randomUUID()}.pdf`;

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: ownerId,
        filename: 'permissions-test.pdf',
        storage_path: storagePath,
        mime_type: 'application/pdf',
        byte_size: 21,
        page_count: 1,
      })
      .select('id')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data.id as string;

    try {
      await t.test('the owner can read and write their own attachment', async () => {
        assert.equal(await canRead(ownerId, attachmentId), true);
        assert.equal(await canWrite(ownerId, attachmentId), true);
      });

      await t.test('an unrelated user with no share is denied read and write', async () => {
        const stranger = randomUUID();
        assert.equal(await canRead(stranger, attachmentId), false);
        assert.equal(await canWrite(stranger, attachmentId), false);
      });

      await t.test('a malformed attachment id fails closed rather than open', async () => {
        assert.equal(await canRead(ownerId, 'not-a-real-uuid'), false);
        assert.equal(await canWrite(ownerId, 'not-a-real-uuid'), false);
      });

      await t.test('a genuinely nonexistent attachment id defers to the route’s own 404', async () => {
        assert.equal(await canRead(ownerId, randomUUID()), true);
        assert.equal(await canWrite(ownerId, randomUUID()), true);
      });

      await t.test('4.3/4.4: isOwner is true only for the actual owner, and fails closed otherwise', async () => {
        assert.equal(await isOwner(ownerId, attachmentId), true);
        assert.equal(await isOwner(randomUUID(), attachmentId), false);
        assert.equal(await isOwner(ownerId, 'not-a-real-uuid'), false);
        assert.equal(await isOwner(ownerId, randomUUID()), false);
      });

      await t.test('4.3/4.7: getAttachmentRole reports owner/none correctly', async () => {
        assert.equal(await getAttachmentRole(ownerId, attachmentId), 'owner');
        assert.equal(await getAttachmentRole(randomUUID(), attachmentId), 'none');
        assert.equal(await getAttachmentRole(ownerId, 'not-a-real-uuid'), 'none');
      });
    } finally {
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
    }
  },
);
