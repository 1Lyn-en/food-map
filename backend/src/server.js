import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { mkdirSync, rmSync, existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { backup } from 'node:sqlite';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, all, get, run, txAsync, db, ensureTransactionIdle } from './db.js';
import { exportBackup, importBackup } from './backup.js';
import { permanentlyDelete } from './delete-entries.js';
import { entrySchema, tagSchema, settingsValueSchema, userSchema, createGroupSchema, joinGroupSchema, groupMemberSchema, validate } from './validators.js';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
const originalsDir = join(uploadsDir, 'originals');
const thumbnailsDir = join(uploadsDir, 'thumbnails');
mkdirSync(originalsDir, { recursive: true });
mkdirSync(thumbnailsDir, { recursive: true });

const frontendDist = process.env.FRONTEND_DIST || join(__dirname, '..', '..', 'frontend', 'dist');

const backupsDir = process.env.BACKUPS_DIR || join(__dirname, '..', 'backups');
mkdirSync(backupsDir, { recursive: true });

initDatabase();

export const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin));
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
function makeStorage(dest) {
  return multer.diskStorage({
    destination(req, file, cb) {
      const now = new Date();
      const y = String(now.getFullYear());
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const subDir = join(dest, y, m);
      mkdirSync(subDir, { recursive: true });
      file._destSubDir = subDir;
      cb(null, subDir);
    },
    filename(req, file, cb) {
      const ext = extname(file.originalname).toLowerCase();
      file._baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, file._baseName);
    }
  });
}
const uploadSingle = multer({
  storage: makeStorage(originalsDir),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = extname(file.originalname).toLowerCase();
    if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
      return cb(Object.assign(new Error('仅支持 jpg/jpeg/png/webp 图片'), { status: 400 }));
    }
    cb(null, true);
  }
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const uploadMultiple = multer({
  storage: makeStorage(originalsDir),
  limits: { fileSize: 10 * 1024 * 1024, files: 9 },
  fileFilter(req, file, cb) {
    const ext = extname(file.originalname).toLowerCase();
    if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
      return cb(Object.assign(new Error('仅支持 jpg/jpeg/png/webp 图片'), { status: 400 }));
    }
    cb(null, true);
  }
});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---- ENTRY HELPER: load tags for entries ----
function attachTags(entries) {
  if (!Array.isArray(entries)) return entries;
  const ids = entries.map((e) => e.id);
  if (ids.length === 0) return entries;
  const placeholders = ids.map(() => '?').join(',');
  const tagRows = all(
    `SELECT et.entry_id, t.id, t.name, t.color, t.icon FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id IN (${placeholders}) ORDER BY t.sort_order`,
    ids
  );
  const tagMap = {};
  for (const t of tagRows) {
    if (!tagMap[t.entry_id]) tagMap[t.entry_id] = [];
    tagMap[t.entry_id].push({ id: t.id, name: t.name, color: t.color, icon: t.icon });
  }
  return entries.map((e) => ({ ...e, tags: tagMap[e.id] || [], image_url: e.cover_image || '' }));
}

