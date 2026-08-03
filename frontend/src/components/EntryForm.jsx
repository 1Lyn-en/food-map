import React, { useEffect, useState, useRef } from 'react';
import { X, Plus, MapPin, Star, ImagePlus, Trash2, GripVertical, Navigation, Loader } from 'lucide-react';
import { useStore } from '../stores';
import { api } from '../api';

function readRational(view, offset, isLE) {
  const num = view.getUint32(offset, isLE);
  const den = view.getUint32(offset + 4, isLE);
  return den ? num / den : 0;
}

function readExifGPSData(view, tiffBase, gpsIfdOff, isLE) {
  const entryStart = tiffBase + gpsIfdOff;
  const n = view.getUint16(entryStart, isLE);
  let latRef = '', lat = null, lngRef = '', lng = null;
  for (let i = 0; i < n; i++) {
    const eo = entryStart + 2 + i * 12;
    if (eo + 12 > view.byteLength) break;
    const tag = view.getUint16(eo, isLE);
    const type = view.getUint16(eo + 2, isLE);
    const count = view.getUint32(eo + 4, isLE);
    if (tag === 0x0001 && type === 2) {
      if (count <= 4) latRef = String.fromCharCode(view.getUint32(eo + 8, isLE) & 0xFF);
    } else if (tag === 0x0002 && type === 5 && count === 3) {
      const dataOff = view.getUint32(eo + 8, isLE);
      if (tiffBase + dataOff + 24 <= view.byteLength) {
        lat = readRational(view, tiffBase + dataOff, isLE)
           + readRational(view, tiffBase + dataOff + 8, isLE) / 60
           + readRational(view, tiffBase + dataOff + 16, isLE) / 3600;
      }
    } else if (tag === 0x0003 && type === 2) {
      if (count <= 4) lngRef = String.fromCharCode(view.getUint32(eo + 8, isLE) & 0xFF);
    } else if (tag === 0x0004 && type === 5 && count === 3) {
      const dataOff = view.getUint32(eo + 8, isLE);
      if (tiffBase + dataOff + 24 <= view.byteLength) {
        lng = readRational(view, tiffBase + dataOff, isLE)
           + readRational(view, tiffBase + dataOff + 8, isLE) / 60
           + readRational(view, tiffBase + dataOff + 16, isLE) / 3600;
      }
    }
  }
  if (lat === null || lng === null) return null;
  if (latRef === 'S') lat = -lat;
  if (lngRef === 'W') lng = -lng;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseExifGPS(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = new Uint8Array(reader.result);
        const view = new DataView(reader.result);
        if (view.getUint16(0, false) !== 0xFFD8) return resolve(null);
        let offset = 2;
        while (offset < view.byteLength - 2) {
          const marker = view.getUint16(offset, false);
          if (marker >= 0xFFD0 && marker <= 0xFFD9) break;
          if (marker === 0xFFE1) {
            const length = view.getUint16(offset + 2, false);
            const exifStart = offset + 4;
            if (exifStart + 6 > view.byteLength) break;
            if (arr[exifStart] !== 0x45 || arr[exifStart + 1] !== 0x78 || arr[exifStart + 2] !== 0x69 || arr[exifStart + 3] !== 0x66 || arr[exifStart + 4] !== 0 || arr[exifStart + 5] !== 0) break;
            const tiffStart = exifStart + 6;
            const isLE = view.getUint16(tiffStart, false) === 0x4949;
            if (view.getUint16(tiffStart + 2, isLE) !== 0x002A) return resolve(null);
            const ifd0Off = view.getUint32(tiffStart + 4, isLE);
            if (tiffStart + ifd0Off + 2 > view.byteLength) return resolve(null);
            const nEntries = view.getUint16(tiffStart + ifd0Off, isLE);
            let gpsIfdOff = 0;
            for (let i = 0; i < nEntries; i++) {
              const eo = tiffStart + ifd0Off + 2 + i * 12;
              if (eo + 12 > view.byteLength) break;
              if (view.getUint16(eo, isLE) === 0x8825) { gpsIfdOff = view.getUint32(eo + 8, isLE); break; }
            }
            if (!gpsIfdOff) return resolve(null);
            resolve(readExifGPSData(view, tiffStart, gpsIfdOff, isLE));
            return;
          }
          offset += 2 + view.getUint16(offset + 2, false);
        }
      } catch (_) {}
      resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}

