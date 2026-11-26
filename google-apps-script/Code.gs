/**
 * Fundaserinco · Seguimiento — Backend Google Sheets + Google Calendar
 * ---------------------------------------------------------------------
 * Este script se ejecuta dentro de una hoja de cálculo de Google y expone
 * una API JSON para la aplicación web estática.
 *
 * INSTALACIÓN RÁPIDA
 * 1. Crea una hoja de cálculo nueva en Google Sheets.
 * 2. Extensiones → Apps Script.
 * 3. Pega este archivo como Code.gs y crea appsscript.json con el manifiesto.
 * 4. Ejecuta la función `instalar` una vez y autoriza los permisos.
 *    En el registro de ejecución aparecerá el TOKEN.
 * 5. Implementar → Nueva implementación → Aplicación web.
 *    - Ejecutar como: yo
 *    - Quién tiene acceso: cualquier persona
 * 6. Copia la URL que termina en /exec y el token en Ajustes de la app.
 *
 * SEGURIDAD
 * - El token se guarda en Propiedades del script, nunca en el repositorio.
 * - Todas las peticiones (GET y POST) exigen `token`.
 * - La URL /exec es pública, así que trata el token como una contraseña.
 *
 * SERVICIO AVANZADO (para Google Meet)
 * - El manifiesto habilita Google Calendar API (Calendar v3). Si no está
 *   habilitado, el script igual crea el evento con CalendarApp, pero sin Meet.
 */

var PROPS = PropertiesService.getScriptProperties();

var SHEETS = {
  tasks: 'Tareas',
  meetings: 'Reuniones',
  milestones: 'Hitos',
  repos: 'Repositorios'
};

var HEADERS = {
  tasks: ['id', 'title', 'description', 'status', 'priority', 'points', 'assignee', 'tags', 'due', 'created', 'updated', 'completedAt'],
  meetings: ['id', 'title', 'date', 'start', 'duration', 'category', 'attendees', 'notes', 'meetLink', 'eventLink', 'eventId', 'source', 'created', 'updated'],
  milestones: ['id', 'title', 'date', 'status', 'description', 'created', 'updated'],
  repos: ['id', 'name', 'url', 'description', 'tags', 'status', 'source', 'created', 'updated']
};

/* ================================ Endpoints =============================== */

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    checkToken_(params.token);
    var action = params.action || 'ping';
    if (action === 'ping') return json_({ ok: true, data: pingPayload_() });
    if (action === 'list') return json_({ ok: true, data: readAll_() });
    throw new Error('Acción GET no soportada: ' + action);
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    var action = body.action || '';
    var data = body.data || {};

    switch (action) {
      case 'ping':
        return json_({ ok: true, data: pingPayload_() });
      case 'list':
        return json_({ ok: true, data: readAll_() });
      case 'upsertTask':
        return json_({ ok: true, data: upsertRow_('tasks', data.task) });
      case 'deleteTask':
        deleteRow_('tasks', data.id);
        return json_({ ok: true, data: { deleted: data.id } });
      case 'upsertMilestone':
        return json_({ ok: true, data: upsertRow_('milestones', data.milestone) });
      case 'deleteMilestone':
        deleteRow_('milestones', data.id);
        return json_({ ok: true, data: { deleted: data.id } });
      case 'upsertRepo':
        return json_({ ok: true, data: upsertRow_('repos', data.repo) });
      case 'deleteRepo':
        deleteRow_('repos', data.id);
        return json_({ ok: true, data: { deleted: data.id } });
      case 'upsertMeeting':
        return json_({ ok: true, data: saveMeeting_(data) });
      case 'deleteMeeting':
        deleteMeeting_(data);
        return json_({ ok: true, data: { deleted: data.id } });
      case 'bulkUpsert':
        return json_({ ok: true, data: bulkUpsert_(data) });
      case 'importCalendar':
        return json_({ ok: true, data: importCalendar_(data) });
      default:
        throw new Error('Acción POST no soportada: ' + action);
    }
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

/**
 * Ejecutar UNA VEZ desde el editor de Apps Script.
 * Crea las hojas, encabezados y genera el token de acceso.
 */