function attachImages(entries) {
  if (!Array.isArray(entries)) return entries;
  if (entries.length === 0) return entries;
  const ids = entries.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT * FROM entry_images WHERE entry_id IN (${placeholders}) ORDER BY sort_order, id`,
    ids
  );
  const map = {};
  for (const img of rows) {
    if (!map[img.entry_id]) map[img.entry_id] = [];
    map[img.entry_id].push(img);
  }
  return entries.map((e) => ({ ...e, images: map[e.id] || [] }));
}

function attachUsers(entries) {
  if (!Array.isArray(entries)) return entries;
  if (entries.length === 0) return entries;
  const ids = [...new Set(entries.map((e) => e.user_id).filter(Boolean))];
  if (ids.length === 0) return entries;
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(`SELECT id, nickname, color FROM users WHERE id IN (${placeholders})`, ids);
  const map = {};
  for (const u of rows) map[u.id] = u;
  return entries.map((e) => ({
    ...e,
    user_nickname: e.user_id && map[e.user_id] ? map[e.user_id].nickname : '',
    user_color: e.user_id && map[e.user_id] ? map[e.user_id].color : ''
  }));
}

function visibilityConditions({ user_id, view, group_id }) {
  const clauses = [];
  const params = [];
  if (!user_id) return { clauses, params };
  const gid = group_id || '';
  if (view === 'mine') {
    clauses.push('user_id = ?');
    params.push(user_id);
  } else if (view === 'shared') {
    if (gid) {
      clauses.push("group_id = ? AND visibility = 'group' AND user_id != ?");
      params.push(gid, user_id);
    } else {
      clauses.push('1 = 0');
    }
  } else {
    if (gid) {
      clauses.push("(user_id = ? OR (group_id = ? AND visibility = 'group'))");
      params.push(user_id, gid);
    } else {
      clauses.push('user_id = ?');
      params.push(user_id);
    }
  }
  return { clauses, params };
}

function assertOwnsEntry(entry, user_id) {
  if (!entry) return { ok: false, error: 404, message: '记录不存在' };
  if (entry.user_id) {
    if (!user_id || entry.user_id !== user_id) {
      return { ok: false, error: 403, message: '只能操作自己的记录' };
    }
  }
  return { ok: true };
}

function resolveUserId(req) {
  return req.body?.user_id || req.query?.user_id || '';
}

// ---- ENTRIES ----
app.get('/api/entries', (req, res) => {
  const {
    keyword, tag_ids, min_rating, max_rating, price_min, price_max,
    meal_types, date_from, date_to, is_favorite, has_image, sort_by, sort_order,
    page, page_size, deleted, user_id, view, group_id, sort_lat, sort_lng
  } = req.query;

  let where = [`e.deleted_at IS ${deleted === '1' ? 'NOT NULL' : 'NULL'}`];
  const params = [];

  const vis = visibilityConditions({ user_id, view, group_id });
  where.push(...vis.clauses);
  params.push(...vis.params);

  if (keyword) {
    where.push('(e.dish_name LIKE ? OR e.restaurant_name LIKE ? OR e.address_text LIKE ? OR e.notes LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }

  if (min_rating) { where.push('e.rating >= ?'); params.push(Number(min_rating)); }
  if (max_rating) { where.push('e.rating <= ?'); params.push(Number(max_rating)); }
  if (price_min) { where.push('e.price_per_person >= ?'); params.push(Number(price_min)); }
  if (price_max) { where.push('e.price_per_person <= ?'); params.push(Number(price_max)); }
  if (date_from) { where.push('e.meal_date >= ?'); params.push(date_from); }
  if (date_to) { where.push('e.meal_date <= ?'); params.push(date_to); }

  if (is_favorite === '1') { where.push('e.is_favorite = 1'); }

  if (has_image === '1') { where.push('EXISTS (SELECT 1 FROM entry_images ei WHERE ei.entry_id = e.id)'); }

  if (meal_types) {
    const types = meal_types.split(',').filter(Boolean);
    if (types.length > 0) {
      where.push(`e.meal_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
  }

  if (tag_ids) {
    const tagIdList = tag_ids.split(',').filter(Boolean).map(Number);
    if (tagIdList.length > 0) {
      const placeholders = tagIdList.map(() => '?').join(',');
      if (req.query.tag_match === 'all') {
        where.push(`e.id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN (${placeholders}) GROUP BY entry_id HAVING COUNT(DISTINCT tag_id) = ?)`);
        params.push(...tagIdList, tagIdList.length);
      } else {
        where.push(`e.id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN (${placeholders}))`);
        params.push(...tagIdList);
      }
    }
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const orderMap = {
    date: 'e.meal_date',
    rating: 'e.rating',
    price: 'e.price_per_person',
    created: 'e.created_at'
  };
  const orderDir = sort_order === 'asc' ? 'ASC' : 'DESC';
  let orderClause;
  if (sort_by === 'distance' && sort_lat && sort_lng) {
    const lat = Number(sort_lat);
    const lng = Number(sort_lng);
    orderClause = `ORDER BY (e.latitude - ${lat}) * (e.latitude - ${lat}) + (e.longitude - ${lng}) * (e.longitude - ${lng}) ${orderDir}, e.id ${orderDir}`;
  } else {
    const orderCol = orderMap[sort_by] || 'e.created_at';
    orderClause = `ORDER BY ${orderCol} ${orderDir}, e.id ${orderDir}`;
  }

  const countResult = get(`SELECT COUNT(*) as total FROM food_entries e ${whereClause}`, params);
  const total = countResult?.total || 0;

  let limitClause = '';
  const limitParams = [];
  if (page && page_size) {
    const p = Math.max(1, Number(page));
    const ps = Math.min(100, Math.max(1, Number(page_size) || 20));
    const offset = (p - 1) * ps;
    limitClause = 'LIMIT ? OFFSET ?';
    limitParams.push(ps, offset);
  }

  const rows = all(
    `SELECT e.* FROM food_entries e ${whereClause} ${orderClause} ${limitClause}`,
    [...params, ...limitParams]
  );

  const enriched = attachImages(attachTags(attachUsers(rows)));

  res.json({
    data: enriched,
    pagination: { page: Number(page) || 1, page_size: Number(page_size) || total, total }
  });
});

