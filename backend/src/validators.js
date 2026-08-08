import { z } from 'zod';

const requiredName = z.string().trim().min(1, '不能为空').max(100);
const longitude = z.coerce.number().finite().min(-180).max(180, '经度范围 -180 ~ 180');
const latitude = z.coerce.number().finite().min(-90).max(90, '纬度范围 -90 ~ 90');
const optionalText = (max) => z.string().trim().max(max).optional().default('');

const dateStr = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return null;
    return value;
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').nullable().optional().default(null)
);

const optionalInt = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return null;
    return Number(value);
  },
  z.number().int().nullable().optional().default(null)
);

const rating = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return null;
    return Number(value);
  },
  z.number().int().min(1).max(5).nullable().optional().default(null)
);

const booleanFromStr = z.preprocess(
  (value) => {
    if (value === 'true' || value === '1' || value === 1 || value === true) return 1;
    return 0;
  },
  z.number().int().min(0).max(1).default(0)
);

const mealTypeEnum = z.preprocess(
  (value) => {
    if (!value || value === '') return null;
    return value;
  },
  z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'afternoon_tea', 'night_snack']).nullable().optional().default(null)
);

export const entrySchema = z.object({
  dish_name: requiredName,
  restaurant_name: requiredName,
  address_text: optionalText(300),
  longitude,
  latitude,
  meal_type: mealTypeEnum,
  price_per_person: z.preprocess((v) => (v === '' || v === undefined || v === null ? null : Number(v)), z.number().int().min(0).max(9999).nullable().optional().default(null)),
  rating,
  notes: optionalText(2000),
  is_favorite: booleanFromStr,
  visit_count: optionalInt,
  meal_date: dateStr,
  tag_ids: z.string().optional().default(''),
  deleted_image_ids: z.string().optional().default(''),
  user_id: z.string().trim().max(64).optional().default(''),
  visibility: z.enum(['private', 'group']).optional().default('private'),
  group_id: z.string().trim().max(10).optional().default('')
});

export const tagSchema = z.object({
  name: z.string().trim().min(1, '标签名不能为空').max(10),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式 #RRGGBB').optional().default('#FF6B6B'),
  icon: z.string().trim().max(20).optional().default('tag'),
  sort_order: z.coerce.number().int().min(0).optional().default(0)
});

export const settingsValueSchema = z.object({
  value: z.string()
});

export const userSchema = z.object({
  id: z.string().trim().min(1, '用户ID不能为空').max(64),
  nickname: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最多 20 个字符'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色格式 #RRGGBB')
});

const userIdSchema = z.string().trim().min(1, '用户ID不能为空').max(64);
const roomCodeSchema = z.string().trim().min(1).transform((v) => v.toUpperCase());

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, '组名不能为空').max(30, '组名最多 30 个字符'),
  creator_id: userIdSchema
});

export const joinGroupSchema = z.object({
  code: roomCodeSchema.refine((v) => /^[A-Z0-9]{6}$/.test(v), '房间码为 6 位字母或数字'),
  user_id: userIdSchema
});

export const groupMemberSchema = z.object({
  user_id: userIdSchema
});

export function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return res.status(400).json({ message: '参数错误', errors });
    }
    req.body = parsed.data;
    next();
  };
}
