import { resolve, relative, sep } from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';

// Only application-owned, literal /uploads/... paths are accepted. Reject
// traversal, Windows device/drive paths, URL encodings and symlink aliases.
export function uploadPath(root, url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) {
    throw Object.assign(new Error('图片路径必须位于 /uploads/ 下'), { status: 400 });
  }
  const parts = url.slice('/uploads/'.length).split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || /[\\:%?#\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) {
    throw Object.assign(new Error('图片路径不安全'), { status: 400 });
  }
  const base = realpathSync(root);
  const target = resolve(base, ...parts);
  const rel = relative(base, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw Object.assign(new Error('图片路径超出上传目录'), { status: 400 });
  }
  let current = base;
  for (const part of parts) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw Object.assign(new Error('图片路径不能包含符号链接'), { status: 400 });
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}
