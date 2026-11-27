/* Fundaserinco · Seguimiento — estado local, CRUD y cálculos */
window.FS = window.FS || {};

(function (FS) {
  'use strict';

  var U = FS.utils;

  var PREFIX = { task: 'FS', meeting: 'MT', milestone: 'HT', repo: 'RP' };
  var SEQ_KEYS = { task: 'task', meeting: 'meeting', milestone: 'milestone', repo: 'repo' };

  function blankState() {
    return {
      version: 1,
      tasks: [],
      meetings: [],
      milestones: [],
      repos: [],
      meta: { seq: { task: 0, meeting: 0, milestone: 0, repo: 0 }, lastSync: null }
    };
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) {
      return tags.map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 8);
    }
    return String(tags || '')
      .split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean)
      .slice(0, 8);
  }

  function normalizeRepoIds(value) {
    var list = Array.isArray(value) ? value : String(value || '').split(/[,;]+/);
    var seen = {};
    return list
      .map(function (id) { return String(id).trim(); })
      .filter(function (id) {
        if (!id || seen[id]) return false;
        seen[id] = true;
        return true;
      });
  }

  function normalizeAttendees(list) {
    if (Array.isArray(list)) {
      return list.map(function (a) { return String(a).trim(); }).filter(Boolean);
    }
    return String(list || '')
      .split(/[,;\n]+/)
      .map(function (a) { return a.trim(); })
      .filter(Boolean);
  }

  function normalizeTask(t) {
    var now = new Date().toISOString();
    return {
      id: String(t.id || ''),
      title: String(t.title || 'Sin título').trim(),
      description: String(t.description || ''),
      status: FS.findStatus(t.status).id,
      priority: FS.findPriority(t.priority).id,
      points: Number(t.points) || 0,
      assignee: String(t.assignee || '').trim(),
      repoIds: normalizeRepoIds(t.repoIds != null ? t.repoIds : t.repoId),
      tags: normalizeTags(t.tags),
      due: String(t.due || '').slice(0, 10),
      created: t.created || now,
      updated: t.updated || now,
      completedAt: t.completedAt || null,
      source: t.source || 'local'
    };
  }

  function normalizeMeeting(m) {
    var now = new Date().toISOString();
    return {
      id: String(m.id || ''),
      title: String(m.title || 'Reunión').trim(),
      date: String(m.date || U.todayISO()).slice(0, 10),
      start: String(m.start || '09:00').slice(0, 5),
      duration: Number(m.duration) || 30,
      category: FS.findCategory(m.category).id,
      attendees: normalizeAttendees(m.attendees),
      notes: String(m.notes || ''),
      meetLink: String(m.meetLink || ''),
      eventLink: String(m.eventLink || ''),
      eventId: String(m.eventId || ''),
      source: m.source || 'local',
      created: m.created || now,
      updated: m.updated || now
    };
  }

  function normalizeMilestone(m) {
    var now = new Date().toISOString();
    return {
      id: String(m.id || ''),
      title: String(m.title || 'Hito').trim(),
      date: String(m.date || U.todayISO()).slice(0, 10),
      status: FS.findMilestoneStatus(m.status).id,
      description: String(m.description || ''),
      created: m.created || now,
      updated: m.updated || now
    };
  }

  function normalizeUrl(raw) {
    var value = String(raw || '').trim();
    if (!value || /\s/.test(value)) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) return '';
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    try {
      var url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      var host = url.hostname;
      if (!host || !/^[a-z0-9.-]+$/i.test(host)) return '';
      if (host !== 'localhost' && host.indexOf('.') === -1) return '';
      return url.href;
    } catch (e) {
      return '';
    }
  }

  function normalizeRepo(r) {
    var now = new Date().toISOString();
    return {
      id: String(r.id || ''),
      name: String(r.name || 'Proyecto').trim(),
      url: normalizeUrl(r.url),
      description: String(r.description || ''),
      tags: normalizeTags(r.tags),
      status: FS.findRepoStatus(r.status).id,
      created: r.created || now,
      updated: r.updated || now,
      source: r.source || 'local'
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') return blankState();
    var state = blankState();
    state.tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(function (t) { return t.id; }) : [];
    state.meetings = Array.isArray(raw.meetings) ? raw.meetings.map(normalizeMeeting).filter(function (m) { return m.id; }) : [];
    state.milestones = Array.isArray(raw.milestones) ? raw.milestones.map(normalizeMilestone).filter(function (m) { return m.id; }) : [];
    state.repos = Array.isArray(raw.repos) ? raw.repos.map(normalizeRepo).filter(function (r) { return r.id; }) : [];
    state.meta.lastSync = (raw.meta && raw.meta.lastSync) || null;
    state.meta.seq = recalcSeq(state);
    var storedSeq = (raw.meta && raw.meta.seq) || {};
    ['task', 'meeting', 'milestone', 'repo'].forEach(function (key) {
      state.meta.seq[key] = Math.max(state.meta.seq[key], Number(storedSeq[key]) || 0);
    });
    return state;
  }

  function recalcSeq(state) {
    var seq = { task: 0, meeting: 0, milestone: 0, repo: 0 };
    state.tasks.forEach(function (t) { seq.task = Math.max(seq.task, seqOf(t.id, PREFIX.task)); });
    state.meetings.forEach(function (m) { seq.meeting = Math.max(seq.meeting, seqOf(m.id, PREFIX.meeting)); });
    state.milestones.forEach(function (m) { seq.milestone = Math.max(seq.milestone, seqOf(m.id, PREFIX.milestone)); });
    state.repos.forEach(function (r) { seq.repo = Math.max(seq.repo, seqOf(r.id, PREFIX.repo)); });
    return seq;
  }

  function seqOf(id, prefix) {
    var match = new RegExp('^' + prefix + '-(\\d+)$').exec(String(id || ''));
    return match ? Number(match[1]) : 0;
  }

  function nowISO() { return new Date().toISOString(); }

  var store = (function () {
    var listeners = [];
    var state = normalizeState(U.loadJSON(FS.STORAGE.data, null));

    function persist() {
      var ok = U.saveJSON(FS.STORAGE.data, state);
      if (!ok) emit('storage-error');
    }

    function emit(reason) {
      listeners.slice().forEach(function (fn) {
        try { fn(state, reason); } catch (e) { console.error('[store] listener error', e); }
      });
    }

    function nextId(kind) {
      state.meta.seq[kind] = (state.meta.seq[kind] || 0) + 1;
      return PREFIX[kind] + '-' + String(state.meta.seq[kind]).padStart(3, '0');
    }

    function find(list, id) {
      return list.find(function (item) { return item.id === id; });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i > -1) listeners.splice(i, 1);
      };
    }

    function getState() { return state; }

    /* --------------------------------- Tareas -------------------------------- */
    function addTask(data) {
      var now = nowISO();
      var task = normalizeTask(Object.assign({
        id: nextId('task'),
        created: now,
        updated: now,
        source: 'local'
      }, data || {}));
      task.updated = now;
      if (task.status === 'done') task.completedAt = now;
      state.tasks.unshift(task);
      persist();
      emit('task:add');
      return task;
    }

    function updateTask(id, patch) {
      var task = find(state.tasks, id);
      if (!task) return null;
      var next = normalizeTask(Object.assign({}, task, patch, { id: task.id, created: task.created }));
      next.updated = nowISO();
      if (next.status === 'done' && task.status !== 'done') next.completedAt = next.updated;
      if (next.status !== 'done' && task.status === 'done') next.completedAt = null;
      if (next.status === 'done' && !next.completedAt) next.completedAt = next.updated;
      Object.assign(task, next);
      persist();
      emit('task:update');
      return task;
    }

    function moveTask(id, status) {
      return updateTask(id, { status: status });
    }

    function deleteTask(id) {
      var before = state.tasks.length;
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      if (state.tasks.length !== before) {
        persist();
        emit('task:delete');
        return true;
      }
      return false;
    }

    /* -------------------------------- Reuniones ------------------------------ */
    function addMeeting(data) {
      var now = nowISO();
      var meeting = normalizeMeeting(Object.assign({
        id: nextId('meeting'),
        created: now,
        updated: now,
        source: 'local'
      }, data || {}));
      meeting.updated = now;
      state.meetings.push(meeting);
      persist();
      emit('meeting:add');
      return meeting;
    }

    function updateMeeting(id, patch) {
      var meeting = find(state.meetings, id);
      if (!meeting) return null;
      var next = normalizeMeeting(Object.assign({}, meeting, patch, { id: meeting.id, created: meeting.created }));
      next.updated = nowISO();
      Object.assign(meeting, next);
      persist();
      emit('meeting:update');
      return meeting;
    }

    function deleteMeeting(id) {
      var before = state.meetings.length;
      state.meetings = state.meetings.filter(function (m) { return m.id !== id; });
      if (state.meetings.length !== before) {
        persist();
        emit('meeting:delete');
        return true;
      }
      return false;
    }

    /* --------------------------------- Hitos --------------------------------- */
    function addMilestone(data) {
      var now = nowISO();
      var milestone = normalizeMilestone(Object.assign({
        id: nextId('milestone'),
        created: now,
        updated: now
      }, data || {}));
      milestone.updated = now;
      state.milestones.push(milestone);
      persist();
      emit('milestone:add');
      return milestone;
    }

    function updateMilestone(id, patch) {
      var milestone = find(state.milestones, id);
      if (!milestone) return null;
      var next = normalizeMilestone(Object.assign({}, milestone, patch, { id: milestone.id, created: milestone.created }));
      next.updated = nowISO();
      Object.assign(milestone, next);
      persist();
      emit('milestone:update');
      return milestone;
    }

    function deleteMilestone(id) {
      var before = state.milestones.length;
      state.milestones = state.milestones.filter(function (m) { return m.id !== id; });
      if (state.milestones.length !== before) {
        persist();
        emit('milestone:delete');
        return true;
      }
      return false;
    }

    /* ------------------------------ Repositorios ----------------------------- */
    function addRepo(data) {
      var now = nowISO();
      var repo = normalizeRepo(Object.assign({
        id: nextId('repo'),
        created: now,
        updated: now,
        source: 'local'
      }, data || {}));
      repo.updated = now;
      state.repos.unshift(repo);
      persist();
      emit('repo:add');
      return repo;
    }

    function updateRepo(id, patch) {
      var repo = find(state.repos, id);
      if (!repo) return null;
      var next = normalizeRepo(Object.assign({}, repo, patch, { id: repo.id, created: repo.created }));
      next.updated = nowISO();
      Object.assign(repo, next);
      persist();
      emit('repo:update');
      return repo;
    }

    function deleteRepo(id) {
      var before = state.repos.length;
      state.repos = state.repos.filter(function (r) { return r.id !== id; });
      if (state.repos.length !== before) {
        state.tasks.forEach(function (task) {
          if (!task.repoIds || task.repoIds.indexOf(id) === -1) return;
          task.repoIds = task.repoIds.filter(function (repoId) { return repoId !== id; });
          task.updated = nowISO();
        });
        persist();
        emit('repo:delete');
        return true;
      }
      return false;
    }

    /* ------------------------------ Import / sync ---------------------------- */
    function mergeRemote(remote) {
      var incoming = {
        tasks: Array.isArray(remote && remote.tasks) ? remote.tasks.map(normalizeTask) : [],
        meetings: Array.isArray(remote && remote.meetings) ? remote.meetings.map(normalizeMeeting) : [],
        milestones: Array.isArray(remote && remote.milestones) ? remote.milestones.map(normalizeMilestone) : [],
        repos: Array.isArray(remote && remote.repos) ? remote.repos.map(normalizeRepo) : []
      };
      var counts = { tasks: 0, meetings: 0, milestones: 0, repos: 0 };

      ['tasks', 'meetings', 'milestones', 'repos'].forEach(function (kind) {
        var local = state[kind];
        incoming[kind].forEach(function (item) {
          if (!item.id) return;
          var existing = find(local, item.id);
          if (!existing) {
            local.push(item);
            counts[kind] += 1;
            return;
          }
          var localTime = new Date(existing.updated || 0).getTime();
          var remoteTime = new Date(item.updated || 0).getTime();
          if (remoteTime > localTime) {
            Object.assign(existing, item);
            counts[kind] += 1;
          }
        });
      });

      state.meta.seq = recalcSeq(state);
      state.meta.lastSync = nowISO();
      persist();
      emit('sync:pull');
      return counts;
    }

    function exportData() {
      return JSON.parse(JSON.stringify({
        version: state.version,
        exportedAt: nowISO(),
        tasks: state.tasks,
        meetings: state.meetings,
        milestones: state.milestones,
        repos: state.repos
      }));
    }

    function importData(data, replace) {
      if (!data || typeof data !== 'object') throw new Error('El archivo no tiene un formato válido.');
      var imported = normalizeState({
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        meetings: Array.isArray(data.meetings) ? data.meetings : [],
        milestones: Array.isArray(data.milestones) ? data.milestones : [],
        repos: Array.isArray(data.repos) ? data.repos : []
      });

      if (replace) {
        state.tasks = imported.tasks;
        state.meetings = imported.meetings;
        state.milestones = imported.milestones;
        state.repos = imported.repos;
      } else {
        ['tasks', 'meetings', 'milestones', 'repos'].forEach(function (kind) {
          imported[kind].forEach(function (item) {
            var existing = find(state[kind], item.id);
            if (existing) Object.assign(existing, item);
            else state[kind].push(item);
          });
        });
      }

      state.meta.seq = recalcSeq(state);
      persist();
      emit('data:import');
      return {
        tasks: state.tasks.length,
        meetings: state.meetings.length,
        milestones: state.milestones.length,
        repos: state.repos.length
      };
    }

    function markSynced(iso) {
      state.meta.lastSync = iso || nowISO();
      persist();
      emit('sync:push');
    }

    function resetAll() {
      var meta = state.meta;
      state = blankState();
      state.meta.seq = meta.seq;
      persist();
      emit('data:reset');
    }

    function setRemoteMeetingLinks(id, links) {
      return updateMeeting(id, links || {});
    }

    /* -------------------------------- Métricas ------------------------------- */
    function stats() {
      var today = U.todayISO();
      var tasks = state.tasks;
      var total = tasks.length;
      var byStatus = {};
      FS.STATUSES.forEach(function (s) { byStatus[s.id] = 0; });
      var pointsTotal = 0;
      var pointsDone = 0;
      var overdue = 0;
      var byPriority = {};
      FS.PRIORITIES.forEach(function (p) { byPriority[p.id] = 0; });
      var tagCounts = {};
      var assigneeCounts = {};

      tasks.forEach(function (t) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        pointsTotal += t.points || 0;
        if (t.status === 'done') pointsDone += t.points || 0;
        if (t.status !== 'done' && t.due && t.due < today) overdue += 1;
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
        (t.tags || []).forEach(function (tag) { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
        if (t.assignee) assigneeCounts[t.assignee] = (assigneeCounts[t.assignee] || 0) + 1;
      });

      var done = byStatus.done || 0;
      var completion = total ? Math.round((done / total) * 100) : 0;

      var weekStart = U.startOfWeek(new Date());
      var weeks = [];
      for (var i = 7; i >= 0; i--) {
        var start = U.addDays(weekStart, -7 * i);
        var end = U.addDays(start, 7);
        var count = tasks.filter(function (t) {
          if (!t.completedAt) return false;
          var d = new Date(t.completedAt);
          return d >= start && d < end;
        }).length;
        weeks.push({
          label: U.pad(start.getDate()) + '/' + U.pad(start.getMonth() + 1),
          count: count,
          start: U.toISODate(start)
        });
      }

      var completed7 = tasks.filter(function (t) {
        if (!t.completedAt) return false;
        var d = new Date(t.completedAt);
        return d >= U.addDays(new Date(), -7);
      }).length;

      var completed30 = tasks.filter(function (t) {
        if (!t.completedAt) return false;
        var d = new Date(t.completedAt);
        return d >= U.addDays(new Date(), -30);
      }).length;

      var upcoming = tasks
        .filter(function (t) { return t.status !== 'done' && t.due; })
        .sort(function (a, b) { return a.due.localeCompare(b.due); })
        .slice(0, 6);

      var dueSoon = tasks.filter(function (t) {
        if (t.status === 'done' || !t.due) return false;
        var diff = U.daysBetween(today, t.due);
        return diff >= 0 && diff <= 7;
      }).length;

      var meetingsUpcoming = state.meetings
        .filter(function (m) {
          if (!m.date) return false;
          return m.date > today || (m.date === today && U.endTime(m.date, m.start, m.duration) >= new Date().toTimeString().slice(0, 5));
        })
        .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });

      var tags = Object.keys(tagCounts)
        .map(function (name) { return { name: name, count: tagCounts[name] }; })
        .sort(function (a, b) { return b.count - a.count; })
        .slice(0, 10);

      var assignees = Object.keys(assigneeCounts)
        .map(function (name) { return { name: name, count: assigneeCounts[name] }; })
        .sort(function (a, b) { return b.count - a.count; });

      return {
        total: total,
        done: done,
        active: total - done,
        byStatus: byStatus,
        byPriority: byPriority,
        pointsTotal: pointsTotal,
        pointsDone: pointsDone,
        completion: completion,
        overdue: overdue,
        dueSoon: dueSoon,
        completed7: completed7,
        completed30: completed30,
        weeks: weeks,
        upcoming: upcoming,
        tags: tags,
        assignees: assignees,
        meetingsUpcoming: meetingsUpcoming,
        meetingsCount: state.meetings.length,
        milestonesTotal: state.milestones.length,
        milestonesDone: state.milestones.filter(function (m) { return m.status === 'done'; }).length
      };
    }

    function onExternalChange() {
      state = normalizeState(U.loadJSON(FS.STORAGE.data, null));
      emit('external');
    }

    return {
      subscribe: subscribe,
      getState: getState,
      addTask: addTask,
      updateTask: updateTask,
      moveTask: moveTask,
      deleteTask: deleteTask,
      addMeeting: addMeeting,
      updateMeeting: updateMeeting,
      deleteMeeting: deleteMeeting,
      setRemoteMeetingLinks: setRemoteMeetingLinks,
      addMilestone: addMilestone,
      updateMilestone: updateMilestone,
      deleteMilestone: deleteMilestone,
      addRepo: addRepo,
      updateRepo: updateRepo,
      deleteRepo: deleteRepo,
      mergeRemote: mergeRemote,
      exportData: exportData,
      importData: importData,
      markSynced: markSynced,
      resetAll: resetAll,
      stats: stats,
      onExternalChange: onExternalChange,
      normalizeTags: normalizeTags,
      normalizeAttendees: normalizeAttendees,
      normalizeUrl: normalizeUrl
    };
  })();

  FS.store = store;
})(window.FS);
