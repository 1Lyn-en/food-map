const BASE = '/api';

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(15000),
    headers: {
      ...(options.headers || {}),
      ...(isForm ? {} : { 'content-type': 'application/json' })
    },
    body: isForm ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || '请求失败');
  return data;
}

export const api = {
  // Entries
  getEntries(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) qs.set(k, v); });
    return request(`/entries?${qs.toString()}`);
  },
  getEntry(id) { return request(`/entries/${id}`); },
  createEntry(form) { return request('/entries', { method: 'POST', body: form }); },
  updateEntry(id, form) { return request(`/entries/${id}`, { method: 'PUT', body: form }); },
  deleteEntry(id, userId) { return request(`/entries/${id}`, { method: 'DELETE', body: userId ? { user_id: userId } : undefined }); },
  batchDelete(ids, userId) { return request('/entries/batch-delete', { method: 'POST', body: userId ? { ids, user_id: userId } : { ids } }); },
  restoreEntry(id, userId) { return request(`/entries/${id}/restore`, { method: 'POST', body: userId ? { user_id: userId } : undefined }); },
  permanentDelete(id, userId) { return request(`/entries/${id}/permanent`, { method: 'DELETE', body: userId ? { user_id: userId } : undefined }); },
  getTrash(userId) { return request(`/entries/trash${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`); },
  clearTrash(userId) { return request(`/entries/trash${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`, { method: 'DELETE' }); },
  getEntriesInBounds(params) { return request(`/entries/in-bounds?${new URLSearchParams(params)}`); },
  getStats() { return request('/entries/stats'); },
  reorderImages(id, imageIds, coverImageId) {
    return request(`/entries/${id}/images/reorder`, { method: 'PUT', body: { image_ids: imageIds, cover_image_id: coverImageId } });
  },

  // Tags
  getTags() { return request('/tags'); },
  createTag(data) { return request('/tags', { method: 'POST', body: data }); },
  updateTag(id, data) { return request(`/tags/${id}`, { method: 'PUT', body: data }); },
  deleteTag(id) { return request(`/tags/${id}`, { method: 'DELETE' }); },
  seedTags() { return request('/seed-tags'); },

  // Data
  exportAll() { return request('/export'); },
  exportCsvUrl() { return `${BASE}/export/csv`; },
  importData(form) { return request('/import', { method: 'POST', body: form }); },

  // Settings
  getSettings() { return request('/settings'); },
  updateSetting(key, value) { return request(`/settings/${key}`, { method: 'PUT', body: { value } }); },

  // Users
  saveUser(data) { return request('/users', { method: 'POST', body: data }); },
  getUser(id) { return request(`/users/me?id=${encodeURIComponent(id)}`); },

  // Groups
  createGroup(data) { return request('/groups', { method: 'POST', body: data }); },
  joinGroup(data) { return request('/groups/join', { method: 'POST', body: data }); },
  leaveGroup(id, userId) { return request(`/groups/${id}/leave`, { method: 'POST', body: { user_id: userId } }); },
  getGroupMembers(id) { return request(`/groups/${id}/members`); },
  getMyGroups(userId) { return request(`/groups?user_id=${encodeURIComponent(userId)}`); },
  disbandGroup(id, userId) { return request(`/groups/${id}`, { method: 'DELETE', body: { user_id: userId } }); },

  // Health
  health() { return request('/health'); }
};
