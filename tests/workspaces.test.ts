import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { getWorkspace, updateWorkspaceDisplayName, validateDisplayName } from '../server/services/workspaces.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';

test('validateDisplayName rejects empty and over-length names, accepts everything else', () => {
  assert.equal(validateDisplayName(''), 'Required field');
  assert.equal(validateDisplayName('   '), 'Required field');
  assert.equal(validateDisplayName('a'.repeat(101)), '100 characters maximum');
  assert.equal(validateDisplayName('a'.repeat(100)), null);
  assert.equal(validateDisplayName('My Workspace'), null);
});

test(
  '4.2/SU3: a freshly created auth user already has a workspace, via the auto-create trigger',
  { skip: !HAS_AUTH_TEST_CREDS && 'requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const user = await createTestSession();
    try {
      await t.test('the workspace id is the user id, with the default display name', async () => {
        const workspace = await getWorkspace(user.userId);
        assert.equal(workspace.id, user.userId);
        assert.equal(workspace.displayName, 'My Workspace');
      });
    } finally {
      await user.cleanup();
    }
  },
);

test(
  'WC1: updateWorkspaceDisplayName persists the new name and rejects invalid ones',
  { skip: !HAS_AUTH_TEST_CREDS && 'requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const user = await createTestSession();
    try {
      await t.test('a valid update round-trips through getWorkspace', async () => {
        const updated = await updateWorkspaceDisplayName(user.userId, 'Acme Corp');
        assert.equal(updated.displayName, 'Acme Corp');
        const fetched = await getWorkspace(user.userId);
        assert.equal(fetched.displayName, 'Acme Corp');
      });

      await t.test('an empty display name is rejected with a 400 before writing anything', async () => {
        await assert.rejects(
          () => updateWorkspaceDisplayName(user.userId, '   '),
          (err: unknown) => (err as { status: number }).status === 400,
        );
        const unchanged = await getWorkspace(user.userId);
        assert.equal(unchanged.displayName, 'Acme Corp');
      });
    } finally {
      await user.cleanup();
    }
  },
);
