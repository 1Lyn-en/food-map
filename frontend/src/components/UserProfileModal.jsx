import React from 'react';
import { X } from 'lucide-react';

export const AVATAR_COLORS = [
  '#FF5A2B', '#FF8C00', '#FFC107', '#8BC34A',
  '#00BCD4', '#2196F3', '#3F51B5', '#9C27B0',
  '#E91E63', '#F44336', '#795548', '#607D8B'
];

export default function UserProfileModal({ title, subtitle, showClose, onClose, onSubmit, initial, submitLabel = '开始使用' }) {
  const [nickname, setNickname] = React.useState(initial?.nickname || '');
  const [color, setColor] = React.useState(initial?.color || AVATAR_COLORS[0]);

  const trimmed = nickname.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 20;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ nickname: trimmed, color });
  };

  const char = trimmed ? trimmed[0].toUpperCase() : '?';

  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('form', { className: 'modal user-modal', onSubmit: submit },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, title),
        showClose ? React.createElement('button', {
          type: 'button', className: 'close-btn', onClick: onClose
        }, React.createElement(X, { size: 16 })) : null
      ),
      React.createElement('div', { className: 'modal-body' },
        React.createElement('div', { className: 'user-avatar-preview' },
          React.createElement('span', { className: 'user-avatar', style: { background: color } }, char)
        ),
        subtitle ? React.createElement('p', { className: 'user-modal-subtitle' }, subtitle) : null,
        React.createElement('label', null,
          '请输入你的昵称（1-20字符）',
          React.createElement('input', {
            value: nickname,
            onChange: (e) => setNickname(e.target.value),
            placeholder: '你的昵称',
            maxLength: 20,
            autoFocus: true
          })
        ),
        React.createElement('div', { className: 'user-color-label' }, '选择你的颜色'),
        React.createElement('div', { className: 'color-picker user-color-picker' },
          AVATAR_COLORS.map((c) =>
            React.createElement('button', {
              key: c,
              type: 'button',
              className: `color-swatch user-swatch${color === c ? ' selected' : ''}`,
              style: { background: c },
              onClick: () => setColor(c),
              'aria-label': c
            })
          )
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', {
          type: 'submit', className: 'primary-btn', disabled: !canSubmit
        }, submitLabel)
      )
    )
  );
}