// In-bounds query (must be before /:id)
app.get('/api/entries/in-bounds', (req, res) => {
  const { sw_lng, sw_lat, ne_lng, ne_lat, user_id, view, group_id } = req.query;
  if (!sw_lng || !sw_lat || !ne_lng || !ne_lat) {
    return res.status(400).json({ message: '请提供 sw_lng, sw_lat, ne_lng, ne_lat' });
  }
  const vis = visibilityConditions({ user_id, view, group_id });
  const whereSql = vis.clauses.length ? ` AND ${vis.clauses.join(' AND ')}` : '';
  const rows = all(
    `SELECT * FROM food_entries WHERE deleted_at IS NULL
     AND longitude >= ? AND longitude <= ? AND latitude >= ? AND latitude <= ?${whereSql}`,
    [Number(sw_lng), Number(ne_lng), Number(sw_lat), Number(ne_lat), ...vis.params]
  );
  res.json(attachUsers(attachTags(rows)));
});

// Trash list (must be before /:id)
app.get('/api/entries/trash', (req, res) => {
  const { user_id } = req.query;
  const rows = user_id
    ? all('SELECT * FROM food_entries WHERE deleted_at IS NOT NULL AND user_id = ? ORDER BY deleted_at DESC', [user_id])
    : all('SELECT * FROM food_entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  const enriched = attachImages(attachTags(attachUsers(rows)));
  res.json(enriched);
});

// Clear trash (must be before /:id)
app.delete('/api/entries/trash', (req, res) => {
  const { user_id } = req.query;
  const rows = user_id
    ? all('SELECT * FROM food_entries WHERE deleted_at IS NOT NULL AND user_id = ?', [user_id])
    : all('SELECT * FROM food_entries WHERE deleted_at IS NOT NULL');
  permanentlyDelete(rows, uploadsDir);
  res.json({ deleted: rows.length });
});

// Stats (must be before /:id)
app.get('/api/entries/stats', (req, res) => {
  const vis = visibilityConditions({ user_id: req.query.user_id, view: req.query.view, group_id: req.query.group_id });
  const where = ['e.deleted_at IS NULL', ...vis.clauses].join(' AND ');
  const P = () => [...vis.params];

  const total = get(`SELECT COUNT(*) as c FROM food_entries e WHERE ${where}`, P());
  const restaurants = get(`SELECT COUNT(DISTINCT e.restaurant_name) as c FROM food_entries e WHERE ${where}`, P());
  const totalSpent = get(`SELECT COALESCE(SUM(e.price_per_person), 0) as c FROM food_entries e WHERE ${where}`, P());
  const avgRating = get(`SELECT ROUND(AVG(e.rating), 1) as c FROM food_entries e WHERE ${where} AND e.rating IS NOT NULL`, P());
  const thisMonth = get(
    `SELECT COUNT(*) as c FROM food_entries e WHERE ${where} AND e.meal_date >= date('now','start of month')`, P()
  );

  const mealTypeDist = all(
    `SELECT e.meal_type as meal_type, COUNT(*) as count FROM food_entries e WHERE ${where} AND e.meal_type IS NOT NULL GROUP BY e.meal_type ORDER BY count DESC`, P()
  );

  const ratingDist = all(
    `SELECT e.rating as rating, COUNT(*) as count FROM food_entries e WHERE ${where} AND e.rating IS NOT NULL GROUP BY e.rating ORDER BY e.rating`, P()
  );

  const priceDist = all(
    `SELECT
       CASE
         WHEN e.price_per_person IS NULL THEN '未记录'
         WHEN e.price_per_person < 30 THEN '30以下'
         WHEN e.price_per_person < 60 THEN '30-60'
         WHEN e.price_per_person < 100 THEN '60-100'
         WHEN e.price_per_person < 200 THEN '100-200'
         ELSE '200以上'
       END as range_label,
       COUNT(*) as count
     FROM food_entries e WHERE ${where} GROUP BY range_label`, P()
  );

  const tagDist = all(
    `SELECT t.id, t.name, t.color, COUNT(et.entry_id) as count
     FROM tags t LEFT JOIN entry_tags et ON t.id = et.tag_id
     LEFT JOIN food_entries e ON e.id = et.entry_id
     WHERE ${where} GROUP BY t.id ORDER BY count DESC`, P()
  );

  const monthlyTrend = all(
    `SELECT strftime('%Y-%m', e.meal_date) as month, COUNT(*) as count, COALESCE(SUM(e.price_per_person), 0) as total_spent
     FROM food_entries e WHERE ${where} AND e.meal_date IS NOT NULL
     GROUP BY month ORDER BY month ASC`, P()
  );

  const favoriteCount = get('SELECT COUNT(*) as c FROM food_entries e WHERE is_favorite = 1 AND ' + where, P());

  res.json({
    overview: {
      total: total?.c || 0,
      restaurants: restaurants?.c || 0,
      total_spent: totalSpent?.c || 0,
      avg_rating: avgRating?.c || 0,
      this_month: thisMonth?.c || 0,
      favorites: favoriteCount?.c || 0
    },
    meal_type_distribution: mealTypeDist,
    rating_distribution: ratingDist,
    price_distribution: priceDist,
    tag_distribution: tagDist,
    monthly_trend: monthlyTrend
  });
});

app.get('/api/entries/:id', (req, res) => {
  const row = get('SELECT * FROM food_entries WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ message: '记录不存在' });
  const [enriched] = attachImages(attachTags(attachUsers([row])));
  res.json(enriched);
});

async function processImage(file) {
  try {
    const absPath = join(file._destSubDir, file._baseName);
    const ext = extname(file._baseName).toLowerCase();
    const thumbnailName = file._baseName.replace(ext, `_thumb${ext}`);
    const thumbnailPath = join(thumbnailsDir, thumbnailName);

    await sharp(absPath)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, force: false })
      .png({ quality: 85, force: false })
      .toFile(absPath + '.tmp');

    rmSync(absPath);
    const fs = await import('node:fs');
    fs.renameSync(absPath + '.tmp', absPath);

    await sharp(absPath)
      .resize(200, 200, { fit: 'cover' })
      .toFile(thumbnailPath);

    return { ok: true, thumbnailPath };
  } catch (err) {
    console.warn(`[sharp] process failed for ${file._baseName}: ${err.message}`);
    return { ok: false };
  }
}

