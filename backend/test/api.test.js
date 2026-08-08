import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlaceholderPng } from '../src/png.js';

const tempDir = mkdtempSync(join(tmpdir(), 'food-map-api-'));
process.env.DB_PATH = join(tempDir, 'test.db');
process.env.UPLOADS_DIR = join(tempDir, 'uploads');

const { app } = await import('../src/server.js');
const { db, run } = await import('../src/db.js');
const server = app.listen(0);
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const baseUrl = `${origin}/api`;

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  try { db.close(); } catch {}
  rmSync(tempDir, { recursive: true, force: true });
});

const pngBuffer = createPlaceholderPng(64, 64, [255, 122, 69]);

function form(fields, images) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }
  if (images) {
    const files = Array.isArray(images) ? images : [images];
    for (const img of files) {
      body.append('images', new Blob([img.buffer], { type: 'image/png' }), img.name);
    }
  }
  return body;
}

async function apiRequest(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...(options.headers || {})
    },
    body: isForm ? options.body : (options.body ? JSON.stringify(options.body) : undefined)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

const baseFields = {
  dish_name: '测试菜品',
  restaurant_name: '测试餐厅',
  longitude: '116.4',
  latitude: '39.9'
};

// --- TESTS ---

test('GET /api/entries returns paginated structure', async () => {
  const { response, data } = await apiRequest('/api/entries');
  assert.equal(response.status, 200);
  assert.ok(data.data, 'should have data array');
  assert.ok(data.pagination, 'should have pagination');
  assert.ok(Array.isArray(data.data));
  assert.equal(data.data.length, 0);
});

test('POST /api/entries creates with images', async () => {
  const res = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    body: form(
      { ...baseFields, dish_name: '水煮牛肉', restaurant_name: '川味小馆', rating: '5' },
      { name: 'beef.png', buffer: pngBuffer }
    )
  });
  assert.equal(res.status, 201);
  const entry = await res.json();
  assert.equal(entry.dish_name, '水煮牛肉');
  assert.equal(entry.rating, 5);
  assert.ok(entry.images?.length >= 1, 'should have images array');
  assert.ok(entry.cover_image, 'should have cover_image');
});

test('POST /api/entries without image and rating', async () => {
  const res = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    body: form({ ...baseFields, dish_name: '手工酸奶', restaurant_name: '三里屯' })
  });
  assert.equal(res.status, 201);
  const entry = await res.json();
  assert.equal(entry.cover_image, '');
  assert.equal(entry.rating, null);
});

test('POST /api/entries rejects invalid body', async () => {
  const missingName = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    body: form({ restaurant_name: '某店', longitude: '116.4', latitude: '39.9' })
  });
  assert.equal(missingName.status, 400);

  const badLng = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    body: form({ dish_name: '菜', restaurant_name: '店', longitude: '999', latitude: '39.9' })
  });
  assert.equal(badLng.status, 400);

  const badRating = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    body: form({ ...baseFields, rating: '9' })
  });
  assert.equal(badRating.status, 400);
});

test('POST /api/entries rejects unsupported file type', async () => {
  const rejected = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    body: form(baseFields, { name: 'evil.exe', buffer: Buffer.from('MZ....') })
  });
  assert.equal(rejected.status, 400);
});

test('PUT /api/entries updates and replaces image', async () => {
  const { data: list } = await apiRequest('/api/entries');
  const target = list.data.find((e) => e.dish_name === '水煮牛肉');
  assert.ok(target, '水煮牛肉 should exist');

  const oldCover = target.cover_image;

  const res = await fetch(`${baseUrl}/entries/${target.id}`, {
    method: 'PUT',
    body: form(
      { ...baseFields, dish_name: '水煮牛肉（大份）', restaurant_name: '川味小馆', rating: '4', notes: '加了一份豆芽。' },
      { name: 'beef2.png', buffer: pngBuffer }
    )
  });
  assert.equal(res.status, 200);
  const entry = await res.json();
  assert.equal(entry.dish_name, '水煮牛肉（大份）');
  assert.equal(entry.rating, 4);
});

