import React, { useState } from 'react';
import { X, Download, Upload, Tags, Trash2, Edit3, Plus } from 'lucide-react';
import { useStore } from '../stores';
import { api } from '../api';

const colors = [
  '#FF4444', '#FF8C00', '#FFC107', '#4CAF50', '#2196F3', '#9C27B0',
  '#E91E63', '#00BCD4', '#795548', '#607D8B', '#FF5722', '#6D4C41'
];

export default function DataPanel({ onClose }) {
  const { state, refreshTags, refresh, notify } = useStore();
  const [tab, setTab] = useState('tags');
  const [importing, setImporting] = useState(false);

  const handleExportJSON = async () => {
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `food-map-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('导出成功');
    } catch (err) { notify(err.message); }
  };

  const handleExportCSV = () => {
    const a = document.createElement('a');
    a.href = api.exportCsvUrl();
    a.download = `food-map-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.importData(form);
      notify(result.message || '导入成功');
      await Promise.all([refresh(), refreshTags()]);
    } catch (err) { notify(err.message); }
    finally { setImporting(false); }
  };

  return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'modal', role: 'dialog' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, '数据管理'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 18 }))
      ),
      React.createElement('div', { className: 'tab-bar' },
        React.createElement('button', { className: `tab-btn${tab === 'tags' ? ' active' : ''}`, onClick: () => setTab('tags') },
          React.createElement(Tags, { size: 14 }), ' 标签管理'),
        React.createElement('button', { className: `tab-btn${tab === 'import' ? ' active' : ''}`, onClick: () => setTab('import') },
          React.createElement(Download, { size: 14 }), ' 导入/导出')
      ),
      React.createElement('div', { className: 'modal-body' },
        tab === 'tags'
          ? React.createElement(TagManagerView, { colors, notify, refreshTags })
          : React.createElement(ImportExportView, { handleExportJSON, handleExportCSV, handleImport, importing })
      )
    )
  );
}

function TagManagerView({ colors, notify, refreshTags }) {
  const { state } = useStore();
  const tags = state.tags || [];
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#FF4444');

  const handleDelete = async (tag) => {
    if (!window.confirm(`确认删除标签「${tag.name}」？关联的记录不会删除。`)) return;
    try {
      await api.deleteTag(tag.id);
      await refreshTags();
      notify('已删除标签');
    } catch (err) { notify(err.message); }
  };

  const handleEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return notify('标签名不能为空');
    try {
      await api.updateTag(editingId, { name: editName.trim(), color: editColor });
      await refreshTags();
      setEditingId(null);
      notify('已更新标签');
    } catch (err) { notify(err.message); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return notify('请输入标签名');
    if (newName.trim().length > 10) return notify('标签名最多10个字符');
    try {
      await api.createTag({ name: newName.trim(), color: newColor });
      await refreshTags();
      setNewName('');
      notify('已创建标签');
    } catch (err) { notify(err.message); }
  };

  return React.createElement('div', null,
    // Create new tag
    React.createElement('div', { className: 'tag-create-bar' },
      React.createElement('div', { className: 'color-picker' },
        colors.map((c) => React.createElement('button', { key: c, className: `color-swatch${newColor === c ? ' selected' : ''}`,
          style: { background: c }, onClick: () => setNewColor(c) }))
      ),
      React.createElement('input', { value: newName, placeholder: '新标签名', maxLength: 10,
        onChange: (e) => setNewName(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') handleCreate(); } }),
      React.createElement('button', { className: 'primary-btn small', onClick: handleCreate }, '创建')
    ),

    // Tag list
    React.createElement('div', { className: 'tag-list' },
      tags.map((tag) =>
        editingId === tag.id
          ? React.createElement('div', { key: tag.id, className: 'tag-edit-row' },
              React.createElement('div', { className: 'color-picker' },
                colors.map((c) => React.createElement('button', { key: c, className: `color-swatch${editColor === c ? ' selected' : ''}`,
                  style: { background: c }, onClick: () => setEditColor(c) }))
              ),
              React.createElement('input', { value: editName, maxLength: 10,
                onChange: (e) => setEditName(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') handleSaveEdit(); } }),
              React.createElement('button', { className: 'primary-btn small', onClick: handleSaveEdit }, '保存'),
              React.createElement('button', { className: 'ghost-btn small', onClick: () => setEditingId(null) }, '取消')
            )
          : React.createElement('div', { key: tag.id, className: 'tag-row' },
              React.createElement('span', { className: 'tag-dot', style: { background: tag.color } }),
              React.createElement('span', { className: 'tag-name' }, tag.name),
              React.createElement('button', { className: 'icon-btn', onClick: () => handleEdit(tag), title: '编辑' },
                React.createElement(Edit3, { size: 13 })),
              React.createElement('button', { className: 'icon-btn danger', onClick: () => handleDelete(tag), title: '删除' },
                React.createElement(Trash2, { size: 13 }))
            )
      ),
      tags.length === 0 && React.createElement('p', { className: 'empty' }, '还没有标签')
    )
  );
}

function ImportExportView({ handleExportJSON, handleExportCSV, handleImport, importing }) {
  return React.createElement('div', null,
    React.createElement('div', { className: 'data-section' },
      React.createElement('h3', null, '导出数据'),
      React.createElement('p', { className: 'hint' }, '将全部数据导出为备份文件，便于迁移或归档'),
      React.createElement('div', { className: 'btn-row' },
        React.createElement('button', { className: 'ghost-btn', onClick: handleExportJSON },
          React.createElement(Download, { size: 14 }), ' 导出 JSON（含完整数据）'),
        React.createElement('button', { className: 'ghost-btn', onClick: handleExportCSV },
          React.createElement(Download, { size: 14 }), ' 导出 CSV（表格数据）')
      )
    ),
    React.createElement('div', { className: 'data-section', style: { borderTop: '1px solid var(--border)', paddingTop: 16 } },
      React.createElement('h3', null, '导入数据'),
      React.createElement('p', { className: 'hint' }, '从之前导出的 JSON 备份文件恢复数据'),
      React.createElement('label', { className: 'import-btn' },
        importing ? '导入中...' : '选择备份文件 (.json)',
        React.createElement('input', { type: 'file', accept: '.json', onChange: handleImport, disabled: importing, style: { display: 'none' } })
      )
    )
  );
}