const MEAL_TYPES = [
  { value: '', label: '不选择' },
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '小吃' },
  { value: 'afternoon_tea', label: '下午茶' },
  { value: 'night_snack', label: '夜宵' }
];

const colors = [
  '#FF4444', '#FF8C00', '#FFC107', '#4CAF50', '#2196F3', '#9C27B0',
  '#E91E63', '#00BCD4', '#795548', '#607D8B', '#FF5722', '#6D4C41'
];

const DRAFT_KEY = 'food-map-draft';

function buildDraftText(d) {
  return {
    dish_name: d.dish_name,
    restaurant_name: d.restaurant_name,
    address_text: d.address_text,
    meal_type: d.meal_type,
    price_per_person: d.price_per_person,
    rating: d.rating,
    notes: d.notes,
    tag_ids: d.tag_ids || [],
    meal_date: d.meal_date,
    longitude: d.lng,
    latitude: d.lat
  };
}

function isDraftEmpty(d) {
  return !d.dish_name && !d.restaurant_name && !d.address_text && !d.meal_type &&
    !d.price_per_person && !d.rating && !d.notes &&
    (!d.tag_ids || d.tag_ids.length === 0) && !d.meal_date &&
    d.lng == null && d.lat == null && d.longitude == null && d.latitude == null;
}

