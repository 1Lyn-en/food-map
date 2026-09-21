import { mkdtempSync, renameSync, rmSync, rmdirSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { all, get, run, tx } from './db.js';
import { uploadPath } from './upload-path.js';

// Stage files on the same filesystem before deleting rows. Restore staged files
// if a move or SQLite statement fails. Missing files are already-clean success.
export function permanentlyDelete(entries, uploadsDir) {
  const ids = entries.map((e) => e.id);
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const urls = new Set(entries.map((e) => e.cover_image).filter(Boolean));
  for (const image of all(`SELECT * FROM entry_images WHERE entry_id IN (${placeholders})`, ids)) {
    if (image.image_path) urls.add(image.image_path);
    if (image.thumbnail_path) urls.add(image.thumbnail_path);
  }
  // Validate all paths before moving any file. Never touch another entry's file.
  const targets = new Set();
  for (const url of urls) {
    const path = uploadPath(uploadsDir, url);
    const shared = get(`SELECT 1 FROM entry_images WHERE (image_path=? OR thumbnail_path=?) AND entry_id NOT IN (${placeholders}) LIMIT 1`, [url,url,...ids]) ||
      get(`SELECT 1 FROM food_entries WHERE cover_image=? AND id NOT IN (${placeholders}) LIMIT 1`, [url,...ids]);
    if (!shared) targets.add(path);
  }
  let staging;
  const moved = [];
  try {
    tx(() => {
      for (const path of targets) {
        let info;
        try { info = lstatSync(path); } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        if (!info.isFile()) throw Object.assign(new Error('图片路径不是普通文件'), { status: 400 });
        // Sibling directory is not exposed by /uploads static middleware.
        staging ||= mkdtempSync(join(dirname(uploadsDir), '.food-map-delete-'));
        const staged = join(staging, String(moved.length));
        renameSync(path, staged);
        moved.push({ path, staged });
      }
      run(`DELETE FROM entry_tags WHERE entry_id IN (${placeholders})`, ids);
      run(`DELETE FROM entry_images WHERE entry_id IN (${placeholders})`, ids);
      run(`DELETE FROM food_entries WHERE id IN (${placeholders})`, ids);
    });
  } catch (error) {
    // Do not delete quarantine if restoring any file fails: retain it for recovery.
    for (const file of moved.reverse()) renameSync(file.staged, file.path);
    if (staging) rmdirSync(staging);
    throw error;
  }
  // The database commit is authoritative. Quarantined files are no longer served;
  // a cleanup failure is logged for maintenance instead of returning a false 500
  // after the irreversible database deletion already succeeded.
  if (staging) {
    try { rmSync(staging, { recursive: true }); }
    catch (error) { console.warn(`永久删除的隔离文件清理失败: ${staging}: ${error.message}`); }
  }
}
