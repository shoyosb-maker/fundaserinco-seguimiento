/* Fundaserinco · Seguimiento — interfaz, vistas, modales e integraciones */
window.FS = window.FS || {};

(function (FS) {
  'use strict';

  var U = FS.utils;
  var store = FS.store;
  var api = FS.api;

  var VIEW_META = {
    board: { title: 'Tablero' },
    tasks: { title: 'Mis tareas' },
    metrics: { title: 'Métricas' },
    roadmap: { title: 'Roadmap' },
    meetings: { title: 'Reuniones' }
  };

  var ui = {
    view: 'board',
    boardSearch: '',
    boardPriority: 'all',
    boardAssignee: 'all',
    tasksSearch: '',
    tasksStatus: 'all',
    tasksPriority: 'all',
    tasksSort: 'updated',
    calCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calView: 'month',
    dragId: null,
    dragging: false,
    justDragged: 0
  };

  var connection = { state: FS.isConfigured() ? 'checking' : 'local', detail: '' };
  var modalStack = [];
  var lastFocused = null;

  /* ------------------------------ Helpers DOM ------------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(v) { return U.esc(v); }

  function icon(name, cls) {
    return '<span class="material-symbols-outlined' + (cls ? ' ' + cls : '') + '">' + name + '</span>';
  }

  function today() { return U.todayISO(); }

  function capitalize(text) {
    var value = String(text || '');
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  function dueLabel(iso) {
    if (!iso) return '';
    var diff = U.daysBetween(today(), iso);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff === -1) return 'Ayer';
    var date = U.parseISO(iso);
    if (!date) return U.formatDate(iso);
    var opts = { day: '2-digit', month: 'short' };
    if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return new Intl.DateTimeFormat('es-CO', opts).format(date);
  }

  function statusChip(statusId) {
    var s = FS.findStatus(statusId);
    return '<span class="status-chip" data-status="' + s.id + '"><span class="status-chip__dot"></span>' + esc(s.label) + '</span>';
  }

  function priorityBadge(priorityId) {
    var p = FS.findPriority(priorityId);
    return '<span class="prio prio--' + p.id + '">' + esc(p.label) + '</span>';
  }

  function initials(name) { return U.initials(name); }

  function taskById(id) {
    return store.getState().tasks.find(function (t) { return t.id === id; });
  }

  function meetingById(id) {
    return store.getState().meetings.find(function (m) { return m.id === id; });
  }

  function milestoneById(id) {
    return store.getState().milestones.find(function (m) { return m.id === id; });
  }

  function meetingEnd(m) {
    var d = new Date(m.date + 'T' + (m.start || '09:00') + ':00');
    d.setMinutes(d.getMinutes() + Number(m.duration || 30));
    return d;
  }

  /* --------------------------------- Toast --------------------------------- */
  function toast(message, type, title) {
    var stack = $('#toast-stack');
    if (!stack) return;
    var icons = { info: 'info', ok: 'check_circle', warn: 'warning', err: 'error' };
    var el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    el.setAttribute('role', 'status');
    el.innerHTML = icon(icons[type] || 'info') +
      '<div class="toast__text">' + (title ? '<strong>' + esc(title) + '</strong><br>' : '') + esc(message) + '</div>';
    stack.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 180);
    }, 4600);
  }

  /* -------------------------------- Modales -------------------------------- */
  function openModal(opts) {
    if (!modalStack.length) lastFocused = document.activeElement;

    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal' + (opts.wide ? ' modal--wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<div class="modal__head">' +
          '<div>' +
            '<h2 class="modal__title" id="modal-title">' + esc(opts.title || '') + '</h2>' +
            (opts.subtitle ? '<p class="modal__sub">' + esc(opts.subtitle) + '</p>' : '') +
          '</div>' +
          '<button class="icon-btn modal__close" type="button" data-action="close-modal" aria-label="Cerrar">' + icon('close') + '</button>' +
        '</div>' +
        '<div class="modal__body">' + (opts.body || '') + '</div>' +
        (opts.foot ? '<div class="modal__foot">' + opts.foot + '</div>' : '') +
      '</div>';
    $('#modal-root').appendChild(backdrop);
    if (FS.glass) FS.glass.enhance(backdrop);
    document.body.style.overflow = 'hidden';

    var handle = {
      root: backdrop,
      close: function () {
        var i = modalStack.indexOf(handle);
        if (i === -1) return;
        modalStack.splice(i, 1);
        backdrop.remove();
        if (!modalStack.length) {
          document.body.style.overflow = '';
          if (lastFocused && lastFocused.focus) lastFocused.focus();
        }
        if (opts.onClose) opts.onClose();
      }
    };

    modalStack.push(handle);
    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop) handle.close();
    });
    if (opts.onMount) opts.onMount(handle);

    setTimeout(function () {
      var focusable = backdrop.querySelector('input:not([type="file"]), select, textarea, button.btn-primary');
      if (focusable) focusable.focus();
    }, 40);

    return handle;
  }

  function closeTopModal() {
    if (modalStack.length) modalStack[modalStack.length - 1].close();
  }

  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      var handle = openModal({
        title: opts.title || 'Confirmar acción',
        body: '<p style="font-size:13.5px;color:var(--muted);line-height:1.6">' + esc(opts.message || '¿Seguro que quieres continuar?') + '</p>',
        foot:
          '<button class="btn btn-ghost" type="button" data-confirm="no">Cancelar</button>' +
          '<div class="spacer"></div>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" type="button" data-confirm="yes">' + esc(opts.confirmLabel || 'Confirmar') + '</button>',
        onClose: function () { if (!settled) { settled = true; resolve(false); } },
        onMount: function (h) {
          h.root.querySelector('[data-confirm="no"]').addEventListener('click', function () { h.close(); });
          h.root.querySelector('[data-confirm="yes"]').addEventListener('click', function () { settled = true; h.close(); resolve(true); });
        }
      });
      return handle;
    });
  }

  /* ------------------------------- Navegación ------------------------------ */
  function routeFromHash() {
    var raw = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return VIEW_META[raw] ? raw : 'board';
  }

  function navigate(view, silent) {
    if (!VIEW_META[view]) view = 'board';
    ui.view = view;
    if (!silent) {
      var hash = '#/' + view;
      if (location.hash !== hash) history.replaceState(null, '', hash);
    }
    closeSidebar();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('is-open');
    var bd = $('#sidebar-backdrop');
    bd.classList.remove('is-open');
    bd.hidden = true;
  }

  function toggleSidebar() {
    var open = !$('#sidebar').classList.contains('is-open');
    $('#sidebar').classList.toggle('is-open', open);
    var bd = $('#sidebar-backdrop');
    bd.hidden = !open;
    bd.classList.toggle('is-open', open);
  }

  function tutorialState() {
    return U.loadJSON(FS.STORAGE.tutorials, {}) || {};
  }

  function applyTutorialState() {
    var state = tutorialState();
    $$('.tutorial[data-tutorial]').forEach(function (card) {
      card.hidden = Boolean(state[card.dataset.tutorial]);
    });
  }

  function dismissTutorial(key) {
    if (!key) return;
    var state = tutorialState();
    state[key] = true;
    U.saveJSON(FS.STORAGE.tutorials, state);
    var card = document.querySelector('.tutorial[data-tutorial="' + key + '"]');
    if (card) card.hidden = true;
    var trigger = document.querySelector('[data-action="show-tutorial"][data-tutorial="' + key + '"]');
    if (trigger) trigger.focus();
  }

  function showTutorial(key) {
    var card = document.querySelector('.tutorial[data-tutorial="' + key + '"]');
    if (!card) return;
    card.hidden = false;
    card.classList.remove('is-flash');
    void card.offsetWidth;
    card.classList.add('is-flash');
    if (card.focus) card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { card.classList.remove('is-flash'); }, 1200);
  }

  function openTerminal() {
    $('#terminal').classList.add('is-open');
    $('#terminal').setAttribute('aria-hidden', 'false');
    if (FS.terminal && FS.terminal.onOpen) FS.terminal.onOpen();
  }

  function closeTerminal() {
    var term = $('#terminal');
    if (term.contains(document.activeElement)) {
      var trigger = document.querySelector('.topbar__actions [data-action="open-terminal"]');
      if (trigger) trigger.focus();
      else if (document.activeElement.blur) document.activeElement.blur();
    }
    term.classList.remove('is-open');
    term.setAttribute('aria-hidden', 'true');
  }

  /* --------------------------------- Render -------------------------------- */
  function render() {
    $$('.view').forEach(function (sec) { sec.hidden = sec.dataset.page !== ui.view; });
    $$('.nav-item[data-view]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.view === ui.view);
      if (btn.dataset.view === ui.view) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    $('#view-title').textContent = VIEW_META[ui.view].title;
    renderChrome();
    renderCurrent();
  }

  function renderCurrent() {
    if (ui.view === 'board') renderBoard();
    else if (ui.view === 'tasks') renderTasks();
    else if (ui.view === 'metrics') renderMetrics();
    else if (ui.view === 'roadmap') renderRoadmap();
    else if (ui.view === 'meetings') renderMeetings();
    syncAssigneeOptions();
  }

  function renderChrome() {
    var state = store.getState();
    var stats = store.stats();
    var counts = {
      board: state.tasks.filter(function (t) { return t.status !== 'done'; }).length,
      tasks: state.tasks.length,
      roadmap: state.milestones.length,
      meetings: stats.meetingsUpcoming.length
    };
    Object.keys(counts).forEach(function (key) {
      var el = document.querySelector('[data-count="' + key + '"]');
      if (el) el.textContent = counts[key];
    });

    var online = connection.state === 'online';
    var failed = connection.state === 'error';
    $('#conn-pill').classList.toggle('is-online', online);
    $('#conn-pill').classList.toggle('is-error', failed);
    $('#conn-pill-label').textContent = online
      ? 'Google Sheets'
      : connection.state === 'checking'
        ? 'Conectando…'
        : failed ? 'Sin conexión' : 'Modo local';
    $('#conn-status').classList.toggle('is-online', online);
    $('#conn-status').classList.toggle('is-error', failed);
    $('#conn-label').textContent = online
      ? 'Google Sheets conectado'
      : connection.state === 'checking'
        ? 'Verificando conexión…'
        : failed ? 'Google sin conexión · datos locales' : 'Modo local (sin Google)';
    $('#cal-tz-label').textContent = 'Zona: ' + FS.getSettings().timezone;
    updateThemeIcon();
  }

  function updateThemeIcon() {
    var dark = FS.getTheme() === 'dark';
    var btn = $('#theme-toggle');
    if (!btn) return;
    btn.innerHTML = icon(dark ? 'light_mode' : 'dark_mode');
    btn.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }

  function setViewTitle(text) {
    var el = $('#view-title');
    if (el) el.textContent = text || VIEW_META[ui.view].title;
  }

  /* --------------------------------- Tablero ------------------------------- */
  function matchesTask(task, search, priority, assignee) {
    if (priority !== 'all' && task.priority !== priority) return false;
    if (assignee !== 'all' && (task.assignee || '') !== assignee) return false;
    if (!search) return true;
    var haystack = (task.id + ' ' + task.title + ' ' + task.description + ' ' + (task.tags || []).join(' ') + ' ' + (task.assignee || '')).toLowerCase();
    return haystack.indexOf(search.toLowerCase()) > -1;
  }

  function renderBoard() {
    var state = store.getState();
    var grid = $('#board-grid');
    if (!grid) return;
    var t = today();

    var filtered = state.tasks.filter(function (task) {
      return matchesTask(task, ui.boardSearch, ui.boardPriority, ui.boardAssignee);
    });

    var byStatus = {};
    FS.STATUSES.forEach(function (s) { byStatus[s.id] = []; });
    filtered.forEach(function (task) {
      (byStatus[task.status] || byStatus.backlog).push(task);
    });

    var totalPoints = state.tasks.reduce(function (acc, task) { return acc + (task.points || 0); }, 0);
    var doneCount = state.tasks.filter(function (task) { return task.status === 'done'; }).length;
    var progress = state.tasks.length ? Math.round((doneCount / state.tasks.length) * 100) : 0;

    $('#board-points').textContent = totalPoints + ' pts';
    $('#board-progress').textContent = progress + '% completado';

    grid.innerHTML = FS.STATUSES.map(function (status) {
      var tasks = byStatus[status.id] || [];
      var points = tasks.reduce(function (acc, task) { return acc + (task.points || 0); }, 0);
      var cards = tasks.map(function (task) { return taskCardHtml(task, t); }).join('');
      return '<div class="kanban-col" data-status="' + status.id + '">' +
        '<div class="kanban-col__head">' +
          '<span class="kanban-col__dot" style="background:var(' + status.color + ')"></span>' +
          '<span class="kanban-col__name">' + esc(status.label) + '</span>' +
          '<span class="kanban-col__count">' + tasks.length + '</span>' +
          '<span class="kanban-col__points">' + points + ' pts</span>' +
          '<button class="kanban-col__add" type="button" data-action="new-task" data-status="' + status.id + '" title="Nueva tarea en ' + esc(status.label) + '" aria-label="Nueva tarea en ' + esc(status.label) + '">' + icon('add') + '</button>' +
        '</div>' +
        '<div class="kanban-col__list" data-status="' + status.id + '">' +
          (cards || '<div class="kanban-col__empty">Sin tareas</div>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function taskCardHtml(task, t) {
    var late = task.due && task.due < t && task.status !== 'done';
    var tags = (task.tags || []).slice(0, 3).map(function (tag) {
      return '<span class="tag">#' + esc(tag) + '</span>';
    }).join('');
    return '<article class="task-card' + (late ? ' is-overdue' : '') + '" draggable="true" data-action="edit-task" data-id="' + esc(task.id) + '" aria-label="Editar ' + esc(task.title) + '">' +
      '<div class="task-card__top">' +
        '<span class="task-card__id">' + esc(task.id) + '</span>' +
        '<span class="task-card__prio">' + priorityBadge(task.priority) + '</span>' +
      '</div>' +
      '<h4 class="task-card__title">' + esc(task.title) + '</h4>' +
      (tags ? '<div class="task-card__tags">' + tags + '</div>' : '') +
      '<div class="task-card__foot">' +
        (task.points ? '<span class="task-card__points">' + task.points + ' SP</span>' : '') +
        (task.due ? '<span class="task-card__due' + (late ? ' late' : '') + '">' + icon('event') + esc(dueLabel(task.due)) + '</span>' : '') +
        (task.assignee ? '<span class="task-card__time" title="' + esc(task.assignee) + '"><span class="task-card__avatar">' + esc(initials(task.assignee)) + '</span></span>' : '') +
      '</div>' +
    '</article>';
  }

  function syncAssigneeOptions() {
    var select = $('#board-filter-assignee');
    if (!select) return;
    var names = Array.from(new Set(store.getState().tasks.map(function (t) { return t.assignee; }).filter(Boolean))).sort();
    var signature = names.join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    var current = ui.boardAssignee;
    select.innerHTML = '<option value="all">Todos los responsables</option>' + names.map(function (name) {
      return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
    }).join('');
    if (names.indexOf(current) === -1) {
      ui.boardAssignee = 'all';
      current = 'all';
    }
    select.value = current;
    if (FS.glass) FS.glass.refresh(select);
  }

  /* --------------------------------- Tareas -------------------------------- */
  function sortedFilteredTasks() {
    var tasks = store.getState().tasks.filter(function (task) {
      return matchesTask(task, ui.tasksSearch, ui.tasksPriority, 'all') &&
        (ui.tasksStatus === 'all' || task.status === ui.tasksStatus);
    });
    var sort = ui.tasksSort;
    tasks.sort(function (a, b) {
      if (sort === 'due') {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      }
      if (sort === 'priority') {
        return FS.findPriority(a.priority).weight - FS.findPriority(b.priority).weight;
      }
      if (sort === 'title') return a.title.localeCompare(b.title, 'es');
      return String(b.updated).localeCompare(String(a.updated));
    });
    return tasks;
  }

  function renderTasks() {
    var list = $('#task-list');
    if (!list) return;
    var tasks = sortedFilteredTasks();
    var t = today();
    $('#tasks-count').textContent = tasks.length + (tasks.length === 1 ? ' tarea' : ' tareas');

    if (!tasks.length) {
      var hasAny = store.getState().tasks.length > 0;
      list.innerHTML = '<div class="empty-state">' + icon(hasAny ? 'filter_alt_off' : 'task_alt') +
        '<h3>' + (hasAny ? 'Ninguna tarea coincide' : 'Aún no hay tareas') + '</h3>' +
        '<p>' + (hasAny ? 'Prueba a cambiar los filtros o la búsqueda.' : 'Crea tu primera tarea para empezar a medir avance, vencimientos y carga de trabajo.') + '</p>' +
        '<div class="empty-state__actions">' +
          (hasAny ? '<button class="btn btn-ghost" type="button" data-action="clear-task-filters">Limpiar filtros</button>' : '') +
          '<button class="btn btn-primary" type="button" data-action="new-task">' + icon('add') + ' Nueva tarea</button>' +
        '</div></div>';
      return;
    }

    list.innerHTML = tasks.map(function (task) {
      var late = task.due && task.due < t && task.status !== 'done';
      var metaTags = (task.tags || []).slice(0, 2).map(function (tag) { return '<span class="tag">#' + esc(tag) + '</span>'; }).join('');
      return '<div class="task-row' + (task.status === 'done' ? ' is-done' : '') + '" data-action="edit-task" data-id="' + esc(task.id) + '" role="button" tabindex="0" aria-label="Editar ' + esc(task.title) + '">' +
        '<div class="task-row__main">' +
          '<div class="task-row__title">' + esc(task.title) + '</div>' +
          '<div class="task-row__meta"><span class="task-row__id">' + esc(task.id) + '</span>' + metaTags + '</div>' +
        '</div>' +
        statusChip(task.status) +
        priorityBadge(task.priority) +
        '<span class="task-row__due' + (late ? ' late' : '') + '">' + esc(task.due ? dueLabel(task.due) : 'Sin fecha') + '</span>' +
        '<span class="task-row__points">' + (task.points ? task.points + ' SP' : '—') + '</span>' +
        '<span class="task-row__assignee" title="' + esc(task.assignee || 'Sin responsable') + '">' + esc(task.assignee ? initials(task.assignee) : '—') + '</span>' +
        '<span class="task-row__go">' + icon('chevron_right') + '</span>' +
      '</div>';
    }).join('');
  }

  /* -------------------------------- Métricas ------------------------------- */
  function renderMetrics() {
    var el = $('#metrics-content');
    if (!el) return;
    var stats = store.stats();

    var kpis = [
      { label: 'Tareas activas', icon: 'pending_actions', value: stats.active, hint: stats.total + ' en total', kind: '' },
      { label: 'Completadas', icon: 'task_alt', value: stats.done, hint: stats.completion + '% del total', kind: 'kpi--success' },
      { label: 'Vencidas', icon: 'running_with_errors', value: stats.overdue, hint: stats.dueSoon + ' vencen en 7 días', kind: stats.overdue ? 'kpi--warning' : '' },
      { label: 'Puntos completados', icon: 'speed', value: stats.pointsDone, hint: 'de ' + stats.pointsTotal + ' pts', kind: 'kpi--coral' },
      { label: 'Reuniones próximas', icon: 'videocam', value: stats.meetingsUpcoming.length, hint: stats.meetingsCount + ' agendadas', kind: '' },
      { label: 'Hitos', icon: 'flag', value: stats.milestonesDone, hint: 'de ' + stats.milestonesTotal + ' hitos', kind: '' }
    ];

    var kpiHtml = kpis.map(function (k) {
      return '<div class="kpi ' + k.kind + '">' +
        '<div class="kpi__label">' + icon(k.icon) + esc(k.label) + '</div>' +
        '<div class="kpi__value">' + k.value + '</div>' +
        '<div class="kpi__hint">' + esc(k.hint) + '</div>' +
      '</div>';
    }).join('');

    var maxWeek = Math.max.apply(null, stats.weeks.map(function (w) { return w.count; }).concat([1]));
    var bars = stats.weeks.map(function (w) {
      var pct = Math.round((w.count / maxWeek) * 100);
      return '<div class="bar-col' + (w.count ? '' : ' is-zero') + '">' +
        '<span class="bar-col__value">' + w.count + '</span>' +
        '<div class="bar-col__bar" style="height:' + Math.max(pct, 2) + '%"></div>' +
        '<span class="bar-col__label">' + w.label + '</span>' +
      '</div>';
    }).join('');

    var done = stats.byStatus.done || 0;
    var legend = FS.STATUSES.map(function (s) {
      return '<div class="legend__item"><span class="legend__dot" style="background:var(' + s.color + ')"></span>' + esc(s.label) +
        '<span class="legend__value">' + (stats.byStatus[s.id] || 0) + '</span></div>';
    }).join('');

    var maxPriority = Math.max.apply(null, FS.PRIORITIES.map(function (p) { return stats.byPriority[p.id] || 0; }).concat([1]));
    var priorities = FS.PRIORITIES.map(function (p) {
      var count = stats.byPriority[p.id] || 0;
      var pct = Math.round((count / maxPriority) * 100);
      return '<div class="priority-row"><span class="priority-row__label">' + esc(p.label) + '</span>' +
        '<span class="hbar"><span class="hbar__fill" style="width:' + pct + '%;background:var(' + (p.id === 'urgent' ? '--danger' : p.id === 'high' ? '--brand-coral' : p.id === 'medium' ? '--brand-cyan' : '--faint') + ')"></span></span>' +
        '<span class="priority-row__value">' + count + '</span></div>';
    }).join('');

    var tagsHtml = stats.tags.length
      ? stats.tags.map(function (tag) {
          return '<div class="mini-row"><span class="tag">#' + esc(tag.name) + '</span><span class="mini-row__title"></span><span class="mini-row__meta">' + tag.count + '</span></div>';
        }).join('')
      : '<p class="faint small">Sin etiquetas todavía.</p>';

    var upcomingHtml = stats.upcoming.length
      ? stats.upcoming.map(function (task) {
          var late = task.due < today();
          return '<div class="mini-row">' + icon('event') +
            '<span class="mini-row__title">' + esc(task.title) + '</span>' +
            '<span class="mini-row__meta"' + (late ? ' style="color:var(--danger)"' : '') + '>' + esc(dueLabel(task.due)) + '</span></div>';
        }).join('')
      : '<p class="faint small">No hay tareas con fecha de vencimiento pendientes.</p>';

    var meetingsHtml = stats.meetingsUpcoming.length
      ? stats.meetingsUpcoming.slice(0, 5).map(function (m) {
          return '<div class="mini-row">' + icon('videocam') +
            '<span class="mini-row__title">' + esc(m.title) + '</span>' +
            '<span class="mini-row__meta">' + esc(U.formatDate(m.date) + ' · ' + m.start) + '</span></div>';
        }).join('')
      : '<p class="faint small">Sin reuniones próximas.</p>';

    el.innerHTML =
      '<div class="kpi-grid">' + kpiHtml + '</div>' +
      (stats.total === 0
        ? '<div class="empty-state" style="margin-bottom:18px">' + icon('insights') +
            '<h3>Las métricas aparecerán con tu primera tarea</h3>' +
            '<p>El tablero y esta vista usan tus datos reales. No hay ejemplos precargados.</p>' +
            '<div class="empty-state__actions"><button class="btn btn-primary" type="button" data-action="new-task">' + icon('add') + ' Crear tarea</button></div></div>'
        : '') +
      '<div class="charts-grid">' +
        '<div class="panel chart-card">' +
          '<div class="chart-card__head"><div><div class="chart-card__title">Ritmo de cierre</div><div class="chart-card__sub">Tareas completadas por semana (últimas 8)</div></div>' +
          '<span class="status-chip" data-status="done">' + icon('trending_up') + ' ' + stats.completed7 + ' esta semana</span></div>' +
          '<div class="bar-chart-wrap"><div class="bar-chart">' + bars + '</div></div>' +
        '</div>' +
        '<div class="panel chart-card">' +
          '<div class="chart-card__head"><div><div class="chart-card__title">Distribución por estado</div><div class="chart-card__sub">' + stats.total + (stats.total === 1 ? ' tarea en total' : ' tareas en total') + '</div></div></div>' +
          '<div class="donut-wrap">' +
            '<div class="donut" style="background:' + donutGradient(stats) + '"><div class="donut__center"><span class="donut__value">' + stats.completion + '%</span><span class="donut__label">Completado</span></div></div>' +
            '<div class="legend">' + legend + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="split-grid">' +
        '<div class="panel chart-card"><div class="chart-card__head"><div><div class="chart-card__title">Prioridades</div><div class="chart-card__sub">Carga por nivel de urgencia</div></div></div>' +
          '<div style="display:flex;flex-direction:column;gap:12px">' + priorities + '</div>' +
          '<div style="margin-top:18px"><div class="section-title">Etiquetas más usadas</div><div class="mini-list">' + tagsHtml + '</div></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="panel chart-card"><div class="chart-card__head"><div><div class="chart-card__title">Próximos vencimientos</div><div class="chart-card__sub">Tareas abiertas con fecha</div></div></div><div class="mini-list">' + upcomingHtml + '</div></div>' +
          '<div class="panel chart-card"><div class="chart-card__head"><div><div class="chart-card__title">Reuniones próximas</div><div class="chart-card__sub">Sincronizadas o locales</div></div></div><div class="mini-list">' + meetingsHtml + '</div></div>' +
        '</div>' +
      '</div>';
  }

  function donutGradient(stats) {
    if (!stats.total) return 'conic-gradient(var(--line) 0 100%)';
    var colors = {
      backlog: 'var(--faint)', todo: 'var(--brand-cyan)',
      in_progress: 'var(--brand-blue)', review: 'var(--brand-coral)', done: 'var(--success)'
    };
    var acc = 0;
    var parts = [];
    FS.STATUSES.forEach(function (s) {
      var count = stats.byStatus[s.id] || 0;
      if (!count) return;
      var from = (acc / stats.total) * 100;
      acc += count;
      var to = (acc / stats.total) * 100;
      parts.push(colors[s.id] + ' ' + from.toFixed(2) + '% ' + to.toFixed(2) + '%');
    });
    return 'conic-gradient(' + parts.join(', ') + ')';
  }

  /* --------------------------------- Roadmap ------------------------------- */
  function renderRoadmap() {
    var el = $('#roadmap-content');
    if (!el) return;
    var state = store.getState();
    var milestones = state.milestones.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var done = milestones.filter(function (m) { return m.status === 'done'; }).length;
    var pct = milestones.length ? Math.round((done / milestones.length) * 100) : 0;
    var next = milestones.find(function (m) { return m.status !== 'done' && m.date >= today(); }) || milestones.find(function (m) { return m.status !== 'done'; });

    var summary = '<div class="panel roadmap-summary">' +
      '<div class="roadmap-summary__progress">' +
        '<div class="roadmap-summary__label"><span>Progreso de hitos</span><span>' + done + ' / ' + milestones.length + '</span></div>' +
        '<div class="hbar" style="height:8px"><div class="hbar__fill" style="width:' + pct + '%;background:linear-gradient(90deg,var(--brand-cyan),var(--brand-blue))"></div></div>' +
      '</div>' +
      '<div style="min-width:180px"><div class="kpi__label">' + icon('flag') + 'Próximo hito</div><div style="font-size:13px;font-weight:700;margin-top:4px">' +
        (next ? esc(next.title) + ' <span class="muted small">· ' + esc(U.formatDate(next.date)) + '</span>' : 'Sin hitos pendientes') + '</div></div>' +
    '</div>';

    var timeline = '';
    if (!milestones.length) {
      timeline = '<div class="empty-state">' + icon('route') +
        '<h3>Tu roadmap está vacío</h3>' +
        '<p>Agrega hitos con fecha para visualizar la línea de tiempo. Se ordenan automáticamente por mes.</p>' +
        '<div class="empty-state__actions"><button class="btn btn-primary" type="button" data-action="new-milestone">' + icon('add') + ' Crear primer hito</button></div></div>';
    } else {
      var groups = {};
      milestones.forEach(function (m) {
        var key = U.monthKey(m.date);
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
      });
      timeline = '<div class="timeline">' + Object.keys(groups).sort().map(function (key) {
        return '<div class="timeline-group">' +
          '<div class="timeline-group__head">' + esc(U.monthLabel(key)) + '</div>' +
          '<div class="milestones">' + groups[key].map(milestoneCardHtml).join('') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    // Carga por vencimiento: mes actual + 5
    var base = new Date();
    var loadRows = [];
    var maxLoad = 1;
    for (var i = 0; i < 6; i++) {
      var d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      var key = d.getFullYear() + '-' + U.pad(d.getMonth() + 1);
      var count = state.tasks.filter(function (task) {
        return task.status !== 'done' && U.monthKey(task.due) === key;
      }).length;
      maxLoad = Math.max(maxLoad, count);
      loadRows.push({ key: key, count: count });
    }
    var loadHtml = loadRows.map(function (row) {
      return '<div class="load-row"><span class="load-row__label">' + esc(U.monthLabel(row.key)) + '</span>' +
        '<span class="hbar"><span class="hbar__fill" style="width:' + Math.round((row.count / maxLoad) * 100) + '%"></span></span>' +
        '<span class="load-row__value">' + row.count + '</span></div>';
    }).join('');

    el.innerHTML = summary + timeline +
      '<div class="panel" style="margin-top:18px">' +
        '<div style="padding:18px 20px 0"><div class="chart-card__title">Carga por vencimiento</div><div class="chart-card__sub">Tareas abiertas con fecha límite en los próximos 6 meses</div></div>' +
        '<div class="roadmap-load">' + loadHtml + '</div>' +
      '</div>';
  }

  function milestoneCardHtml(m) {
    var d = U.parseISO(m.date);
    var day = d ? d.getDate() : '—';
    var month = d ? new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(d).replace('.', '') : '';
    var st = FS.findMilestoneStatus(m.status);
    return '<div class="milestone' + (m.status === 'done' ? ' is-done' : '') + '" data-action="edit-milestone" data-id="' + esc(m.id) + '" role="button" tabindex="0">' +
      '<span class="milestone__status status-dot--' + st.id + '"></span>' +
      '<div class="milestone__date"><b>' + day + '</b><span>' + esc(month) + '</span></div>' +
      '<div class="milestone__body">' +
        '<div class="milestone__title">' + esc(m.title) + '</div>' +
        (m.description ? '<div class="milestone__desc">' + esc(m.description) + '</div>' : '') +
        '<div class="milestone__desc" style="margin-top:4px"><span class="status-chip"><span class="status-chip__dot" style="background:var(' + st.color + ')"></span>' + esc(st.label) + '</span></div>' +
      '</div>' +
      '<div class="milestone__actions">' +
        '<button class="icon-btn" type="button" data-action="toggle-milestone" data-id="' + esc(m.id) + '" title="Cambiar estado" aria-label="Cambiar estado">' + icon(m.status === 'done' ? 'undo' : 'check') + '</button>' +
      '</div>' +
    '</div>';
  }

  /* -------------------------------- Reuniones ------------------------------ */
  function renderMeetings() {
    var el = $('#meetings-content');
    if (!el) return;
    var label = $('#cal-month-label');
    var state = store.getState();

    $$('.cal-tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.calView === ui.calView);
    });

    if (ui.calView === 'agenda') {
      if (label) label.textContent = 'Agenda de reuniones';
      el.innerHTML = agendaHtml(state);
      return;
    }

    if (label) {
      label.textContent = capitalize(new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(ui.calCursor));
    }

    var year = ui.calCursor.getFullYear();
    var month = ui.calCursor.getMonth();
    var first = new Date(year, month, 1);
    var offset = (first.getDay() + 6) % 7;
    var start = U.addDays(first, -offset);

    var byDate = {};
    state.meetings.forEach(function (m) {
      if (!byDate[m.date]) byDate[m.date] = [];
      byDate[m.date].push(m);
    });
    Object.keys(byDate).forEach(function (key) {
      byDate[key].sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
    });

    var dow = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var day = U.addDays(start, i);
      var iso = U.toISODate(day);
      var inMonth = day.getMonth() === month;
      var isToday = iso === today();
      var items = byDate[iso] || [];
      var shown = items.slice(0, 3).map(function (m) {
        var cat = FS.findCategory(m.category);
        return '<button class="cal-pill cal-pill--' + cat.className + '" type="button" data-action="edit-meeting" data-id="' + esc(m.id) + '" title="' + esc(m.title + ' · ' + m.start) + '">' +
          '<span class="cal-pill__time">' + esc(m.start) + '</span><span class="cal-pill__title">' + esc(m.title) + '</span></button>';
      }).join('');
      var more = items.length > 3 ? '<span class="cal-more">+' + (items.length - 3) + ' más</span>' : '';
      cells += '<div class="cal-day' + (inMonth ? '' : ' is-out') + (isToday ? ' is-today' : '') + '" data-date="' + iso + '">' +
        '<div class="cal-day__head"><span class="cal-day__num">' + day.getDate() + '</span>' +
          '<button class="cal-day__add" type="button" data-action="new-meeting" data-date="' + iso + '" aria-label="Crear reunión el ' + esc(U.formatDate(iso)) + '" title="Agregar reunión">' + icon('add') + '</button>' +
        '</div>' +
        '<div class="cal-day__items">' + shown + more + '</div>' +
      '</div>';
    }

    var emptyHint = state.meetings.length ? '' :
      '<div class="empty-state" style="margin-top:16px">' + icon('calendar_month') +
        '<h3>No hay reuniones todavía</h3>' +
        '<p>Crea tus propias sesiones. Puedes vincular Google Calendar para generar el evento y el enlace de Meet automáticamente.</p>' +
        '<div class="empty-state__actions">' +
          '<button class="btn btn-primary" type="button" data-action="new-meeting">' + icon('add') + ' Nueva reunión</button>' +
          '<button class="btn btn-ghost" type="button" data-action="open-settings">Conectar Google</button>' +
        '</div></div>';

    el.innerHTML = '<div class="cal-week-head">' + dow.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div>' + emptyHint;
  }

  function agendaHtml(state) {
    var now = new Date();
    var meetings = state.meetings.slice().sort(function (a, b) {
      return (a.date + a.start).localeCompare(b.date + b.start);
    });
    var upcoming = meetings.filter(function (m) { return meetingEnd(m) >= now; });
    var past = meetings.filter(function (m) { return meetingEnd(m) < now; }).reverse().slice(0, 8);

    function group(list, descending) {
      var groups = {};
      list.forEach(function (m) {
        if (!groups[m.date]) groups[m.date] = [];
        groups[m.date].push(m);
      });
      var keys = Object.keys(groups).sort();
      if (descending) keys.reverse();
      return keys.map(function (date) {
        var isToday = date === today();
        return '<div class="agenda-group">' +
          '<div class="agenda-group__head"><span class="agenda-group__date">' + esc(capitalize(U.formatDate(date, 'long'))) + '</span>' +
            (isToday ? '<span class="agenda-group__badge">Hoy</span>' : '') +
            '<span class="agenda-group__count">' + groups[date].length + ' ' + (groups[date].length === 1 ? 'reunión' : 'reuniones') + '</span></div>' +
          groups[date].map(meetingCardHtml).join('') +
        '</div>';
      }).join('');
    }

    if (!meetings.length) {
      return '<div class="empty-state">' + icon('event_busy') +
        '<h3>Agenda vacía</h3>' +
        '<p>Aún no hay reuniones. Crea la primera y, si conectas Google, el evento y el Meet se crean automáticamente.</p>' +
        '<div class="empty-state__actions"><button class="btn btn-primary" type="button" data-action="new-meeting">' + icon('add') + ' Nueva reunión</button>' +
        '<button class="btn btn-ghost" type="button" data-action="import-calendar">Importar de Google Calendar</button></div></div>';
    }

    return '<div class="agenda">' +
      (upcoming.length ? '<div><div class="section-title">' + icon('upcoming') + 'Próximas</div>' + group(upcoming, false) + '</div>' : '') +
      (past.length ? '<div><div class="section-title">' + icon('history') + 'Anteriores</div>' + group(past, true) + '</div>' : '') +
    '</div>';
  }

  function meetingCardHtml(m) {
    var cat = FS.findCategory(m.category);
    var end = U.endTime(m.date, m.start, m.duration);
    var meetBadge = m.meetLink ? '<span class="meet-badge">' + icon('videocam') + 'Meet</span>' : '';
    return '<div class="meeting-card" data-action="edit-meeting" data-id="' + esc(m.id) + '" role="button" tabindex="0">' +
      '<div class="meeting-card__time"><b>' + esc(m.start) + '</b><span>' + esc(end) + '</span></div>' +
      '<div class="meeting-card__icon meeting-card__icon--' + cat.className + '">' + icon(cat.icon) + '</div>' +
      '<div class="meeting-card__body">' +
        '<div class="meeting-card__title">' + esc(m.title) + '</div>' +
        '<div class="meeting-card__meta">' +
          '<span>' + esc(cat.label) + '</span>' +
          '<span>' + icon('schedule') + esc(U.durationLabel(m.duration)) + '</span>' +
          (m.attendees && m.attendees.length ? '<span>' + icon('group') + m.attendees.length + ' invitados</span>' : '') +
          meetBadge +
        '</div>' +
      '</div>' +
      '<div class="meeting-card__actions">' +
        (m.meetLink ? '<button class="icon-btn" type="button" data-action="open-meet" data-id="' + esc(m.id) + '" title="Abrir Google Meet" aria-label="Abrir Google Meet">' + icon('videocam') + '</button>' : '') +
        '<button class="icon-btn" type="button" data-action="copy-invite" data-id="' + esc(m.id) + '" title="Copiar invitación" aria-label="Copiar invitación">' + icon('content_copy') + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ------------------------------ Modal tarea ------------------------------ */
  function openTaskModal(id, defaults) {
    var task = id ? taskById(id) : null;
    var t = task || Object.assign({ title: '', description: '', status: 'todo', priority: 'medium', points: 0, assignee: '', due: '', tags: [] }, defaults || {});
    var tagValue = (t.tags || []).join(', ');

    var body =
      '<form id="task-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field field--full"><label for="task-title">Título *</label><input id="task-title" name="title" required maxlength="140" value="' + esc(t.title) + '" placeholder="¿Qué hay que hacer?"></div>' +
          '<div class="field field--full"><label for="task-desc">Descripción</label><textarea id="task-desc" name="description" placeholder="Contexto, criterios de aceptación, enlaces…">' + esc(t.description || '') + '</textarea></div>' +
          '<div class="field"><label for="task-status">Estado</label><select id="task-status" name="status">' +
            FS.STATUSES.map(function (s) { return '<option value="' + s.id + '"' + (t.status === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="task-priority">Prioridad</label><select id="task-priority" name="priority">' +
            FS.PRIORITIES.map(function (p) { return '<option value="' + p.id + '"' + (t.priority === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="task-points">Puntos (SP)</label><input id="task-points" name="points" type="number" min="0" max="100" step="1" value="' + Number(t.points || 0) + '"></div>' +
          '<div class="field"><label for="task-assignee">Responsable</label><input id="task-assignee" name="assignee" maxlength="60" value="' + esc(t.assignee || '') + '" placeholder="Nombre o correo"></div>' +
          '<div class="field"><label for="task-due">Vencimiento</label><input id="task-due" name="due" type="date" value="' + esc(t.due || '') + '"></div>' +
          '<div class="field"><label for="task-tags">Etiquetas</label><input id="task-tags" name="tags" value="' + esc(tagValue) + '" placeholder="web, diseño, cliente"><span class="field__hint">Separadas por comas.</span></div>' +
        '</div>' +
      '</form>';

    var foot =
      (task ? '<button class="btn btn-danger btn-sm" type="button" id="task-delete">' + icon('delete') + ' Eliminar</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost" type="button" data-action="close-modal">Cancelar</button>' +
      '<button class="btn btn-primary" type="submit" form="task-form">' + (task ? 'Guardar cambios' : 'Crear tarea') + '</button>';

    var handle = openModal({
      title: task ? 'Editar tarea' : 'Nueva tarea',
      subtitle: task ? task.id + ' · creada ' + U.formatDateTime(task.created) : 'Se guarda de inmediato en este navegador',
      body: body,
      foot: foot
    });

    var form = handle.root.querySelector('#task-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        status: form.status.value,
        priority: form.priority.value,
        points: Number(form.points.value) || 0,
        assignee: form.assignee.value.trim(),
        due: form.due.value,
        tags: store.normalizeTags(form.tags.value)
      };
      if (!data.title) {
        form.title.focus();
        toast('La tarea necesita un título.', 'warn');
        return;
      }
      var saved;
      if (task) saved = store.updateTask(task.id, data);
      else saved = store.addTask(data);
      handle.close();
      toast(task ? 'Tarea actualizada.' : 'Tarea creada (' + saved.id + ').', 'ok');
      pushTaskRemote(saved);
    });

    var del = handle.root.querySelector('#task-delete');
    if (del) {
      del.addEventListener('click', function () {
        confirmDialog({
          title: 'Eliminar tarea',
          message: 'Se eliminará "' + task.title + '" de este navegador' + (FS.isConfigured() ? ' y de Google Sheets.' : '.'),
          confirmLabel: 'Eliminar',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          store.deleteTask(task.id);
          handle.close();
          toast('Tarea eliminada.', 'ok');
          if (FS.isConfigured()) {
            api.deleteTask(task.id).catch(function (err) { toast('No se pudo borrar en Google: ' + err.message, 'warn'); });
          }
        });
      });
    }
  }

  function pushTaskRemote(task) {
    if (!task || !FS.isConfigured()) return;
    api.upsertTask(task).then(function () {
      if (connection.state !== 'online') setConnection('online');
    }).catch(function (err) {
      setConnection('error', err.message);
      toast('Guardado localmente, pero falló el envío a Google: ' + err.message, 'warn');
    });
  }

  function pushMilestoneRemote(milestone) {
    if (!milestone || !FS.isConfigured()) return;
    api.upsertMilestone(milestone).catch(function (err) {
      toast('Guardado localmente, pero falló el envío a Google: ' + err.message, 'warn');
    });
  }

  /* ---------------------------- Modal reunión ------------------------------ */
  function openMeetingModal(id, defaults) {
    var meeting = id ? meetingById(id) : null;
    var defaultDate = (defaults && defaults.date) || today();
    var m = meeting || Object.assign({
      title: '', date: defaultDate, start: '09:00', duration: 30,
      category: 'sync', attendees: [], notes: '', meetLink: '', eventLink: '', eventId: ''
    }, defaults || {});

    var configured = FS.isConfigured();
    var meetChecked = configured && (meeting ? Boolean(meeting.meetLink) || FS.getSettings().meetByDefault : FS.getSettings().meetByDefault);
    var attendeeText = (m.attendees || []).join(', ');

    var meetOptions = configured
      ? '<label class="switch-row"><input type="checkbox" id="meet-toggle"' + (meetChecked ? ' checked' : '') + '>' +
          '<span class="switch-row__text"><span class="switch-row__title">Crear evento en Calendar con Google Meet</span>' +
          '<span class="switch-row__hint">Se crea el evento, se envía la invitación a los correos y se guarda el enlace de Meet. Si lo desactivas, la reunión solo se guarda en la app.</span></span></label>'
      : '<div class="callout callout--warn">' + icon('info') +
          '<div><strong>Google todavía no está conectado.</strong> Puedes guardar la reunión localmente, abrir una plantilla de Calendar o crear un Meet al instante.<br>' +
          '<button class="btn btn-ghost btn-sm" type="button" id="meet-template" style="margin-top:8px">' + icon('open_in_new') + ' Abrir plantilla de Calendar</button> ' +
          '<button class="btn btn-ghost btn-sm" type="button" id="meet-instant" style="margin-top:8px">' + icon('videocam') + ' Crear Meet ahora</button></div></div>';

    var existingLinks = '';
    if (meeting && (meeting.meetLink || meeting.eventLink)) {
      existingLinks = '<div class="callout callout--ok">' + icon('link') + '<div style="flex:1">' +
        (meeting.meetLink ? '<div><strong>Meet:</strong> <a href="' + esc(meeting.meetLink) + '" target="_blank" rel="noopener">' + esc(meeting.meetLink) + '</a></div>' : '') +
        (meeting.eventLink ? '<div style="margin-top:2px"><a href="' + esc(meeting.eventLink) + '" target="_blank" rel="noopener">Ver evento en Google Calendar</a></div>' : '') +
        '</div><button class="icon-btn" type="button" data-action="copy-invite" data-id="' + esc(meeting.id) + '" title="Copiar invitación">' + icon('content_copy') + '</button></div>';
    }

    var body =
      '<form id="meeting-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field field--full"><label for="meeting-title">Título *</label><input id="meeting-title" name="title" required maxlength="140" value="' + esc(m.title) + '" placeholder="Ej. Revisión de avances"></div>' +
          '<div class="field"><label for="meeting-date">Fecha *</label><input id="meeting-date" name="date" type="date" required value="' + esc(m.date) + '"></div>' +
          '<div class="field"><label for="meeting-start">Hora de inicio</label><input id="meeting-start" name="start" type="time" value="' + esc(m.start) + '"></div>' +
          '<div class="field"><label for="meeting-duration">Duración</label><select id="meeting-duration" name="duration">' +
            [15, 30, 45, 60, 90, 120].map(function (d) { return '<option value="' + d + '"' + (Number(m.duration) === d ? ' selected' : '') + '>' + U.durationLabel(d) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="meeting-category">Categoría</label><select id="meeting-category" name="category">' +
            FS.CATEGORIES.map(function (c) { return '<option value="' + c.id + '"' + (m.category === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field field--full"><label for="meeting-attendees">Invitados</label><input id="meeting-attendees" name="attendees" value="' + esc(attendeeText) + '" placeholder="correo1@dominio.com, correo2@dominio.com"><span class="field__hint">Separados por comas. Se usan para la invitación de Calendar.</span></div>' +
          '<div class="field field--full"><label for="meeting-notes">Notas / agenda</label><textarea id="meeting-notes" name="notes" placeholder="Temas a tratar, enlaces, decisiones…">' + esc(m.notes || '') + '</textarea></div>' +
          '<div class="field"><label for="meeting-meet">Enlace de Meet</label><input id="meeting-meet" name="meetLink" value="' + esc(m.meetLink || '') + '" placeholder="https://meet.google.com/…"><span class="field__hint">Pégalo aquí si lo creaste manualmente.</span></div>' +
          '<div class="field"><label for="meeting-event">Enlace del evento</label><input id="meeting-event" name="eventLink" value="' + esc(m.eventLink || '') + '" placeholder="https://calendar.google.com/…"><span class="field__hint">Opcional. Se rellena solo con Google conectado.</span></div>' +
          '<div class="field field--full">' + meetOptions + '</div>' +
          (existingLinks ? '<div class="field field--full">' + existingLinks + '</div>' : '') +
        '</div>' +
      '</form>';

    var foot =
      (meeting ? '<button class="btn btn-danger btn-sm" type="button" id="meeting-delete">' + icon('delete') + ' Eliminar</button>' : '') +
      (meeting && meeting.meetLink ? '<button class="btn btn-ghost btn-sm" type="button" data-action="open-meet" data-id="' + esc(meeting.id) + '">' + icon('videocam') + ' Abrir Meet</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost" type="button" data-action="close-modal">Cancelar</button>' +
      '<button class="btn btn-primary" type="submit" form="meeting-form">' + (meeting ? 'Guardar cambios' : 'Crear reunión') + '</button>';

    var handle = openModal({
      title: meeting ? 'Editar reunión' : 'Nueva reunión',
      subtitle: meeting ? meeting.id + (meeting.eventId ? ' · evento de Google Calendar' : ' · guardada localmente') : 'Crea tu propia sesión; sin ejemplos precargados',
      body: body,
      foot: foot,
      wide: true
    });

    var form = handle.root.querySelector('#meeting-form');
    var templateBtn = handle.root.querySelector('#meet-template');
    var instantBtn = handle.root.querySelector('#meet-instant');

    function readForm() {
      return {
        title: form.title.value.trim(),
        date: form.date.value,
        start: form.start.value || '09:00',
        duration: Number(form.duration.value) || 30,
        category: form.category.value,
        attendees: store.normalizeAttendees(form.attendees.value),
        notes: form.notes.value.trim(),
        meetLink: form.meetLink.value.trim(),
        eventLink: form.eventLink.value.trim()
      };
    }

    if (templateBtn) {
      templateBtn.addEventListener('click', function () {
        var data = readForm();
        if (!data.title) { form.title.focus(); toast('Ponle título a la reunión para generar el enlace.', 'warn'); return; }
        window.open(api.calendarTemplateUrl(data), '_blank', 'noopener');
      });
    }
    if (instantBtn) {
      instantBtn.addEventListener('click', function () {
        window.open(api.meetNewUrl, '_blank', 'noopener');
        toast('Copia el enlace del Meet y pégalo al editar la reunión.', 'info');
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = readForm();
      if (!data.title) { form.title.focus(); toast('La reunión necesita un título.', 'warn'); return; }
      if (!data.date) { form.date.focus(); toast('Selecciona una fecha.', 'warn'); return; }
      var toggle = handle.root.querySelector('#meet-toggle');
      var wantMeet = Boolean(toggle && toggle.checked);

      var saved;
      if (meeting) saved = store.updateMeeting(meeting.id, data);
      else saved = store.addMeeting(data);

      handle.close();
      toast(meeting ? 'Reunión actualizada.' : 'Reunión creada.', 'ok');

      if (FS.isConfigured()) {
        api.upsertMeeting(saved, wantMeet).then(function (res) {
          if (res && res.meeting) {
            store.updateMeeting(saved.id, {
              meetLink: res.meeting.meetLink || saved.meetLink,
              eventLink: res.meeting.eventLink || saved.eventLink,
              eventId: res.meeting.eventId || saved.eventId
            });
          }
          if (res && res.warning) toast(res.warning, 'warn');
          else toast(wantMeet ? 'Evento de Calendar y Meet creados.' : 'Reunión sincronizada con Google Sheets.', 'ok');
          setConnection('online');
        }).catch(function (err) {
          setConnection('error', err.message);
          toast('Reunión guardada localmente. Google: ' + err.message, 'warn');
        });
      } else if (wantMeet) {
        window.open(api.calendarTemplateUrl(saved), '_blank', 'noopener');
      }
    });

    var del = handle.root.querySelector('#meeting-delete');
    if (del) {
      del.addEventListener('click', function () {
        confirmDialog({
          title: 'Eliminar reunión',
          message: 'Se eliminará "' + meeting.title + '"' + (meeting.eventId ? ' y su evento de Google Calendar' : '') + '.',
          confirmLabel: 'Eliminar',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          var target = meeting;
          store.deleteMeeting(target.id);
          handle.close();
          toast('Reunión eliminada.', 'ok');
          if (FS.isConfigured() && (target.eventId || target.source === 'google')) {
            api.deleteMeeting(target).catch(function (err) { toast('No se pudo eliminar el evento en Google: ' + err.message, 'warn'); });
          }
        });
      });
    }
  }

  /* ----------------------------- Modal hito -------------------------------- */
  function openMilestoneModal(id) {
    var milestone = id ? milestoneById(id) : null;
    var m = milestone || { title: '', date: today(), status: 'planned', description: '' };

    var body = '<form id="milestone-form" novalidate><div class="form-grid">' +
      '<div class="field field--full"><label for="milestone-title">Título *</label><input id="milestone-title" name="title" required maxlength="140" value="' + esc(m.title) + '" placeholder="Ej. Publicar versión 1.0"></div>' +
      '<div class="field"><label for="milestone-date">Fecha *</label><input id="milestone-date" name="date" type="date" required value="' + esc(m.date) + '"></div>' +
      '<div class="field"><label for="milestone-status">Estado</label><select id="milestone-status" name="status">' +
        FS.MILESTONE_STATUSES.map(function (s) { return '<option value="' + s.id + '"' + (m.status === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field field--full"><label for="milestone-desc">Descripción</label><textarea id="milestone-desc" name="description" placeholder="Alcance, criterio de éxito, dependencias…">' + esc(m.description || '') + '</textarea></div>' +
    '</div></form>';

    var foot = (milestone ? '<button class="btn btn-danger btn-sm" type="button" id="milestone-delete">' + icon('delete') + ' Eliminar</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost" type="button" data-action="close-modal">Cancelar</button>' +
      '<button class="btn btn-primary" type="submit" form="milestone-form">' + (milestone ? 'Guardar cambios' : 'Crear hito') + '</button>';

    var handle = openModal({
      title: milestone ? 'Editar hito' : 'Nuevo hito',
      subtitle: milestone ? milestone.id : 'Los hitos aparecen en el roadmap agrupados por mes',
      body: body,
      foot: foot
    });

    var form = handle.root.querySelector('#milestone-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        title: form.title.value.trim(),
        date: form.date.value,
        status: form.status.value,
        description: form.description.value.trim()
      };
      if (!data.title || !data.date) { toast('Título y fecha son obligatorios.', 'warn'); return; }
      var saved = milestone ? store.updateMilestone(milestone.id, data) : store.addMilestone(data);
      handle.close();
      toast(milestone ? 'Hito actualizado.' : 'Hito creado.', 'ok');
      pushMilestoneRemote(saved);
    });

    var del = handle.root.querySelector('#milestone-delete');
    if (del) {
      del.addEventListener('click', function () {
        confirmDialog({ title: 'Eliminar hito', message: 'Se eliminará "' + milestone.title + '".', confirmLabel: 'Eliminar', danger: true })
          .then(function (ok) {
            if (!ok) return;
            store.deleteMilestone(milestone.id);
            handle.close();
            toast('Hito eliminado.', 'ok');
            if (FS.isConfigured()) api.deleteMilestone(milestone.id).catch(function (err) { toast('No se pudo eliminar en Google: ' + err.message, 'warn'); });
          });
      });
    }
  }

  /* ----------------------------- Apps Script ------------------------------- */
  function openAppsScript() {
    var s = FS.getSettings();
    var has = Boolean(s.apiUrl && s.token);

    var body =
      '<div class="callout' + (has ? '' : ' callout--warn') + '">' + icon(has ? 'info' : 'warning') +
        '<div>' + (has
          ? 'Estos datos se leen de la configuración guardada en este navegador. Puedes editarlos aquí o copiarlos; no están escritos en el código ni se suben a GitHub.'
          : 'Todavía no hay credenciales guardadas en este navegador. Pega la URL y el token, importa una conexión o usa Ajustes.') +
        '</div></div>' +
      '<div class="form-grid" style="margin-top:12px">' +
        '<div class="field field--full"><label for="apps-url">URL del Web App</label>' +
          '<div class="field__with-btn">' +
            '<input id="apps-url" class="mono" value="' + esc(s.apiUrl) + '" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-copy-apps="apiUrl" aria-label="Copiar URL" title="Copiar URL">' + icon('content_copy') + '<span class="btn-label">Copiar</span></button>' +
          '</div></div>' +
        '<div class="field field--full"><label for="apps-token">Token de acceso</label>' +
          '<div class="field__with-btn">' +
            '<input id="apps-token" class="mono" value="' + esc(s.token) + '" placeholder="Token generado por instalar()" autocomplete="off" spellcheck="false">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-copy-apps="token" aria-label="Copiar token" title="Copiar token">' + icon('content_copy') + '<span class="btn-label">Copiar</span></button>' +
          '</div></div>' +
      '</div>' +
      '<div class="field-row" style="margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" type="button" id="apps-download">' + icon('download') + ' Descargar TXT</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="apps-import">' + icon('upload') + ' Importar conexión</button>' +
        '<input type="file" id="apps-file" accept="application/json,.json" hidden>' +
        '<button class="btn btn-ghost btn-sm" type="button" id="apps-open-settings">' + icon('settings') + ' Más opciones en Ajustes</button>' +
      '</div>' +
      '<p class="faint small" style="margin:10px 0 0">El TXT descargado contiene el token. El token es equivalente a una contraseña: cualquiera que lo tenga puede escribir en la hoja y en el calendario.</p>';

    var foot =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">Cerrar</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-ghost btn-collapse" type="button" id="apps-copy-both" aria-label="Copiar URL y token" title="Copiar URL y token">' + icon('content_copy') + '<span class="btn-label">Copiar ambos</span></button>' +
      '<button class="btn btn-primary" type="button" id="apps-save">' + icon('save') + ' Guardar</button>';

    var handle = openModal({
      title: 'Apps Script',
      subtitle: 'URL y token de la conexión',
      body: body,
      foot: foot,
      wide: true
    });

    var urlInput = handle.root.querySelector('#apps-url');
    var tokenInput = handle.root.querySelector('#apps-token');
    var fileInput = handle.root.querySelector('#apps-file');

    function readInputs() {
      return { apiUrl: urlInput.value.trim(), token: tokenInput.value.trim() };
    }

    Array.prototype.forEach.call(handle.root.querySelectorAll('[data-copy-apps]'), function (btn) {
      btn.addEventListener('click', function () {
        var values = readInputs();
        var value = btn.getAttribute('data-copy-apps') === 'token' ? values.token : values.apiUrl;
        if (!value) {
          toast('No hay nada que copiar todavía.', 'warn');
          return;
        }
        U.copy(value).then(function () {
          toast(btn.getAttribute('data-copy-apps') === 'token' ? 'Token copiado.' : 'URL copiada.', 'ok');
        }).catch(function () {
          toast('No se pudo copiar. Selecciona el texto manualmente.', 'warn');
        });
      });
    });

    handle.root.querySelector('#apps-copy-both').addEventListener('click', function () {
      var values = readInputs();
      if (!values.apiUrl || !values.token) {
        toast('Faltan la URL o el token.', 'warn');
        return;
      }
      U.copy('URL: ' + values.apiUrl + '\nToken: ' + values.token).then(function () {
        toast('URL y token copiados.', 'ok');
      }).catch(function () {
        toast('No se pudo copiar. Selecciona el texto manualmente.', 'warn');
      });
    });

    handle.root.querySelector('#apps-save').addEventListener('click', function () {
      var values = readInputs();
      if (!values.apiUrl) {
        toast('Pega la URL del Web App.', 'warn');
        urlInput.focus();
        return;
      }
      if (!values.token) {
        toast('Pega el token de acceso.', 'warn');
        tokenInput.focus();
        return;
      }
      FS.saveSettings(values);
      refreshConnection(true);
      handle.close();
      openAppsScript();
      toast('Conexión guardada en este navegador.', 'ok');
    });

    handle.root.querySelector('#apps-download').addEventListener('click', function () {
      var values = readInputs();
      if (!values.apiUrl || !values.token) {
        toast('Faltan la URL o el token para descargar.', 'warn');
        return;
      }
      var text = 'Fundaserinco · Seguimiento\n' +
        'Conexión Apps Script\n\n' +
        'URL del Web App:\n' + values.apiUrl + '\n\n' +
        'Token de acceso:\n' + values.token + '\n\n' +
        'Generado: ' + new Date().toLocaleString('es-CO') + '\n';
      U.download('fundaserinco-apps-script.txt', text, 'text/plain;charset=utf-8');
      toast('TXT descargado. Contiene el token: guárdalo en un lugar privado.', 'ok');
    });

    handle.root.querySelector('#apps-import').addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function (e) {
      var input = e.target;
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var next = data && data.settings ? data.settings : data;
          if (!next || typeof next.apiUrl !== 'string' || !next.apiUrl.trim()) {
            throw new Error('El archivo no contiene una URL válida.');
          }
          if (typeof next.token !== 'string' || !next.token.trim()) {
            throw new Error('El archivo no contiene el token.');
          }
          var current = FS.getSettings();
          FS.saveSettings({
            apiUrl: next.apiUrl.trim(),
            token: next.token.trim(),
            calendarId: typeof next.calendarId === 'string' && next.calendarId.trim() ? next.calendarId.trim() : current.calendarId,
            timezone: typeof next.timezone === 'string' && next.timezone ? next.timezone : current.timezone,
            meetByDefault: typeof next.meetByDefault === 'boolean' ? next.meetByDefault : current.meetByDefault
          });
          refreshConnection(true);
          handle.close();
          openAppsScript();
          toast('Conexión importada y guardada.', 'ok');
        } catch (err) {
          toast('No se pudo importar la conexión: ' + err.message, 'err');
        } finally {
          input.value = '';
        }
      };
      reader.readAsText(file);
    });

    handle.root.querySelector('#apps-open-settings').addEventListener('click', function () {
      handle.close();
      openSettings();
    });
  }

  /* ------------------------------- Ajustes --------------------------------- */
  function openSettings() {
    var s = FS.getSettings();
    var online = connection.state === 'online';

    var body =
      '<form id="settings-form" novalidate>' +
        '<div class="section-title">' + icon('cloud') + 'Conexión con Google</div>' +
        '<div class="form-grid">' +
          '<div class="field field--full"><label for="settings-url">URL del Web App (Apps Script)</label>' +
            '<div class="field__with-btn">' +
              '<input id="settings-url" name="apiUrl" value="' + esc(s.apiUrl) + '" placeholder="https://script.google.com/macros/s/…/exec">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-copy-field="apiUrl" aria-label="Copiar URL" title="Copiar URL">' + icon('content_copy') + '<span class="btn-label">Copiar</span></button>' +
            '</div>' +
            '<span class="field__hint">Termina en <code>/exec</code>. Se obtiene al implementar el script como aplicación web.</span></div>' +
          '<div class="field field--full"><label for="settings-token">Token de acceso</label>' +
            '<div class="field__with-btn">' +
              '<input id="settings-token" name="token" value="' + esc(s.token) + '" placeholder="Token generado por la función instalar()" autocomplete="off" spellcheck="false">' +
              '<button class="btn btn-ghost btn-sm" type="button" data-copy-field="token" aria-label="Copiar token" title="Copiar token">' + icon('content_copy') + '<span class="btn-label">Copiar</span></button>' +
            '</div>' +
            '<span class="field__hint">Se guarda solo en este navegador (localStorage). No lo subas a GitHub.</span></div>' +
          '<div class="field"><label for="settings-calendar">ID de calendario</label><input id="settings-calendar" name="calendarId" value="' + esc(s.calendarId) + '" placeholder="primary"><span class="field__hint"><code>primary</code> es tu calendario principal.</span></div>' +
          '<div class="field"><label for="settings-timezone">Zona horaria</label><select id="settings-timezone" name="timezone">' +
            FS.TIMEZONES.map(function (tz) { return '<option value="' + tz + '"' + (s.timezone === tz ? ' selected' : '') + '>' + tz + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field field--full"><label class="switch-row"><input type="checkbox" id="settings-meet" name="meetByDefault"' + (s.meetByDefault ? ' checked' : '') + '>' +
            '<span class="switch-row__text"><span class="switch-row__title">Crear Meet por defecto</span>' +
            '<span class="switch-row__hint">Marca la casilla automáticamente al crear reuniones cuando Google esté conectado.</span></span></label></div>' +
        '</div>' +
        '<div class="field-row" style="margin-top:12px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" type="button" id="settings-export-connection">' + icon('download') + ' Exportar conexión</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" id="settings-import-connection">' + icon('upload') + ' Importar conexión</button>' +
          '<input type="file" id="settings-connection-file" accept="application/json,.json" hidden>' +
        '</div>' +
        '<p class="faint small" style="margin:6px 0 0">El archivo de conexión contiene el token. Guárdalo en un lugar privado y no lo subas a GitHub.</p>' +
        '<div id="settings-test-result" style="margin-top:12px"></div>' +
        '<div class="field-row" style="margin-top:12px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" type="button" id="settings-test">' + icon('network_check') + ' Probar conexión</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" id="settings-sync">' + icon('cloud_sync') + ' Sincronizar ahora</button>' +
          '<span class="faint small" style="margin-left:auto">' + (online ? 'Conectado' : 'Sin verificar') + '</span>' +
        '</div>' +
        '<details class="settings-block" style="margin-top:14px">' +
          '<summary>' + icon('menu_book') + 'Cómo conectar Google Sheets y Calendar</summary>' +
          '<ol>' +
            '<li>Crea una hoja de cálculo en Google Sheets y abre <strong>Extensiones → Apps Script</strong>.</li>' +
            '<li>Copia el contenido de <code>google-apps-script/Code.gs</code> y <code>appsscript.json</code> de este proyecto.</li>' +
            '<li>Ejecuta la función <code>instalar</code>, autoriza los permisos y copia el <strong>TOKEN</strong> que aparece en el registro de ejecución.</li>' +
            '<li>Implementa como <strong>Aplicación web</strong>: ejecutar como tú, acceso <strong>Cualquier persona</strong>. Copia la URL <code>/exec</code>.</li>' +
            '<li>Pega la URL y el token aquí, guarda y pulsa <strong>Probar conexión</strong>.</li>' +
          '</ol>' +
          '<p class="small muted" style="margin:8px 0 0">Para Meet automático, el manifiesto habilita el servicio avanzado <strong>Google Calendar API</strong>. La guía completa está en <code>estado-del-proyecto.txt</code>.</p>' +
        '</details>' +
        '<div class="section-title" style="margin-top:20px">' + icon('database') + 'Datos locales</div>' +
        '<div class="callout">' + icon('shield') +
          '<div>Tu información vive en este navegador. Exporta un respaldo antes de limpiar datos o cambiar de equipo. La sincronización con Google no elimina la copia local.</div></div>' +
        '<div class="field-row" style="margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" type="button" id="settings-export">' + icon('download') + ' Exportar JSON</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" id="settings-import">' + icon('upload') + ' Importar JSON</button>' +
          '<input type="file" id="settings-file" accept="application/json,.json" hidden>' +
          '<button class="btn btn-danger btn-sm" type="button" id="settings-reset" style="margin-left:auto">' + icon('delete_forever') + ' Borrar datos locales</button>' +
        '</div>' +
        '<p class="faint small" style="margin-top:10px">Última sincronización: ' +
          (store.getState().meta.lastSync ? esc(U.formatDateTime(store.getState().meta.lastSync)) : 'nunca') + '</p>' +
      '</form>';

    var foot =
      '<button class="btn btn-ghost" type="button" data-action="close-modal">Cerrar</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary" type="submit" form="settings-form">Guardar ajustes</button>';

    var handle = openModal({
      title: 'Ajustes',
      subtitle: 'Conexión, respaldos y zona horaria',
      body: body,
      foot: foot,
      wide: true
    });

    var form = handle.root.querySelector('#settings-form');
    var result = handle.root.querySelector('#settings-test-result');

    function readSettings() {
      return {
        apiUrl: form.apiUrl.value.trim(),
        token: form.token.value.trim(),
        calendarId: form.calendarId.value.trim() || 'primary',
        timezone: form.timezone.value,
        meetByDefault: form.meetByDefault.checked
      };
    }

    Array.prototype.forEach.call(handle.root.querySelectorAll('[data-copy-field]'), function (btn) {
      btn.addEventListener('click', function () {
        var field = form.elements[btn.getAttribute('data-copy-field')];
        var value = field ? field.value.trim() : '';
        if (!value) {
          toast('No hay nada que copiar todavía.', 'warn');
          return;
        }
        U.copy(value).then(function () {
          toast(btn.getAttribute('data-copy-field') === 'token' ? 'Token copiado.' : 'URL copiada.', 'ok');
        }).catch(function () {
          toast('No se pudo copiar. Selecciona el texto manualmente.', 'warn');
        });
      });
    });

    handle.root.querySelector('#settings-export-connection').addEventListener('click', function () {
      var values = readSettings();
      if (!values.apiUrl || !values.token) {
        toast('Completa la URL y el token antes de exportar.', 'warn');
        return;
      }
      U.download('fundaserinco-conexion.json', JSON.stringify({
        type: 'fundaserinco-connection',
        version: 1,
        exported: new Date().toISOString(),
        settings: values
      }, null, 2), 'application/json');
      toast('Conexión exportada. Contiene el token: guárdala en un lugar privado.', 'ok');
    });

    handle.root.querySelector('#settings-import-connection').addEventListener('click', function () {
      handle.root.querySelector('#settings-connection-file').click();
    });

    handle.root.querySelector('#settings-connection-file').addEventListener('change', function (e) {
      var input = e.target;
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var s = data && data.settings ? data.settings : data;
          if (!s || typeof s !== 'object' || typeof s.apiUrl !== 'string' || !s.apiUrl.trim()) {
            throw new Error('El archivo no contiene una URL válida.');
          }
          if (typeof s.token !== 'string' || !s.token.trim()) {
            throw new Error('El archivo no contiene el token.');
          }
          form.apiUrl.value = s.apiUrl.trim();
          form.token.value = s.token.trim();
          form.calendarId.value = typeof s.calendarId === 'string' && s.calendarId.trim() ? s.calendarId.trim() : 'primary';
          if (typeof s.timezone === 'string' && s.timezone) form.timezone.value = s.timezone;
          form.meetByDefault.checked = Boolean(s.meetByDefault);
          if (FS.glass) FS.glass.refresh(form.timezone);
          FS.saveSettings(readSettings());
          result.innerHTML = '<div class="callout callout--ok">' + icon('check_circle') +
            '<div><strong>Conexión importada.</strong> Ya está guardada en este navegador. Usa <em>Probar conexión</em> para verificarla.</div></div>';
          refreshConnection(true);
          toast('Conexión importada y guardada.', 'ok');
        } catch (err) {
          toast('No se pudo importar la conexión: ' + err.message, 'err');
        } finally {
          input.value = '';
        }
      };
      reader.readAsText(file);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      FS.saveSettings(readSettings());
      handle.close();
      refreshConnection(true);
      toast('Ajustes guardados.', 'ok');
    });

    handle.root.querySelector('#settings-test').addEventListener('click', function (e) {
      var btn = e.currentTarget;
      var values = readSettings();
      result.innerHTML = '<div class="callout">' + icon('hourglass_top') + '<div>Probando conexión con Google…</div></div>';
      btn.disabled = true;
      api.ping(values).then(function (data) {
        result.innerHTML = '<div class="callout callout--ok">' + icon('check_circle') +
          '<div><strong>Conectado.</strong> ' + esc(data && data.spreadsheet ? 'Hoja: ' + data.spreadsheet : 'El Web App respondió correctamente.') + '</div></div>';
        FS.saveSettings(values);
        setConnection('online');
        renderChrome();
      }).catch(function (err) {
        result.innerHTML = '<div class="callout callout--warn">' + icon('error') +
          '<div><strong>No se pudo conectar.</strong> ' + esc(err.message) + '</div></div>';
        setConnection(FS.isConfigured() ? 'error' : 'local', err.message);
      }).finally(function () { btn.disabled = false; });
    });

    handle.root.querySelector('#settings-sync').addEventListener('click', function () {
      FS.saveSettings(readSettings());
      handle.close();
      syncNow();
    });

    handle.root.querySelector('#settings-export').addEventListener('click', exportJson);
    handle.root.querySelector('#settings-import').addEventListener('click', function () {
      handle.root.querySelector('#settings-file').click();
    });
    handle.root.querySelector('#settings-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          var counts = store.importData(data, false);
          handle.close();
          toast('Importado: ' + counts.tasks + (counts.tasks === 1 ? ' tarea, ' : ' tareas, ') +
            counts.meetings + (counts.meetings === 1 ? ' reunión, ' : ' reuniones, ') +
            counts.milestones + (counts.milestones === 1 ? ' hito.' : ' hitos.'), 'ok');
        } catch (err) {
          toast('No se pudo importar: ' + err.message, 'err');
        }
      };
      reader.readAsText(file);
    });

    handle.root.querySelector('#settings-reset').addEventListener('click', function () {
      confirmDialog({
        title: 'Borrar todos los datos locales',
        message: 'Se eliminarán tareas, reuniones e hitos de este navegador. Los datos de Google Sheets no se tocan. Exporta un respaldo antes de continuar.',
        confirmLabel: 'Borrar datos',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        store.resetAll();
        handle.close();
        toast('Datos locales eliminados.', 'ok');
      });
    });
  }

  /* ---------------------------- Integración Google ------------------------- */
  function setConnection(state, detail) {
    connection.state = state;
    connection.detail = detail || '';
    renderChrome();
  }

  function refreshConnection(silent) {
    if (!FS.isConfigured()) {
      setConnection('local');
      return;
    }
    setConnection('checking');
    api.ping().then(function () {
      setConnection('online');
      if (!silent) toast('Conexión con Google verificada.', 'ok');
    }).catch(function (err) {
      setConnection('error', err.message);
      if (!silent) toast('No se pudo conectar con Google: ' + err.message, 'warn');
    });
  }

  function syncNow() {
    if (!FS.isConfigured()) {
      toast('Configura primero la URL y el token en Ajustes.', 'warn');
      openSettings();
      return;
    }
    toast('Sincronizando con Google Sheets…', 'info');
    api.list().then(function (data) {
      var counts = store.mergeRemote(data || {});
      var state = store.getState();
      return api.bulkUpsert({
        tasks: state.tasks,
        meetings: state.meetings,
        milestones: state.milestones
      }).then(function () {
        store.markSynced();
        setConnection('online');
        render();
        toast('Sincronizado. Descargados: ' + counts.tasks + ' tareas, ' + counts.meetings + ' reuniones, ' + counts.milestones + ' hitos.', 'ok');
      });
    }).catch(function (err) {
      setConnection('error', err.message);
      toast('Error al sincronizar: ' + err.message, 'err');
    });
  }

  function importCalendar() {
    if (!FS.isConfigured()) {
      toast('Conecta Google para importar eventos del calendario.', 'warn');
      openSettings();
      return;
    }
    var from = new Date();
    from.setMonth(from.getMonth() - 1);
    var to = new Date();
    to.setMonth(to.getMonth() + 4);
    toast('Importando eventos del calendario…', 'info');
    api.importCalendar(U.toISODate(from), U.toISODate(to)).then(function (events) {
      var state = store.getState();
      var added = 0;
      (events || []).forEach(function (ev) {
        if (!ev || !ev.date) return;
        var exists = state.meetings.some(function (m) {
          if (m.date !== ev.date || m.start !== ev.start) return false;
          return (ev.eventId && m.eventId === ev.eventId) || m.title === ev.title;
        });
        if (exists) return;
        store.addMeeting({
          title: ev.title || 'Evento de Google Calendar',
          date: ev.date,
          start: ev.start || '09:00',
          duration: ev.duration || 30,
          category: 'other',
          attendees: ev.attendees || [],
          notes: ev.notes || '',
          meetLink: ev.meetLink || '',
          eventLink: ev.eventLink || '',
          eventId: ev.eventId || '',
          source: 'google'
        });
        added += 1;
      });
      setConnection('online');
      render();
      toast(added ? 'Se importaron ' + added + ' eventos.' : 'No había eventos nuevos por importar.', added ? 'ok' : 'info');
    }).catch(function (err) {
      setConnection('error', err.message);
      toast('No se pudo importar el calendario: ' + err.message, 'err');
    });
  }

  function exportJson() {
    var data = store.exportData();
    U.download('fundaserinco-seguimiento-' + today() + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Respaldo JSON descargado.', 'ok');
  }

  function exportCsv() {
    var tasks = store.getState().tasks;
    if (!tasks.length) {
      toast('No hay tareas para exportar.', 'warn');
      return;
    }
    var rows = [['ID', 'Título', 'Estado', 'Prioridad', 'Puntos', 'Responsable', 'Etiquetas', 'Vencimiento', 'Creado', 'Actualizado', 'Completado', 'Descripción']];
    tasks.forEach(function (t) {
      rows.push([
        t.id, t.title, FS.findStatus(t.status).label, FS.findPriority(t.priority).label,
        t.points, t.assignee, (t.tags || []).join(' | '), t.due,
        t.created, t.updated, t.completedAt || '', t.description
      ]);
    });
    var csv = rows.map(function (row) { return row.map(U.csvCell).join(','); }).join('\r\n');
    U.download('fundaserinco-tareas-' + today() + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
    toast('CSV de tareas descargado.', 'ok');
  }

  /* ------------------------------ Drag & drop ------------------------------ */
  function bindDragAndDrop() {
    var targetCol = null;

    document.addEventListener('dragstart', function (e) {
      var card = e.target.closest && e.target.closest('.task-card');
      if (!card) return;
      ui.dragId = card.dataset.id;
      ui.dragging = true;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (err) { /* noop */ }
    });

    document.addEventListener('dragend', function (e) {
      var card = e.target.closest && e.target.closest('.task-card');
      if (card) card.classList.remove('dragging');
      ui.dragId = null;
      ui.dragging = false;
      ui.justDragged = Date.now();
      if (targetCol) { targetCol.classList.remove('drop-target'); targetCol = null; }
    });

    document.addEventListener('dragover', function (e) {
      if (!ui.dragId) return;
      var col = e.target.closest && e.target.closest('.kanban-col');
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (targetCol !== col) {
        if (targetCol) targetCol.classList.remove('drop-target');
        targetCol = col;
        col.classList.add('drop-target');
      }
    });

    document.addEventListener('dragleave', function (e) {
      var col = e.target.closest && e.target.closest('.kanban-col');
      if (col && targetCol === col && !col.contains(e.relatedTarget)) {
        col.classList.remove('drop-target');
        targetCol = null;
      }
    });

    document.addEventListener('drop', function (e) {
      var col = e.target.closest && e.target.closest('.kanban-col');
      if (!col) return;
      e.preventDefault();
      var id = ui.dragId || e.dataTransfer.getData('text/plain');
      var status = col.dataset.status;
      col.classList.remove('drop-target');
      targetCol = null;
      ui.dragId = null;
      ui.dragging = false;
      ui.justDragged = Date.now();
      if (!id || !status) return;
      var task = taskById(id);
      if (!task || task.status === status) return;
      var updated = store.moveTask(id, status);
      toast('Movida a ' + FS.findStatus(status).label + '.', 'ok');
      pushTaskRemote(updated);
    });
  }

  /* -------------------------------- Acciones ------------------------------- */
  function handleAction(action, el, e) {
    if (action === 'edit-task') {
      if (ui.dragging || Date.now() - ui.justDragged < 320) return;
      openTaskModal(el.dataset.id);
      return;
    }
    if (action === 'edit-meeting') { openMeetingModal(el.dataset.id); return; }
    if (action === 'edit-milestone') { openMilestoneModal(el.dataset.id); return; }

    switch (action) {
      case 'toggle-theme':
        FS.setTheme(FS.getTheme() === 'dark' ? 'light' : 'dark');
        updateThemeIcon();
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'open-terminal':
        openTerminal();
        break;
      case 'close-terminal':
        closeTerminal();
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'close-modal':
        closeTopModal();
        break;
      case 'dismiss-tutorial':
        dismissTutorial(el.dataset.tutorial);
        break;
      case 'show-tutorial':
        showTutorial(el.dataset.tutorial);
        break;
      case 'open-apps-script':
        openAppsScript();
        break;
      case 'new-task':
        openTaskModal(null, el.dataset.status ? { status: el.dataset.status } : null);
        break;
      case 'new-meeting':
        openMeetingModal(null, el.dataset.date ? { date: el.dataset.date } : null);
        break;
      case 'new-milestone':
        openMilestoneModal();
        break;
      case 'sync':
        syncNow();
        break;
      case 'import-calendar':
        importCalendar();
        break;
      case 'export-csv':
        exportCsv();
        break;
      case 'cal-prev':
        ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth() - 1, 1);
        renderMeetings();
        break;
      case 'cal-next':
        ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth() + 1, 1);
        renderMeetings();
        break;
      case 'cal-today':
        ui.calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        renderMeetings();
        break;
      case 'cal-view':
        ui.calView = el.dataset.calView || 'month';
        renderMeetings();
        break;
      case 'open-meet': {
        var m = meetingById(el.dataset.id);
        if (m && m.meetLink) window.open(m.meetLink, '_blank', 'noopener');
        else if (m) {
          var url = api.calendarTemplateUrl(m);
          window.open(url, '_blank', 'noopener');
          toast('Esta reunión no tiene Meet. Se abrió la plantilla de Calendar.', 'info');
        }
        break;
      }
      case 'copy-invite': {
        var mc = meetingById(el.dataset.id);
        if (!mc) break;
        U.copy(api.inviteText(mc)).then(function () { toast('Invitación copiada al portapapeles.', 'ok'); })
          .catch(function () { toast('No se pudo copiar automáticamente.', 'warn'); });
        break;
      }
      case 'toggle-milestone': {
        var ms = milestoneById(el.dataset.id);
        if (!ms) break;
        var order = ['planned', 'in_progress', 'done'];
        var next = order[(order.indexOf(ms.status) + 1) % order.length];
        var savedMs = store.updateMilestone(ms.id, { status: next });
        toast('Hito: ' + FS.findMilestoneStatus(next).label + '.', 'ok');
        pushMilestoneRemote(savedMs);
        break;
      }
      case 'clear-task-filters':
        ui.tasksSearch = '';
        ui.tasksStatus = 'all';
        ui.tasksPriority = 'all';
        ui.tasksSort = 'updated';
        $('#tasks-search').value = '';
        $('#tasks-filter-status').value = 'all';
        $('#tasks-filter-priority').value = 'all';
        $('#tasks-sort').value = 'updated';
        if (FS.glass) {
          FS.glass.refresh($('#tasks-filter-status'));
          FS.glass.refresh($('#tasks-filter-priority'));
          FS.glass.refresh($('#tasks-sort'));
        }
        renderTasks();
        break;
      default:
        break;
    }
  }

  function onDocumentClick(e) {
    var viewBtn = e.target.closest('.nav-item[data-view]');
    if (viewBtn) {
      navigate(viewBtn.dataset.view);
      return;
    }
    var actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      e.preventDefault();
      handleAction(actionEl.dataset.action, actionEl, e);
      return;
    }
    var dayEl = e.target.closest('.cal-day[data-date]');
    if (dayEl && !e.target.closest('button')) {
      openMeetingModal(null, { date: dayEl.dataset.date });
    }
  }

  function onKeydown(e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    if (e.key === 'Escape') {
      if (modalStack.length) { closeTopModal(); return; }
      if ($('#terminal').classList.contains('is-open') && !typing) { closeTerminal(); return; }
      if ($('#sidebar').classList.contains('is-open')) { closeSidebar(); return; }
    }

    if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if ($('#terminal').classList.contains('is-open')) closeTerminal();
      else openTerminal();
      return;
    }

    if (typing || modalStack.length) return;

    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest) {
      var roleButton = e.target.closest('[role="button"][data-action]');
      if (roleButton) {
        e.preventDefault();
        handleAction(roleButton.dataset.action, roleButton, e);
        return;
      }
    }

    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openTaskModal();
    } else if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openMeetingModal();
    } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      openTerminal();
      if (FS.terminal && FS.terminal.help) FS.terminal.help();
    }
  }

  function bindFilters() {
    var boardSearch = $('#board-search');
    boardSearch.addEventListener('input', U.debounce(function () {
      ui.boardSearch = boardSearch.value.trim();
      renderBoard();
    }, 140));
    $('#board-filter-priority').addEventListener('change', function (e) {
      ui.boardPriority = e.target.value;
      renderBoard();
    });
    $('#board-filter-assignee').addEventListener('change', function (e) {
      ui.boardAssignee = e.target.value;
      renderBoard();
    });

    var tasksSearch = $('#tasks-search');
    tasksSearch.addEventListener('input', U.debounce(function () {
      ui.tasksSearch = tasksSearch.value.trim();
      renderTasks();
    }, 140));
    $('#tasks-filter-status').addEventListener('change', function (e) {
      ui.tasksStatus = e.target.value;
      renderTasks();
    });
    $('#tasks-filter-priority').addEventListener('change', function (e) {
      ui.tasksPriority = e.target.value;
      renderTasks();
    });
    $('#tasks-sort').addEventListener('change', function (e) {
      ui.tasksSort = e.target.value;
      renderTasks();
    });
  }

  /* --------------------------------- Init ---------------------------------- */
  function init() {
    ui.view = routeFromHash();
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeydown);
    bindDragAndDrop();
    bindFilters();

    $('#sidebar-backdrop').addEventListener('click', closeSidebar);
    window.addEventListener('hashchange', function () {
      ui.view = routeFromHash();
      render();
    });

    window.addEventListener('storage', function (e) {
      if (e.key === FS.STORAGE.data) store.onExternalChange();
      if (e.key === FS.STORAGE.theme) {
        var theme = e.newValue || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeIcon();
      }
    });

    document.addEventListener('fs:theme', updateThemeIcon);

    store.subscribe(function () {
      renderChrome();
      renderCurrent();
    });

    render();
    applyTutorialState();
    refreshConnection(true);

    var seenKey = 'fs.seguimiento.seen';
    try {
      if (!localStorage.getItem(seenKey) && !store.getState().tasks.length) {
        localStorage.setItem(seenKey, '1');
        setTimeout(function () {
          toast('Crea tu primera tarea con el botón "Nueva tarea" o escribe help en la terminal.', 'info', 'Bienvenido a Fundaserinco');
        }, 900);
      }
    } catch (err) { /* noop */ }
  }

  /* --------------------------- API para terminal --------------------------- */
  FS.app = {
    navigate: navigate,
    render: render,
    renderCurrent: renderCurrent,
    toast: toast,
    openTaskModal: openTaskModal,
    openMeetingModal: openMeetingModal,
    openMilestoneModal: openMilestoneModal,
    openSettings: openSettings,
    openTerminal: openTerminal,
    closeTerminal: closeTerminal,
    syncNow: syncNow,
    exportJson: exportJson,
    exportCsv: exportCsv,
    refreshConnection: refreshConnection,
    confirm: confirmDialog,
    getUi: function () { return ui; },
    isModalOpen: function () { return modalStack.length > 0; },
    setConnection: setConnection,
    getConnection: function () { return connection; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.FS);