export default function EntryForm({ onClose, amapReady, hasKey, keyword, setKeyword, suggestions, setSuggestions, onPickTip, reverseGeocode, onMapSetPoint, saveFormRef }) {
  const { state, dispatch, refresh, refreshTags, notify } = useStore();
  const entry = state.draft;
  const [draft, setDraft] = useState({
    id: null, dish_name: '', restaurant_name: '', address_text: '',
    lng: null, lat: null, meal_type: '', price_per_person: '',
    rating: null, notes: '', is_favorite: false,
    tag_ids: [], meal_date: ''
  });
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#FF4444');
  const [saving, setSaving] = useState(false);
  const [exifCoords, setExifCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [allImages, setAllImages] = useState([]);
  const [coverKey, setCoverKey] = useState(null);
  const [deletedImgIds, setDeletedImgIds] = useState(new Set());
  const [draftPrompt, setDraftPrompt] = useState(false);
  const pickRef = useRef(false);
  const dragIdxRef = useRef(-1);
  const draftRef = useRef(null);
  draftRef.current = draft;
  const savedRef = useRef(false);
  const initializedRef = useRef(false);
  const everSavedDraftRef = useRef(false);

  const openEntry = state.draft;

  useEffect(() => {
    if (openEntry) {
      setDraft({
        id: openEntry.id || null,
        dish_name: openEntry.dish_name || '',
        restaurant_name: openEntry.restaurant_name || '',
        address_text: openEntry.address_text || '',
        lng: openEntry.longitude || null,
        lat: openEntry.latitude || null,
        meal_type: openEntry.meal_type || '',
        price_per_person: openEntry.price_per_person ? String(openEntry.price_per_person) : '',
        rating: openEntry.rating || null,
        notes: openEntry.notes || '',
        is_favorite: Boolean(openEntry.is_favorite),
        tag_ids: (openEntry.tags || []).map((t) => t.id),
        meal_date: openEntry.meal_date || ''
      });
      const imgs = (openEntry.images || []).map((img) => ({
        key: `img-${img.id}`,
        kind: 'existing',
        img,
        url: img.thumbnail_path || img.image_path
      }));
      setAllImages(imgs);
      setCoverKey(imgs.length > 0 ? imgs[0].key : null);
      setDeletedImgIds(new Set());
      setExifCoords(null);
    }
  }, [openEntry]);

  // Register save handler for Ctrl+S shortcut
  React.useEffect(() => {
    if (saveFormRef) saveFormRef.current = handleSave;
  });

  // Check for unfinished draft when opening a new form
  React.useEffect(() => {
    if (openEntry && !openEntry.id) {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && !isDraftEmpty(parsed)) setDraftPrompt(true);
        }
      } catch (_) {}
    }
  }, [openEntry]);

  // Autosave draft (new forms only, 2s debounce)
  React.useEffect(() => {
    if (savedRef.current) return;
    if (draft.id != null) return;
    if (!initializedRef.current) { initializedRef.current = true; return; }
    if (isDraftEmpty(draft)) {
      if (everSavedDraftRef.current) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
        everSavedDraftRef.current = false;
      }
      return;
    }
    const text = buildDraftText(draft);
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(text));
        everSavedDraftRef.current = true;
      } catch (_) {}
    }, 2000);
    return () => clearTimeout(timer);
  }, [draft]);

  // Flush draft on unmount so closing the form keeps it recoverable
  React.useEffect(() => {
    return () => {
      if (savedRef.current) return;
      const d = draftRef.current;
      if (!d || d.id != null) return;
      if (isDraftEmpty(d)) return;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftText(d))); } catch (_) {}
    };
  }, []);

  const selectedTags = (state.tags || []).filter((t) => draft.tag_ids.includes(t.id));

  const handleImageAdd = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const total = files.length + allImages.length;
    if (total > 9) return notify('最多上传9张图片');

    const validFiles = files.filter((f) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { notify('仅支持 JPG/PNG/WebP'); return false; }
      if (f.size > 10 * 1024 * 1024) { notify('单张图片不超过10MB'); return false; }
      return true;
    });
    const stamp = Date.now();
    const newItems = validFiles.map((file, i) => ({
      key: `new-${stamp}-${i}`,
      kind: 'new',
      file,
      url: URL.createObjectURL(file)
    }));
    setAllImages((prev) => [...prev, ...newItems]);

    if (!exifCoords && validFiles.length > 0) {
      const checkExif = async () => {
        for (const file of validFiles) {
          const gps = await parseExifGPS(file);
          if (gps) { setExifCoords(gps); break; }
        }
      };
      checkExif();
    }
  };

  const removeImage = (key) => {
    setAllImages((prev) => {
      const item = prev.find((it) => it.key === key);
      if (item?.kind === 'new' && item.url) {
        try { URL.revokeObjectURL(item.url); } catch (_) {}
      }
      return prev.filter((it) => it.key !== key);
    });
    if (coverKey === key) setCoverKey(null);
    const match = key.match(/^img-(\d+)$/);
    if (match) {
      setDeletedImgIds((prev) => new Set([...prev, Number(match[1])]));
    }
  };

  const handleDragStart = (e, idx) => {
    dragIdxRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    const dragIdx = dragIdxRef.current;
    if (dragIdx < 0 || dragIdx === dropIdx) return;
    setAllImages((prev) => {
      const items = [...prev];
      const [moved] = items.splice(dragIdx, 1);
      items.splice(dropIdx, 0, moved);
      return items;
    });
    dragIdxRef.current = -1;
  };

  const setAsCover = (key) => {
    setCoverKey(key);
  };

  const handleExifFill = async () => {
    if (!exifCoords || !reverseGeocode) return;
    const { lng, lat } = exifCoords;
    setDraft((d) => ({ ...d, lng, lat, address_text: '' }));
    onMapSetPoint(lng, lat);
    try {
      const addr = await reverseGeocode(lng, lat);
      setDraft((d) => ({ ...d, lng, lat, address_text: addr }));
    } catch (_) {}
    setExifCoords(null);
  };

  const handleLocateMe = () => {
    if (!('geolocation' in navigator)) { notify('浏览器不支持定位功能'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords;
        setDraft((d) => ({ ...d, lng, lat, address_text: '' }));
        onMapSetPoint(lng, lat);
        try {
          const addr = await reverseGeocode(lng, lat);
          setDraft((d) => ({ ...d, lng, lat, address_text: addr }));
        } catch (_) {}
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) notify('定位权限被拒绝，请在浏览器设置中开启');
        else if (err.code === err.TIMEOUT) notify('定位超时，请重试');
        else notify('定位失败，请重试');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  };

  const toggleTag = (tagId) => {
    setDraft((d) => ({
      ...d,
      tag_ids: d.tag_ids.includes(tagId) ? d.tag_ids.filter((id) => id !== tagId) : [...d.tag_ids, tagId]
    }));
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return notify('请输入标签名');
    if (name.length > 10) return notify('标签名最多10个字符');
    try {
      const tag = await api.createTag({ name, color: newTagColor });
      await refreshTags();
      setDraft((d) => ({ ...d, tag_ids: [...d.tag_ids, tag.id] }));
      setNewTagName('');
    } catch (err) { notify(err.message); }
  };

  const handleRestoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDraft((d) => ({
          ...d,
          dish_name: parsed.dish_name || '',
          restaurant_name: parsed.restaurant_name || '',
          address_text: parsed.address_text || '',
          meal_type: parsed.meal_type || '',
          price_per_person: parsed.price_per_person || '',
          rating: parsed.rating || null,
          notes: parsed.notes || '',
          tag_ids: parsed.tag_ids || [],
          meal_date: parsed.meal_date || '',
          lng: parsed.longitude != null ? parsed.longitude : null,
          lat: parsed.latitude != null ? parsed.latitude : null
        }));
        if (parsed.longitude != null && parsed.latitude != null && onMapSetPoint) {
          onMapSetPoint(parsed.longitude, parsed.latitude);
        }
      }
    } catch (_) {}
    setDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    setDraftPrompt(false);
  };

  const handleSave = async () => {
    if (!draft.dish_name.trim() || !draft.restaurant_name.trim()) return notify('菜名与店名为必填项');
    if (draft.lng == null || draft.lat == null) return notify('请先在地图上选点');

    const form = new FormData();
    form.append('dish_name', draft.dish_name.trim());
    form.append('restaurant_name', draft.restaurant_name.trim());
    form.append('address_text', draft.address_text || '');
    form.append('longitude', String(draft.lng));
    form.append('latitude', String(draft.lat));
    form.append('meal_type', draft.meal_type || '');
    form.append('price_per_person', draft.price_per_person || '');
    if (draft.rating) form.append('rating', String(draft.rating));
    form.append('notes', draft.notes || '');
    form.append('is_favorite', draft.is_favorite ? '1' : '0');
    form.append('meal_date', draft.meal_date || '');
    form.append('tag_ids', draft.tag_ids.join(','));
    form.append('deleted_image_ids', Array.from(deletedImgIds).join(','));
    allImages.filter((it) => it.kind === 'new').forEach((it) => form.append('images', it.file));

    setSaving(true);
    try {
      const result = draft.id
        ? await api.updateEntry(draft.id, form)
        : await api.createEntry(form);

      const respImgs = result.images || [];
      const existingIds = new Set(allImages.filter((it) => it.kind === 'existing').map((it) => it.img.id));
      const newRespImgs = respImgs.filter((img) => !existingIds.has(img.id));
      let newIdx = 0;
      const desiredIds = [];
      for (const item of allImages) {
        if (item.kind === 'existing') { desiredIds.push(item.img.id); } else {
          const mapped = newRespImgs[newIdx++];
          if (mapped) desiredIds.push(mapped.id);
        }
      }

      let actualCoverId = null;
      if (coverKey?.startsWith('img-')) {
        actualCoverId = Number(coverKey.replace('img-', ''));
      } else if (coverKey) {
        const ci = allImages.findIndex((it) => it.key === coverKey);
        if (ci >= 0 && ci < desiredIds.length) actualCoverId = desiredIds[ci];
      }

      if (desiredIds.length > 1 || actualCoverId != null) {
        await api.reorderImages(result.id, desiredIds, actualCoverId);
      }

      await refresh();
      if (result?.id) {
        dispatch({ type: 'SET_HIGHLIGHT', payload: result.id });
      } else if (result?.id !== undefined) {
        dispatch({ type: 'SET_HIGHLIGHT', payload: result.id });
      }
      notify(draft.id ? '已更新记录' : '已保存新记录');
      savedRef.current = true;
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
      setDraftPrompt(false);
      onClose();
    } catch (err) {
      notify(err.message);
    } finally {
      setSaving(false);
    }
  };

  return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'modal', role: 'dialog' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, draft.id ? '编辑记录' : '新增记录'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 18 }))
      ),
      React.createElement('div', { className: 'modal-body' },

        draftPrompt && React.createElement('div', { className: 'draft-prompt' },
          React.createElement('span', null, '有未完成的草稿'),
          React.createElement('div', { className: 'draft-prompt-actions' },
            React.createElement('button', { className: 'draft-btn restore', type: 'button', onClick: handleRestoreDraft }, '恢复'),
            React.createElement('button', { className: 'draft-btn discard', type: 'button', onClick: handleDiscardDraft }, '丢弃')
          )
        ),

        // Images
        React.createElement('div', { className: 'images-section' },
          React.createElement('label', { className: 'section-label' }, '图片（最多9张）'),
          React.createElement('div', { className: 'images-grid' },
            allImages.map((item, idx) =>
              React.createElement('div', {
                key: item.key,
                className: 'image-preview' + (coverKey === item.key ? ' is-cover' : ''),
                draggable: true,
                onDragStart: (e) => handleDragStart(e, idx),
                onDragEnd: handleDragEnd,
                onDragOver: handleDragOver,
                onDrop: (e) => handleDrop(e, idx)
              },
                React.createElement('img', { src: item.url, alt: '', draggable: false }),
                coverKey === item.key && React.createElement('span', { className: 'cover-badge' }, '封面'),
                React.createElement('div', { className: 'img-hover-actions' },
                  coverKey !== item.key && React.createElement('button', {
                    className: 'cover-set-btn',
                    type: 'button',
                    onClick: (e) => { e.stopPropagation(); setAsCover(item.key); },
                    title: '设为封面'
                  }, React.createElement(Star, { size: 12, fill: 'currentColor' }), ' 封面')
                ),
                React.createElement('button', {
                  className: 'img-remove',
                  onClick: (e) => { e.stopPropagation(); removeImage(item.key); }
                }, React.createElement(X, { size: 14 }))
              )
            ),
            allImages.length < 9 &&
              React.createElement('label', { className: 'image-add' },
                React.createElement(ImagePlus, { size: 24 }),
                React.createElement('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, onChange: handleImageAdd, style: { display: 'none' } })
              )
          )
        ),

        // Basic info
        React.createElement('label', null, '菜名 *',
          React.createElement('input', { value: draft.dish_name, placeholder: '例如：北京烤鸭', maxLength: 100,
            onChange: (e) => setDraft((d) => ({ ...d, dish_name: e.target.value })) })
        ),
        React.createElement('label', null, '店名 *',
          React.createElement('input', { value: draft.restaurant_name, placeholder: '例如：全聚德（王府井店）', maxLength: 100,
            onChange: (e) => setDraft((d) => ({ ...d, restaurant_name: e.target.value })) })
        ),

        // Meal date
        React.createElement('label', null, '用餐日期',
          React.createElement('input', { type: 'date', value: draft.meal_date,
            onChange: (e) => setDraft((d) => ({ ...d, meal_date: e.target.value })) })
        ),

        // Address search
        React.createElement('label', null, '地址',
          React.createElement('div', { className: 'search-wrap' },
            React.createElement('div', { className: 'search-input' },
              React.createElement(MapPin, { size: 16 }),
              React.createElement('input', { value: keyword, disabled: !hasKey,
                placeholder: hasKey ? '输入地址关键词搜索' : '需配置高德 Key',
                onChange: (e) => setKeyword(e.target.value) }),
              React.createElement('button', { className: 'locate-btn', disabled: !hasKey || !amapReady || locating,
                onClick: handleLocateMe, title: '定位我', type: 'button' },
                locating ? React.createElement(Loader, { size: 14, className: 'spin' }) : React.createElement(Navigation, { size: 14 })
              ),
              keyword ? React.createElement('button', { className: 'clear-btn', onClick: () => { setKeyword(''); setSuggestions([]); } },
                React.createElement(X, { size: 14 })
              ) : null
            ),
            suggestions.length > 0 && React.createElement('ul', { className: 'suggest' },
              suggestions.slice(0, 8).map((tip, i) =>
                React.createElement('li', { key: `${tip.id}-${i}`, onClick: () => onPickTip(tip) },
                  React.createElement('b', null, tip.name),
                  React.createElement('span', null, [tip.district, tip.address].filter(Boolean).join(' '))
                )
              )
            ),
            exifCoords && !draft.lng && reverseGeocode && React.createElement('div', { className: 'exif-hint' },
              '📷 照片含位置信息，',
              React.createElement('button', { className: 'exif-link', onClick: handleExifFill, type: 'button' },
                '填充位置'
              )
            )
          )
        ),

        React.createElement('div', { className: 'coord-box' },
          React.createElement('span', { className: 'coord-label' }, React.createElement(MapPin, { size: 14 }), ' 地图选点'),
          draft.lng != null ? React.createElement('span', { className: 'coord-value' },
            `${draft.lng.toFixed(6)}, ${draft.lat.toFixed(6)}`)
            : React.createElement('span', { className: 'coord-value muted' }, hasKey ? '未选点（搜索地址或点击地图）' : '需配置 Key')
        ),

        // Details row
        React.createElement('div', { className: 'form-row' },
          React.createElement('label', null, '用餐类型',
            React.createElement('select', { value: draft.meal_type,
              onChange: (e) => setDraft((d) => ({ ...d, meal_type: e.target.value })) },
              MEAL_TYPES.map((mt) => React.createElement('option', { key: mt.value, value: mt.value }, mt.label))
            )
          ),
          React.createElement('label', null, '人均（元）',
            React.createElement('input', { type: 'number', value: draft.price_per_person, placeholder: '0', min: 0, max: 9999,
              onChange: (e) => setDraft((d) => ({ ...d, price_per_person: e.target.value })) })
          )
        ),

        // Rating
        React.createElement('label', null, '评分',
          React.createElement('div', { className: 'stars' },
            [1, 2, 3, 4, 5].map((n) =>
              React.createElement('button', { key: n, type: 'button',
                className: draft.rating >= n ? 'star on' : 'star',
                onClick: () => setDraft((d) => ({ ...d, rating: d.rating === n ? null : n }))
              }, React.createElement(Star, { size: 22, fill: draft.rating >= n ? 'currentColor' : 'none' }))
            ),
            draft.rating ? React.createElement('span', { className: 'star-note' }, `${draft.rating} 星`) : React.createElement('span', { className: 'star-note muted' }, '未评分')
          )
        ),

        // Tags
        React.createElement('div', { className: 'form-label-wrap' },
          React.createElement('label', { className: 'section-label' }, '标签'),
          React.createElement('div', { className: 'tag-selected' },
            selectedTags.map((tag) =>
              React.createElement('span', { key: tag.id, className: 'tag-chip selected', style: { background: tag.color, color: '#fff' },
                onClick: () => toggleTag(tag.id) }, tag.name, ' ×')
            ),
            React.createElement('button', { className: 'tag-add-btn', onClick: () => setShowTagPicker(!showTagPicker) },
              React.createElement(Plus, { size: 14 }), ' 添加标签'
            )
          ),
          showTagPicker && React.createElement('div', { className: 'tag-picker' },
            (state.tags || []).filter((t) => !draft.tag_ids.includes(t.id)).map((tag) =>
              React.createElement('button', { key: tag.id, className: 'tag-option',
                style: { borderColor: tag.color + '60' },
                onClick: () => toggleTag(tag.id) },
                React.createElement('span', { className: 'tag-dot', style: { background: tag.color } }),
                tag.name
              )
            ),
            React.createElement('div', { className: 'tag-create' },
              React.createElement('div', { className: 'color-picker' },
                colors.map((c) => React.createElement('button', { key: c, className: `color-swatch${newTagColor === c ? ' selected' : ''}`,
                  style: { background: c }, onClick: () => setNewTagColor(c) }))
              ),
              React.createElement('input', { value: newTagName, placeholder: '新标签名（≤10字）', maxLength: 10,
                onChange: (e) => setNewTagName(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') createTag(); } }),
              React.createElement('button', { className: 'primary-btn small', onClick: createTag }, '创建')
            )
          )
        ),

        // Favorite & notes
        React.createElement('label', { className: 'checkbox-label' },
          React.createElement('input', { type: 'checkbox', checked: draft.is_favorite,
            onChange: (e) => setDraft((d) => ({ ...d, is_favorite: e.target.checked })) }),
          React.createElement(Star, { size: 16, fill: draft.is_favorite ? '#FF5A2B' : 'none', color: draft.is_favorite ? '#FF5A2B' : '#999' }),
          ' 收藏'
        ),

        React.createElement('label', null, '备注',
          React.createElement('textarea', { value: draft.notes, rows: 3, placeholder: '口味、环境、是否值得再去……', maxLength: 2000,
            onChange: (e) => setDraft((d) => ({ ...d, notes: e.target.value })) })
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement('button', { className: 'primary', onClick: handleSave, disabled: saving },
          saving ? '保存中...' : '保存'
        )
      )
    )
  );
}
