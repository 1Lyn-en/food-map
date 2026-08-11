import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Loader, MapPin } from 'lucide-react';
import './styles.css';
import { StoreProvider, useStore } from './stores';
import { api } from './api';
import Sidebar from './components/Sidebar';
import EntryForm from './components/EntryForm';
import Toolbar from './components/Toolbar';
import StatsPanel from './components/StatsPanel';
import DataPanel from './components/DataPanel';
import Toast from './components/Toast';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || '';
const AMAP_SECURITY = import.meta.env.VITE_AMAP_SECURITY_CODE || '';

const DEFAULT_CENTER = [116.397428, 39.90923];
const EMPTY_ARRAY = [];
const GEOCODE_CACHE_LIMIT = 300;
const geocodeCache = new Map();

function loadAmap() {
  return new Promise((resolve, reject) => {
    if (window.AMap) return resolve(window.AMap);
    window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY || '' };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}${AMAP_SECURITY ? '&jscode=' + encodeURIComponent(AMAP_SECURITY) : ''}`;
    script.async = true;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => reject(new Error('高德地图脚本加载失败'));
    document.head.appendChild(script);
  });
}

function markerHtml({ entry, user, highlight }) {
  const isOwn = !user || !entry.user_id || entry.user_id === user.id;
  const cls = `food-marker${highlight ? ' highlight' : ''}`;
  if (isOwn) {
    return `<div class="${cls}"><span class="badge">🍴</span></div>`;
  }
  const color = entry.user_color || '#999';
  const initial = (entry.user_nickname || '?').slice(0, 1);
  return `<div class="${cls}"><span class="badge user-marker" style="background:${color};border-color:${color};color:#fff;"><span>${initial}</span></span></div>`;
}

const pickMarkerHtml = '<div class="pick-marker"><div class="dot"></div></div>';

function App() {
  const { state, dispatch, refresh, refreshTags, notify } = useStore();
  const [amapReady, setAmapReady] = useState(false);
  const [amapLoading, setAmapLoading] = useState(false);
  const [amapTimeout, setAmapTimeout] = useState(false);
  const [mapError, setMapError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [addrFocus, setAddrFocus] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showData, setShowData] = useState(false);
  const [pickerActive, setPickerActive] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showFocusHint, setShowFocusHint] = useState(false);

  const initTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return localStorage.getItem('mapStyle') === 'dark' ? 'dark' : 'light';
  };
  const [theme, setTheme] = useState(initTheme);

  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const infoRef = useRef(null);
  const tempRef = useRef(null);
  const autoRef = useRef(null);
  const placeRef = useRef(null);
  const geocoderRef = useRef(null);
  const entriesRef = useRef([]);
  const highlightRef = useRef(null);
  const saveFormRef = useRef(null);
  const openInfoRef = useRef(null);
  const draftRef = useRef(null);
  const pickerActiveRef = useRef(false);
  const pickSeqRef = useRef(0);
  const pickTimerRef = useRef(null);
  const lastPickedKeywordRef = useRef('');
  const focusStateRef = useRef({ id: null });
  const hintTimerRef = useRef(null);
  const hintHideTimerRef = useRef(null);

  useEffect(() => { entriesRef.current = state.entries; }, [state.entries]);
  useEffect(() => { highlightRef.current = state.highlightId; }, [state.highlightId]);
  useEffect(() => { draftRef.current = state.draft; }, [state.draft]);
  useEffect(() => { pickerActiveRef.current = pickerActive; }, [pickerActive]);

  // Init data
  useEffect(() => {
    Promise.all([refresh(), refreshTags()]).catch((err) => notify(err.message, null, 2600, 'error'));
  }, []);

  // Clear highlight
  useEffect(() => {
    if (!state.highlightId) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_HIGHLIGHT', payload: null });
    }, 2800);
    return () => clearTimeout(timer);
  }, [state.highlightId]);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !amapReady) return;
    markersRef.current.forEach((m) => { if (m.setMap) m.setMap(null); });
    markersRef.current.clear();
    entriesRef.current.forEach((entry) => {
      const marker = new window.AMap.Marker({
        position: [entry.longitude, entry.latitude],
        content: markerHtml({ entry, user: state.user, highlight: highlightRef.current === entry.id }),
        offset: new window.AMap.Pixel(-22, -44),
        title: entry.dish_name
      });
      marker.on('click', () => {
        if (!openInfoRef.current) return;
        try { openInfoRef.current(entry, marker); } catch (e) { console.error('[marker click]', e); }
      });
      marker.setMap(map);
      markersRef.current.set(entry.id, marker);
    });
    console.log('[renderMarkers]', entriesRef.current.length, 'markers placed');
  }, [state.entries, state.user, amapReady]);

  // Init map
  useEffect(() => {
    if (!state.hasKey) { setMapError('未配置高德地图 Key'); return; }
    let cancelled = false;
    setAmapLoading(true);
    const timeoutId = setTimeout(() => { if (!amapReady && !cancelled) setAmapTimeout(true); }, 8000);

    loadAmap().then((AMap) => {
      if (cancelled) return;
      const map = new AMap.Map('map', { center: DEFAULT_CENTER, zoom: 11, viewMode: '2D' });
      map.on('complete', () => setAmapLoading(false));
      map.on('click', (e) => {
        if (!pickerActiveRef.current || !draftRef.current) return;
        setPickedPoint(e.lnglat.getLng(), e.lnglat.getLat());
      });
      AMap.plugin(['AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geocoder'], () => {
        autoRef.current = new AMap.AutoComplete({ city: '' });
        placeRef.current = new AMap.PlaceSearch({ pageSize: 1, city: '' });
        geocoderRef.current = new AMap.Geocoder({ city: '' });
        setAmapReady(true);
        setAmapLoading(false);
        setAmapTimeout(false);
        if (theme === 'dark') { map.setMapStyle('amap://styles/dark'); }
      });
      mapRef.current = map;
    }).catch((error) => {
      setMapError(error.message);
      setAmapLoading(false);
    });

    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, []);

  // Address search
  useEffect(() => {
    if (!state.draft || !amapReady || !autoRef.current) return;
    if (!addrFocus) { setSuggestions(EMPTY_ARRAY); return; }
    const value = keyword.trim();
    if (!value) { setSuggestions(EMPTY_ARRAY); return; }
    if (keyword === lastPickedKeywordRef.current && lastPickedKeywordRef.current) {
      setSuggestions(EMPTY_ARRAY);
      return;
    }
    const timer = setTimeout(() => {
      autoRef.current.search(value, (status, result) => {
        if (status === 'complete' && Array.isArray(result?.tips)) {
          setSuggestions(result.tips);
        } else { setSuggestions(EMPTY_ARRAY); }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, amapReady, addrFocus]);

  const updateMapMarker = (lng, lat) => {
    const map = mapRef.current;
    if (!map) return;
    if (!tempRef.current) {
      tempRef.current = new window.AMap.Marker({
        position: [lng, lat], content: pickMarkerHtml,
        offset: new window.AMap.Pixel(-14, -30), draggable: true
      });
      tempRef.current.on('dragend', (e) => {
        const pos = e.target.getPosition();
        const dlng = pos.getLng();
        const dlat = pos.getLat();
        if (pickTimerRef.current) clearTimeout(pickTimerRef.current);
        pickTimerRef.current = setTimeout(() => setPickedPoint(dlng, dlat), 150);
      });
      tempRef.current.setMap(map);
      map.setCenter([lng, lat]);
    } else { tempRef.current.setPosition([lng, lat]); }
  };

  const reverseGeocode = (lng, lat) => {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (geocodeCache.has(key)) return geocodeCache.get(key);
    const p = new Promise((resolve, reject) => {
      if (!geocoderRef.current) return reject(new Error('Geocoder not ready'));
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('逆地理编码超时'));
      }, 4000);
      geocoderRef.current.getAddress([lng, lat], (status, result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (status === 'complete' && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '');
        } else {
          reject(new Error('逆地理编码失败'));
        }
      });
    });
    if (geocodeCache.size >= GEOCODE_CACHE_LIMIT) geocodeCache.delete(geocodeCache.keys().next().value);
    geocodeCache.set(key, p);
    p.catch(() => geocodeCache.delete(key));
    return p;
  };

  const setPickedPoint = (lng, lat, { addressText } = {}) => {
    const seq = ++pickSeqRef.current;
    dispatch({
      type: 'SET_DRAFT',
      payload: { ...draftRef.current, lng, lat, ...(addressText != null ? { address_text: addressText } : {}) }
    });
    updateMapMarker(lng, lat);
    if (addressText != null) return;
    setGeocoding(true);
    reverseGeocode(lng, lat).then((addr) => {
      if (seq !== pickSeqRef.current) return;
      setGeocoding(false);
      setKeyword(addr);
      lastPickedKeywordRef.current = addr;
      dispatch({ type: 'SET_DRAFT', payload: { ...draftRef.current, lng, lat, address_text: addr } });
    }).catch(() => {
      if (seq !== pickSeqRef.current) return;
      setGeocoding(false);
      notify('地址解析失败，请手动填写地址', null, 2600, 'error');
    });
  };

  const selectTip = (tip) => {
    const addressText = [tip.name, tip.district, tip.address].filter(Boolean).join('，');
    setKeyword(tip.name);
    lastPickedKeywordRef.current = tip.name;
    setSuggestions(EMPTY_ARRAY);
    if (tip.location && tip.location.lng !== undefined) {
      setPickedPoint(tip.location.lng, tip.location.lat, { addressText });
    } else if (tip.id && placeRef.current) {
      placeRef.current.getDetails(tip.id, (status, result) => {
        const poi = result?.poiList?.pois?.[0];
        if (poi?.location) setPickedPoint(poi.location.lng, poi.location.lat, { addressText });
      });
    }
  };

  const openInfo = (entry, marker) => {
    const map = mapRef.current;
    if (!map) return;
    const pos = marker.getPosition ? marker.getPosition() : null;
    if (!pos) return;
    const stars = entry.rating ? '★'.repeat(entry.rating) + '☆'.repeat(5 - entry.rating) : '';
    const coverImg = entry.cover_image || (entry.images?.[0]?.image_path) || '';
    const tagChips = (entry.tags || []).map((t) =>
      `<span class="info-tag" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${t.name}</span>`
    ).join('');
    const kw = (state.keyword || '').trim();
    const hl = (text) => {
      const t = String(text ?? '');
      if (!t || !kw) return t;
      const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return t.replace(re, '<span class="search-hl">$1</span>');
    };

    const isOwn = !state.user || !entry.user_id || entry.user_id === state.user.id;
    const sharedBy = !isOwn && entry.user_nickname
      ? `<div class="info-shared-by"><span class="owner-dot" style="background:${entry.user_color || '#999'}"></span>由 ${entry.user_nickname} 分享</div>`
      : '';
    const actionsHtml = isOwn
      ? `<div class="info-actions">
          <button data-act="edit" class="info-btn edit">编辑</button>
          <button data-act="del" class="info-btn del">删除</button>
        </div>`
      : `<div class="info-actions"><div class="info-readonly">只读 · 他人分享的记录</div></div>`;

    const el = document.createElement('div');
    el.className = 'info-card';
    el.innerHTML = `
      <div class="info-media">${coverImg ? `<img src="${coverImg}" alt=""/>` : '<div class="info-noimg"><span>🍜</span></div>'}</div>
      <div class="info-body">
        ${sharedBy}
        <div class="info-title-row"><h3>${hl(esc(entry.dish_name))}</h3>${entry.is_favorite ? '<span class="fav-icon">⭐</span>' : ''}</div>
        <p class="info-rest">${hl(esc(entry.restaurant_name))}</p>
        ${entry.address_text ? `<p class="info-addr">📍 ${hl(esc(entry.address_text))}</p>` : ''}
        ${stars ? `<div class="info-stars">${stars}</div>` : ''}
        ${entry.price_per_person ? `<span class="info-price">💰 ¥${entry.price_per_person}/人</span>` : ''}
        ${tagChips ? `<div class="info-tags">${tagChips}</div>` : ''}
        ${entry.notes ? `<p class="info-notes">${esc(entry.notes)}</p>` : ''}
        <p class="info-time">${formatTime(entry.created_at)}</p>
        ${actionsHtml}
      </div>
      <div class="info-arrow"></div>`;
    const info = new window.AMap.InfoWindow({ content: el, offset: new window.AMap.Pixel(0, -30), autoMove: false });
    if (isOwn) {
      el.querySelector('[data-act="edit"]').addEventListener('click', () => { info.close(); openForm(entry); });
      el.querySelector('[data-act="del"]').addEventListener('click', () => { info.close(); handleDelete(entry); });
    }
    if (infoRef.current) infoRef.current.close();
    infoRef.current = info;
    info.open(map, pos);
  };
  useEffect(() => { openInfoRef.current = openInfo; });

  const focusEntry = (id) => {
    const row = entriesRef.current.find((r) => r.id === id);
    const map = mapRef.current;
    const marker = markersRef.current.get(id);
    if (!row || !map) return;
    const lng = row.longitude;
    const lat = row.latitude;
    const isSecond = focusStateRef.current.id === id;
    if (isSecond) {
      clearTimeout(hintTimerRef.current);
      clearTimeout(hintHideTimerRef.current);
      setShowFocusHint(false);
    }
    map.setZoomAndCenter(isSecond ? 15 : 11, [lng, lat]);
    // 44px pin 的视觉中心比坐标点高约 22px：把坐标点放到屏幕中心下方 22px，令图标主体居中
    const px = map.lngLatToContainer([lng, lat]);
    const target = map.containerToLngLat(new window.AMap.Pixel(px.x, px.y - 22));
    map.setCenter(target);
    focusStateRef.current.id = id;
    if (!isSecond) {
      clearTimeout(hintTimerRef.current);
      clearTimeout(hintHideTimerRef.current);
      hintTimerRef.current = setTimeout(() => {
        setShowFocusHint(true);
        hintHideTimerRef.current = setTimeout(() => setShowFocusHint(false), 5000);
      }, 1000);
    }
    if (marker) openInfo(row, marker);
  };

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  // Apply theme to <html>, persist it, and keep the map in sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    localStorage.setItem('mapStyle', theme === 'dark' ? 'dark' : 'normal');
    const map = mapRef.current;
    if (map && typeof map.setMapStyle === 'function') {
      map.setMapStyle(theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal');
    }
  }, [theme]);

  const openForm = (entry) => {
    if (infoRef.current) infoRef.current.close();
    lastPickedKeywordRef.current = '';
    setPickerActive(true);
    if (entry) {
      setKeyword(entry.address_text ? entry.address_text.split('，')[0] : '');
      dispatch({ type: 'SET_DRAFT', payload: { ...entry, lng: entry.longitude, lat: entry.latitude } });
      updateMapMarker(entry.longitude, entry.latitude);
    } else {
      setKeyword('');
      dispatch({ type: 'SET_DRAFT', payload: { id: null } });
    }
  };

  const closeForm = () => {
    setPickerActive(false);
    setPickMode(false);
    setGeocoding(false);
    pickSeqRef.current++;
    if (pickTimerRef.current) { clearTimeout(pickTimerRef.current); pickTimerRef.current = null; }
    lastPickedKeywordRef.current = '';
    if (tempRef.current) { tempRef.current.setMap(null); tempRef.current = null; }
    dispatch({ type: 'SET_DRAFT', payload: null });
    setSuggestions(EMPTY_ARRAY);
    setAddrFocus(false);
  };

  const startPick = () => {
    setPickMode(true);
    const map = mapRef.current;
    const d = state.draft;
    if (map && d && d.lng != null && d.lat != null) {
      map.setCenter([d.lng, d.lat]);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isCtrl && key === 'n') {
        if (isTyping) return;
        e.preventDefault();
        if (!state.draft) openForm(null);
      } else if (isCtrl && key === 's') {
        if (isTyping) return;
        e.preventDefault();
        if (state.draft && saveFormRef.current) saveFormRef.current();
      } else if (e.key === 'Escape') {
        if (pickMode) setPickMode(false);
        else if (state.draft) closeForm();
        else if (showStats) setShowStats(false);
        else if (showData) setShowData(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.draft, showStats, showData, pickMode]);

  const handleDelete = async (entry) => {
    if (!window.confirm(`确认删除「${entry.dish_name}」吗？`)) return;
    try {
      await api.deleteEntry(entry.id);
      if (infoRef.current) infoRef.current.close();
      await refresh();
      const timer = notify('已删除 1 条记录', {
        label: '撤销',
        onClick: async () => {
          clearTimeout(timer);
          dispatch({ type: 'SET_TOAST', payload: null });
          try {
            await api.restoreEntry(entry.id);
            notify('已恢复记录', null, 2600, 'success');
            await refresh();
          } catch (err) { notify(err.message, null, 2600, 'error'); }
        }
      }, 5000, 'success');
    } catch (err) { notify(err.message, null, 2600, 'error'); }
  };

  return React.createElement('div', { className: 'app' },
    React.createElement('div', { id: 'map', className: 'map' }),
    React.createElement('div', { className: 'map-atmosphere' }),
    React.createElement('div', { className: 'map-vignette' }),

    state.hasKey && amapLoading && !amapReady && React.createElement('div', { className: 'map-overlay' },
      React.createElement(Loader, { size: 32, className: 'spin' }),
      React.createElement('span', null, '地图加载中...')
    ),

    state.hasKey && amapTimeout && !amapReady && React.createElement('div', { className: 'banner' },
      React.createElement(MapPin, { size: 16 }),
      React.createElement('span', null, '地图初始化超时：请确认高德控制台该 Key 的「域名白名单」已加入当前域名，且安全密钥校验已正确配置')
    ),

    (!state.hasKey || mapError) && React.createElement('div', { className: 'banner' },
      React.createElement(MapPin, { size: 16 }),
      React.createElement('span', null,
        !state.hasKey
          ? '未配置高德地图 Key，请在 frontend/.env 中设置 VITE_AMAP_KEY'
          : `${mapError}。若域名/IP 未在高德控制台「域名白名单」或安全密钥校验不匹配，地图也会加载失败，请核对后重新 build`)
    ),

    React.createElement(Toolbar, {
      onToggleStats: () => setShowStats(!showStats),
      onToggleData: () => setShowData(!showData),
      theme,
      onToggleTheme: toggleTheme
    }),

    React.createElement(Sidebar, {
      entries: state.entries,
      onNewEntry: () => openForm(null),
      onEditEntry: (entry) => openForm(entry),
      onFocusEntry: focusEntry
    }),

    state.draft &&     React.createElement(EntryForm, {
      onClose: closeForm,
      amapReady,
      hasKey: state.hasKey,
      keyword, setKeyword,
      suggestions, setSuggestions,
      addrFocus, setAddrFocus,
      pickMode,
      onStartPick: startPick,
      onPickTip: selectTip,
      onPickPoint: setPickedPoint,
      geocoding,
      onMapSetPoint: updateMapMarker,
      saveFormRef
    }),

    pickMode && React.createElement('div', { className: 'pick-guide' },
      React.createElement('div', { className: 'pick-guide-card' },
        React.createElement('span', { className: 'pick-guide-tip' }, '点击地图选择店铺位置，可拖动蓝点微调'),
        React.createElement('div', { className: 'pick-guide-actions' },
          React.createElement('button', { className: 'primary-btn', onClick: () => setPickMode(false) }, '确认选点'),
          React.createElement('button', { className: 'ghost-btn', onClick: () => setPickMode(false) }, '取消')
        )
      )
    ),

    showFocusHint && React.createElement('div', { className: 'focus-hint' },
      React.createElement('span', null, '再次点击可放大地图图标')
    ),

    showStats && React.createElement(StatsPanel, { onClose: () => setShowStats(false) }),    showData && React.createElement(DataPanel, { onClose: () => setShowData(false) }),

    React.createElement(Toast, { message: state.toast?.message, action: state.toast?.action, variant: state.toast?.variant })
  );
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(String(value).endsWith('Z') ? value : `${value}Z`);
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function AppShell() {
  return React.createElement(StoreProvider, null, React.createElement(App));
}

createRoot(document.getElementById('root')).render(React.createElement(AppShell));
