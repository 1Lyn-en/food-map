import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { api } from './api';

const StoreContext = createContext(null);

const USER_KEYS = { id: 'foodmap_userId', nickname: 'foodmap_nickname', color: 'foodmap_color' };
const CURRENT_GROUP_KEY = 'foodmap_currentGroup';

function loadUser() {
  try {
    const id = localStorage.getItem(USER_KEYS.id);
    const nickname = localStorage.getItem(USER_KEYS.nickname);
    const color = localStorage.getItem(USER_KEYS.color);
    if (id && nickname && color) {
      return { id: String(id), nickname: String(nickname), color: String(color) };
    }
  } catch {}
  return null;
}

function loadCurrentGroup() {
  try {
    const raw = localStorage.getItem(CURRENT_GROUP_KEY);
    if (!raw) return null;
    const group = JSON.parse(raw);
    if (group && typeof group === 'object' && !Array.isArray(group) && typeof group.id === 'string' && group.id) {
      return group;
    }
  } catch {}
  return null;
}

// First-launch identity: persist the id immediately so the identity stays
// stable even if the user reloads before finishing the onboarding dialog.
export function getOrCreateUserId() {
  try {
    const existing = localStorage.getItem(USER_KEYS.id);
    if (existing) return String(existing);
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(USER_KEYS.id, id);
    return id;
  } catch {
    return `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

const initialState = {
  user: loadUser(),
  groups: [],
  currentGroup: loadCurrentGroup(),
  viewMode: 'all',
  entries: [],
  tags: [],
  stats: null,
  loading: false,
  toast: null,
  draft: null,
  keyword: '',
  filters: {},
  sortBy: 'created',
  sortOrder: 'desc',
  highlightId: null,
  hasKey: Boolean(import.meta.env.VITE_AMAP_KEY && import.meta.env.VITE_AMAP_KEY !== 'your_amap_web_js_api_key')
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ENTRIES': return { ...state, entries: action.payload };
    case 'SET_TAGS': return { ...state, tags: action.payload };
    case 'SET_STATS': return { ...state, stats: action.payload };
    case 'SET_LOADING': return { ...state, loading: action.payload };
    case 'SET_TOAST': return { ...state, toast: action.payload };
    case 'SET_DRAFT': return { ...state, draft: action.payload };
    case 'SET_KEYWORD': return { ...state, keyword: action.payload };
    case 'SET_FILTERS': return { ...state, filters: action.payload };
    case 'SET_SORT': return { ...state, sortBy: action.payload.sortBy || state.sortBy, sortOrder: action.payload.sortOrder || state.sortOrder };
    case 'SET_HIGHLIGHT': return { ...state, highlightId: action.payload };
    case 'SET_USER': return { ...state, user: action.payload };
    case 'SET_GROUPS': return { ...state, groups: action.payload };
    case 'SET_CURRENT_GROUP': return { ...state, currentGroup: action.payload };
    case 'SET_VIEW_MODE': return { ...state, viewMode: action.payload };
    default: return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refresh = useCallback(async (viewOverride) => {
    const filters = state.filters;
    const params = { sort_by: state.sortBy, sort_order: state.sortOrder };
    if (state.user) params.user_id = state.user.id;
    params.view = viewOverride || state.viewMode || 'all';
    if (state.currentGroup && params.view !== 'mine') params.group_id = state.currentGroup.id;
    if (state.keyword) params.keyword = state.keyword;
    if (filters.tag_ids) params.tag_ids = filters.tag_ids;
    if (filters.min_rating) params.min_rating = filters.min_rating;
    if (filters.price_min) params.price_min = filters.price_min;
    if (filters.price_max) params.price_max = filters.price_max;
    if (filters.meal_types) params.meal_types = filters.meal_types;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (filters.is_favorite) params.is_favorite = 1;
    if (filters.has_image) params.has_image = 1;

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await api.getEntries(params);
      dispatch({ type: 'SET_ENTRIES', payload: result.data || result });
      return result.data || result;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.keyword, state.filters, state.sortBy, state.sortOrder, state.user, state.currentGroup, state.viewMode]);

  const refreshTags = useCallback(async () => {
    const tags = await api.getTags();
    dispatch({ type: 'SET_TAGS', payload: tags });
    return tags;
  }, []);

  const refreshStats = useCallback(async () => {
    const stats = await api.getStats();
    dispatch({ type: 'SET_STATS', payload: stats });
    return stats;
  }, []);

  const notify = useCallback((message, action = null, duration = 2600, variant = 'info') => {
    dispatch({ type: 'SET_TOAST', payload: { message, action, variant } });
    const timer = setTimeout(() => dispatch({ type: 'SET_TOAST', payload: null }), duration);
    return timer;
  }, []);

  const saveUser = useCallback(async ({ id, nickname, color }) => {
    const res = await api.saveUser({ id, nickname, color });
    const user = res.user || res;
    localStorage.setItem(USER_KEYS.id, user.id);
    localStorage.setItem(USER_KEYS.nickname, user.nickname);
    localStorage.setItem(USER_KEYS.color, user.color);
    dispatch({ type: 'SET_USER', payload: user });
    return res;
  }, []);

  const loadGroups = useCallback(async () => {
    const user = state.user;
    if (!user) return;
    const res = await api.getMyGroups(user.id);
    dispatch({ type: 'SET_GROUPS', payload: res.groups || [] });
    return res.groups || [];
  }, [state.user]);

  const setCurrentGroup = useCallback((group) => {
    if (group) {
      localStorage.setItem(CURRENT_GROUP_KEY, JSON.stringify(group));
    } else {
      localStorage.removeItem(CURRENT_GROUP_KEY);
      dispatch({ type: 'SET_VIEW_MODE', payload: 'all' });
      dispatch({ type: 'SET_CURRENT_GROUP', payload: null });
      return;
    }
    dispatch({ type: 'SET_CURRENT_GROUP', payload: group });
  }, []);

  const setViewMode = useCallback((view) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: view });
  }, []);

  const value = { state, dispatch, refresh, refreshTags, refreshStats, notify, saveUser, loadGroups, setCurrentGroup, setViewMode };
  return React.createElement(StoreContext.Provider, { value }, children);
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
