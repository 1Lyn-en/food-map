import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = join(__dirname, '..', 'data', 'food-map.db');

export function openDatabase(path = process.env.DB_PATH || defaultDbPath) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  return db;
}

export const db = openDatabase();

export function initDatabase(database = db) {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  database.exec(schema);

  // Migrate existing food_entries table to add new columns
  const cols = database.prepare(`SELECT name FROM pragma_table_info('food_entries')`).all();
  const colNames = cols.map((c) => c.name);

  const migrations = [
    ['meal_type', 'TEXT DEFAULT NULL'],
    ['price_per_person', 'INTEGER DEFAULT NULL'],
    ['cover_image', "TEXT DEFAULT ''"],
    ['is_favorite', 'INTEGER DEFAULT 0'],
    ['visit_count', 'INTEGER DEFAULT 1'],
    ['meal_date', 'TEXT DEFAULT CURRENT_DATE'],
    ['deleted_at', 'TEXT DEFAULT NULL'],
    ['user_id', "TEXT DEFAULT NULL"],
    ['group_id', 'TEXT DEFAULT NULL'],
    ['visibility', "TEXT DEFAULT 'private'"],
  ];

  for (const [col, type] of migrations) {
    if (!colNames.includes(col)) {
      try {
        database.exec(`ALTER TABLE food_entries ADD COLUMN ${col} ${type}`);
      } catch (err) {
        console.warn(`[migrate] Failed to add column ${col}: ${err.message}`);
      }
    }
  }

  // Index for user_id (after column migration, safe for existing DBs)
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_entries_user ON food_entries(user_id)');
  } catch (err) {
    console.warn(`[migrate] Failed to create user_id index: ${err.message}`);
  }

  // Migrate image_url -> cover_image (copy data if needed)
  if (colNames.includes('image_url') && !colNames.includes('cover_image')) {
    try {
      database.exec("ALTER TABLE food_entries ADD COLUMN cover_image TEXT DEFAULT ''");
      database.exec("UPDATE food_entries SET cover_image = COALESCE(image_url, '') WHERE cover_image = ''");
    } catch (err) {
      console.warn(`[migrate] Failed to migrate image_url: ${err.message}`);
    }
  }
}

export function all(sql, params = []) {
  const statement = db.prepare(sql);
  return Array.isArray(params) ? statement.all(...params) : statement.all(params);
}

export function get(sql, params = []) {
  const statement = db.prepare(sql);
  return Array.isArray(params) ? statement.get(...params) : statement.get(params);
}

export function run(sql, params = []) {
  const statement = db.prepare(sql);
  return Array.isArray(params) ? statement.run(...params) : statement.run(params);
}

function transactionBusyError() {
  return Object.assign(new Error('数据库正在处理另一项写入，请稍后重试'), { status: 409 });
}

export function ensureTransactionIdle() {
  if (db.isTransaction) throw transactionBusyError();
}

export function tx(callback) {
  ensureTransactionIdle();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    if (result && typeof result.then === 'function') {
      throw new TypeError('tx requires a synchronous callback');
    }
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function txAsync(callback) {
  ensureTransactionIdle();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
