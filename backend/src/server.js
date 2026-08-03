import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, all, get, run, txAsync } from './db.js';
import { entrySchema, tagSchema, settingsValueSchema, validate } from './validators.js';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
const originalsDir = join(uploadsDir, 'originals');
const thumbnailsDir = join(uploadsDir, 'thumbnails');
mkdirSync(originalsDir, { recursive: true });
mkdirSync(thumbnailsDir, { recursive: true });

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

// ---- ENTRIES ----
app.get('/api/entries', (req, res) => {
  const {
    keyword, tag_ids, min_rating, max_rating, price_min, price_max,
    meal_types, date_from, date_to, is_favorite, has_image, sort_by, sort_order,
    page, page_size, deleted
  } = req.query;

  let where = [`e.deleted_at IS ${deleted === '1' ? 'NOT NULL' : 'NULL'}`];
  const params = [];

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
      where.push(`e.id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN (${tagIdList.map(() => '?').join(',')}))`);
      params.push(...tagIdList);
    }
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const orderMap = {
    date: 'e.meal_date',
    rating: 'e.rating',
    price: 'e.price_per_person',
    created: 'e.created_at'
  };
  const orderCol = orderMap[sort_by] || 'e.created_at';
  const orderDir = sort_order === 'asc' ? 'ASC' : 'DESC';
  const orderClause = `ORDER BY ${orderCol} ${orderDir}, e.id ${orderDir}`;

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

  const enriched = attachImages(attachTags(rows));

  res.json({
    data: enriched,
    pagination: { page: Number(page) || 1, page_size: Number(page_size) || total, total }
  });
});

// In-bounds query (must be before /:id)
app.get('/api/entries/in-bounds', (req, res) => {
  const { sw_lng, sw_lat, ne_lng, ne_lat } = req.query;
  if (!sw_lng || !sw_lat || !ne_lng || !ne_lat) {
    return res.status(400).json({ message: '请提供 sw_lng, sw_lat, ne_lng, ne_lat' });
  }
  const rows = all(
    `SELECT * FROM food_entries WHERE deleted_at IS NULL
     AND longitude >= ? AND longitude <= ? AND latitude >= ? AND latitude <= ?`,
    [Number(sw_lng), Number(ne_lng), Number(sw_lat), Number(ne_lat)]
  );
  res.json(attachTags(rows));
});