test('PUT /api/entries without new image keeps existing', async () => {
  const { data: list } = await apiRequest('/api/entries');
  const target = list.data.find((e) => e.dish_name === '手工酸奶');
  assert.ok(target);

  const res = await fetch(`${baseUrl}/entries/${target.id}`, {
    method: 'PUT',
    body: form({
      ...baseFields, dish_name: '手工酸奶（原味）', restaurant_name: '三里屯',
      tag_ids: '', deleted_image_ids: ''
    })
  });
  assert.equal(res.status, 200);
  const entry = await res.json();
  assert.equal(entry.dish_name, '手工酸奶（原味）');
});

test('GET /api/entries list is ordered', async () => {
  const { data } = await apiRequest('/api/entries');
  const dates = data.data.map((e) => e.created_at);
  if (dates.length > 0) {
    assert.deepEqual([...dates].sort().reverse(), dates);
  }
});

test('DELETE /api/entries soft deletes', async () => {
  const { data: list } = await apiRequest('/api/entries');
  const target = list.data[0];
  assert.ok(target);

  const deleted = await fetch(`${baseUrl}/entries/${target.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);

  const { data: after } = await apiRequest('/api/entries');
  assert.equal(after.data.some((e) => e.id === target.id), false, 'soft-deleted entry should not appear');
});

test('POST /api/entries/:id/restore recovers soft-deleted entry', async () => {
  const { data: deletedList } = await apiRequest('/api/entries?deleted=1');
  const target = deletedList.data[0];
  assert.ok(target, 'should have at least one soft-deleted entry');

  const res = await fetch(`${baseUrl}/entries/${target.id}/restore`, { method: 'POST' });
  assert.equal(res.status, 200);

  const { data: after } = await apiRequest('/api/entries');
  assert.ok(after.data.some((e) => e.id === target.id), 'restored entry should appear');
});

test('DELETE nonexistent entry returns 404', async () => {
  const deleted = await fetch(`${baseUrl}/entries/999999`, { method: 'DELETE' });
  assert.equal(deleted.status, 404);
});

test('GET /api/tags returns tags list', async () => {
  const { response, data } = await apiRequest('/api/tags');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
});

test('POST/PUT/DELETE /api/tags CRUD', async () => {
  const { data: created } = await apiRequest('/api/tags', {
    method: 'POST', body: { name: '测试标签', color: '#FF0000' }
  });
  assert.ok(created.id);

  const { data: updated } = await apiRequest(`/api/tags/${created.id}`, {
    method: 'PUT', body: { name: '更新标签', color: '#00FF00' }
  });
  assert.equal(updated.name, '更新标签');

  const del = await fetch(`${baseUrl}/tags/${created.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

test('GET /api/entries/stats returns statistics', async () => {
  const { response, data } = await apiRequest('/api/entries/stats');
  assert.equal(response.status, 200);
  assert.ok(data.overview);
  assert.ok(data.meal_type_distribution);
  assert.ok(data.tag_distribution);
});

test('GET /api/export returns full data', async () => {
  const { response, data } = await apiRequest('/api/export');
  assert.equal(response.status, 200);
  assert.ok(data.version);
  assert.ok(Array.isArray(data.entries));
  assert.ok(Array.isArray(data.tags));
});

test('GET /api/settings returns settings list', async () => {
  const { response, data } = await apiRequest('/api/settings');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
});

// --- USERS ---

test('POST /api/users creates user and claims orphan entries', async () => {
  const userId = 'test-user-001';
  const res = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: userId, nickname: '小明', color: '#FF5A2B' }
  });
  assert.equal(res.response.status, 201);
  assert.equal(res.data.created, true);
  assert.equal(res.data.user.id, userId);
  assert.equal(res.data.user.nickname, '小明');
  assert.equal(res.data.user.color, '#FF5A2B');

  const entry = await apiRequest('/api/entries');
  const claimedRow = entry.data.data.find((e) => e.dish_name === '水煮牛肉（大份）');
  assert.ok(claimedRow, 'should claim at least one entry');
  assert.equal(claimedRow.user_id, userId, 'entry should be claimed by new user');
});

test('POST /api/users updates existing user nickname and color', async () => {
  const userId = 'test-user-001';
  const res = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: userId, nickname: '大明', color: '#2196F3' }
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.created, false);
  assert.equal(res.data.user.nickname, '大明');
  assert.equal(res.data.user.color, '#2196F3');
});