function instalar() {
  setupSheets_();
  var token = PROPS.getProperty('API_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 28);
    PROPS.setProperty('API_TOKEN', token);
  }
  if (!PROPS.getProperty('TIMEZONE')) {
    PROPS.setProperty('TIMEZONE', Session.getScriptTimeZone() || 'America/Bogota');
  }
  var calendarId = PROPS.getProperty('CALENDAR_ID') || 'primary';

  Logger.log('====================================================');
  Logger.log('Fundaserinco · Seguimiento — instalación lista');
  Logger.log('Hoja: ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log('TOKEN: ' + token);
  Logger.log('CALENDAR_ID: ' + calendarId);
  Logger.log('Zona horaria: ' + PROPS.getProperty('TIMEZONE'));
  Logger.log('Ahora implementa como Aplicación web (acceso: cualquier persona).');
  Logger.log('====================================================');

  return { token: token, calendarId: calendarId };
}

/* =============================== Helpers API ============================== */

function pingPayload_() {
  return {
    message: 'Fundaserinco API activa',
    time: new Date().toISOString(),
    spreadsheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
    timezone: PROPS.getProperty('TIMEZONE') || Session.getScriptTimeZone()
  };
}

function checkToken_(token) {
  var expected = PROPS.getProperty('API_TOKEN');
  if (!expected) throw new Error('El script no está instalado. Ejecuta la función instalar().');
  if (!token || String(token) !== String(expected)) throw new Error('Token inválido.');
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorMessage_(err) {
  return String((err && err.message) || err || 'Error desconocido');
}

/* ============================== Sheets CRUD =============================== */

function setupSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (key) {
    var name = SHEETS[key];
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var headers = HEADERS[key];
    var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var needsHeader = current.join('') === '' || String(current[0]) !== headers[0];
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), headers.length).setNumberFormat('@');
  });
  var def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(def); } catch (e) { /* noop */ }
  }
}

function getSheet_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS[key]);
  if (!sheet) {
    setupSheets_();
    sheet = ss.getSheetByName(SHEETS[key]);
  }
  return sheet;
}

function serialize_(value, header) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

function readAll_() {
  var result = { tasks: [], meetings: [], milestones: [], repos: [] };
  Object.keys(SHEETS).forEach(function (key) {
    var sheet = getSheet_(key);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) { result[key] = []; return; }
    var headers = HEADERS[key];
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    result[key] = values
      .filter(function (row) { return row[0] !== '' && row[0] != null; })
      .map(function (row) { return rowToObject_(headers, row); });
  });
  return result;
}

function rowToObject_(headers, row) {
  var obj = {};
  headers.forEach(function (header, i) {
    var value = row[i];
    if (value instanceof Date) {
      if (header === 'date' || header === 'due') value = Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
      else value = Utilities.formatDate(value, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
    }
    obj[header] = value == null ? '' : value;
  });
  obj.points = Number(obj.points) || 0;
  obj.duration = Number(obj.duration) || 0;
  obj.tags = splitList_(obj.tags);
  obj.attendees = splitList_(obj.attendees);
  return obj;
}

function splitList_(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
}

function upsertRow_(key, record) {
  if (!record || !record.id) throw new Error('Registro sin id.');
  var sheet = getSheet_(key);
  var headers = HEADERS[key];
  var lastRow = sheet.getLastRow();
  var values = headers.map(function (header) {
    var raw = record[header];
    if (raw === undefined || raw === null) {
      if (header === 'created' || header === 'updated') return new Date().toISOString();
      return '';
    }
    return serialize_(raw, header);
  });

  var targetRow = 0;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(record.id)) { targetRow = i + 2; break; }
    }
  }
  if (!targetRow) targetRow = lastRow + 1;

  sheet.getRange(targetRow, 1, 1, headers.length).setNumberFormat('@');
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([values]);
  return record;
}

