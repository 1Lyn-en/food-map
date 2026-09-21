import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createPlaceholderPng } from '../src/png.js';

const temp = mkdtempSync(join(tmpdir(), 'food-map-reliability-'));
process.env.DB_PATH = join(temp, 'live.db');
process.env.UPLOADS_DIR = join(temp, 'uploads');
process.env.BACKUPS_DIR = join(temp, 'backups');
process.env.FRONTEND_DIST = join(temp, 'no-frontend');
const { app } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const backend = fileURLToPath(new URL('../', import.meta.url));
const png = createPlaceholderPng(64, 64, [200, 80, 40]);
const urlPath = (path) => join(process.env.UPLOADS_DIR, path.slice('/uploads/'.length));
const tables = ['entry_tags', 'entry_images', 'food_entries', 'tags', 'settings', 'group_members', 'groups', 'users'];

function snapshot() {
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
function files(dir = process.env.UPLOADS_DIR) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name)).sort();
}
function reset() {
  for (const table of tables) db.exec(`DELETE FROM ${table}`);
  db.exec('DELETE FROM sqlite_sequence');
  rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
  mkdirSync(join(process.env.UPLOADS_DIR, 'originals'), { recursive: true });
  mkdirSync(join(process.env.UPLOADS_DIR, 'thumbnails'), { recursive: true });
}
async function create(name = 'fixture', count = 1) {
  const body = new FormData();
  for (const [k, v] of Object.entries({ dish_name: name, restaurant_name: 'test', longitude: '116.4', latitude: '39.9' })) body.append(k, v);
  for (let i = 0; i < count; i++) body.append('images', new Blob([png], { type: 'image/png' }), `${i}.png`);
  const r = await fetch(`${origin}/api/entries`, { method: 'POST', body });
  assert.equal(r.status, 201);
  return r.json();
}
async function importBackup(data) {
  const body = new FormData();
  body.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }), 'backup.json');
  const response = await fetch(`${origin}/api/import`, { method: 'POST', body });
  return { response, data: await response.json() };
}
function seed(env, args = []) {
  return spawnSync(process.execPath, ['src/seed.js', ...args], { cwd: backend, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15000 });
}

test.beforeEach(reset);
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(temp, { recursive: true, force: true });
});

// Tracer: the downloaded file must restore committed WAL contents, not merely be nonempty.
test('backup snapshot includes uncheckpointed WAL data and leaves no temporary files', async () => {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA wal_autocheckpoint = 0');
  const entry = await create('WAL-only record');
  assert.ok(readFileSync(process.env.DB_PATH + '-wal').length > 0);
  const response = await fetch(`${origin}/api/backup/download`);
  assert.equal(response.status, 200);
  const destination = join(temp, 'download.db');
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  const restored = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(restored.prepare('SELECT dish_name FROM food_entries WHERE id = ?').get(entry.id)?.dish_name, 'WAL-only record');
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM entry_images').get().n, 1);
  } finally { restored.close(); }
  assert.deepEqual(readdirSync(process.env.BACKUPS_DIR), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM food_entries').get().n, 1);
});

