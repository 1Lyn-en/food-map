import React from 'react';
import { Search, SlidersHorizontal, Star, ArrowUpDown, Sun, BarChart3, Database, User, X, Calendar, Moon } from 'lucide-react';
import { useStore } from '../stores';

const MEAL_TYPES = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '小吃' },
  { value: 'afternoon_tea', label: '下午茶' },
  { value: 'night_snack', label: '夜宵' }
];

const SORT_OPTIONS = [
  { value: 'created', label: '最新' },
  { value: 'rating', label: '评分' },
  { value: 'price', label: '价格' },
  { value: 'date', label: '用餐日期' }
];

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_PRESETS = ['today', 'week', 'month', 'year'];
const DATE_PRESET_LABELS = { today: '今天', week: '本周', month: '本月', year: '今年' };

function getPresetDates(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { date_from: dateStr(today), date_to: dateStr(today) };
    case 'week': {
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      return { date_from: dateStr(monday), date_to: dateStr(today) };
    }
    case 'month':
      return { date_from: dateStr(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: dateStr(today) };
    case 'year':
      return { date_from: dateStr(new Date(now.getFullYear(), 0, 1)), date_to: dateStr(today) };
    default:
      return null;
  }
}

function detectPreset(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return null;
  for (const preset of DATE_PRESETS) {
    const p = getPresetDates(preset);
    if (p && p.date_from === dateFrom && p.date_to === dateTo) return preset;
  }
  return null;
}

