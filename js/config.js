/* Fundaserinco · Seguimiento — configuración, catálogos y utilidades */
window.FS = window.FS || {};

(function (FS) {
  'use strict';

  FS.APP_VERSION = '0.1.0';

  FS.STORAGE = {
    data: 'fs.seguimiento.data.v1',
    settings: 'fs.seguimiento.settings.v1',
    theme: 'fs.seguimiento.theme'
  };

  FS.STATUSES = [
    { id: 'backlog', label: 'Backlog', color: '--faint', hint: 'Ideas y trabajo sin iniciar' },
    { id: 'todo', label: 'Por hacer', color: '--brand-cyan', hint: 'Listo para tomar' },
    { id: 'in_progress', label: 'En progreso', color: '--brand-blue', hint: 'Trabajo activo' },
    { id: 'review', label: 'En revisión', color: '--brand-coral', hint: 'Validación o revisión' },
    { id: 'done', label: 'Hecho', color: '--success', hint: 'Completado' }
  ];

  FS.PRIORITIES = [
    { id: 'urgent', label: 'Urgente', weight: 0 },
    { id: 'high', label: 'Alta', weight: 1 },
    { id: 'medium', label: 'Media', weight: 2 },
    { id: 'low', label: 'Baja', weight: 3 }
  ];

  FS.CATEGORIES = [
    { id: 'sync', label: 'Sync / Daily', icon: 'groups', className: 'sync' },
    { id: 'review', label: 'Revisión', icon: 'rate_review', className: 'review' },
    { id: 'planning', label: 'Planificación', icon: 'event_note', className: 'planning' },
    { id: 'demo', label: 'Demo', icon: 'presentation', className: 'demo' },
    { id: 'other', label: 'Otro', icon: 'event', className: 'other' }
  ];

  FS.MILESTONE_STATUSES = [
    { id: 'planned', label: 'Planeado', color: '--faint' },
    { id: 'in_progress', label: 'En curso', color: '--brand-blue' },
    { id: 'done', label: 'Completado', color: '--success' }
  ];

  FS.DEFAULTS = {
    apiUrl: '',
    token: '',
    calendarId: 'primary',
    timezone: 'America/Bogota',
    meetByDefault: true
  };

  FS.TIMEZONES = [
    'America/Bogota',
    'America/Mexico_City',
    'America/Lima',
    'America/Santiago',
    'America/Argentina/Buenos_Aires',
    'America/Panama',
    'America/Caracas',
    'America/Guayaquil',
    'America/Santo_Domingo',
    'America/Puerto_Rico',
    'Europe/Madrid',
    'UTC'
  ];

  FS.getSettings = function () {
    var saved = FS.utils.loadJSON(FS.STORAGE.settings, {});
    return Object.assign({}, FS.DEFAULTS, saved || {});
  };

  FS.saveSettings = function (patch) {
    var next = Object.assign(FS.getSettings(), patch || {});
    FS.utils.saveJSON(FS.STORAGE.settings, next);
    return next;
  };

  FS.isConfigured = function () {
    var s = FS.getSettings();
    return Boolean(s.apiUrl && s.token);
  };

  FS.getTheme = function () {
    return document.documentElement.getAttribute('data-theme') || 'light';
  };

  FS.setTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(FS.STORAGE.theme, theme); } catch (e) { /* storage bloqueado */ }
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0B101C' : '#0086C8');
    document.dispatchEvent(new CustomEvent('fs:theme', { detail: theme }));
  };

  FS.findStatus = function (id) { return FS.STATUSES.find(function (s) { return s.id === id; }) || FS.STATUSES[0]; };
  FS.findPriority = function (id) { return FS.PRIORITIES.find(function (p) { return p.id === id; }) || FS.PRIORITIES[2]; };
  FS.findCategory = function (id) { return FS.CATEGORIES.find(function (c) { return c.id === id; }) || FS.CATEGORIES[4]; };
  FS.findMilestoneStatus = function (id) { return FS.MILESTONE_STATUSES.find(function (s) { return s.id === id; }) || FS.MILESTONE_STATUSES[0]; };

  /* ------------------------------- Utilidades ------------------------------ */
  var U = {};

  U.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  U.loadJSON = function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  };

  U.saveJSON = function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  };

  U.pad = function (n) { return String(n).padStart(2, '0'); };

  U.todayISO = function () { return U.toISODate(new Date()); };

  U.toISODate = function (date) {
    return date.getFullYear() + '-' + U.pad(date.getMonth() + 1) + '-' + U.pad(date.getDate());
  };

  U.parseISO = function (iso) {
    if (!iso) return null;
    var parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return null;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  };

  U.addDays = function (date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  };

  U.daysBetween = function (aISO, bISO) {
    var a = U.parseISO(aISO);
    var b = U.parseISO(bISO);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  };

  U.formatDate = function (iso, style) {
    var d = U.parseISO(iso);
    if (!d) return '—';
    var opts = style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'month'
        ? { month: 'long', year: 'numeric' }
        : { day: '2-digit', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat('es-CO', opts).format(d);
  };

  U.formatDateTime = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(d);
  };

  U.relativeTime = function (iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var diff = Math.round((then - Date.now()) / 60000);
    var abs = Math.abs(diff);
    if (abs < 1) return 'ahora';
    if (abs < 60) return diff > 0 ? 'en ' + abs + ' min' : 'hace ' + abs + ' min';
    if (abs < 1440) {
      var h = Math.round(abs / 60);
      return diff > 0 ? 'en ' + h + ' h' : 'hace ' + h + ' h';
    }
    var d = Math.round(abs / 1440);
    return diff > 0 ? 'en ' + d + ' d' : 'hace ' + d + ' d';
  };

  U.formatTime = function (hhmm) {
    if (!hhmm) return '—';
    return String(hhmm).slice(0, 5);
  };

  U.endTime = function (dateISO, startHHMM, durationMin) {
    var d = U.parseISO(dateISO);
    if (!d) return '';
    var parts = String(startHHMM || '09:00').split(':');
    d.setHours(Number(parts[0] || 0), Number(parts[1] || 0), 0, 0);
    d.setMinutes(d.getMinutes() + Number(durationMin || 30));
    return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };

  U.durationLabel = function (min) {
    var m = Number(min || 0);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var rest = m % 60;
    return rest ? h + ' h ' + rest + ' min' : h + ' h';
  };

  U.initials = function (name) {
    var clean = String(name || '').trim();
    if (!clean) return '—';
    if (clean.indexOf('@') > -1) clean = clean.split('@')[0].replace(/[._-]+/g, ' ');
    var parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  U.startOfWeek = function (date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - day);
    return d;
  };

  U.monthKey = function (iso) {
    return String(iso || '').slice(0, 7);
  };

  U.monthLabel = function (key) {
    var parts = String(key).split('-');
    if (parts.length < 2) return key;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(d);
  };

  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, wait || 180);
    };
  };

  U.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  };

  U.download = function (filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  U.csvCell = function (value) {
    var s = String(value == null ? '' : value);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  U.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };

  FS.utils = U;
})(window.FS);