test('JSON round trip restores images, cover, ordering, tags, users and rooms into empty storage', async () => {
  const entry = await create('round-trip', 2);
  db.prepare('INSERT INTO users (id,nickname,color) VALUES (?,?,?)').run('owner', 'Owner', '#123456');
  db.prepare('INSERT INTO groups (id,name,creator_id) VALUES (?,?,?)').run('ABCDEF', 'room', 'owner');
  db.prepare('INSERT INTO group_members (group_id,user_id) VALUES (?,?)').run('ABCDEF', 'owner');
  const tag = db.prepare('INSERT INTO tags (name,color) VALUES (?,?)').run('测试', '#123456').lastInsertRowid;
  db.prepare('INSERT INTO entry_tags (entry_id,tag_id) VALUES (?,?)').run(entry.id, tag);
  db.prepare("UPDATE food_entries SET cover_image=?,user_id='owner',group_id='ABCDEF',visibility='group',price_per_person=0,deleted_at='2026-01-02 00:00:00' WHERE id=?").run(entry.images[1].image_path, entry.id);
  db.prepare('UPDATE entry_images SET sort_order=7 WHERE id=?').run(entry.images[1].id);
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('theme', 'dark');
  const backup = await (await fetch(`${origin}/api/export`)).json();
  const expectedFiles = backup.images.map((image) => ({ original: Buffer.from(image.image_base64, 'base64'), thumb: Buffer.from(image.thumbnail_base64, 'base64') }));
  reset();
  const result = await importBackup(backup);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  const rows = db.prepare('SELECT * FROM food_entries').all();
  assert.equal(rows.length, 1);
  const images = db.prepare('SELECT * FROM entry_images ORDER BY sort_order').all();
  assert.equal(images.length, 2, 'image rows must be restored, not just their old URLs');
  for (const [i, image] of images.entries()) {
    assert.deepEqual(readFileSync(urlPath(image.image_path)), expectedFiles[i].original);
    assert.deepEqual(readFileSync(urlPath(image.thumbnail_path)), expectedFiles[i].thumb);
    assert.equal((await fetch(origin + image.image_path)).status, 200);
    assert.equal(image.entry_id, rows[0].id);
  }
  assert.equal(images[1].sort_order, 7);
  assert.equal(rows[0].cover_image, images[1].image_path);
  assert.equal(rows[0].price_per_person, 0);
  assert.equal(rows[0].deleted_at, '2026-01-02 00:00:00');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_tags').get().n, 1);
  assert.equal(db.prepare('SELECT nickname FROM users WHERE id=?').get('owner').nickname, 'Owner');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM group_members').get().n, 1);
  assert.equal(db.prepare('SELECT value FROM settings WHERE key=?').get('theme').value, 'dark');
});

test('import skips ID conflicts without changing their images/tags and reports actual counts', async () => {
  const local = await create('local');
  db.prepare('INSERT INTO tags (name,color) VALUES (?,?)').run('外来', '#654321');
  const before = snapshot();
  const fileBefore = files();
  const incoming = { version: '1.0', entries: [{ ...local, dish_name: 'different', cover_image: '/uploads/foreign.png' }], tags: [{ id: 987, name: '外来', color: '#123456' }], entry_tags: [{ entry_id: local.id, tag_id: 987 }], images: [{ entry_id: local.id, image_path: '/uploads/foreign.png', image_base64: png.toString('base64') }] };
  const first = await importBackup(incoming);
  assert.equal(first.response.status, 200);
  assert.equal(first.data.imported_entries, 0);
  assert.equal(first.data.skipped_entries, 1);
  assert.deepEqual(db.prepare('SELECT * FROM food_entries').all(), before.food_entries);
  assert.deepEqual(db.prepare('SELECT * FROM entry_images').all(), before.entry_images);
  assert.deepEqual(db.prepare('SELECT * FROM entry_tags').all(), before.entry_tags);
  assert.deepEqual(db.prepare('SELECT * FROM tags').all(), before.tags);
  assert.deepEqual(files(), fileBefore);
});

test('invalid import (traversal, corrupt image, broken reference) leaves database and files unchanged', async () => {
  await create('keep');
  const base = { entries: [{ id: 999, dish_name: 'incoming', restaurant_name: 'test', longitude: 116.4, latitude: 39.9 }], tags: [{ id: 123, name: '新标签', color: '#123456' }], images: [{ entry_id: 999, image_path: '/uploads/new.png', image_base64: png.toString('base64') }] };
  const cases = [
    (b) => { b.images[0].image_path = '/uploads/../../outside.png'; },
    (b) => { b.images[0].image_base64 = 'not-base64!'; },
    (b) => { b.images[0].image_base64 = Buffer.from('not an image').toString('base64'); },
    (b) => { b.images[0].entry_id = 123456; }
  ];
  for (const mutate of cases) {
    const incoming = structuredClone(base);
    mutate(incoming);
    const before = snapshot();
    const beforeFiles = files();
    const result = await importBackup(incoming);
    assert.equal(result.response.status, 400, JSON.stringify(result.data));
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(files(), beforeFiles);
  }
});

test('old backups without image bytes import records, clear broken cover and report a warning', async () => {
  const incoming = {
    version: '1.0',
    entries: [{ id: 888, dish_name: 'legacy', restaurant_name: 'old', longitude: 116.4, latitude: 39.9, cover_image: '/uploads/missing.png' }],
    images: [{ id: 1, entry_id: 888, image_path: '/uploads/missing.png', thumbnail_path: '/uploads/missing-thumb.png', sort_order: 0, image_base64: null, thumbnail_base64: null }]
  };
  const result = await importBackup(incoming);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.imported_entries, 1);
  assert.equal(result.data.imported_images, 0);
  assert.equal(result.data.warnings.length, 2);
  assert.equal(db.prepare('SELECT cover_image FROM food_entries WHERE id=888').get().cover_image, '');
});