function deleteRow_(key, id) {
  if (!id) throw new Error('Falta el id a eliminar.');
  var sheet = getSheet_(key);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function bulkUpsert_(data) {
  var counts = { tasks: 0, meetings: 0, milestones: 0, repos: 0 };
  ['tasks', 'meetings', 'milestones', 'repos'].forEach(function (key) {
    var list = Array.isArray(data[key]) ? data[key] : [];
    list.forEach(function (item) {
      if (!item || !item.id) return;
      upsertRow_(key, item);
      counts[key] += 1;
    });
  });
  return counts;
}

/* =============================== Reuniones =============================== */

function saveMeeting_(data) {
  var meeting = data.meeting || {};
  if (!meeting.id) throw new Error('La reunión no tiene id.');
  var warning = '';

  if (data.createMeet || meeting.eventId) {
    try {
      var calendarResult = createOrUpdateEvent_(meeting, Boolean(data.createMeet), data.calendarId, data.timezone);
      meeting.eventId = calendarResult.eventId || meeting.eventId || '';
      meeting.eventLink = calendarResult.eventLink || meeting.eventLink || '';
      if (calendarResult.meetLink) meeting.meetLink = calendarResult.meetLink;
      if (calendarResult.warning) warning = calendarResult.warning;
    } catch (err) {
      warning = 'La reunión se guardó, pero no se pudo crear el evento de Calendar: ' + errorMessage_(err);
    }
  }

  meeting.updated = new Date().toISOString();
  if (!meeting.created) meeting.created = meeting.updated;
  upsertRow_('meetings', meeting);
  return { meeting: meeting, warning: warning };
}

function deleteMeeting_(data) {
  if (data.eventId) {
    try {
      removeCalendarEvent_(data.eventId, data.calendarId);
    } catch (err) {
      // Se elimina la fila igualmente; el evento huérfano se puede borrar a mano.
      Logger.log('No se pudo borrar el evento: ' + errorMessage_(err));
    }
  }
  deleteRow_('meetings', data.id);
  return true;
}

function getTimezone_(tz) {
  return tz || PROPS.getProperty('TIMEZONE') || Session.getScriptTimeZone() || 'America/Bogota';
}

function getCalendarId_(calendarId) {
  if (calendarId && calendarId !== 'primary') return calendarId;
  return PROPS.getProperty('CALENDAR_ID') || 'primary';
}

function parseAttendees_(list) {
  if (!list) return [];
  var arr = Array.isArray(list) ? list : String(list).split(',');
  return arr.map(function (email) { return String(email).trim(); })
    .filter(function (email) { return email && email.indexOf('@') > -1; });
}

function meetingStartEnd_(meeting, tz) {
  var date = meeting.date;
  var time = meeting.start || '09:00';
  var start = Utilities.parseDate(date + ' ' + time, tz, 'yyyy-MM-dd HH:mm');
  var end = new Date(start.getTime() + (Number(meeting.duration) || 30) * 60000);
  return { start: start, end: end };
}

/**
 * Crea o actualiza un evento. Con el servicio avanzado Calendar (v3) agrega
 * conferencia de Google Meet. Sin el servicio, cae a CalendarApp sin Meet.
 */
function createOrUpdateEvent_(meeting, createMeet, calendarId, timezone) {
  var tz = getTimezone_(timezone);
  var calId = getCalendarId_(calendarId);
  var range = meetingStartEnd_(meeting, tz);
  var attendees = parseAttendees_(meeting.attendees);

  var startResource = {
    dateTime: Utilities.formatDate(range.start, tz, "yyyy-MM-dd'T'HH:mm:ss"),
    timeZone: tz
  };
  var endResource = {
    dateTime: Utilities.formatDate(range.end, tz, "yyyy-MM-dd'T'HH:mm:ss"),
    timeZone: tz
  };
  var attendeeResources = attendees.map(function (email) { return { email: email }; });

  var advancedError = '';
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      // Actualización de un evento existente
      if (meeting.eventId) {
        var patch = {
          summary: meeting.title,
          description: meeting.notes || '',
          start: startResource,
          end: endResource,
          attendees: attendeeResources
        };
        var updated = Calendar.Events.patch(patch, calId, meeting.eventId, { sendUpdates: 'all' });
        return {
          eventId: updated.id,
          eventLink: updated.htmlLink || '',
          meetLink: conferenceLink_(updated),
          warning: ''
        };
      }

      // Creación de un evento nuevo
      var resource = {
        summary: meeting.title,
        description: meeting.notes || '',
        start: startResource,
        end: endResource,
        attendees: attendeeResources
      };
      var options = { sendUpdates: 'all' };
      if (createMeet) {
        resource.conferenceData = {
          createRequest: {
            requestId: Utilities.getUuid(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        };
        options.conferenceDataVersion = 1;
      }
      var created = Calendar.Events.insert(resource, calId, options);
      return {
        eventId: created.id,
        eventLink: created.htmlLink || '',
        meetLink: conferenceLink_(created),
        warning: createMeet && !conferenceLink_(created)
          ? 'El evento se creó, pero Google no devolvió enlace de Meet. Revisa la configuración del calendario.'
          : ''
      };
    }
    advancedError = 'servicio avanzado Calendar no habilitado';
  } catch (err) {
    advancedError = errorMessage_(err);
    Logger.log('Calendar API avanzada falló: ' + advancedError);
  }

  // Respaldo con CalendarApp (sin Meet automático)
  var calendar = getCalendarApp_(calId);
  var event;
  if (meeting.eventId) {
    event = calendar.getEventById(meeting.eventId);
    if (event) {
      event.setTitle(meeting.title || 'Reunión');
      event.setDescription(meeting.notes || '');
      event.setTime(range.start, range.end);
      attendeeResources.forEach(function (a) {
        try { event.addGuest(a.email); } catch (e) { /* noop */ }
      });
    }
  }
  if (!event) {
    event = calendar.createEvent(meeting.title || 'Reunión', range.start, range.end, {
      description: meeting.notes || '',
      guests: attendees.join(','),
      sendInvites: attendees.length > 0
    });
  }

  return {
    eventId: event.getId(),
    eventLink: '',
    meetLink: '',
    warning: 'Evento creado sin Google Meet (' + advancedError + '). Habilita el servicio avanzado "Google Calendar API" en Apps Script para generar Meet automáticamente.'
  };
}

function conferenceLink_(event) {
  if (!event) return '';
  if (event.hangoutLink) return event.hangoutLink;
  var points = event.conferenceData && event.conferenceData.entryPoints;
  if (!points) return '';
  for (var i = 0; i < points.length; i++) {
    if (points[i].entryPointType === 'video') return points[i].uri || '';
  }
  return '';
}

function getCalendarApp_(calId) {
  if (calId && calId !== 'primary') {
    var byId = CalendarApp.getCalendarById(calId);
    if (byId) return byId;
  }
  return CalendarApp.getDefaultCalendar();
}

function removeCalendarEvent_(eventId, calendarId) {
  var calId = getCalendarId_(calendarId);
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      Calendar.Events.remove(calId, eventId);
      return true;
    }
  } catch (err) {
    Logger.log('Calendar.Events.remove falló: ' + errorMessage_(err));
  }
  var calendar = getCalendarApp_(calId);
  var event = calendar.getEventById(eventId);
  if (event) event.deleteEvent();
  return true;
}

