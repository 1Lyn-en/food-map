import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { db, all, get, run, tx } from './db.js';
import { entrySchema, tagSchema, userSchema } from './validators.js';
import { uploadPath } from './upload-path.js';

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const id = z.number().int().positive().safe();
const stamp = z.string().max(64).nullable().optional();
const backupEntry = entrySchema.extend({
  id,
  user_id: z.string().max(64).nullable().optional(),
  group_id: z.string().max(10).nullable().optional(),
  cover_image: z.string().max(500).optional().default(''),
  tag_ids: z.string().optional(),
  created_at: stamp, updated_at: stamp, deleted_at: stamp
});
const schema = z.object({
  version: z.enum(['1.0', '1.1']).optional(),
  entries: z.array(backupEntry).max(10000),
  tags: z.array(tagSchema.extend({ id, created_at: stamp })).optional().default([]),
  entry_tags: z.array(z.object({ entry_id: id, tag_id: id })).optional().default([]),
  images: z.array(z.object({
    id: id.optional(), entry_id: id,
    image_path: z.string().max(500),
    thumbnail_path: z.string().max(500).nullable().optional(),
    sort_order: z.number().int().min(0).optional().default(0),
    created_at: stamp,
    image_base64: z.string().nullable().optional(),
    thumbnail_base64: z.string().nullable().optional()
  })).optional().default([]),
  settings: z.array(z.object({ key: z.string().min(1).max(100), value: z.string(), updated_at: stamp })).optional().default([]),
  users: z.array(userSchema.extend({ created_at: stamp })).optional().default([]),
  groups: z.array(z.object({ id: z.string().regex(/^[A-Z0-9]{6}$/), name: z.string().min(1).max(30), creator_id: z.string().min(1).max(64), created_at: stamp })).optional().default([]),
  group_members: z.array(z.object({ group_id: z.string().regex(/^[A-Z0-9]{6}$/), user_id: z.string().min(1).max(64), joined_at: stamp })).optional().default([])
});

export function exportBackup(uploadsDir) {
  // Synchronous read transaction gives all tables one SQLite snapshot.
  return tx(() => {
    const images = all('SELECT * FROM entry_images ORDER BY entry_id, sort_order, id').map((image) => {
      const encode = (path) => path ? readFileSync(uploadPath(uploadsDir, path)).toString('base64') : null;
      return { ...image, image_base64: encode(image.image_path), thumbnail_base64: encode(image.thumbnail_path) };
    });
    return {
      version: '1.1', exported_at: new Date().toISOString(),
      entries: all('SELECT * FROM food_entries'), tags: all('SELECT * FROM tags'),
      entry_tags: all('SELECT * FROM entry_tags'), images, settings: all('SELECT * FROM settings'),
      users: all('SELECT * FROM users'), groups: all('SELECT * FROM groups'), group_members: all('SELECT * FROM group_members')
    };
  });
}

async function decodeImage(base64) {
  if (!base64 || base64.length > 14 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) fail('图片 Base64 缺失、损坏或过大');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 10 * 1024 * 1024 || bytes.toString('base64') !== base64) fail('图片超过限制或编码不正确');
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) fail('备份图片仅支持 JPEG、PNG、WebP');
    // Decode, not just inspect a header; reject truncated/corrupt image bodies.
    await image.stats();
    return { bytes, extension: metadata.format === 'jpeg' ? 'jpg' : metadata.format };
  } catch { fail('备份图片无法解码'); }
}