function getNextSortOrder(entryId) {
  const row = get('SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM entry_images WHERE entry_id = ?', [entryId]);
  return row?.next_order ?? 0;
}

async function saveEntryImages(entryId, files, startOrder = 0) {
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const { thumbnailPath: thumbAbsPath } = await processImage(file);
    const absPath = join(file._destSubDir, file._baseName);
    const relPath = '/uploads/originals/' + basename(dirname(dirname(absPath))) + '/' + basename(dirname(absPath)) + '/' + basename(absPath);
    const thumbRelPath = thumbAbsPath
      ? '/uploads/thumbnails/' + basename(thumbAbsPath)
      : relPath;
    run(
      'INSERT INTO entry_images (entry_id, image_path, thumbnail_path, sort_order) VALUES (?, ?, ?, ?)',
      [entryId, relPath, thumbRelPath, startOrder + i]
    );
  }
}

app.post('/api/entries', uploadMultiple.array('images', 9), validate(entrySchema), asyncHandler(async (req, res) => {
  const data = req.body;
  const groupId = data.visibility === 'group' ? (data.group_id || null) : null;
  let lastId;
  await txAsync(async () => {
    const result = run(
      `INSERT INTO food_entries
       (dish_name, restaurant_name, address_text, longitude, latitude,
        meal_type, price_per_person, rating, notes, is_favorite, visit_count, meal_date,
        user_id, group_id, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_DATE), ?, ?, ?)`,
      [
        data.dish_name, data.restaurant_name, data.address_text,
        data.longitude, data.latitude,
        data.meal_type || null, data.price_per_person,
        data.rating, data.notes, data.is_favorite,
        data.visit_count || 1, data.meal_date || null,
        data.user_id || null, groupId, data.visibility || 'private'
      ]
    );
    lastId = result.lastInsertRowid;
    await saveEntryImages(lastId, req.files);
    if (req.files && req.files.length > 0) {
      const firstAbs = join(req.files[0]._destSubDir, req.files[0]._baseName);
      const firstPath = '/uploads/originals/' + basename(dirname(dirname(firstAbs))) + '/' + basename(dirname(firstAbs)) + '/' + basename(firstAbs);
      run('UPDATE food_entries SET cover_image = ? WHERE id = ?', [firstPath, lastId]);
    }
    if (data.tag_ids) {
      const tagIds = data.tag_ids.split(',').filter(Boolean).map(Number);
      for (const tagId of tagIds) {
        run('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', [lastId, tagId]);
      }
    }
  });
  const row = get('SELECT * FROM food_entries WHERE id = ?', [lastId]);
  res.status(201).json(attachImages(attachTags(attachUsers([row])))[0]);
}));