test('POST /api/users rejects empty nickname and bad color', async () => {
  const emptyNick = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: 'x', nickname: '   ', color: '#FF5A2B' }
  });
  assert.equal(emptyNick.response.status, 400);

  const badColor = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: 'x', nickname: '小明', color: 'red' }
  });
  assert.equal(badColor.response.status, 400);
});

test('GET /api/users/me returns user by id', async () => {
  const { response, data } = await apiRequest('/api/users/me?id=test-user-001');
  assert.equal(response.status, 200);
  assert.equal(data.id, 'test-user-001');
  assert.equal(data.nickname, '大明');
});

test('GET /api/users/me without id returns 400 and unknown id returns 404', async () => {
  const noId = await apiRequest('/api/users/me');
  assert.equal(noId.response.status, 400);

  const unknown = await apiRequest('/api/users/me?id=nope');
  assert.equal(unknown.response.status, 404);
});

test('POST /api/users reuses identity with same nickname+color instead of duplicating', async () => {
  const first = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: 'merge-user-001', nickname: '食客甲', color: '#00BCD4' }
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.data.created, true);

  const entry = await apiRequest('/api/entries', {
    method: 'POST',
    body: form({ ...baseFields, dish_name: '食客甲的旧记录', restaurant_name: '老店', user_id: first.data.user.id })
  });
  assert.equal(entry.data.user_id, 'merge-user-001');

  // A reset browser would send a brand-new id with the same nickname+color.
  const reuse = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: 'merge-user-002', nickname: '食客甲', color: '#00BCD4' }
  });
  assert.equal(reuse.response.status, 200);
  assert.equal(reuse.data.created, false);
  assert.equal(reuse.data.user.id, 'merge-user-001', 'should reuse the earlier identity, not create a duplicate');

  const mine = await apiRequest('/api/entries?user_id=merge-user-001&view=mine');
  assert.ok(mine.data.data.some((e) => e.dish_name === '食客甲的旧记录'), 'record should still be owned and editable');
  const other = await apiRequest('/api/entries?user_id=merge-user-002&view=mine');
  assert.equal(other.data.data.length, 0, 'no records should be stranded under the discarded id');
});

