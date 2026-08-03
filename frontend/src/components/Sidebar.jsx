import React from 'react';
import { Plus, Utensils, Star, Trash2, RotateCcw, X, CheckSquare } from 'lucide-react';
import { useStore } from '../stores';
import { api } from '../api';

function formatTime(value) {
  if (!value) return '';
  const date = new Date(String(value).endsWith('Z') ? value : `${value}Z`);
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

const MEAL_TYPE_LABELS = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '小吃',
  afternoon_tea: '下午茶', night_snack: '夜宵'
};

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightText({ text, keyword }) {
  const kw = (keyword || '').trim();
  if (!text || !kw) return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(kw)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === kw.toLowerCase()
      ? React.createElement('mark', { key: i, className: 'search-hl' }, part)
      : part
  );
}

export default function Sidebar({ onNewEntry, onEditEntry, entries, onFocusEntry }) {
  const { state, refresh, notify, dispatch } = useStore();
  const [multiSelectMode, setMultiSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [showTrash, setShowTrash] = React.useState(false);
  const [trashEntries, setTrashEntries] = React.useState([]);
  const [trashCount, setTrashCount] = React.useState(0);

  const fetchTrashCount = React.useCallback(async () => {
    try {
      const data = await api.getTrash();
      setTrashCount(Array.isArray(data) ? data.length : 0);
    } catch {}
  }, []);

  React.useEffect(() => { fetchTrashCount(); }, []);

  const enterMultiSelect = () => { setMultiSelectMode(true); setSelectedIds(new Set()); };
  const exitMultiSelect = () => { setMultiSelectMode(false); setSelectedIds(new Set()); };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.size} 条记录吗？`)) return;
    try {
      await api.batchDelete([...selectedIds]);
      notify(`已删除 ${selectedIds.size} 条记录`);
      await refresh();
      exitMultiSelect();
      fetchTrashCount();
    } catch (err) { notify(err.message); }
  };

  const openTrash = () => {
    setShowTrash(true);
    api.getTrash().then((data) => {
      setTrashEntries(Array.isArray(data) ? data : []);
    }).catch((err) => notify(err.message));
  };

  const handleRestore = async (id, name) => {
    try {
      await api.restoreEntry(id);
      notify(`已恢复「${name}」`);
      await refresh();
      const data = await api.getTrash();
      setTrashEntries(Array.isArray(data) ? data : []);
      fetchTrashCount();
    } catch (err) { notify(err.message); }
  };

  const handlePermanentDelete = async (id, name) => {
    if (!window.confirm(`永久删除「${name}」后将无法恢复，确认删除？`)) return;
    try {
      await api.permanentDelete(id);
      notify(`已永久删除「${name}」`);
      const data = await api.getTrash();
      setTrashEntries(Array.isArray(data) ? data : []);
      fetchTrashCount();
    } catch (err) { notify(err.message); }
  };

  const handleClearTrash = async () => {
    if (trashEntries.length === 0) return;
    if (!window.confirm(`确认清空回收站（共 ${trashEntries.length} 条）吗？此操作不可撤销。`)) return;
    try {
      const res = await api.clearTrash();
      notify(`已清空回收站（${res.deleted} 条）`);
      setTrashEntries([]);
      setTrashCount(0);
    } catch (err) { notify(err.message); }
  };

  const clearFilters = () => {
    dispatch({ type: 'SET_FILTERS', payload: {} });
    dispatch({ type: 'SET_KEYWORD', payload: '' });
    refresh().catch((err) => notify(err.message));
  };

  const hasKeyword = (state.keyword || '').trim();
  const hasFilters = Object.keys(state.filters).length > 0;

  let emptyEmoji = '🍜';
  let emptyMessage = '还没有美食记录';
  let emptyAction = null;
  let emptyActionLabel = '';
  if (multiSelectMode) {
    emptyEmoji = '🗑️';
    emptyMessage = '没有可选择的记录。';
  } else if (hasKeyword) {
    emptyEmoji = '🤔';
    emptyMessage = '未找到相关记录';
    emptyAction = clearFilters;
    emptyActionLabel = '清除搜索';
  } else if (hasFilters) {
    emptyEmoji = '🔍';
    emptyMessage = '没有找到符合条件的记录';
    emptyAction = clearFilters;
    emptyActionLabel = '清除筛选';
  } else {
    emptyEmoji = '🍜';
    emptyMessage = '还没有美食记录';
    emptyAction = onNewEntry;
    emptyActionLabel = '记录第一顿';
  }

  return React.createElement('aside', { className: 'sidebar' },
    React.createElement('div', { className: 'sidebar-header' },
      React.createElement('h1', null,
        React.createElement(Utensils, { size: 20 }),
        ' 美食地图'
      ),
      React.createElement('button', { className: 'add-btn', onClick: onNewEntry },
        React.createElement(Plus, { size: 18 }),
        ' 新增记录'
      ),
      !multiSelectMode && React.createElement('button', {
        className: 'ghost-btn small',
        onClick: enterMultiSelect
      },
        React.createElement(CheckSquare, { size: 14 }),
        ' 多选'
      )
    ),

    React.createElement('div', { className: 'entry-list' },
      multiSelectMode && entries.length > 0 && React.createElement('div', { className: 'select-all-row' },
        React.createElement('label', { className: 'checkbox-label' },
          React.createElement('input', {
            type: 'checkbox',
            checked: entries.length > 0 && selectedIds.size === entries.length,
            onChange: selectAll
          }),
          ` 全选 (${selectedIds.size}/${entries.length})`
        )
      ),
      state.loading
        ? React.createElement(ListSkeleton, null)
        : entries.length === 0
          ? React.createElement(EmptyState, { emoji: emptyEmoji, message: emptyMessage, onAction: emptyAction, actionLabel: emptyActionLabel })
          : entries.map((entry) =>
            React.createElement(EntryCard, {
              key: entry.id,
              entry,
              keyword: state.keyword,
              multiSelectMode,
              isSelected: selectedIds.has(entry.id),
              onToggleSelect: () => toggleSelect(entry.id),
              onClick: () => onFocusEntry(entry.id),
              onEdit: (e) => { e.stopPropagation(); onEditEntry(entry); }
            })
          )
    ),

    multiSelectMode && React.createElement('div', { className: 'multi-select-bar' },
      React.createElement('span', { className: 'multi-select-count' }, `已选 ${selectedIds.size} 条`),
      React.createElement('div', { className: 'multi-select-actions' },
        React.createElement('button', {
          className: 'ghost-btn small',
          style: { color: '#E0433A' },
          onClick: handleBatchDelete,
          disabled: selectedIds.size === 0
        }, '批量删除'),
        React.createElement('button', { className: 'ghost-btn small', onClick: exitMultiSelect }, '取消')
      )
    ),

    !multiSelectMode && React.createElement('div', { className: 'sidebar-trash-bar' },
      React.createElement('button', { className: 'trash-btn', onClick: openTrash },
        '🗑️ 回收站',
        trashCount > 0 ? React.createElement('span', { className: 'trash-count' }, trashCount) : null
      )
    ),

    showTrash && React.createElement(TrashModal, {
      entries: trashEntries,
      onClose: () => setShowTrash(false),
      onRestore: handleRestore,
      onPermanentDelete: handlePermanentDelete,
      onClearAll: handleClearTrash
    })
  );
}

function ListSkeleton() {
  return React.createElement('div', { className: 'skeleton-list', 'aria-hidden': true },
    [0, 1, 2].map((i) =>
      React.createElement('div', { key: i, className: 'skeleton-card' },
        React.createElement('div', { className: 'skeleton skeleton-thumb' }),
        React.createElement('div', { className: 'skeleton-lines' },
          React.createElement('div', { className: 'skeleton skeleton-line' }),
          React.createElement('div', { className: 'skeleton skeleton-line short' }),
          React.createElement('div', { className: 'skeleton skeleton-line tiny' })
        )
      )
    )
  );
}

function EmptyState({ emoji, message, onAction, actionLabel }) {
  return React.createElement('div', { className: 'empty-state' },
    React.createElement('div', { className: 'empty-emoji' }, emoji),
    React.createElement('p', null, message),
    onAction ? React.createElement('button', { className: 'empty-btn', onClick: onAction }, actionLabel) : null
  );
}

function EntryCard({ entry, keyword, multiSelectMode, isSelected, onToggleSelect, onClick, onEdit }) {
  const coverImg = entry.cover_image || (entry.images?.[0]?.image_path);
  const tagColors = (entry.tags || []).slice(0, 3);

  return React.createElement('div', {
    className: `entry-item${multiSelectMode ? ' multi-select-item' : ''}`,
    onClick: multiSelectMode ? onToggleSelect : onClick
  },
    multiSelectMode && React.createElement('input', {
      type: 'checkbox',
      className: 'entry-checkbox',
      checked: isSelected,
      onChange: onToggleSelect,
      onClick: (e) => e.stopPropagation()
    }),
    React.createElement('div', { className: 'entry-thumb' },
      coverImg
        ? React.createElement('img', { src: coverImg, alt: entry.dish_name, loading: 'lazy' })
        : React.createElement('span', null, '🍜')
    ),
    React.createElement('div', { className: 'entry-meta' },
      React.createElement('div', { className: 'entry-title-row' },
        React.createElement('b', null, React.createElement(HighlightText, { text: entry.dish_name, keyword })),
        entry.is_favorite ? React.createElement(Star, { size: 12, fill: '#FF5A2B', color: '#FF5A2B', className: 'fav-star' }) : null
      ),
      React.createElement('span', null, React.createElement(HighlightText, { text: entry.restaurant_name, keyword })),
      React.createElement('div', { className: 'entry-tags' },
        entry.meal_type ? React.createElement('span', { className: 'meal-badge' }, MEAL_TYPE_LABELS[entry.meal_type] || entry.meal_type) : null,
        entry.price_per_person ? React.createElement('span', { className: 'price-badge' }, '¥' + entry.price_per_person) : null,
        entry.rating ? React.createElement('span', { className: 'rating-badge' }, '★ ' + entry.rating) : null,
        tagColors.map((t) =>
          React.createElement('span', { key: t.id, className: 'mini-tag', style: { background: t.color + '20', color: t.color, borderColor: t.color + '40' } }, t.name)
        )
      ),
      React.createElement('small', null, formatTime(entry.created_at))
    )
  );
}

function TrashModal({ entries, onClose, onRestore, onPermanentDelete, onClearAll }) {
  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal modal-lg' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, '🗑️ 回收站'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 16 }))
      ),
      React.createElement('div', { className: 'modal-body' },
        entries.length === 0
          ? React.createElement(EmptyState, { emoji: '🗑️', message: '回收站是空的' })
          : entries.map((entry) =>
              React.createElement('div', { key: entry.id, className: 'trash-entry' },
                React.createElement('div', { className: 'trash-entry-thumb' },
                  (entry.cover_image || (entry.images?.[0]?.image_path))
                    ? React.createElement('img', { src: entry.cover_image || entry.images[0].image_path, alt: entry.dish_name })
                    : React.createElement('span', null, '🍜')
                ),
                React.createElement('div', { className: 'trash-entry-info' },
                  React.createElement('div', { className: 'trash-entry-title' },
                    React.createElement('b', null, entry.dish_name),
                    React.createElement('span', { className: 'muted' }, entry.restaurant_name)
                  ),
                  React.createElement('small', { className: 'muted' }, '删除于 ' + formatTime(entry.deleted_at))
                ),
                React.createElement('div', { className: 'trash-entry-actions' },
                  React.createElement('button', {
                    className: 'icon-btn',
                    title: '恢复',
                    onClick: () => onRestore(entry.id, entry.dish_name)
                  }, React.createElement(RotateCcw, { size: 16 })),
                  React.createElement('button', {
                    className: 'icon-btn danger',
                    title: '永久删除',
                    onClick: () => onPermanentDelete(entry.id, entry.dish_name)
                  }, React.createElement(Trash2, { size: 16 }))
                )
              )
            )
      ),
      React.createElement('div', { className: 'modal-footer', style: { justifyContent: 'space-between' } },
        React.createElement('button', {
          className: 'ghost-btn',
          style: { color: '#E0433A' },
          onClick: onClearAll,
          disabled: entries.length === 0
        }, '清空回收站'),
        React.createElement('button', { className: 'primary-btn', onClick: onClose }, '关闭')
      )
    )
  );
}