app.put('/api/entries/:id', uploadMultiple.array('images', 9), validate(entrySchema), asyncHandler(async (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });

  const ownerCheck = assertOwnsEntry(existing, req.body.user_id);
  if (!ownerCheck.ok) return res.status(ownerCheck.error).json({ message: ownerCheck.message });

  const data = req.body;
  const groupId = data.visibility === 'group' ? (data.group_id || null) : null;
  await txAsync(async () => {
    run(
      `UPDATE food_entries SET
        dish_name = ?, restaurant_name = ?, address_text = ?, longitude = ?, latitude = ?,
        meal_type = ?, price_per_person = ?, rating = ?, notes = ?, is_favorite = ?,
        visit_count = ?, meal_date = COALESCE(NULLIF(?, ''), meal_date),
        user_id = ?, group_id = ?, visibility = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.dish_name, data.restaurant_name, data.address_text, data.longitude, data.latitude,
        data.meal_type || null, data.price_per_person,
        data.rating, data.notes, data.is_favorite,
        data.visit_count || 1, data.meal_date || null,
        data.user_id || null, groupId, data.visibility || 'private', req.params.id
      ]
    );

    if (data.tag_ids !== undefined) {
      run('DELETE FROM entry_tags WHERE entry_id = ?', [req.params.id]);
      const tagIds = data.tag_ids.split(',').filter(Boolean).map(Number);
      for (const tagId of tagIds) {
        run('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', [req.params.id, tagId]);
      }
    }

    if (data.deleted_image_ids) {
      const delIds = data.deleted_image_ids.split(',').filter(Boolean).map(Number);
      for (const imgId of delIds) {
        const img = get('SELECT * FROM entry_images WHERE id = ? AND entry_id = ?', [imgId, req.params.id]);
        if (img) {
          try { rmSync(join(uploadsDir, img.image_path.replace(/^\/uploads\//, '')), { force: true }); } catch {}
        }
        run('DELETE FROM entry_images WHERE id = ? AND entry_id = ?', [imgId, req.params.id]);
      }
    }

    await saveEntryImages(req.params.id, req.files, getNextSortOrder(req.params.id));

    if (data.cover_image_id) {
      const coverImg = get('SELECT image_path FROM entry_images WHERE id = ? AND entry_id = ?', [Number(data.cover_image_id), req.params.id]);
      if (coverImg) {
        run('UPDATE food_entries SET cover_image = ? WHERE id = ?', [coverImg.image_path, req.params.id]);
      }
    } else {
      const allImgs = all('SELECT * FROM entry_images WHERE entry_id = ? ORDER BY sort_order, id', [req.params.id]);
      if (allImgs.length > 0) {
        run('UPDATE food_entries SET cover_image = ? WHERE id = ?', [allImgs[0].image_path, req.params.id]);
      } else {
        run('UPDATE food_entries SET cover_image = ? WHERE id = ?', ['', req.params.id]);
      }
    }
  });

  const row = get('SELECT * FROM food_entries WHERE id = ?', [req.params.id]);
  res.json(attachImages(attachTags(attachUsers([row])))[0]);
}));

app.put('/api/entries/:id/images/reorder', asyncHandler(async (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });

  const ownerCheck = assertOwnsEntry(existing, resolveUserId(req));
  if (!ownerCheck.ok) return res.status(ownerCheck.error).json({ message: ownerCheck.message });

  const { image_ids, cover_image_id } = req.body;

  await txAsync(async () => {
    if (Array.isArray(image_ids)) {
      for (let i = 0; i < image_ids.length; i++) {
        run('UPDATE entry_images SET sort_order = ? WHERE id = ? AND entry_id = ?',
          [i, image_ids[i], req.params.id]);
      }
    }

    if (cover_image_id != null) {
      const coverImg = get('SELECT image_path FROM entry_images WHERE id = ? AND entry_id = ?',
        [Number(cover_image_id), req.params.id]);
      if (coverImg) {
        run('UPDATE food_entries SET cover_image = ? WHERE id = ?',
          [coverImg.image_path, req.params.id]);
      }
    } else {
      const allImgs = all('SELECT * FROM entry_images WHERE entry_id = ? ORDER BY sort_order, id', [req.params.id]);
      const cover = allImgs.length > 0 ? allImgs[0].image_path : '';
      run('UPDATE food_entries SET cover_image = ? WHERE id = ?', [cover, req.params.id]);
    }
  });

  const row = get('SELECT * FROM food_entries WHERE id = ?', [req.params.id]);
  res.json(attachImages(attachTags(attachUsers([row])))[0]);
}));

app.delete('/api/entries/:id', (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });
  const ownerCheck = assertOwnsEntry(existing, resolveUserId(req));
  if (!ownerCheck.ok) return res.status(ownerCheck.error).json({ message: ownerCheck.message });
  run('UPDATE food_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

app.post('/api/entries/batch-delete', (req, res) => {
  const { ids, user_id } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: '请提供要删除的记录ID' });
  const placeholders = ids.map(() => '?').join(',');
  if (user_id) {
    const owned = all(
      `SELECT id FROM food_entries WHERE id IN (${placeholders}) AND deleted_at IS NULL AND (user_id = ? OR user_id IS NULL OR user_id = '')`,
      [...ids, user_id]
    );
    if (owned.length !== ids.length) {
      return res.status(403).json({ message: '只能删除自己的记录' });
    }
    run(`UPDATE food_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  } else {
    run(`UPDATE food_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  }
  res.json({ deleted: ids.length });
});

app.post('/api/entries/:id/restore', (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在或未删除' });
  const ownerCheck = assertOwnsEntry(existing, resolveUserId(req));
  if (!ownerCheck.ok) return res.status(ownerCheck.error).json({ message: ownerCheck.message });
  run('UPDATE food_entries SET deleted_at = NULL WHERE id = ?', [req.params.id]);
  res.json({ message: '已恢复' });
});

// Permanent delete
app.delete('/api/entries/:id/permanent', (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });
  const ownerCheck = assertOwnsEntry(existing, resolveUserId(req));
  if (!ownerCheck.ok) return res.status(ownerCheck.error).json({ message: ownerCheck.message });

  permanentlyDelete([existing], uploadsDir);
  res.status(204).end();
});

// ---- TAGS ----
app.get('/api/tags', (req, res) => {
  const rows = all('SELECT * FROM tags ORDER BY sort_order, id');
  res.json(rows);
});

app.post('/api/tags', validate(tagSchema), (req, res) => {
  const { name, color, icon, sort_order } = req.body;
  try {
    const result = run(
      'INSERT INTO tags (name, color, icon, sort_order) VALUES (?, ?, ?, ?)',
      [name, color, icon, sort_order]
    );
    const row = get('SELECT * FROM tags WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(row);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ message: '标签名已存在' });
    }
    throw err;
  }
});

app.put('/api/tags/:id', validate(tagSchema), (req, res) => {
  const existing = get('SELECT * FROM tags WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '标签不存在' });
  const { name, color, icon, sort_order } = req.body;
  run('UPDATE tags SET name = ?, color = ?, icon = ?, sort_order = ? WHERE id = ?',
    [name, color, icon, sort_order, req.params.id]);
  res.json(get('SELECT * FROM tags WHERE id = ?', [req.params.id]));
});

app.delete('/api/tags/:id', (req, res) => {
  const existing = get('SELECT * FROM tags WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '标签不存在' });
  run('DELETE FROM entry_tags WHERE tag_id = ?', [req.params.id]);
  run('DELETE FROM tags WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

// ---- DATA MANAGEMENT ----
app.get('/api/export', (req, res) => {
  res.json(exportBackup(uploadsDir));
});

app.get('/api/export/csv', (req, res) => {
  const rows = all('SELECT * FROM food_entries WHERE deleted_at IS NULL ORDER BY created_at DESC');
  if (rows.length === 0) return res.status(200).set('Content-Type', 'text/csv').send('');

  const headers = Object.keys(rows[0]);
  const csvBody = rows.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const raw = String(v);
      let str = raw.replace(/"/g, '""');
      if (/^[=+\-@]/.test(raw)) str = "'" + str;
      return `"${str}"`;
    }).join(',')
  );

  const csv = '\uFEFF' + headers.join(',') + '\n' + csvBody.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="food-map-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

app.post('/api/import', importUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请上传导入文件' });
  const content = req.file.buffer.toString('utf8');
  let data;
  try { data = JSON.parse(content); } catch {
    return res.status(400).json({ message: '文件格式不正确，请选择有效的JSON备份文件' });
  }

  const result = await importBackup(data, uploadsDir);
  res.json(result);
}));

// ---- SETTINGS ----
app.get('/api/settings', (req, res) => {
  const rows = all('SELECT * FROM settings');
  res.json(rows);
});

app.put('/api/settings/:key', validate(settingsValueSchema), (req, res) => {
  run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP',
    [req.params.key, req.body.value]
  );
  res.json(get('SELECT * FROM settings WHERE key = ?', [req.params.key]));
});

// ---- USERS ----
// A browser reset (cleared localStorage) makes the frontend generate a brand-new
// user id, which silently strands previously created records under a "ghost"
// identity. Fold those records back into the active user so that owned entries
// stay editable. Only ghost identities with no room activity are merged, so a
// genuine co-owner in a shared room is never absorbed.
function foldGhostIdentities(id, nickname, color) {
  let claimed = run(
    "UPDATE food_entries SET user_id = ? WHERE user_id IS NULL OR user_id = ''",
    [id]
  ).changes;
  const ghosts = all(
    `SELECT u.id FROM users u
     WHERE u.nickname = ? AND u.color = ? AND u.id != ?
       AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.creator_id = u.id)`,
    [nickname, color, id]
  );
  for (const ghost of ghosts) {
    claimed += run('UPDATE food_entries SET user_id = ? WHERE user_id = ?', [id, ghost.id]).changes;
    run('DELETE FROM users WHERE id = ?', [ghost.id]);
  }
  return claimed;
}

app.post('/api/users', validate(userSchema), (req, res) => {
  const { id, nickname, color } = req.body;
  const existing = get('SELECT * FROM users WHERE id = ?', [id]);
  if (existing) {
    run('UPDATE users SET nickname = ?, color = ? WHERE id = ?', [nickname, color, id]);
    const claimed = foldGhostIdentities(id, nickname, color);
    return res.json({ user: get('SELECT * FROM users WHERE id = ?', [id]), created: false, claimed });
  }
  // A fresh id that matches an existing user's nickname+color is almost always
  // the same person re-registering after clearing local data. Reuse their
  // previous identity instead of creating a duplicate and orphaning their records.
  const twin = get(
    'SELECT * FROM users WHERE nickname = ? AND color = ? ORDER BY created_at LIMIT 1',
    [nickname, color]
  );
  if (twin) {
    const claimed = foldGhostIdentities(twin.id, nickname, color);
    return res.json({ user: get('SELECT * FROM users WHERE id = ?', [twin.id]), created: false, claimed });
  }
  run('INSERT INTO users (id, nickname, color) VALUES (?, ?, ?)', [id, nickname, color]);
  const claimed = foldGhostIdentities(id, nickname, color);
  res.status(201).json({ user: get('SELECT * FROM users WHERE id = ?', [id]), created: true, claimed });
});

app.get('/api/users/me', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ message: '缺少 id 参数' });
  const row = get('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ message: '用户不存在' });
  res.json(row);
});

// ---- GROUPS ----
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (get('SELECT 1 FROM groups WHERE id = ?', [code]));
  return code;
}

app.post('/api/groups', validate(createGroupSchema), (req, res) => {
  const { name, creator_id } = req.body;
  const id = generateRoomCode();
  run('INSERT INTO groups (id, name, creator_id) VALUES (?, ?, ?)', [id, name, creator_id]);
  run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [id, creator_id]);
  const group = get('SELECT * FROM groups WHERE id = ?', [id]);
  res.status(201).json({ group: { ...group, member_count: 1, is_creator: true } });
});

app.post('/api/groups/join', validate(joinGroupSchema), (req, res) => {
  const { code, user_id } = req.body;
  const group = get('SELECT * FROM groups WHERE id = ?', [code]);
  if (!group) return res.status(404).json({ message: '房间不存在，请检查房间码' });
  run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [code, user_id]);
  const memberCount = get('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?', [code]).c;
  res.json({ group: { ...group, member_count: memberCount, is_creator: group.creator_id === user_id } });
});

app.post('/api/groups/:id/leave', validate(groupMemberSchema), (req, res) => {
  const { user_id } = req.body;
  run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [req.params.id, user_id]);
  res.json({ message: '已退出房间' });
});

app.get('/api/groups/:id/members', (req, res) => {
  const group = get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
  if (!group) return res.status(404).json({ message: '房间不存在' });
  const members = all(
    `SELECT gm.user_id, gm.joined_at, u.nickname, u.color
     FROM group_members gm LEFT JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ? ORDER BY gm.joined_at`,
    [req.params.id]
  );
  res.json({ group, members });
});

app.get('/api/groups', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ message: '缺少 user_id 参数' });
  const groups = all(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
     FROM group_members gm JOIN groups g ON g.id = gm.group_id
     WHERE gm.user_id = ? ORDER BY gm.joined_at DESC`,
    [user_id]
  ).map((g) => ({ ...g, is_creator: g.creator_id === user_id }));
  res.json({ groups });
});

app.delete('/api/groups/:id', validate(groupMemberSchema), (req, res) => {
  const { user_id } = req.body;
  const group = get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
  if (!group) return res.status(404).json({ message: '房间不存在' });
  if (group.creator_id !== user_id) return res.status(403).json({ message: '只有房主可以解散房间' });
  try {
    run("UPDATE food_entries SET visibility = 'private', group_id = NULL WHERE group_id = ?", [req.params.id]);
  } catch (err) {
    console.warn(`[groups] visibility column not migrated yet, skip: ${err.message}`);
  }
  run('DELETE FROM group_members WHERE group_id = ?', [req.params.id]);
  run('DELETE FROM groups WHERE id = ?', [req.params.id]);
  res.json({ message: '房间已解散' });
});

// ---- BACKUP ----
app.get('/api/backup/download', asyncHandler(async (req, res) => {
  ensureTransactionIdle();
  const tempDir = mkdtempSync(join(backupsDir, '.download-'));
  const snapshot = join(tempDir, 'food-map.db');
  try {
    await backup(db, snapshot, { rate: 128, progress: () => 0 });
    const src = readFileSync(snapshot);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="food-map-backup-${new Date().toISOString().slice(0, 10)}.db"`);
    res.send(src);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}));

// Seed tags if needed
app.get('/api/seed-tags', (req, res) => {
  const count = get('SELECT COUNT(*) as c FROM tags');
  if (count.c > 0) return res.json({ message: '已有标签' });
  const presetTags = [
    { name: '川菜', color: '#FF4444', icon: 'flame' },
    { name: '粤菜', color: '#FF8C00', icon: 'utensils' },
    { name: '日料', color: '#E91E63', icon: 'fish' },
    { name: '火锅', color: '#FF5722', icon: 'flame' },
    { name: '烧烤', color: '#795548', icon: 'flame' },
    { name: '咖啡', color: '#6D4C41', icon: 'coffee' },
    { name: '甜点', color: '#FF69B4', icon: 'cake' },
    { name: '面食', color: '#FFC107', icon: 'utensils' },
    { name: '小吃', color: '#4CAF50', icon: 'cookie' },
    { name: '海鲜', color: '#2196F3', icon: 'fish' },
    { name: '西餐', color: '#9C27B0', icon: 'utensils-crossed' },
    { name: '韩餐', color: '#00BCD4', icon: 'utensils' }
  ];
  for (const tag of presetTags) {
    run('INSERT OR IGNORE INTO tags (name, color, icon) VALUES (?, ?, ?)', [tag.name, tag.color, tag.icon]);
  }
  res.json({ message: `已创建 ${presetTags.length} 个预设标签` });
});

// ---- FRONTEND STATIC (production) ----
// Serve the built SPA from the same process: single Node server exposes both
// the API and the UI, so no Vite dev server / reverse proxy is required.
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  // SPA fallback: unknown non-API paths return index.html (client-side routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

// ---- ERROR HANDLING ----
app.use((req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: '图片大小超过限制' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: '一次最多上传9张图片' });
    return res.status(400).json({ message: err.message });
  }
  const status = Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ message: status < 500 ? err.message : '服务器内部错误' });
});

const port = process.env.PORT || 3001;
if (process.argv[1]?.endsWith('server.js')) {
  app.listen(port, () => {
    console.log(`Food Map API listening on http://localhost:${port}`);
  });
}
