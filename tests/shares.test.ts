import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { canRead, canWrite, isOwner, getAttachmentRole } from '../server/middleware/permissions.js';
import { createShare, listShares, removeShare } from '../server/services/shares.js';
import { resolveUserIdByEmail } from '../server/services/users.js';
import { supabase } from '../server/lib/supabaseClient.js';

const OWNER_ID = process.env.TEST_OWNER_USER_ID;
const BUCKET = process.env.STORAGE_BUCKET;
const HAS_CREDS = Boolean(OWNER_ID && BUCKET && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findGranteeCandidate(ownerId: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) return null;
  return data.users.find((user) => user.id !== ownerId && Boolean(user.email)) ?? null;
}

test(
  'resolveUserIdByEmail resolves a known account by email and fails closed for an unknown one',
  { skip: !HAS_CREDS && 'requires TEST_OWNER_USER_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  async () => {
    const { data, error } = await supabase.auth.admin.getUserById(OWNER_ID as string);
    assert.equal(error, null);
    const ownerEmail = data.user?.email;
    if (!ownerEmail) return;

    assert.equal(await resolveUserIdByEmail(ownerEmail), OWNER_ID);
    assert.equal(await resolveUserIdByEmail(ownerEmail.toUpperCase()), OWNER_ID);
    assert.equal(await resolveUserIdByEmail(`nobody-${randomUUID()}@example.com`), null);
  },
);

test(
  '4.4/P1/P2: createShare/listShares/removeShare enforce grant-by-email against a real attachment',
  { skip: !HAS_CREDS && 'requires TEST_OWNER_USER_ID, STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  async (t) => {
    const ownerId = OWNER_ID as string;
    const bucket = BUCKET as string;

    const grantee = HAS_CREDS ? await findGranteeCandidate(ownerId) : null;
    if (!grantee) {
      t.skip('requires a second real auth.users account (besides TEST_OWNER_USER_ID) to grant a share to');
      return;
    }

    const storagePath = `scratch-tests/shares-${randomUUID()}.pdf`;
    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: ownerId,
        filename: 'shares-test.pdf',
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
      await t.test('resolveUserIdByEmail resolves a real account and fails closed for an unknown one', async () => {
        assert.equal(await resolveUserIdByEmail(grantee.email as string), grantee.id);
        assert.equal(await resolveUserIdByEmail(`nobody-${randomUUID()}@example.com`), null);
      });

      let shareId = '';

      await t.test('granting view access resolves grantee_user_id and grants read but not write', async () => {
        const share = await createShare({
          attachmentId,
          email: grantee.email as string,
          role: 'view',
          grantedBy: ownerId,
        });
        shareId = share.id;
        assert.equal(share.granteeUserId, grantee.id);
        assert.equal(share.role, 'view');
        assert.equal(await canRead(grantee.id, attachmentId), true);
        assert.equal(await canWrite(grantee.id, attachmentId), false);
        assert.equal(await getAttachmentRole(grantee.id, attachmentId), 'view');
        assert.equal(await isOwner(grantee.id, attachmentId), false);
      });

      await t.test('re-granting the same email upserts the role instead of duplicating the row', async () => {
        await createShare({ attachmentId, email: grantee.email as string, role: 'edit', grantedBy: ownerId });
        assert.equal(await canWrite(grantee.id, attachmentId), true);
        assert.equal(await getAttachmentRole(grantee.id, attachmentId), 'edit');

        const shares = await listShares(attachmentId);
        const matching = shares.filter((s) => s.granteeEmail === (grantee.email as string).toLowerCase());
        assert.equal(matching.length, 1);
        assert.equal(matching[0]?.role, 'edit');
      });

      await t.test('revoking removes read/write access entirely', async () => {
        await removeShare(attachmentId, shareId);
        assert.equal(await canRead(grantee.id, attachmentId), false);
        assert.equal(await canWrite(grantee.id, attachmentId), false);
        assert.equal(await getAttachmentRole(grantee.id, attachmentId), 'none');
      });
    } finally {
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
    }
  },
);
