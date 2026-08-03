import React from 'react';

export default function Toast({ message, action, variant }) {
  if (!message) return null;
  const className = `toast${variant === 'success' ? ' toast-success' : variant === 'error' ? ' toast-error' : ''}`;
  return React.createElement('div', { className },
    React.createElement('span', null, message),
    action ? React.createElement('button', { className: 'toast-action', onClick: action.onClick }, action.label) : null
  );
}
