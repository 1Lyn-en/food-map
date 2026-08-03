import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, run, tx, all } from './db.js';
import { createPlaceholderPng } from './png.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
const originalsDir = join(uploadsDir, 'originals');
const thumbnailsDir = join(uploadsDir, 'thumbnails');
mkdirSync(originalsDir, { recursive: true });
mkdirSync(thumbnailsDir, { recursive: true });

initDatabase();

run('DELETE FROM entry_tags');
run('DELETE FROM entry_images');
run('DELETE FROM tags');
run('DELETE FROM food_entries');
run('DELETE FROM sqlite_sequence');

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
  { name: '西餐', color: '#9C27B0', icon: 'glass-water' },
  { name: '韩餐', color: '#00BCD4', icon: 'utensils' }
];

for (const tag of presetTags) {
  run('INSERT INTO tags (name, color, icon) VALUES (?, ?, ?)', [tag.name, tag.color, tag.icon]);
}
console.log(`已创建 ${presetTags.length} 个标签`);

const placeholder = [
  ['beijing-wangfujing.png', [230, 92, 67]],
  ['shanghai-nanjinglu.png', [255, 122, 69]],
  ['beijing-sanlitun.png', [220, 120, 60]]
];
for (const [file, rgb] of placeholder) {
  writeFileSync(join(originalsDir, file), createPlaceholderPng(640, 480, rgb));
}

const entries = [
  {
    dish_name: '北京烤鸭',
    restaurant_name: '全聚德（王府井店）',
    address_text: '北京市东城区王府井大街 8 号',
    longitude: 116.41174,
    latitude: 39.91138,
    cover_image: '/uploads/originals/beijing-wangfujing.png',
    rating: 5,
    notes: '酥脆的鸭皮配甜面酱，值得排队。',
    meal_type: 'lunch',
    price_per_person: 198,
    is_favorite: 1,
    tag_names: ['川菜', '烧烤']
  },
  {
    dish_name: '生煎包',
    restaurant_name: '老盛昌汤包（南京东路店）',
    address_text: '上海市黄浦区南京东路 353 号',
    longitude: 121.48333,
    latitude: 31.23583,
    cover_image: '/uploads/originals/shanghai-nanjinglu.png',
    rating: 4,
    notes: '底部焦脆，汤汁浓郁，配一碗小馄饨正好。',
    meal_type: 'breakfast',
    price_per_person: 25,
    is_favorite: 0,
    tag_names: ['面食', '小吃']
  },
  {
    dish_name: '手工酸奶',
    restaurant_name: '三里屯太古里北区',
    address_text: '北京市朝阳区三里屯路 19 号',
    longitude: 116.45526,
    latitude: 39.93698,
    cover_image: '/uploads/originals/beijing-sanlitun.png',
    rating: 3,
    notes: '逛街歇脚时的甜品，口感偏酸。',
    meal_type: 'afternoon_tea',
    price_per_person: 35,
    is_favorite: 0,
    tag_names: ['甜点']
  }
];

tx(() => {
  for (const e of entries) {
    const result = run(
      `INSERT INTO food_entries
       (dish_name, restaurant_name, address_text, longitude, latitude, cover_image, rating, notes, meal_type, price_per_person, is_favorite, meal_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '-' || ? || ' days'))`,
      [e.dish_name, e.restaurant_name, e.address_text, e.longitude, e.latitude, e.cover_image, e.rating, e.notes, e.meal_type, e.price_per_person, e.is_favorite, Math.floor(Math.random() * 30)]
    );
    const entryId = result.lastInsertRowid;

    const tags = all('SELECT * FROM tags');
    for (const tagName of e.tag_names) {
      const tag = tags.find((t) => t.name === tagName);
      if (tag) {
        run('INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', [entryId, tag.id]);
      }
    }

    run(
      'INSERT INTO entry_images (entry_id, image_path, thumbnail_path, sort_order) VALUES (?, ?, ?, 0)',
      [entryId, e.cover_image, e.cover_image]
    );
  }
});

console.log(`Seed completed. 已写入 ${entries.length} 条演示记录，${presetTags.length} 个标签。`);
