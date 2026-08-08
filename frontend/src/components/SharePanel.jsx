import React from 'react';
import { X, Users, Plus, LogIn, Copy, Check, LogOut, Trash2, Share2 } from 'lucide-react';
import { useStore } from '../stores';
import { api } from '../api';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(String(value).endsWith('Z') ? value : `${value}Z`);
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export default function SharePanel({ onClose }) {
  const { state, notify, loadGroups, setCurrentGroup, setViewMode, refresh } = useStore();
  const [groupName, setGroupName] = React.useState('');
  const [joinCode, setJoinCode] = React.useState('');
  const [createdCode, setCreatedCode] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [members, setMembers] = React.useState([]);

  const user = state.user;
  const rooms = state.groups;
  const currentGroup = state.currentGroup;

  const refreshMembers = React.useCallback(async () => {
    if (!currentGroup) { setMembers([]); return; }
    try {
      const res = await api.getGroupMembers(currentGroup.id);
      setMembers(Array.isArray(res.members) ? res.members : []);
    } catch (err) { notify(err.message, null, 2600, 'error'); }
  }, [currentGroup]);

  React.useEffect(() => {
    loadGroups().catch(() => {});
  }, []);

  React.useEffect(() => {
    refreshMembers();
  }, [currentGroup, refreshMembers]);

  const refreshGroups = async () => {
    try { await loadGroups(); } catch {}
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = groupName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await api.createGroup({ name, creator_id: user.id });
      setGroupName('');
      setCreatedCode(res.group.id);
      setCopied(false);
      setCurrentGroup(res.group);
      notify(`房间「${res.group.name}」已创建`, null, 2000, 'success');
      await refreshGroups();
    } catch (err) { notify(err.message, null, 2600, 'error'); }
    finally { setBusy(false); }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    try {
      const res = await api.joinGroup({ code, user_id: user.id });
      setJoinCode('');
      setCreatedCode(null);
      setCurrentGroup(res.group);
      notify(`已加入「${res.group.name}」`, null, 2000, 'success');
      await refreshGroups();
    } catch (err) { notify(err.message, null, 2600, 'error'); }
    finally { setBusy(false); }
  };

  const enterRoom = (room) => {
    setCurrentGroup(room);
    setCreatedCode(null);
    notify(`已进入「${room.name}」`, null, 2000, 'success');
  };

  const leaveRoom = async (room) => {
    if (!window.confirm(`确认退出「${room.name}」吗？退出后将看不到该组共享记录。`)) return;
    try {
      await api.leaveGroup(room.id, user.id);
      if (state.currentGroup?.id === room.id) {
        setCurrentGroup(null);
        setViewMode('mine');
      }
      setMembers([]);
      notify(`已退出「${room.name}」`, null, 2000, 'success');
      await refreshGroups();
      await refresh('mine');
    } catch (err) { notify(err.message, null, 2600, 'error'); }
  };

  const disbandRoom = async (room) => {
    if (!window.confirm(`解散「${room.name}」后所有共享记录将变为私有，确定？`)) return;
    try {
      await api.disbandGroup(room.id, user.id);
      if (state.currentGroup?.id === room.id) {
        setCurrentGroup(null);
        setViewMode('mine');
      }
      setMembers([]);
      notify('房间已解散', null, 2600, 'success');
      await refreshGroups();
      await refresh('mine');
    } catch (err) { notify(err.message, null, 2600, 'error'); }
  };

  const copyCreated = async () => {
    await copyText(createdCode);
    setCopied(true);
    notify('房间码已复制，发给朋友吧！', null, 2000, 'success');
  };

  const copyCurrentRoom = async () => {
    if (!currentGroup) return;
    await copyText(currentGroup.id);
    setCopied(true);
    notify('房间码已复制，发给朋友吧！', null, 2000, 'success');
  };

  const shareRoomCode = async (code, roomName) => {
    const shareData = {
      title: `一起记录美食「${roomName}」`,
      text: `加入我的共享房间「${roomName}」，房间码：${code}`,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    await copyText(code);
    notify('房间码已复制，发给朋友吧！', null, 2000, 'success');
  };

  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal share-modal' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null,
          React.createElement(Users, { size: 18 }),
          ' 共享'
        ),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 16 }))
      ),
      React.createElement('div', { className: 'modal-body share-body' },

        // Current room detail
        currentGroup && React.createElement('div', { className: 'share-section room-detail' },
          React.createElement('div', { className: 'room-detail-name' }, currentGroup.name),
          React.createElement('div', { className: 'room-detail-code-row' },
            React.createElement('span', { className: 'room-detail-code' }, currentGroup.id),
            React.createElement('button', { className: 'ghost-btn small', title: '复制房间码', onClick: () => copyCurrentRoom() },
              React.createElement(Copy, { size: 14 }),
              ' 复制'
            ),
            React.createElement('button', {
              className: 'ghost-btn small',
              title: '分享房间码',
              onClick: () => shareRoomCode(currentGroup.id, currentGroup.name)
            },
              React.createElement(Share2, { size: 14 }),
              ' 分享'
            )
          ),
          React.createElement('div', { className: 'room-detail-member-title' },
            React.createElement(Users, { size: 13 }),
            ' 成员 (',
            members.length,
            ')'
          ),
          React.createElement('div', { className: 'room-member-list' },
            members.length === 0
              ? React.createElement('div', { className: 'share-empty' }, '暂无成员')
              : members.map((m) => React.createElement('div', { key: m.user_id, className: 'room-member-row' },
                  React.createElement('span', { className: 'user-avatar member-avatar', style: { background: m.color || '#888' } },
                    (m.nickname || '?').slice(0, 1)
                  ),
                  React.createElement('span', { className: 'room-member-name' },
                    m.nickname || '未知用户',
                    m.user_id === currentGroup.creator_id ? React.createElement('span', { className: 'share-owner-badge', style: { marginLeft: 6 } }, '房主') : null,
                    m.user_id === user.id ? React.createElement('span', { className: 'share-current-badge', style: { marginLeft: 6 } }, '我') : null
                  ),
                  React.createElement('span', { className: 'room-member-time' }, formatTime(m.joined_at))
                ))
          ),
          React.createElement('div', { className: 'room-detail-actions' },
            currentGroup.creator_id === user.id
              ? React.createElement('button', { className: 'danger-btn', onClick: () => disbandRoom(currentGroup) },
                  React.createElement(Trash2, { size: 14 }),
                  ' 解散房间'
                )
              : React.createElement('button', { className: 'danger-btn', onClick: () => leaveRoom(currentGroup) },
                  React.createElement(LogOut, { size: 14 }),
                  ' 退出房间'
                )
          )
        ),

        // Create group
        React.createElement('div', { className: 'share-section' },
          React.createElement('div', { className: 'share-section-title' }, '创建共享组'),
          React.createElement('form', { className: 'share-inline', onSubmit: handleCreate },
            React.createElement('input', {
              className: 'share-input',
              placeholder: '输入组名，如：成都美食小分队',
              value: groupName,
              maxLength: 30,
              onChange: (e) => setGroupName(e.target.value)
            }),
            React.createElement('button', { className: 'primary-btn share-btn', type: 'submit', disabled: busy || !groupName.trim() },
              React.createElement(Plus, { size: 14 }),
              ' 创建'
            )
          ),
          createdCode && React.createElement('div', { className: 'share-code-result' },
            React.createElement('span', { className: 'share-code-label' }, '房间码'),
            React.createElement('span', { className: 'share-code-text' }, createdCode),
            React.createElement('button', { className: 'ghost-btn small', onClick: copyCreated },
              copied ? React.createElement(Check, { size: 14 }) : React.createElement(Copy, { size: 14 }),
              copied ? ' 已复制' : ' 复制'
            )
          )
        ),

        // Join group
        React.createElement('div', { className: 'share-section' },
          React.createElement('div', { className: 'share-section-title' }, '加入共享组'),
          React.createElement('form', { className: 'share-inline', onSubmit: handleJoin },
            React.createElement('input', {
              className: 'share-input share-code-input',
              placeholder: '输入 6 位房间码',
              value: joinCode,
              maxLength: 6,
              onChange: (e) => setJoinCode(e.target.value.toUpperCase())
            }),
            React.createElement('button', { className: 'primary-btn share-btn', type: 'submit', disabled: busy || joinCode.trim().length !== 6 },
              React.createElement(LogIn, { size: 14 }),
              ' 加入'
            )
          )
        ),

        // Room list
        React.createElement('div', { className: 'share-section' },
          React.createElement('div', { className: 'share-section-title' },
            '已加入的房间',
            rooms.length > 0 ? React.createElement('span', { className: 'share-section-count' }, rooms.length) : null
          ),
          rooms.length === 0
            ? React.createElement('div', { className: 'share-empty' }, '还没有加入任何房间，创建或输入房间码加入吧')
            : React.createElement('div', { className: 'share-room-list' },
                rooms.map((room) => {
                  const isCurrent = state.currentGroup?.id === room.id;
                  return React.createElement('div', { key: room.id, className: `share-room${isCurrent ? ' current' : ''}` },
                    React.createElement('div', { className: 'share-room-info' },
                      React.createElement('div', { className: 'share-room-name' },
                        room.name,
                        isCurrent ? React.createElement('span', { className: 'share-current-badge' }, '当前') : null,
                        room.is_creator ? React.createElement('span', { className: 'share-owner-badge' }, '房主') : null
                      ),
                      React.createElement('span', { className: 'share-room-meta' },
                        room.id,
                        ' · ',
                        room.member_count,
                        ' 人'
                      )
                    ),
                    React.createElement('div', { className: 'share-room-actions' },
                      isCurrent
                        ? null
                        : React.createElement('button', { className: 'icon-btn', title: '进入', onClick: () => enterRoom(room) },
                            React.createElement(LogIn, { size: 14 })
                          ),
                      room.is_creator
                        ? React.createElement('button', {
                            className: 'icon-btn danger',
                            title: '解散房间',
                            onClick: () => disbandRoom(room)
                          }, React.createElement(Trash2, { size: 14 }))
                        : React.createElement('button', {
                            className: 'icon-btn',
                            title: '退出房间',
                            onClick: () => leaveRoom(room)
                          }, React.createElement(LogOut, { size: 14 }))
                    )
                  );
                })
              )
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'primary-btn', onClick: onClose }, '关闭')
      )
    )
  );
}
