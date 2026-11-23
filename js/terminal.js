/* Fundaserinco · Seguimiento — terminal de comandos */
window.FS = window.FS || {};

(function (FS) {
  'use strict';

  var U = FS.utils;
  var store = FS.store;

  var body, input;
  var history = [];
  var historyIndex = 0;
  var bannerShown = false;

  var STATUS_ALIASES = {
    backlog: 'backlog', pendiente: 'backlog', idea: 'backlog',
    todo: 'todo', porhacer: 'todo', hacer: 'todo', listo: 'todo',
    progreso: 'in_progress', enprogreso: 'in_progress', doing: 'in_progress', curso: 'in_progress',
    revision: 'review', review: 'review', revisar: 'review',
    hecho: 'done', done: 'done', completado: 'done', listohecho: 'done'
  };

  var PRIORITY_ALIASES = {
    urgente: 'urgent', urgent: 'urgent', p0: 'urgent',
    alta: 'high', high: 'high', p1: 'high',
    media: 'medium', medium: 'medium', normal: 'medium', p2: 'medium',
    baja: 'low', low: 'low', p3: 'low'
  };

  var COMMANDS = [
    'help', 'ls', 'add', 'edit', 'done', 'mv', 'rm', 'meet', 'stats',
    'board', 'tasks', 'metrics', 'roadmap', 'meetings', 'theme', 'sync',
    'export', 'settings', 'config', 'clear', 'version', 'date', 'echo'
  ];

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_-]+/g, '');
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function print(text, cls) {
    var line = el('div', 'term-line' + (cls ? ' term-line--' + cls : ''));
    line.textContent = text;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    return line;
  }

  function printHtml(html, cls) {
    var line = el('div', 'term-line' + (cls ? ' term-line--' + cls : ''), html);
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    return line;
  }

  function printLink(label, url) {
    var line = el('div', 'term-line term-line--accent');
    line.appendChild(document.createTextNode(label + ' '));
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = url;
    a.style.color = '#7CC7F0';
    a.style.wordBreak = 'break-all';
    line.appendChild(a);
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  function promptHtml(cmd) {
    return '<span class="term-line__prompt">fundaserinco:~$</span> ' + U.esc(cmd);
  }

  function echo(cmd) {
    var line = el('div', 'term-line term-line--cmd');
    line.innerHTML = promptHtml(cmd);
    body.appendChild(line);
  }

  function banner() {
    if (bannerShown) return;
    bannerShown = true;
    print('Fundaserinco · Seguimiento v' + FS.APP_VERSION, 'accent');
    print('Terminal conectada al mismo estado que la interfaz. Nada de esto es de mentira.', 'muted');
    var online = FS.app.getConnection().state === 'online';
    print('Modo: ' + (online ? 'Google Sheets conectado' : 'local (los datos viven en este navegador)'), online ? 'ok' : 'muted');
    print('Escribe "help" para ver los comandos disponibles.', 'muted');
    print('');
  }

  function help() {
    banner();
    print('Comandos disponibles', 'accent');
    var rows = [
      ['help', 'Muestra esta ayuda'],
      ['ls [estado]', 'Lista tareas (backlog, todo, progreso, revision, hecho)'],
      ['add "Título" [estado] [prioridad] [puntos]', 'Crea una tarea'],
      ['edit <id>', 'Abre la tarea en un modal'],
      ['done <id>', 'Marca una tarea como hecha'],
      ['mv <id> <estado>', 'Cambia el estado de una tarea'],
      ['rm <id>', 'Elimina una tarea'],
      ['meet "Título" [YYYY-MM-DD] [HH:MM] [min]', 'Crea una reunión (y Meet si hay Google)'],
      ['stats', 'Resumen de tareas, puntos y reuniones'],
      ['board | tasks | metrics | roadmap | meetings', 'Navega entre vistas'],
      ['theme [dark|light]', 'Cambia el tema'],
      ['sync', 'Sincroniza con Google Sheets'],
      ['export [json|csv]', 'Descarga un respaldo'],
      ['settings', 'Abre los ajustes de Google'],
      ['config', 'Muestra la configuración actual'],
      ['clear', 'Limpia la terminal'],
      ['version', 'Versión del sistema'],
      ['date', 'Fecha y hora actual'],
      ['echo <texto>', 'Repite el texto']
    ];
    rows.forEach(function (row) {
      var line = el('div', 'term-line');
      var cmd = el('span', null, U.esc(row[0].padEnd(46, ' ')));
      cmd.style.color = '#EEF3FF';
      var desc = el('span', 'term-line--muted', U.esc(row[1]));
      line.appendChild(cmd);
      line.appendChild(desc);
      body.appendChild(line);
    });
    print('');
    print('Estados: backlog · todo · progreso · revision · hecho', 'muted');
    print('Prioridades: urgente · alta · media · baja', 'muted');
    print('También puedes mover tarjetas arrastrando en el tablero.', 'muted');
    body.scrollTop = body.scrollHeight;
  }

  function tokenize(raw) {
    var tokens = [];
    var re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    var match;
    while ((match = re.exec(raw)) !== null) {
      tokens.push(match[1] != null ? match[1] : match[2] != null ? match[2] : match[3]);
    }
    return tokens;
  }

  function resolveTaskId(ref) {
    if (!ref) return null;
    var clean = String(ref).trim().toUpperCase();
    var numeric = /^(\d+)$/.exec(clean) || /^FS-?(\d+)$/.exec(clean);
    var candidate = numeric ? 'FS-' + String(Number(numeric[1])).padStart(3, '0') : clean;
    var exact = store.getState().tasks.find(function (t) { return t.id.toUpperCase() === candidate; });
    if (exact) return exact;
    var matches = store.getState().tasks.filter(function (t) { return t.id.toUpperCase().indexOf(candidate) === 0; });
    return matches.length === 1 ? matches[0] : null;
  }

  function statusFrom(value) {
    if (!value) return null;
    var id = STATUS_ALIASES[normalize(value)];
    return id || null;
  }

  function priorityFrom(value) {
    if (!value) return null;
    return PRIORITY_ALIASES[normalize(value)] || null;
  }

  function formatTask(task) {
    var status = FS.findStatus(task.status).label;
    var priority = FS.findPriority(task.priority).label;
    var due = task.due ? ' · vence ' + U.formatDate(task.due) : '';
    return task.id.padEnd(8) + ' [' + status.padEnd(11) + '] ' + priority.padEnd(8) + ' ' + task.title + due;
  }

  function listTasks(statusArg) {
    var status = statusArg ? statusFrom(statusArg) : null;
    if (statusArg && !status) {
      print('Estado no reconocido: "' + statusArg + '". Usa backlog, todo, progreso, revision o hecho.', 'warn');
      return;
    }
    var tasks = store.getState().tasks.slice().sort(function (a, b) { return a.id.localeCompare(b.id); });
    if (status) tasks = tasks.filter(function (t) { return t.status === status; });
    if (!tasks.length) {
      print(status ? 'No hay tareas en estado ' + FS.findStatus(status).label + '.' : 'No hay tareas todavía. Crea una con: add "Mi primera tarea"', 'muted');
      return;
    }
    tasks.forEach(function (task) {
      var line = el('div', 'term-line');
      line.textContent = formatTask(task);
      if (task.status === 'done') line.classList.add('term-line--ok');
      body.appendChild(line);
    });
    body.scrollTop = body.scrollHeight;
    print(tasks.length + (tasks.length === 1 ? ' tarea.' : ' tareas.'), 'muted');
  }

  function addTask(tokens) {
    if (!tokens.length) {
      print('Uso: add "Título" [estado] [prioridad] [puntos]', 'warn');
      return;
    }
    var titleParts = [];
    var status = 'todo';
    var priority = 'medium';
    var points = 0;

    tokens.forEach(function (token, index) {
      var s = statusFrom(token);
      var p = priorityFrom(token);
      if (index > 0 && /^\d+$/.test(token)) { points = Number(token); return; }
      if (index > 0 && s) { status = s; return; }
      if (index > 0 && p) { priority = p; return; }
      titleParts.push(token);
    });

    var title = titleParts.join(' ').trim();
    if (!title) {
      print('Falta el título. Uso: add "Título" [estado] [prioridad] [puntos]', 'warn');
      return;
    }

    var task = store.addTask({ title: title, status: status, priority: priority, points: points });
    print('✓ Tarea creada: ' + task.id + ' · ' + task.title, 'ok');
    print('  Estado: ' + FS.findStatus(status).label + ' · Prioridad: ' + FS.findPriority(priority).label + (points ? ' · ' + points + ' SP' : ''), 'muted');
    if (FS.isConfigured()) {
      FS.api.upsertTask(task).then(function () {
        print('  Sincronizada con Google Sheets.', 'ok');
      }).catch(function (err) {
        print('  Guardada localmente. Google: ' + err.message, 'warn');
      });
    }
  }

  function meet(tokens) {
    if (!tokens.length) {
      print('Uso: meet "Título" [YYYY-MM-DD] [HH:MM] [minutos]', 'warn');
      return;
    }
    var titleParts = [];
    var date = U.todayISO();
    var start = '09:00';
    var duration = 30;

    tokens.forEach(function (token, index) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(token)) { date = token; return; }
      if (/^\d{1,2}:\d{2}$/.test(token)) { start = token.padStart(5, '0'); return; }
      if (index > 0 && /^\d+$/.test(token)) { duration = Number(token); return; }
      titleParts.push(token);
    });

    var title = titleParts.join(' ').trim();
    if (!title) {
      print('Falta el título. Uso: meet "Título" [YYYY-MM-DD] [HH:MM] [minutos]', 'warn');
      return;
    }

    var meeting = store.addMeeting({
      title: title, date: date, start: start, duration: duration,
      category: 'sync', attendees: [], notes: ''
    });
    print('✓ Reunión creada: ' + meeting.id + ' · ' + meeting.title, 'ok');
    print('  ' + U.formatDate(date, 'long') + ' · ' + start + ' – ' + U.endTime(date, start, duration) + ' (' + U.durationLabel(duration) + ')', 'muted');

    if (FS.isConfigured()) {
      print('  Creando evento en Google Calendar y enlace de Meet…', 'muted');
      FS.api.upsertMeeting(meeting, true).then(function (res) {
        if (res && res.meeting) {
          store.updateMeeting(meeting.id, {
            meetLink: res.meeting.meetLink || '',
            eventLink: res.meeting.eventLink || '',
            eventId: res.meeting.eventId || ''
          });
          if (res.meeting.meetLink) printLink('Meet:', res.meeting.meetLink);
          else print('  Evento creado, pero sin enlace de Meet (revisa el servicio Calendar API).', 'warn');
        }
        if (res && res.warning) print('  ' + res.warning, 'warn');
      }).catch(function (err) {
        print('  Guardada localmente. Google: ' + err.message, 'warn');
        printLink('Plantilla de Calendar:', FS.api.calendarTemplateUrl(meeting));
      });
    } else {
      print('  Sin Google conectado: la reunión quedó local. Configúralo en settings.', 'muted');
      printLink('Plantilla de Calendar:', FS.api.calendarTemplateUrl(meeting));
    }
  }

  function stats() {
    var s = store.stats();
    print('Resumen del sistema', 'accent');
    print('  Tareas: ' + s.total + ' · activas ' + s.active + ' · hechas ' + s.done + ' (' + s.completion + '%)');
    print('  Puntos: ' + s.pointsDone + ' / ' + s.pointsTotal + ' completados');
    print('  Vencidas: ' + s.overdue + ' · vencen en 7 días: ' + s.dueSoon, s.overdue ? 'warn' : null);
    print('  Reuniones próximas: ' + s.meetingsUpcoming.length + ' · agendadas totales: ' + s.meetingsCount);
    print('  Hitos: ' + s.milestonesDone + ' / ' + s.milestonesTotal + ' completados');
    if (s.weeks.length) {
      print('  Ritmo (8 semanas): ' + s.weeks.map(function (w) { return w.count; }).join(' · '), 'muted');
    }
  }

  function config() {
    var s = FS.getSettings();
    var conn = FS.app.getConnection();
    print('Configuración actual', 'accent');
    print('  Google: ' + (FS.isConfigured() ? (conn.state === 'online' ? 'conectado' : 'configurado (' + (conn.detail || 'sin verificar') + ')') : 'no configurado'));
    print('  Web App: ' + (s.apiUrl ? s.apiUrl.replace(/\/macros\/s\/[^/]+\//, '/macros/s/…/') : '—'));
    print('  Token: ' + (s.token ? '••••' + s.token.slice(-4) : '—'));
    print('  Calendario: ' + s.calendarId + ' · Zona: ' + s.timezone);
    print('  Última sincronización: ' + (store.getState().meta.lastSync ? U.formatDateTime(store.getState().meta.lastSync) : 'nunca'));
  }

  function execute(raw) {
    var cmd = String(raw || '').trim();
    if (!cmd) return;
    echo(cmd);
    history.push(cmd);
    historyIndex = history.length;

    var tokens = tokenize(cmd);
    var name = normalize(tokens[0]);
    var args = tokens.slice(1);
    var rest = cmd.slice(tokens[0].length).trim();

    switch (name) {
      case 'help':
      case 'ayuda':
        help();
        break;
      case 'ls':
      case 'list':
      case 'tareas':
        listTasks(args[0]);
        break;
      case 'add':
      case 'nueva':
        addTask(args);
        break;
      case 'edit':
      case 'editar': {
        var t = resolveTaskId(args[0]);
        if (!t) { print('No encontré esa tarea. Usa ls para ver los IDs.', 'warn'); break; }
        FS.app.openTaskModal(t.id);
        print('Abriendo ' + t.id + '…', 'muted');
        break;
      }
      case 'done':
      case 'hecho':
      case 'complete': {
        var td = resolveTaskId(args[0]);
        if (!td) { print('No encontré esa tarea. Usa ls para ver los IDs.', 'warn'); break; }
        var doneTask = store.updateTask(td.id, { status: 'done' });
        print('✓ ' + td.id + ' marcada como hecha.', 'ok');
        if (FS.isConfigured()) {
          FS.api.upsertTask(doneTask).catch(function (err) { print('  Google: ' + err.message, 'warn'); });
        }
        break;
      }
      case 'mv':
      case 'move': {
        var tm = resolveTaskId(args[0]);
        var nextStatus = statusFrom(args[1]);
        if (!tm) { print('No encontré esa tarea.', 'warn'); break; }
        if (!nextStatus) { print('Estado no válido. Usa backlog, todo, progreso, revision o hecho.', 'warn'); break; }
        var moved = store.moveTask(tm.id, nextStatus);
        print('✓ ' + tm.id + ' → ' + FS.findStatus(nextStatus).label + '.', 'ok');
        if (FS.isConfigured()) {
          FS.api.upsertTask(moved).catch(function (err) { print('  Google: ' + err.message, 'warn'); });
        }
        break;
      }
      case 'rm':
      case 'delete': {
        var tr = resolveTaskId(args[0]);
        if (!tr) { print('No encontré esa tarea.', 'warn'); break; }
        FS.app.confirm({
          title: 'Eliminar tarea',
          message: 'Se eliminará "' + tr.title + '" de este navegador' + (FS.isConfigured() ? ' y de Google Sheets.' : '.'),
          confirmLabel: 'Eliminar',
          danger: true
        }).then(function (ok) {
          if (!ok) { print('Eliminación cancelada.', 'muted'); return; }
          store.deleteTask(tr.id);
          print('✓ ' + tr.id + ' eliminada.', 'ok');
          if (FS.isConfigured()) {
            FS.api.deleteTask(tr.id).catch(function (err) { print('  Google: ' + err.message, 'warn'); });
          }
        });
        break;
      }
      case 'meet':
      case 'reunion':
      case 'reunión':
        meet(args);
        break;
      case 'stats':
      case 'resumen':
        stats();
        break;
      case 'board':
      case 'tablero':
        FS.app.navigate('board');
        print('→ Tablero', 'muted');
        break;
      case 'tasks':
        FS.app.navigate('tasks');
        print('→ Mis tareas', 'muted');
        break;
      case 'metrics':
      case 'metricas':
        FS.app.navigate('metrics');
        print('→ Métricas', 'muted');
        break;
      case 'roadmap':
        FS.app.navigate('roadmap');
        print('→ Roadmap', 'muted');
        break;
      case 'meetings':
      case 'reuniones':
        FS.app.navigate('meetings');
        print('→ Reuniones', 'muted');
        break;
      case 'theme':
      case 'tema': {
        var theme = args[0] ? normalize(args[0]) : (FS.getTheme() === 'dark' ? 'light' : 'dark');
        if (theme !== 'dark' && theme !== 'light') {
          print('Uso: theme dark | light', 'warn');
          break;
        }
        FS.setTheme(theme);
        print('Tema: ' + theme, 'ok');
        break;
      }
      case 'sync':
      case 'sincronizar':
        if (!FS.isConfigured()) { print('Configura Google en settings antes de sincronizar.', 'warn'); break; }
        FS.app.syncNow();
        print('Sincronización iniciada. Mira las notificaciones.', 'muted');
        break;
      case 'export':
      case 'exportar': {
        var kind = normalize(args[0] || 'json');
        if (kind === 'csv') FS.app.exportCsv();
        else FS.app.exportJson();
        print('Exportación iniciada (' + (kind === 'csv' ? 'CSV' : 'JSON') + ').', 'ok');
        break;
      }
      case 'settings':
      case 'ajustes':
        FS.app.openSettings();
        print('Abriendo ajustes…', 'muted');
        break;
      case 'config':
      case 'configuracion':
        config();
        break;
      case 'clear':
      case 'cls':
        body.innerHTML = '';
        break;
      case 'version':
      case 'v':
        print('Fundaserinco · Seguimiento v' + FS.APP_VERSION, 'accent');
        print('Brand system v1.0 · Plus Jakarta Sans · Tech Blue #0086C8', 'muted');
        break;
      case 'date':
      case 'fecha':
        print(new Intl.DateTimeFormat('es-CO', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        }).format(new Date()), 'accent');
        break;
      case 'echo':
        print(rest || '');
        break;
      default:
        print('Comando no encontrado: "' + tokens[0] + '". Escribe help para ver la lista.', 'err');
    }
  }

  function complete() {
    var value = input.value.trim();
    var tokens = value.split(/\s+/);
    if (tokens.length <= 1) {
      var matches = COMMANDS.filter(function (c) { return c.indexOf(tokens[0] || '') === 0; });
      if (matches.length === 1) input.value = matches[0] + ' ';
      else if (matches.length > 1) print(matches.join('  '), 'muted');
      return;
    }
    var name = normalize(tokens[0]);
    if ((name === 'mv' || name === 'done' || name === 'rm' || name === 'edit') && tokens.length === 2) {
      var ids = store.getState().tasks.map(function (t) { return t.id; }).filter(function (id) {
        return id.toLowerCase().indexOf((tokens[1] || '').toLowerCase()) === 0;
      });
      if (ids.length) print(ids.join('  '), 'muted');
    } else if (name === 'mv' && tokens.length === 3) {
      print(FS.STATUSES.map(function (s) { return s.id; }).join('  '), 'muted');
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var value = input.value;
      input.value = '';
      execute(value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex -= 1;
        input.value = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex += 1;
        input.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        input.value = '';
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      body.innerHTML = '';
    }
  }

  function onOpen() {
    if (!bannerShown) banner();
    setTimeout(function () { input.focus(); }, 120);
  }

  function init() {
    body = document.getElementById('term-body');
    input = document.getElementById('term-input');
    if (!body || !input) return;
    input.addEventListener('keydown', onKeydown);
    body.addEventListener('click', function () {
      if (window.getSelection().toString()) return;
      input.focus();
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  FS.terminal = {
    onOpen: onOpen,
    help: help,
    execute: execute
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.FS);
