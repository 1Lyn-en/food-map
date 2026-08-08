PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS food_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_name TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  address_text TEXT DEFAULT '',
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  meal_type TEXT DEFAULT NULL,
  price_per_person INTEGER DEFAULT NULL,
  cover_image TEXT DEFAULT '',
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT DEFAULT '',
  is_favorite INTEGER DEFAULT 0,
  visit_count INTEGER DEFAULT 1,
  meal_date TEXT DEFAULT CURRENT_DATE,
  user_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_coords ON food_entries(longitude, latitude);
CREATE INDEX IF NOT EXISTS idx_entries_meal_date ON food_entries(meal_date);
CREATE INDEX IF NOT EXISTS idx_entries_rating ON food_entries(rating);
CREATE INDEX IF NOT EXISTS idx_entries_deleted ON food_entries(deleted_at);
CREATE INDEX IF NOT EXISTS idx_entries_restaurant ON food_entries(restaurant_name);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS entry_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER REFERENCES food_entries(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  thumbnail_path TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#FF6B6B',
  icon TEXT DEFAULT 'tag',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id INTEGER REFERENCES food_entries(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