function importCalendar_(data) {
  var calId = getCalendarId_(data.calendarId);
  var tz = getTimezone_(data.timezone);
  var calendar = getCalendarApp_(calId);
  var from = new Date((data.fromISO || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')) + 'T00:00:00');
  var to = new Date((data.toISO || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')) + 'T23:59:59');
  var events = calendar.getEvents(from, to);
  var result = [];

  events.forEach(function (event) {
    if (event.isAllDayEvent && event.isAllDayEvent()) return;
    var start = event.getStartTime();
    var end = event.getEndTime();
    var attendees = [];
    try {
      attendees = event.getGuestList(true).map(function (guest) { return guest.getEmail(); }).filter(Boolean);
    } catch (e) { attendees = []; }
    result.push({
      eventId: event.getId(),
      title: event.getTitle() || 'Evento de Google Calendar',
      date: Utilities.formatDate(start, tz, 'yyyy-MM-dd'),
      start: Utilities.formatDate(start, tz, 'HH:mm'),
      duration: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
      notes: event.getDescription() || '',
      location: event.getLocation() || '',
      attendees: attendees,
      meetLink: '',
      eventLink: '',
      source: 'google'
    });
  });

  return result;
}

/* ============================== Pruebas ================================== */

/** Prueba manual del calendario desde el editor (opcional). */
function probarCalendario() {
  var result = createOrUpdateEvent_({
    title: 'Prueba Fundaserinco',
    date: Utilities.formatDate(new Date(), getTimezone_(), 'yyyy-MM-dd'),
    start: '09:00',
    duration: 15,
    notes: 'Evento de prueba creado por el backend de Fundaserinco.',
    attendees: []
  }, true, null, null);
  Logger.log(result);
  return result;
}
