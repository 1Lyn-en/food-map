import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { api } from './api';

const StoreContext = createContext(null);

const initialState = {
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
    default: return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refresh = useCallback(async () => {
    const filters = state.filters;
    const params = { sort_by: state.sortBy, sort_order: state.sortOrder };
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
  }, [state.keyword, state.filters, state.sortBy, state.sortOrder]);

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

  const value = { state, dispatch, refresh, refreshTags, refreshStats, notify };
  return React.createElement(StoreContext.Provider, { value }, children);
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