export default function Toolbar({ onToggleStats, onToggleData, theme, onToggleTheme }) {
  const { state, dispatch, refresh, notify } = useStore();
  const [showFilter, setShowFilter] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState(state.keyword);
  const [isFocused, setIsFocused] = React.useState(false);
  const [searchHistory, setSearchHistory] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('food-map-search-history') || '[]'); } catch { return []; }
  });

  React.useEffect(() => {
    setSearchValue(state.keyword);
  }, [state.keyword]);

  const saveToHistory = (term) => {
    if (!term) return;
    setSearchHistory((prev) => {
      const next = [term, ...prev.filter((x) => x !== term)].slice(0, 5);
      try { localStorage.setItem('food-map-search-history', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  const performSearch = (term) => {
    const t = term.trim();
    setSearchValue(t);
    setIsFocused(false);
    dispatch({ type: 'SET_KEYWORD', payload: t });
    refresh().catch((err) => notify(err.message));
    saveToHistory(t);
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      performSearch(searchValue);
    }
  };

  const removeHistoryItem = (term) => {
    setSearchHistory((prev) => {
      const next = prev.filter((x) => x !== term);
      try { localStorage.setItem('food-map-search-history', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  const clearHistory = () => {
    setSearchHistory([]);
    try { localStorage.removeItem('food-map-search-history'); } catch (_) {}
  };

  const showHistory = isFocused && !searchValue && searchHistory.length > 0;

  const handleClearFilters = () => {
    dispatch({ type: 'SET_FILTERS', payload: {} });
    dispatch({ type: 'SET_KEYWORD', payload: '' });
    refresh().catch((err) => notify(err.message));
  };

  const applyFilter = (key, value) => {
    const newFilters = { ...state.filters };
    if (value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    dispatch({ type: 'SET_FILTERS', payload: newFilters });
    refresh().catch((err) => notify(err.message));
  };

  const activeFilterCount = Object.keys(state.filters).length;

  return React.createElement('div', { className: 'toolbar' },
    React.createElement('div', { className: `toolbar-row${showFilter ? ' filter-open' : ''}` },
      React.createElement('div', { className: 'search-history-wrap' },
        React.createElement('div', { className: 'search-box' },
          React.createElement(Search, { size: 16 }),
          React.createElement('input', {
            type: 'text',
            placeholder: '搜索菜名、店名、地址...',
            value: searchValue,
            onChange: (e) => setSearchValue(e.target.value),
            onKeyDown: handleSearch,
            onFocus: () => setIsFocused(true),
            onBlur: () => setIsFocused(false)
          })
        ),
        showHistory && React.createElement('div', { className: 'search-history', onMouseDown: (e) => e.preventDefault() },
          searchHistory.map((term) =>
            React.createElement('div', { key: term, className: 'search-history-item' },
              React.createElement('button', { className: 'search-history-term', onClick: () => performSearch(term) },
                React.createElement(Search, { size: 12 }),
                term
              ),
              React.createElement('button', { className: 'search-history-del', title: '删除', onClick: () => removeHistoryItem(term) },
                React.createElement(X, { size: 12 })
              )
            )
          ),
          React.createElement('div', { className: 'search-history-footer' },
            React.createElement('button', { className: 'search-history-clear', onClick: clearHistory }, '清除历史')
          )
        )
      ),
      React.createElement('div', { className: 'toolbar-actions' },
        React.createElement('button', {
          className: `tool-btn${showFilter ? ' active' : ''}`,
          onClick: () => setShowFilter(!showFilter),
          title: '筛选'
        },
          React.createElement(SlidersHorizontal, { size: 16 }),
          ' 筛选',
          activeFilterCount > 0 ? React.createElement('span', { className: 'tool-count' }, activeFilterCount) : null
        ),
        React.createElement('div', { className: 'sort-group' },
          React.createElement(ArrowUpDown, { size: 14, className: 'sort-icon' }),
          React.createElement('select', {
            value: `${state.sortBy}:${state.sortOrder}`,
            onChange: (e) => {
              const [sortBy, sortOrder] = e.target.value.split(':');
              dispatch({ type: 'SET_SORT', payload: { sortBy, sortOrder } });
              refresh().catch((err) => notify(err.message));
            },
            className: 'sort-select'
          },
            React.createElement('option', { value: 'created:desc' }, '最新优先'),
            React.createElement('option', { value: 'created:asc' }, '最早优先'),
            React.createElement('option', { value: 'rating:desc' }, '评分从高到低'),
            React.createElement('option', { value: 'price:desc' }, '价格从高到低'),
            React.createElement('option', { value: 'price:asc' }, '价格从低到高')
          )
        ),
        React.createElement('button', { className: 'tool-btn', onClick: onToggleStats, title: '统计' },
          React.createElement(BarChart3, { size: 16 })
        ),
        React.createElement('button', { className: 'tool-btn', onClick: onToggleData, title: '数据管理' },
          React.createElement(Database, { size: 16 })
        ),
        React.createElement('button', { className: `tool-btn${theme === 'dark' ? ' active' : ''}`, onClick: onToggleTheme, title: theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式' },
          React.createElement(theme === 'dark' ? Sun : Moon, { size: 16 })
        )
      )
    ),
    showFilter && React.createElement(FilterPanel, { filters: state.filters, applyFilter, onClose: () => setShowFilter(false), onClear: handleClearFilters, tags: state.tags })
  );
}

function FilterPanel({ filters, applyFilter, onClose, onClear, tags }) {
  return React.createElement('div', { className: 'filter-panel' },
    React.createElement('div', { className: 'filter-header' },
      React.createElement('h3', null, '筛选条件'),
      React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 16 }))
    ),
    React.createElement('div', { className: 'filter-body' },

      // Date range
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          React.createElement(Calendar, { size: 14 }),
          ' 时间范围'
        ),
        React.createElement('div', { className: 'date-presets' },
          DATE_PRESETS.map((preset) =>
            React.createElement('button', {
              key: preset,
              className: `date-preset-btn${detectPreset(filters.date_from, filters.date_to) === preset ? ' active' : ''}`,
              onClick: () => {
                const d = getPresetDates(preset);
                applyFilter('date_from', d ? d.date_from : '');
                applyFilter('date_to', d ? d.date_to : '');
              }
            }, DATE_PRESET_LABELS[preset])
          )
        ),
        React.createElement('div', { className: 'date-range-row' },
          React.createElement('input', {
            type: 'date',
            value: filters.date_from || '',
            onChange: (e) => applyFilter('date_from', e.target.value)
          }),
          React.createElement('span', null, '至'),
          React.createElement('input', {
            type: 'date',
            value: filters.date_to || '',
            onChange: (e) => applyFilter('date_to', e.target.value)
          })
        )
      ),

      // Tags
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', null, '标签'),
        React.createElement('div', { className: 'tag-chips' },
          tags.map((tag) =>
            React.createElement('button', {
              key: tag.id,
              className: `tag-chip${(filters.tag_ids || '').split(',').includes(String(tag.id)) ? ' selected' : ''}`,
              style: (filters.tag_ids || '').split(',').includes(String(tag.id)) ? { background: tag.color, borderColor: tag.color, color: '#fff' } : {},
              onClick: () => {
                const current = (filters.tag_ids || '').split(',').filter(Boolean);
                const id = String(tag.id);
                const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id];
                applyFilter('tag_ids', next.join(','));
              }
            }, tag.name)
          )
        )
      ),

      // Rating
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', null, '最低评分'),
        React.createElement('div', { className: 'rating-filter' },
          [1, 2, 3, 4, 5].map((n) =>
            React.createElement('button', {
              key: n,
              className: `star-btn${Number(filters.min_rating) >= n ? ' on' : ''}`,
              onClick: () => applyFilter('min_rating', Number(filters.min_rating) === n ? '' : n)
            },
              React.createElement(Star, { size: 16, fill: Number(filters.min_rating) >= n ? 'currentColor' : 'none' })
            )
          ),
          Number(filters.min_rating) ? React.createElement('button', {
            className: 'clear-filter-btn',
            onClick: () => applyFilter('min_rating', '')
          }, '清除') : null
        )
      ),

      // Price
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', null, '价格区间'),
        React.createElement('div', { className: 'price-filter' },
          React.createElement('input', {
            type: 'number', placeholder: '最低', value: filters.price_min || '',
            onChange: (e) => applyFilter('price_min', e.target.value)
          }),
          React.createElement('span', null, '-'),
          React.createElement('input', {
            type: 'number', placeholder: '最高', value: filters.price_max || '',
            onChange: (e) => applyFilter('price_max', e.target.value)
          })
        )
      ),

      // Meal types
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', null, '用餐类型'),
        React.createElement('div', { className: 'tag-chips' },
          MEAL_TYPES.map((mt) =>
            React.createElement('button', {
              key: mt.value,
              className: `tag-chip${(filters.meal_types || '').split(',').includes(mt.value) ? ' selected' : ''}`,
              onClick: () => {
                const current = (filters.meal_types || '').split(',').filter(Boolean);
                const next = current.includes(mt.value) ? current.filter((t) => t !== mt.value) : [...current, mt.value];
                applyFilter('meal_types', next.join(','));
              }
            }, mt.label)
          )
        )
      ),

      // Favorite only
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', { className: 'checkbox-label' },
          React.createElement('input', {
            type: 'checkbox',
            checked: filters.is_favorite === true,
            onChange: (e) => applyFilter('is_favorite', e.target.checked ? true : '')
          }),
          ' 只看收藏'
        )
      ),

      // Has image only
      React.createElement('div', { className: 'filter-group' },
        React.createElement('label', { className: 'checkbox-label' },
          React.createElement('input', {
            type: 'checkbox',
            checked: filters.has_image === true,
            onChange: (e) => applyFilter('has_image', e.target.checked ? true : '')
          }),
          ' 只看有图'
        )
      )
    ),
    React.createElement('div', { className: 'filter-footer' },
      React.createElement('button', { className: 'ghost-btn', onClick: onClear }, '清除全部筛选'),
      React.createElement('button', { className: 'primary-btn', onClick: onClose }, '完成')
    )
  );
}
