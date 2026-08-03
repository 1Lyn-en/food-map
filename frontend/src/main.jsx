import React, { useEffect, useRef, useState, useCallback } from 'react';
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

function markerHtml(highlight) {
  return `<div class="food-marker${highlight ? ' highlight' : ''}"><span class="badge">🍜</span></div>`;
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
  const [showStats, setShowStats] = useState(false);
  const [showData, setShowData] = useState(false);
  const [pickerActive, setPickerActive] = useState(false);

  const initTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return localStorage.getItem('mapStyle') === 'dark' ? 'dark' : 'light';
  };
  const [theme, setTheme] = useState(initTheme);

  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const clusterRef = useRef(null);
  const infoRef = useRef(null);
  const tempRef = useRef(null);
  const autoRef = useRef(null);
  const placeRef = useRef(null);
  const geocoderRef = useRef(null);
  const entriesRef = useRef([]);
  const highlightRef = useRef(null);
  const saveFormRef = useRef(null);

  useEffect(() => { entriesRef.current = state.entries; }, [state.entries]);
  useEffect(() => { highlightRef.current = state.highlightId; }, [state.highlightId]);

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
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !amapReady) return;
    markersRef.current.clear();
    const markers = [];
    entriesRef.current.forEach((entry) => {
      const marker = new window.AMap.Marker({
        position: [entry.longitude, entry.latitude],
        content: markerHtml(highlightRef.current === entry.id),
        offset: new window.AMap.Pixel(-22, -44),
        title: entry.dish_name
      });
      marker.on('click', () => openInfo(entry, marker));
      marker.setMap(map);
      markersRef.current.set(entry.id, marker);
      markers.push(marker);
    });
    if (clusterRef.current) {
      clusterRef.current.setMarkers(markers);
    }
  }, [amapReady]);

  useEffect(() => { renderMarkers(); }, [state.entries, amapReady]);

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
        if (!pickerActive || !state.draft) return;
        const lng = e.lnglat.getLng();
        const lat = e.lnglat.getLat();
        setPoint(lng, lat, '');
        reverseGeocode(lng, lat).then((addr) => {
          dispatch({ type: 'SET_DRAFT', payload: { ...state.draft, lng, lat, address_text: addr } });
        }).catch(() => {});
      });
      AMap.plugin(['AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.MarkerCluster', 'AMap.Geocoder'], () => {
        autoRef.current = new AMap.AutoComplete({ city: '' });
        placeRef.current = new AMap.PlaceSearch({ pageSize: 1, city: '' });
        geocoderRef.current = new AMap.Geocoder({ city: '' });
        clusterRef.current = new AMap.MarkerCluster(map, [], {
          gridSize: 60,
          maxZoom: 14,
          averageCenter: true
        });
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
    const value = keyword.trim();
    if (!value) { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      autoRef.current.search(value, (status, result) => {
        if (status === 'complete' && Array.isArray(result?.tips)) {
          setSuggestions(result.tips);
        } else { setSuggestions([]); }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, state.draft, amapReady]);

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
        dispatch({ type: 'SET_DRAFT', payload: { ...state.draft, lng: pos.getLng(), lat: pos.getLat() } });
      });
      tempRef.current.setMap(map);
    } else { tempRef.current.setPosition([lng, lat]); }
    map.setCenter([lng, lat]);
    map.setZoom(15);
  };

  const setPoint = (lng, lat, addressText) => {
    dispatch({ type: 'SET_DRAFT', payload: { ...state.draft, lng, lat, address_text: addressText || state.draft?.address_text } });
    updateMapMarker(lng, lat);
  };

  const reverseGeocode = (lng, lat) => {
    return new Promise((resolve, reject) => {
      if (!geocoderRef.current) return reject(new Error('Geocoder not ready'));
      geocoderRef.current.getAddress([lng, lat], (status, result) => {
        if (status === 'complete' && result.regeocode) {
          resolve(result.regeocode.formattedAddress || '');
        } else {
          reject(new Error('逆地理编码失败'));
        }
      });
    });
  };

  const selectTip = (tip) => {
    const addressText = [tip.name, tip.district, tip.address].filter(Boolean).join('，');
    setKeyword(tip.name);
    setSuggestions([]);
    if (tip.location && tip.location.lng !== undefined) {
      setPoint(tip.location.lng, tip.location.lat, addressText);
    } else if (tip.id && placeRef.current) {
      placeRef.current.getDetails(tip.id, (status, result) => {
        const poi = result?.poiList?.pois?.[0];
        if (poi?.location) setPoint(poi.location.lng, poi.location.lat, addressText);
      });
    }
  };

  const openInfo = (entry, marker) => {
    const map = mapRef.current;
    if (!map) return;
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

    const el = document.createElement('div');
    el.className = 'info-card';
    el.innerHTML = `
      <div class="info-media">${coverImg ? `<img src="${coverImg}" alt=""/>` : '<div class="info-noimg"><span>🍜</span></div>'}</div>
      <div class="info-body">
        <div class="info-title-row"><h3>${hl(esc(entry.dish_name))}</h3>${entry.is_favorite ? '<span class="fav-icon">⭐</span>' : ''}</div>
        <p class="info-rest">${hl(esc(entry.restaurant_name))}</p>
        ${entry.address_text ? `<p class="info-addr">📍 ${hl(esc(entry.address_text))}</p>` : ''}
        ${stars ? `<div class="info-stars">${stars}</div>` : ''}
        ${entry.price_per_person ? `<span class="info-price">💰 ¥${entry.price_per_person}/人</span>` : ''}
        ${tagChips ? `<div class="info-tags">${tagChips}</div>` : ''}
        ${entry.notes ? `<p class="info-notes">${esc(entry.notes)}</p>` : ''}
        <p class="info-time">${formatTime(entry.created_at)}</p>
        <div class="info-actions">
          <button data-act="edit" class="info-btn edit">编辑</button>
          <button data-act="del" class="info-btn del">删除</button>
        </div>
      </div>
      <div class="info-arrow"></div>`;
    const info = new window.AMap.InfoWindow({ content: el, offset: new window.AMap.Pixel(0, -30) });
    el.querySelector('[data-act="edit"]').addEventListener('click', () => { info.close(); openForm(entry); });
    el.querySelector('[data-act="del"]').addEventListener('click', () => { info.close(); handleDelete(entry); });
    if (infoRef.current) infoRef.current.close();
    infoRef.current = info;
    info.open(map, marker.getPosition());
  };

  const focusEntry = (id) => {
    const row = entriesRef.current.find((r) => r.id === id);
    const map = mapRef.current;
    const marker = markersRef.current.get(id);
    if (!row || !map) return;
    map.setCenter([row.longitude, row.latitude]);
    map.setZoom(15);
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
    setPickerActive(true);
    if (entry) {
      setKeyword(entry.address_text ? entry.address_text.split('，')[0] : '');
      dispatch({ type: 'SET_DRAFT', payload: { ...entry } });
      setPoint(entry.longitude, entry.latitude, entry.address_text);
    } else {
      setKeyword('');
      dispatch({ type: 'SET_DRAFT', payload: { id: null } });
    }
  };

  const closeForm = () => {
    setPickerActive(false);
    if (tempRef.current) { tempRef.current.setMap(null); tempRef.current = null; }
    dispatch({ type: 'SET_DRAFT', payload: null });
    setSuggestions([]);
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
        if (state.draft) closeForm();
        else if (showStats) setShowStats(false);
        else if (showData) setShowData(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.draft, showStats, showData]);

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

    state.hasKey && amapLoading && !amapReady && React.createElement('div', { className: 'map-overlay' },
      React.createElement(Loader, { size: 32, className: 'spin' }),
      React.createElement('span', null, '地图加载中...')
    ),

    state.hasKey && amapTimeout && !amapReady && React.createElement('div', { className: 'banner' },
      React.createElement(MapPin, { size: 16 }),
      React.createElement('span', null, '地图初始化超时，请检查高德 Key 配置')
    ),

    (!state.hasKey || mapError) && React.createElement('div', { className: 'banner' },
      React.createElement(MapPin, { size: 16 }),
      React.createElement('span', null,
        !state.hasKey
          ? '未配置高德地图 Key，请在 frontend/.env 中设置 VITE_AMAP_KEY'
          : `地图加载失败：${mapError}`)
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
      onPickTip: selectTip,
      reverseGeocode,
      onMapSetPoint: updateMapMarker,
      saveFormRef
    }),

    showStats && React.createElement(StatsPanel, { onClose: () => setShowStats(false) }),
    showData && React.createElement(DataPanel, { onClose: () => setShowData(false) }),

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