test('POST /api/users profile update folds legacy ghost identities', async () => {
  // Simulate a duplicate identity a reset browser left behind in older data.
  db.prepare('INSERT INTO users (id, nickname, color) VALUES (?, ?, ?)').run('merge-ghost', '食客甲', '#00BCD4');
  db.prepare("UPDATE food_entries SET user_id = 'merge-ghost' WHERE dish_name = '食客甲的旧记录'").run();

  const update = await apiRequest('/api/users', {
    method: 'POST',
    body: { id: 'merge-user-001', nickname: '食客甲', color: '#00BCD4' }
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.data.created, false);
  assert.equal(update.data.claimed, 1, 'should reclaim the ghost record');

  const mine = await apiRequest('/api/entries?user_id=merge-user-001&view=mine');
  assert.ok(mine.data.data.some((e) => e.dish_name === '食客甲的旧记录'), 'ghost record should be owned again');

  const ghostUser = db.prepare('SELECT * FROM users WHERE id = ?').get('merge-ghost');
  assert.equal(ghostUser, undefined, 'ghost identity should be removed');
});

// --- GROUPS ---

test('POST /api/groups creates room with 6-char code', async () => {
  const res = await apiRequest('/api/groups', {
    method: 'POST',
    body: { name: '成都美食小分队', creator_id: 'test-user-001' }
  });
  assert.equal(res.response.status, 201);
  assert.ok(res.data.group);
  assert.match(res.data.group.id, /^[A-Z0-9]{6}$/, 'code should be 6 uppercase chars');
  assert.equal(res.data.group.name, '成都美食小分队');
  assert.equal(res.data.group.creator_id, 'test-user-001');
  assert.equal(res.data.group.member_count, 1);
  assert.equal(res.data.group.is_creator, true);
});

test('POST /api/groups/join with wrong code returns 404', async () => {
  const res = await apiRequest('/api/groups/join', {
    method: 'POST',
    body: { code: 'ZZZZZZ', user_id: 'test-user-002' }
  });
  assert.equal(res.response.status, 404);
});

test('POST /api/groups/join joins room and lists it', async () => {
  const { data: created } = await apiRequest('/api/groups', {
    method: 'POST',
    body: { name: '聚餐群', creator_id: 'test-user-001' }
  });
  const code = created.group.id;

  const joinRes = await apiRequest('/api/groups/join', {
    method: 'POST',
    body: { code: code.toLowerCase(), user_id: 'test-user-002' }
  });
  assert.equal(joinRes.response.status, 200);
  assert.equal(joinRes.data.group.member_count, 2);

  const listRes = await apiRequest('/api/groups?user_id=test-user-002');
  assert.equal(listRes.response.status, 200);
  assert.ok(listRes.data.groups.some((g) => g.id === code), 'user should see joined room');
  assert.equal(listRes.data.groups.find((g) => g.id === code).member_count, 2);
});

test('GET /api/groups/:id/members returns member info', async () => {
  const { data: list } = await apiRequest('/api/groups?user_id=test-user-001');
  const group = list.groups[0];
  const res = await apiRequest(`/api/groups/${group.id}/members`);
  assert.equal(res.response.status, 200);
  assert.equal(res.data.group.id, group.id);
  const mine = res.data.members.find((m) => m.user_id === 'test-user-001');
  assert.equal(mine.nickname, '大明');
  assert.ok(mine.color);
});

test('POST /api/groups/:id/leave removes membership', async () => {
  const { data: list } = await apiRequest('/api/groups?user_id=test-user-002');
  const group = list.groups[0];
  const leaveRes = await apiRequest(`/api/groups/${group.id}/leave`, {
    method: 'POST',
    body: { user_id: 'test-user-002' }
  });
  assert.equal(leaveRes.response.status, 200);

  const after = await apiRequest('/api/groups?user_id=test-user-002');
  assert.ok(!after.data.groups.some((g) => g.id === group.id), 'user should no longer see room');
});

test('DELETE /api/groups/:id disbands only by creator', async () => {
  const { data: created } = await apiRequest('/api/groups', {
    method: 'POST',
    body: { name: '待解散', creator_id: 'test-user-001' }
  });
  const code = created.group.id;

  const forbidden = await apiRequest(`/api/groups/${code}`, {
    method: 'DELETE',
    body: { user_id: 'test-user-002' }
  });
  assert.equal(forbidden.response.status, 403);

  const disband = await apiRequest(`/api/groups/${code}`, {
    method: 'DELETE',
    body: { user_id: 'test-user-001' }
  });
  assert.equal(disband.response.status, 200);

  const missing = await apiRequest(`/api/groups/${code}/members`);
  assert.equal(missing.response.status, 404);
});

test('POST /api/groups rejects empty name and bad code', async () => {
  const noName = await apiRequest('/api/groups', {
    method: 'POST',
    body: { name: '  ', creator_id: 'test-user-001' }
  });
  assert.equal(noName.response.status, 400);

  const badCode = await apiRequest('/api/groups/join', {
    method: 'POST',
    body: { code: 'AB1', user_id: 'test-user-001' }
  });
  assert.equal(badCode.response.status, 400);
});

// --- VISIBILITY (v2-3) ---

async function ensureUser(id, nickname) {
  const res = await apiRequest('/api/users', {
    method: 'POST',
    body: { id, nickname, color: '#FF5A2B' }
  });
  return res.data.user;
}

async function createOwnedEntry(userId, dishName, { visibility = 'private', group_id = '', restaurant = '测试餐厅' } = {}) {
  const res = await apiRequest('/api/entries', {
    method: 'POST',
    body: form({
      ...baseFields,
      dish_name: dishName,
      restaurant_name: restaurant,
      user_id: userId,
      visibility,
      group_id
    })
  });
  return res.data;
}

test('POST /api/entries stores user_id and visibility', async () => {
  const u = await ensureUser('vis-user-a', '小A');
  const entry = await createOwnedEntry(u.id, 'A的私有菜', { visibility: 'private' });
  assert.equal(entry.user_id, u.id);
  assert.equal(entry.visibility, 'private');
  assert.equal(entry.group_id, null);
});

test('GET /api/entries view=mine only returns own entries with user info', async () => {
  const a = await ensureUser('vis-user-b', '小B');
  const entry = await createOwnedEntry(a.id, 'B的菜', { visibility: 'private' });

  const mine = await apiRequest(`/api/entries?user_id=${a.id}&view=mine`);
  assert.equal(mine.response.status, 200);
  const names = mine.data.data.map((e) => e.dish_name);
  assert.ok(names.includes('B的菜'), 'should include own entry');
  assert.ok(!names.includes('A的私有菜'), 'should not include other user entry');

  const b = mine.data.data.find((e) => e.dish_name === 'B的菜');
  assert.equal(b.user_id, a.id);
  assert.equal(b.user_nickname, '小B');
  assert.ok(b.user_color);
});

test('GET /api/entries view=shared only returns OTHER users group-shared entries', async () => {
  const a = await ensureUser('vis-user-c', '小C');
  const b = await ensureUser('vis-user-d', '小D');
  const created = await apiRequest('/api/groups', {
    method: 'POST',
    body: { name: '共享测试组', creator_id: a.id }
  });
  const code = created.data.group.id;
  await apiRequest('/api/groups/join', { method: 'POST', body: { code, user_id: b.id } });

  await createOwnedEntry(a.id, 'C共享菜', { visibility: 'group', group_id: code });
  await createOwnedEntry(a.id, 'C私有菜', { visibility: 'private' });
  await createOwnedEntry(b.id, 'D共享菜', { visibility: 'group', group_id: code });

  const shared = await apiRequest(`/api/entries?user_id=${b.id}&view=shared&group_id=${code}`);
  const names = shared.data.data.map((e) => e.dish_name);
  assert.ok(names.includes('C共享菜'), 'should see other user group-shared entry');
  assert.ok(!names.includes('C私有菜'), 'should not see private entry');
  assert.ok(!names.includes('D共享菜'), 'should not see own shared entry');
});

test('GET /api/entries view=all returns mine + group shared', async () => {
  const a = await ensureUser('vis-user-e', '小E');
  const b = await ensureUser('vis-user-f', '小F');
  const created = await apiRequest('/api/groups', {
    method: 'POST',
    body: { name: '全部视图组', creator_id: a.id }
  });
  const code = created.data.group.id;
  await apiRequest('/api/groups/join', { method: 'POST', body: { code, user_id: b.id } });

  await createOwnedEntry(a.id, 'E共享菜', { visibility: 'group', group_id: code });
  await createOwnedEntry(b.id, 'F自己的菜', { visibility: 'private' });
  await createOwnedEntry(b.id, 'F共享菜', { visibility: 'group', group_id: code });

  const all = await apiRequest(`/api/entries?user_id=${b.id}&view=all&group_id=${code}`);
  const names = all.data.data.map((e) => e.dish_name);
  assert.ok(names.includes('F自己的菜'), 'should include own private entry');
  assert.ok(names.includes('F共享菜'), 'should include own shared entry');
  assert.ok(names.includes('E共享菜'), 'should include other user shared entry');
});

test('PUT/DELETE another user entry returns 403', async () => {
  const a = await ensureUser('vis-user-g', '小G');
  const b = await ensureUser('vis-user-h', '小H');
  const entry = await createOwnedEntry(a.id, 'G的菜', { visibility: 'private' });

  const putRes = await apiRequest(`/api/entries/${entry.id}`, {
    method: 'PUT',
    body: form({ ...baseFields, dish_name: 'G的菜改', restaurant_name: '某店', user_id: b.id })
  });
  assert.equal(putRes.response.status, 403);

  const delRes = await apiRequest(`/api/entries/${entry.id}`, {
    method: 'DELETE',
    body: { user_id: b.id }
  });
  assert.equal(delRes.response.status, 403);
});

test('batch-delete refuses other user records', async () => {
  const a = await ensureUser('vis-user-i', '小I');
  const b = await ensureUser('vis-user-j', '小J');
  const mine = await createOwnedEntry(a.id, 'I自己的菜', { visibility: 'private' });
  const theirs = await createOwnedEntry(b.id, 'J的菜', { visibility: 'private' });

  const res = await apiRequest('/api/entries/batch-delete', {
    method: 'POST',
    body: { ids: [mine.id, theirs.id], user_id: a.id }
  });
  assert.equal(res.response.status, 403);
});

// --- Regression coverage for fixed bugs ---

test('IMPORT /api/import preserves entry→tag links via id remapping', async () => {
  const tagA = (await apiRequest('/api/tags', { method: 'POST', body: { name: '导入标签A', color: '#111111' } })).data;
  const tagB = (await apiRequest('/api/tags', { method: 'POST', body: { name: '导入标签B', color: '#222222' } })).data;
  const entry = (await apiRequest('/api/entries', {
    method: 'POST',
    body: form({ ...baseFields, dish_name: '导入源记录', tag_ids: `${tagA.id},${tagB.id}` })
  })).data;

  const backup = (await apiRequest('/api/export')).data;

  // Simulate a restore onto a fresh device: the source rows no longer exist,
  // so the import must recreate them and remap entry→tag links to new ids.
  run('DELETE FROM entry_tags WHERE entry_id = ?', [entry.id]);
  run('DELETE FROM food_entries WHERE id = ?', [entry.id]);

  const impForm = new FormData();
  impForm.append('file', new Blob([JSON.stringify(backup)], { type: 'application/json' }), 'backup.json');
  const impRes = await fetch(`${baseUrl}/import`, { method: 'POST', body: impForm });
  assert.equal(impRes.status, 200);

  const { data: list } = await apiRequest('/api/entries?page=1&page_size=100');
  const restored = list.data.filter((e) => e.dish_name === '导入源记录');
  assert.ok(restored.length >= 1, 'should have imported copies');
  for (const c of restored) {
    const names = (c.tags || []).map((t) => t.name);
    assert.ok(
      names.includes(tagA.name) && names.includes(tagB.name),
      `imported copy ${c.id} should keep both tags, got ${JSON.stringify(names)}`
    );
  }
});

test('DELETE /api/entries/:id without user_id is refused for an owned entry', async () => {
  const u = await ensureUser('own-del-a', '删甲');
  const entry = await createOwnedEntry(u.id, '删甲记录', { visibility: 'private' });
  const noId = await apiRequest(`/api/entries/${entry.id}`, { method: 'DELETE' });
  assert.equal(noId.response.status, 403, 'deleting an owned entry without user_id must be blocked');
  const withId = await apiRequest(`/api/entries/${entry.id}`, { method: 'DELETE', body: { user_id: u.id } });
  assert.equal(withId.response.status, 204, 'owner can delete');
});

test('GET /api/entries/stats respects user/visibility scope', async () => {
  const a = await ensureUser('stat-scope-a', '统计甲');
  const b = await ensureUser('stat-scope-b', '统计乙');
  const created = await apiRequest('/api/groups', { method: 'POST', body: { name: '统计范围组', creator_id: a.id } });
  const code = created.data.group.id;
  await apiRequest('/api/groups/join', { method: 'POST', body: { code, user_id: b.id } });
  await createOwnedEntry(a.id, '甲共享菜', { visibility: 'group', group_id: code });
  await createOwnedEntry(b.id, '乙私有菜', { visibility: 'private' });

  const mineA = await apiRequest(`/api/entries/stats?user_id=${a.id}&view=mine`);
  assert.equal(mineA.data.overview.total, 1, 'mine view should only count 甲共享菜');

  const allAB = await apiRequest(`/api/entries/stats?user_id=${b.id}&view=all&group_id=${code}`);
  assert.equal(allAB.data.overview.total, 2, 'all view should count own + group-shared');
});

test('GET /api/entries sort_by=distance orders by proximity', async () => {
  await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, dish_name: '距离近点', restaurant_name: '近店', latitude: '39.9001', longitude: '116.4001' }) });
  await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, dish_name: '距离远点', restaurant_name: '远店', latitude: '39.9002', longitude: '116.4002' }) });
  const { data } = await apiRequest('/api/entries?sort_by=distance&sort_lat=39.900&sort_lng=116.400&sort_order=asc&page=1&page_size=100');
  const idx = {};
  data.data.forEach((e, i) => { if (e.dish_name === '近点'.replace('近点', '距离近点')) idx.near = i; if (e.dish_name === '距离远点') idx.far = i; });
  assert.ok(idx.near !== undefined && idx.far !== undefined);
  assert.ok(idx.near < idx.far, 'nearer entry should come first');
});