// Trash list (must be before /:id)
app.get('/api/entries/trash', (req, res) => {
  const rows = all('SELECT * FROM food_entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  const enriched = attachImages(attachTags(rows));
  res.json(enriched);
});

// Clear trash (must be before /:id)
app.delete('/api/entries/trash', (req, res) => {
  const rows = all('SELECT * FROM food_entries WHERE deleted_at IS NOT NULL');
  for (const entry of rows) {
    const images = all('SELECT * FROM entry_images WHERE entry_id = ?', [entry.id]);
    for (const img of images) {
      try { rmSync(join(uploadsDir, img.image_path.replace(/^\//, '')), { force: true }); } catch {}
      try { rmSync(join(uploadsDir, img.thumbnail_path.replace(/^\//, '')), { force: true }); } catch {}
    }
    run('DELETE FROM entry_tags WHERE entry_id = ?', [entry.id]);
    run('DELETE FROM entry_images WHERE entry_id = ?', [entry.id]);
    run('DELETE FROM food_entries WHERE id = ?', [entry.id]);
  }
  res.json({ deleted: rows.length });
});

// Stats (must be before /:id)
app.get('/api/entries/stats', (req, res) => {
  const total = get('SELECT COUNT(*) as c FROM food_entries WHERE deleted_at IS NULL');
  const restaurants = get('SELECT COUNT(DISTINCT restaurant_name) as c FROM food_entries WHERE deleted_at IS NULL');
  const totalSpent = get('SELECT COALESCE(SUM(price_per_person), 0) as c FROM food_entries WHERE deleted_at IS NULL');
  const avgRating = get('SELECT ROUND(AVG(rating), 1) as c FROM food_entries WHERE deleted_at IS NULL AND rating IS NOT NULL');
  const thisMonth = get(
    `SELECT COUNT(*) as c FROM food_entries WHERE deleted_at IS NULL
     AND meal_date >= date('now','start of month')`
  );

  const mealTypeDist = all(
    `SELECT meal_type, COUNT(*) as count FROM food_entries WHERE deleted_at IS NULL AND meal_type IS NOT NULL GROUP BY meal_type ORDER BY count DESC`
  );

  const ratingDist = all(
    `SELECT rating, COUNT(*) as count FROM food_entries WHERE deleted_at IS NULL AND rating IS NOT NULL GROUP BY rating ORDER BY rating`
  );

  const priceDist = all(
    `SELECT
       CASE
         WHEN price_per_person IS NULL THEN '未记录'
         WHEN price_per_person < 30 THEN '30以下'
         WHEN price_per_person < 60 THEN '30-60'
         WHEN price_per_person < 100 THEN '60-100'
         WHEN price_per_person < 200 THEN '100-200'
         ELSE '200以上'
       END as range_label,
       COUNT(*) as count
     FROM food_entries WHERE deleted_at IS NULL
     GROUP BY range_label`
  );

  const tagDist = all(
    `SELECT t.id, t.name, t.color, COUNT(et.entry_id) as count
     FROM tags t LEFT JOIN entry_tags et ON t.id = et.tag_id
     GROUP BY t.id ORDER BY count DESC`
  );

  const monthlyTrend = all(
    `SELECT strftime('%Y-%m', meal_date) as month, COUNT(*) as count, COALESCE(SUM(price_per_person), 0) as total_spent
     FROM food_entries WHERE deleted_at IS NULL AND meal_date IS NOT NULL
     GROUP BY month ORDER BY month ASC`
  );

  const favoriteCount = get('SELECT COUNT(*) as c FROM food_entries WHERE deleted_at IS NULL AND is_favorite = 1');

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
  const [enriched] = attachImages(attachTags([row]));
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
    const relPath = '/uploads/' + basename(dirname(dirname(absPath))) + '/' + basename(dirname(absPath)) + '/' + basename(absPath);
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
  let lastId;
  await txAsync(async () => {
    const result = run(
      `INSERT INTO food_entries
       (dish_name, restaurant_name, address_text, longitude, latitude,
        meal_type, price_per_person, rating, notes, is_favorite, visit_count, meal_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_DATE))`,
      [
        data.dish_name, data.restaurant_name, data.address_text,
        data.longitude, data.latitude,
        data.meal_type || null, data.price_per_person,
        data.rating, data.notes, data.is_favorite,
        data.visit_count || 1, data.meal_date || null
      ]
    );
    lastId = result.lastInsertRowid;
    await saveEntryImages(lastId, req.files);
    if (req.files && req.files.length > 0) {
      const firstPath = '/uploads/' + basename(dirname(dirname(join(req.files[0]._destSubDir, req.files[0]._baseName)))) + '/' + basename(dirname(join(req.files[0]._destSubDir, req.files[0]._baseName))) + '/' + basename(join(req.files[0]._destSubDir, req.files[0]._baseName));
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
  res.status(201).json(attachImages(attachTags([row]))[0]);
}));

app.put('/api/entries/:id', uploadMultiple.array('images', 9), validate(entrySchema), asyncHandler(async (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });

  const data = req.body;
  await txAsync(async () => {
    run(
      `UPDATE food_entries SET
        dish_name = ?, restaurant_name = ?, address_text = ?, longitude = ?, latitude = ?,
        meal_type = ?, price_per_person = ?, rating = ?, notes = ?, is_favorite = ?,
        visit_count = ?, meal_date = COALESCE(NULLIF(?, ''), meal_date),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.dish_name, data.restaurant_name, data.address_text, data.longitude, data.latitude,
        data.meal_type || null, data.price_per_person,
        data.rating, data.notes, data.is_favorite,
        data.visit_count || 1, data.meal_date || null, req.params.id
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
          try { rmSync(join(uploadsDir, img.image_path.replace(/^\//, '')), { force: true }); } catch {}
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
  res.json(attachImages(attachTags([row]))[0]);
}));

app.put('/api/entries/:id/images/reorder', asyncHandler(async (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });

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
  res.json(attachImages(attachTags([row]))[0]);
}));

app.delete('/api/entries/:id', (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });
  run('UPDATE food_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

app.post('/api/entries/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: '请提供要删除的记录ID' });
  const placeholders = ids.map(() => '?').join(',');
  run(`UPDATE food_entries SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids);
  res.json({ deleted: ids.length });
});

app.post('/api/entries/:id/restore', (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在或未删除' });
  run('UPDATE food_entries SET deleted_at = NULL WHERE id = ?', [req.params.id]);
  res.json({ message: '已恢复' });
});

// Permanent delete
app.delete('/api/entries/:id/permanent', (req, res) => {
  const existing = get('SELECT * FROM food_entries WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: '记录不存在' });

  const images = all('SELECT * FROM entry_images WHERE entry_id = ?', [req.params.id]);
  for (const img of images) {
    try { rmSync(join(uploadsDir, img.image_path.replace(/^\//, '')), { force: true }); } catch {}
    try { rmSync(join(uploadsDir, img.thumbnail_path.replace(/^\//, '')), { force: true }); } catch {}
  }

  run('DELETE FROM entry_tags WHERE entry_id = ?', [req.params.id]);
  run('DELETE FROM entry_images WHERE entry_id = ?', [req.params.id]);
  run('DELETE FROM food_entries WHERE id = ?', [req.params.id]);
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
  const rows = all('SELECT * FROM food_entries');
  const tags = all('SELECT * FROM tags');
  const entryTags = all('SELECT * FROM entry_tags');
  const images = all('SELECT * FROM entry_images');
  const settings = all('SELECT * FROM settings');

  res.json({
    version: '1.0',
    exported_at: new Date().toISOString(),
    entries: rows,
    tags,
    entry_tags: entryTags,
    images,
    settings
  });
});

app.get('/api/export/csv', (req, res) => {
  const rows = all('SELECT * FROM food_entries WHERE deleted_at IS NULL ORDER BY created_at DESC');
  if (rows.length === 0) return res.status(200).set('Content-Type', 'text/csv').send('');

  const headers = Object.keys(rows[0]);
  const csvBody = rows.map((row) =>
    headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const str = String(v).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );

  const csv = '\uFEFF' + headers.join(',') + '\n' + csvBody.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="food-map-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

app.post('/api/import', uploadSingle.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请上传导入文件' });
  const fs = await import('node:fs');
  const content = fs.readFileSync(req.file.path, 'utf8');
  let data;
  try { data = JSON.parse(content); } catch {
    try { rmSync(req.file.path, { force: true }); } catch {}
    return res.status(400).json({ message: '文件格式不正确，请选择有效的JSON备份文件' });
  }

  const { entries, tags, entry_tags, settings } = data;
  if (!Array.isArray(entries)) {
    try { rmSync(req.file.path, { force: true }); } catch {}
    return res.status(400).json({ message: '备份文件缺少 entries 字段' });
  }

  await txAsync(async () => {
    if (Array.isArray(tags)) {
      for (const t of tags) {
        run('INSERT OR IGNORE INTO tags (name, color, icon, sort_order) VALUES (?, ?, ?, ?)',
          [t.name, t.color || '#FF6B6B', t.icon || 'tag', t.sort_order || 0]);
      }
    }

    for (const e of entries) {
      run(
        `INSERT INTO food_entries
         (dish_name, restaurant_name, address_text, longitude, latitude,
          meal_type, price_per_person, cover_image, rating, notes, is_favorite,
          visit_count, meal_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.dish_name, e.restaurant_name, e.address_text || '',
          e.longitude, e.latitude,
          e.meal_type || null, e.price_per_person || null,
          e.cover_image || '', e.rating || null, e.notes || '',
          e.is_favorite || 0, e.visit_count || 1,
          e.meal_date || null, e.created_at || null, e.updated_at || null
        ]
      );
    }

    if (Array.isArray(entry_tags)) {
      for (const et of entry_tags) {
        run('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)',
          [et.entry_id, et.tag_id]);
      }
    }

    if (Array.isArray(settings)) {
      for (const s of settings) {
        run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
          [s.key, s.value, s.updated_at || new Date().toISOString()]);
      }
    }
  });

  try { rmSync(req.file.path, { force: true }); } catch {}
  res.json({ imported_entries: entries.length, message: `成功导入 ${entries.length} 条记录` });
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
