/* Fundaserinco · Seguimiento — cliente de Google Apps Script (Sheets + Calendar) */
window.FS = window.FS || {};

(function (FS) {
  'use strict';

  var U = FS.utils;
  var TIMEOUT = 20000;

  function settingsWith(overrides) {
    return Object.assign(FS.getSettings(), overrides || {});
  }

  function cleanUrl(url) {
    return String(url || '').trim();
  }

  function requireConfig(cfg) {
    if (!cleanUrl(cfg.apiUrl) || !cfg.token) {
      throw new Error('Falta configurar la URL del Web App y el token en Ajustes.');
    }
  }

  function request(action, data, overrides) {
    var cfg = settingsWith(overrides);
    requireConfig(cfg);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT);

    var body = JSON.stringify({
      token: cfg.token,
      action: action,
      data: data || {}
    });

    return fetch(cleanUrl(cfg.apiUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
      signal: controller.signal
    }).then(function (res) {
      return res.text().then(function (text) {
        var payload = null;
        try { payload = JSON.parse(text); } catch (e) { /* respuesta no JSON */ }
        if (!payload) {
          throw new Error('La URL respondió algo distinto a JSON. Verifica que el Web App esté publicado con acceso "Cualquier persona".');
        }
        if (payload.ok === false) throw new Error(payload.error || 'Error del backend de Google.');
        return payload.data !== undefined ? payload.data : payload;
      });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') throw new Error('La conexión con Google tardó demasiado. Intenta de nuevo.');
      throw err;
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function get(action, params, overrides) {
    var cfg = settingsWith(overrides);
    requireConfig(cfg);
    var url = cleanUrl(cfg.apiUrl);
    var query = new URLSearchParams(Object.assign({ token: cfg.token, action: action }, params || {}));
    url += (url.indexOf('?') > -1 ? '&' : '?') + query.toString();

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT);

    return fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var payload = null;
        try { payload = JSON.parse(text); } catch (e) { /* noop */ }
        if (!payload) throw new Error('Respuesta inesperada de Google. Revisa la publicación del Web App.');
        if (payload.ok === false) throw new Error(payload.error || 'Error del backend de Google.');
        return payload.data !== undefined ? payload.data : payload;
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw new Error('La conexión con Google tardó demasiado.');
        throw err;
      })
      .finally(function () { clearTimeout(timer); });
  }

  function offsetMs_(date, timeZone) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(date).reduce(function (acc, part) {
        acc[part.type] = part.value;
        return acc;
      }, {});
      var asUTC = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
      );
      return asUTC - date.getTime();
    } catch (e) {
      return -date.getTimezoneOffset() * 60000;
    }
  }

  /** Convierte una hora de pared en una zona IANA al instante UTC correcto. */
  function wallTimeToUTC(dateISO, time, timeZone) {
    var tz = timeZone || FS.getSettings().timezone || 'America/Bogota';
    var dateParts = String(dateISO).slice(0, 10).split('-').map(Number);
    var timeParts = String(time || '09:00').slice(0, 5).split(':').map(Number);
    var guess = new Date(Date.UTC(
      dateParts[0], dateParts[1] - 1, dateParts[2],
      timeParts[0] || 0, timeParts[1] || 0, 0
    ));
    var offset = offsetMs_(guess, tz);
    var result = new Date(guess.getTime() - offset);
    var offset2 = offsetMs_(result, tz);
    if (offset2 !== offset) result = new Date(guess.getTime() - offset2);
    return result;
  }

  function addMinutesToWallTime(start, duration) {
    var parts = String(start || '09:00').slice(0, 5).split(':').map(Number);
    var total = (parts[0] || 0) * 60 + (parts[1] || 0) + Number(duration || 0);
    return U.pad(Math.floor(total / 60) % 24) + ':' + U.pad(total % 60);
  }

  function buildCalendarDates(dateISO, start, duration) {
    var startISO = dateISO + 'T' + (start || '09:00') + ':00';
    var endISO = dateISO + 'T' + addMinutesToWallTime(start, duration) + ':00';
    var startUTC = wallTimeToUTC(dateISO, start || '09:00');
    var endUTC = new Date(startUTC.getTime() + Number(duration || 30) * 60000);
    return {
      startISO: startISO,
      endISO: endISO,
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString()
    };
  }

  function gcalStamp(isoDate) {
    var d = new Date(isoDate);
    return d.getUTCFullYear() + U.pad(d.getUTCMonth() + 1) + U.pad(d.getUTCDate()) +
      'T' + U.pad(d.getUTCHours()) + U.pad(d.getUTCMinutes()) + '00Z';
  }

  function calendarTemplateUrl(meeting) {
    var dates = buildCalendarDates(meeting.date, meeting.start, meeting.duration);
    var details = (meeting.notes || '') +
      (meeting.meetLink ? '\n\nGoogle Meet: ' + meeting.meetLink : '') +
      '\n\nCreado desde Fundaserinco · Seguimiento';
    var params = new URLSearchParams({
      action: 'TEMPLATE',
      text: meeting.title || 'Reunión',
      dates: gcalStamp(dates.startUTC) + '/' + gcalStamp(dates.endUTC),
      details: details.trim(),
      location: meeting.meetLink || ''
    });
    (meeting.attendees || []).forEach(function (email) {
      if (email) params.append('add', email);
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function inviteText(meeting) {
    var lines = [
      meeting.title,
      U.formatDate(meeting.date, 'long') + ' · ' + meeting.start + ' – ' + U.endTime(meeting.date, meeting.start, meeting.duration),
      'Duración: ' + U.durationLabel(meeting.duration)
    ];
    if (meeting.meetLink) lines.push('Google Meet: ' + meeting.meetLink);
    if (meeting.notes) lines.push('', meeting.notes);
    if ((meeting.attendees || []).length) lines.push('', 'Invitados: ' + meeting.attendees.join(', '));
    return lines.join('\n');
  }

  FS.api = {
    ping: function (overrides) { return request('ping', {}, overrides); },
    list: function (overrides) { return request('list', {}, overrides); },
    upsertTask: function (task) { return request('upsertTask', { task: task }); },
    deleteTask: function (id) { return request('deleteTask', { id: id }); },
    upsertMeeting: function (meeting, createMeet) {
      return request('upsertMeeting', {
        meeting: meeting,
        createMeet: Boolean(createMeet),
        calendarId: FS.getSettings().calendarId || 'primary',
        timezone: FS.getSettings().timezone || 'America/Bogota'
      });
    },
    deleteMeeting: function (meeting) {
      return request('deleteMeeting', {
        id: meeting.id,
        eventId: meeting.eventId || '',
        calendarId: FS.getSettings().calendarId || 'primary'
      });
    },
    upsertMilestone: function (milestone) { return request('upsertMilestone', { milestone: milestone }); },
    deleteMilestone: function (id) { return request('deleteMilestone', { id: id }); },
    upsertRepo: function (repo) { return request('upsertRepo', { repo: repo }); },
    deleteRepo: function (id) { return request('deleteRepo', { id: id }); },
    bulkUpsert: function (data) { return request('bulkUpsert', data); },
    importCalendar: function (fromISO, toISO) {
      return request('importCalendar', {
        fromISO: fromISO,
        toISO: toISO,
        calendarId: FS.getSettings().calendarId || 'primary'
      });
    },
    buildCalendarDates: buildCalendarDates,
    wallTimeToUTC: wallTimeToUTC,
    calendarTemplateUrl: calendarTemplateUrl,
    inviteText: inviteText,
    meetNewUrl: 'https://meet.google.com/new'
  };
})(window.FS);