test('legacy backup with missing user/room metadata downgrades entries to private and warns', async () => {
  const incoming = {
    version: '1.0',
    entries: [{ id: 890, dish_name: 'legacy-shared', restaurant_name: 'old', longitude: 116.4, latitude: 39.9, user_id: 'gone-user', group_id: 'ABCDEF', visibility: 'group' }]
  };
  const result = await importBackup(incoming);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.warnings.length, 2);
  const row = db.prepare('SELECT user_id,group_id,visibility FROM food_entries WHERE id=890').get();
  assert.equal(row.user_id, null);
  assert.equal(row.group_id, null);
  assert.equal(row.visibility, 'private');
});

test('v1.1 backup missing image bytes is rejected without partial writes', async () => {
  const incoming = {
    version: '1.1',
    entries: [{ id: 889, dish_name: 'broken-complete', restaurant_name: 'bad', longitude: 116.4, latitude: 39.9, cover_image: '/uploads/missing.png' }],
    images: [{ id: 1, entry_id: 889, image_path: '/uploads/missing.png', image_base64: null }]
  };
  const before = snapshot();
  const result = await importBackup(incoming);
  assert.equal(result.response.status, 400);
  assert.deepEqual(snapshot(), before);
});

test('permanent deletion removes original/thumbnail and preserves another entry', async () => {
  const target = await create('delete');
  const keep = await create('keep');
  const paths = target.images.flatMap((i) => [i.image_path, i.thumbnail_path]);
  assert.ok(paths.every((p) => existsSync(urlPath(p))));
  assert.equal((await fetch(`${origin}/api/entries/${target.id}/permanent`, { method: 'DELETE' })).status, 204);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM food_entries WHERE id=?').get(target.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_images WHERE entry_id=?').get(target.id).n, 0);
  assert.ok(paths.every((p) => !existsSync(urlPath(p))), 'physical files must disappear');
  assert.ok(keep.images.every((i) => existsSync(urlPath(i.image_path)) && existsSync(urlPath(i.thumbnail_path))));
});

test('permanent deletion does not remove a file still referenced by another entry', async () => {
  const target = await create('shared-delete');
  const keep = await create('shared-keep');
  const shared = target.images[0];
  db.prepare('UPDATE entry_images SET image_path=?,thumbnail_path=? WHERE entry_id=?').run(shared.image_path, shared.thumbnail_path, keep.id);
  db.prepare('UPDATE food_entries SET cover_image=? WHERE id=?').run(shared.image_path, keep.id);
  assert.equal((await fetch(`${origin}/api/entries/${target.id}/permanent`, { method: 'DELETE' })).status, 204);
  assert.ok(existsSync(urlPath(shared.image_path)));
  assert.ok(existsSync(urlPath(shared.thumbnail_path)));
  assert.equal((await fetch(origin + shared.image_path)).status, 200);
});

test('export and SQLite backup refuse while the shared database connection has an active write transaction', async () => {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("INSERT INTO food_entries (dish_name,restaurant_name,longitude,latitude) VALUES ('partial','test',1,1)").run();
    for (const path of ['/api/export', '/api/backup/download']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 409);
      assert.match((await response.json()).message, /正在处理|稍后/);
    }
  } finally {
    db.exec('ROLLBACK');
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM food_entries WHERE dish_name='partial'").get().n, 0);
});

test('seed initializes empty storage and refuses reruns/nonempty databases without data changes', () => {
  const dir = mkdtempSync(join(temp, 'seed-'));
  const env = { DB_PATH: join(dir, 'seed.db'), UPLOADS_DIR: join(dir, 'uploads') };
  const first = seed(env);
  assert.equal(first.status, 0, first.stderr);
  const seeded = new DatabaseSync(env.DB_PATH);
  try {
    assert.equal(seeded.prepare('SELECT COUNT(*) AS n FROM food_entries').get().n, 3);
    const data = seeded.prepare('SELECT * FROM food_entries').all();
    for (const entry of data) assert.ok(existsSync(join(env.UPLOADS_DIR, entry.cover_image.slice('/uploads/'.length))));
    const second = seed(env);
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /非空|已有数据/);
    assert.deepEqual(seeded.prepare('SELECT * FROM food_entries').all(), data);
  } finally { seeded.close(); }
});