export async function importBackup(raw, uploadsDir) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail('备份结构或字段不正确');
  const data = parsed.data;
  const entryIds = new Set(data.entries.map((e) => e.id));
  if (entryIds.size !== data.entries.length) fail('备份记录 ID 重复');
  const tagIds = new Set(data.tags.map((t) => t.id));
  if (tagIds.size !== data.tags.length) fail('备份标签 ID 重复');
  for (const link of data.entry_tags) {
    if (!entryIds.has(link.entry_id) || !tagIds.has(link.tag_id)) fail('备份标签关联不存在');
  }
  for (const entry of data.entries) if (entry.cover_image) uploadPath(uploadsDir, entry.cover_image);
  const candidates = new Set(data.entries.filter((e) => !get('SELECT id FROM food_entries WHERE id=?', [e.id])).map((e) => e.id));
  const compatibilityWarnings = [];
  const knownUserIds = new Set([...all('SELECT id FROM users').map((u) => u.id), ...data.users.map((u) => u.id)]);
  const knownGroupIds = new Set([...all('SELECT id FROM groups').map((g) => g.id), ...data.groups.map((g) => g.id)]);
  for (const group of data.groups) {
    if (!knownUserIds.has(group.creator_id)) fail('房间创建者不存在');
  }
  for (const entry of data.entries) {
    if (entry.user_id && !knownUserIds.has(entry.user_id)) {
      if (data.version === '1.1') fail('完整备份中的记录用户不存在');
      compatibilityWarnings.push(`记录 ${entry.id} 的旧备份缺少用户资料，已恢复为未归属记录`);
    }
    if (entry.visibility === 'group' && entry.group_id && !knownGroupIds.has(entry.group_id)) {
      if (data.version === '1.1') fail('完整备份中的共享房间不存在');
      compatibilityWarnings.push(`记录 ${entry.id} 的旧备份缺少房间资料，已恢复为私有记录`);
    }
  }
  const prepared = [];
  for (const image of data.images) {
    if (!entryIds.has(image.entry_id)) fail('备份图片关联的记录不存在');
    uploadPath(uploadsDir, image.image_path);
    if (image.thumbnail_path) uploadPath(uploadsDir, image.thumbnail_path);
    if (!candidates.has(image.entry_id)) continue;
    if (!image.image_base64) {
      if (data.version === '1.1') fail('完整备份缺少图片内容');
      compatibilityWarnings.push(`记录 ${image.entry_id} 的旧备份图片缺少文件内容，已跳过`);
      continue;
    }
    const original = await decodeImage(image.image_base64);
    const thumb = image.thumbnail_base64 ? await decodeImage(image.thumbnail_base64) : null;
    prepared.push({ ...image, original, thumb });
  }
  const userIds = new Set(data.users.map((u) => u.id));
  const groupIds = new Set(data.groups.map((g) => g.id));
  for (const member of data.group_members) {
    if ((!groupIds.has(member.group_id) && !get('SELECT id FROM groups WHERE id=?', [member.group_id])) ||
        (!userIds.has(member.user_id) && !get('SELECT id FROM users WHERE id=?', [member.user_id]))) fail('成员关联的用户或房间不存在');
  }

  const createdFiles = [];
  try {
    // No await from BEGIN through COMMIT: another request cannot interleave writes
    // on this shared connection. Recheck IDs after asynchronous image decoding.
    return tx(() => {
      const importedIds = new Set();
      let importedImages = 0;
      const warnings = [...compatibilityWarnings];
      for (const e of data.entries) {
        if (get('SELECT id FROM food_entries WHERE id=?', [e.id])) continue;
        const knownUser = e.user_id && knownUserIds.has(e.user_id) ? e.user_id : null;
        const knownGroup = e.group_id && knownGroupIds.has(e.group_id) ? e.group_id : null;
        const visibility = e.visibility === 'group' && knownGroup ? 'group' : 'private';
        run(`INSERT INTO food_entries
          (id,dish_name,restaurant_name,address_text,longitude,latitude,meal_type,price_per_person,
           rating,notes,is_favorite,visit_count,meal_date,created_at,updated_at,deleted_at,user_id,group_id,visibility,cover_image)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_DATE),COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP),?,?,?,?,?)`,
        [e.id,e.dish_name,e.restaurant_name,e.address_text,e.longitude,e.latitude,e.meal_type,e.price_per_person,
          e.rating,e.notes,e.is_favorite,e.visit_count ?? 1,e.meal_date,e.created_at ?? null,e.updated_at ?? null,e.deleted_at ?? null,
          knownUser,knownGroup,visibility,'']);
        importedIds.add(e.id);
      }
      const tagMap = new Map();
      const usedTagIds = new Set(data.entry_tags.filter((link) => importedIds.has(link.entry_id)).map((link) => link.tag_id));
      for (const t of data.tags) {
        if (!usedTagIds.has(t.id) && data.version !== '1.1') continue;
        run('INSERT OR IGNORE INTO tags (name,color,icon,sort_order,created_at) VALUES (?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))', [t.name,t.color,t.icon,t.sort_order,t.created_at ?? null]);
        tagMap.set(t.id, get('SELECT id FROM tags WHERE name=?', [t.name]).id);
      }
      for (const link of data.entry_tags) if (importedIds.has(link.entry_id)) {
        run('INSERT OR IGNORE INTO entry_tags (entry_id,tag_id) VALUES (?,?)', [link.entry_id,tagMap.get(link.tag_id)]);
      }
      const pathMaps = new Map();
      const write = ({ bytes, extension }) => {
        const url = `/uploads/imported/${randomUUID()}.${extension}`;
        const path = uploadPath(uploadsDir, url);
        mkdirSync(dirname(path), { recursive: true });
        // Exclusive creation means neither a malicious backup nor ID collision
        // can overwrite an existing image.
        writeFileSync(path, bytes, { flag: 'wx' });
        createdFiles.push(path);
        return url;
      };
      for (const image of prepared) {
        if (!importedIds.has(image.entry_id)) continue;
        const original = write(image.original);
        const thumb = image.thumb ? write(image.thumb) : original;
        run('INSERT INTO entry_images (entry_id,image_path,thumbnail_path,sort_order,created_at) VALUES (?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))',
          [image.entry_id,original,thumb,image.sort_order,image.created_at ?? null]);
        if (!pathMaps.has(image.entry_id)) pathMaps.set(image.entry_id, new Map());
        pathMaps.get(image.entry_id).set(image.image_path, original);
        importedImages++;
      }
      for (const e of data.entries) if (importedIds.has(e.id)) {
        const cover = pathMaps.get(e.id)?.get(e.cover_image) || get('SELECT image_path FROM entry_images WHERE entry_id=? ORDER BY sort_order,id LIMIT 1', [e.id])?.image_path || '';
        if (e.cover_image && !cover) warnings.push(`记录 ${e.id} 的旧备份不含图片内容，已清除失效封面`);
        run('UPDATE food_entries SET cover_image=? WHERE id=?', [cover,e.id]);
      }
      for (const u of data.users) run('INSERT OR IGNORE INTO users (id,nickname,color,created_at) VALUES (?,?,?,COALESCE(?,CURRENT_TIMESTAMP))', [u.id,u.nickname,u.color,u.created_at ?? null]);
      for (const g of data.groups) run('INSERT OR IGNORE INTO groups (id,name,creator_id,created_at) VALUES (?,?,?,COALESCE(?,CURRENT_TIMESTAMP))', [g.id,g.name,g.creator_id,g.created_at ?? null]);
      for (const m of data.group_members) run('INSERT OR IGNORE INTO group_members (group_id,user_id,joined_at) VALUES (?,?,COALESCE(?,CURRENT_TIMESTAMP))', [m.group_id,m.user_id,m.joined_at ?? null]);
      for (const s of data.settings) run('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,COALESCE(?,CURRENT_TIMESTAMP))', [s.key,s.value,s.updated_at ?? null]);
      return { imported_entries: importedIds.size, skipped_entries: data.entries.length - importedIds.size, imported_images: importedImages, warnings,
        message: `已导入 ${importedIds.size} 条记录，跳过 ${data.entries.length - importedIds.size} 条同 ID 记录，恢复 ${importedImages} 张图片${warnings.length ? `；${warnings.length} 条图片缺失提示` : ''}` };
    });
  } catch (error) {
    for (const path of createdFiles) {
      try { unlinkSync(path); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') console.error('导入文件回滚失败', cleanupError);
      }
    }
    throw error;
  }
}
