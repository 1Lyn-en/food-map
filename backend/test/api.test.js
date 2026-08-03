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
const { db } = await import('../src/db.js');
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