test('GET /api/export embeds image Base64 and /api/backup/download serves DB', async () => {
  const { data } = await apiRequest('/api/export');
  assert.ok(Array.isArray(data.images));
  assert.ok(data.images.some((i) => i.image_base64), 'at least one image should embed base64');
  const backupRes = await fetch(`${baseUrl}/backup/download`);
  assert.equal(backupRes.status, 200);
  assert.ok((await backupRes.arrayBuffer()).byteLength > 0);
});

test('POST /api/entries rejects invalid meal_date format', async () => {
  const bad = await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, meal_date: '2026/01/01' }) });
  assert.equal(bad.response.status, 400);
  const good = await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, meal_date: '2026-01-01' }) });
  assert.equal(good.response.status, 201);
  assert.equal(good.data.meal_date, '2026-01-01');
});

test('GET /api/export/csv escapes formula-injection cells', async () => {
  await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, dish_name: 'CSV注', notes: '=cmd()' }) });
  const csv = await (await fetch(`${baseUrl}/export/csv`)).text();
  assert.ok(csv.includes('"\'=cmd()"'), 'leading = cell should be single-quoted');
});

test('GET /api/entries tag_match=all returns only entries containing every tag', async () => {
  const t1 = (await apiRequest('/api/tags', { method: 'POST', body: { name: '全部标签一', color: '#334455' } })).data;
  const t2 = (await apiRequest('/api/tags', { method: 'POST', body: { name: '全部标签二', color: '#445566' } })).data;
  await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, dish_name: '全A', tag_ids: `${t1.id}` }) });
  await apiRequest('/api/entries', { method: 'POST', body: form({ ...baseFields, dish_name: '全AB', tag_ids: `${t1.id},${t2.id}` }) });
  const anyRes = await apiRequest(`/api/entries?tag_ids=${t1.id},${t2.id}`);
  const namesAny = anyRes.data.data.map((e) => e.dish_name);
  assert.ok(namesAny.includes('全A') && namesAny.includes('全AB'), 'any should include both');
  const allRes = await apiRequest(`/api/entries?tag_ids=${t1.id},${t2.id}&tag_match=all`);
  const namesAll = allRes.data.data.map((e) => e.dish_name);
  assert.ok(namesAll.includes('全AB'), 'all should include entry with both');
  assert.ok(!namesAll.includes('全A'), 'all should exclude entry with only one tag');
});
