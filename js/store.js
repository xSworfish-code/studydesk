/*!
 * StudyDesk — local storage, validation and backups
 *
 * All data lives in this browser (localStorage). Nothing is sent anywhere.
 * Everything read from storage or from an imported backup file is treated as
 * untrusted: sanitize() rebuilds the data field by field, with type checks,
 * length limits and size caps, and drops anything it does not recognize.
 *
 * Author: Asaf Rojas (Sworfish Tech) — MIT License
 */
(function (root) {
  'use strict';

  var KEY = 'studydesk-v1';
  var VERSION = 1;
  var COLORS = ['yellow', 'green', 'pink', 'orange', 'blue', 'purple'];
  var LIMITS = { subjects: 30, items: 40, tasks: 500, blocks: 120, name: 60, note: 200, maxParciales: 6, periods: 24, courses: 20 };
  var ID_RE = /^[a-z0-9]{6,24}$/;
  var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  function uid() {
    var bytes = new Uint8Array(9);
    root.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (b) { return (b % 36).toString(36); }).join('') + Date.now().toString(36).slice(-4);
  }

  function defaults() {
    return {
      version: VERSION,
      settings: { lang: null, system: 'hn', parciales: 4, min: 70, work: 25, short: 5, long: 15, rounds: 4 },
      subjects: [],
      tasks: [],
      schedule: [],
      uni: { min: 70, periods: [] },
      stats: { date: null, sessions: 0, minutes: 0, totalSessions: 0 }
    };
  }

  // ----------------------------------------------------------- validators
  function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max) : ''; }
  function num(v, lo, hi) {
    var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
  }
  function int(v, lo, hi, fallback) { var n = num(v, lo, hi); return n === null ? fallback : Math.round(n); }
  function id(v) { return typeof v === 'string' && ID_RE.test(v) ? v : uid(); }
  function list(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }
  function oneOf(v, options, fallback) { return options.indexOf(v) !== -1 ? v : fallback; }

  function cleanItem(it) {
    if (!it || typeof it !== 'object') return null;
    var value = num(it.value, 0, 100);
    if (value === null) return null;
    var score = num(it.score, 0, value);
    return { id: id(it.id), name: str(it.name, LIMITS.name) || '—', value: value, score: score };
  }

  function cleanParcial(p) {
    p = p && typeof p === 'object' ? p : {};
    return {
      mode: oneOf(p.mode, ['direct', 'items'], 'direct'),
      grade: num(p.grade, 0, 100),
      items: list(p.items, LIMITS.items).map(cleanItem).filter(Boolean)
    };
  }

  function cleanSubject(s) {
    if (!s || typeof s !== 'object') return null;
    var name = str(s.name, LIMITS.name);
    if (!name) return null;
    var parciales = list(s.parciales, LIMITS.maxParciales).map(cleanParcial);
    while (parciales.length < LIMITS.maxParciales) parciales.push(cleanParcial({}));
    return { id: id(s.id), name: name, color: oneOf(s.color, COLORS, 'yellow'), goal: num(s.goal, 0, 100), parciales: parciales };
  }

  function cleanTask(t) {
    if (!t || typeof t !== 'object') return null;
    var title = str(t.title, LIMITS.name * 2);
    if (!title) return null;
    return {
      id: id(t.id), title: title,
      subjectId: typeof t.subjectId === 'string' && ID_RE.test(t.subjectId) ? t.subjectId : null,
      due: typeof t.due === 'string' && DATE_RE.test(t.due) ? t.due : null,
      done: t.done === true,
      created: int(t.created, 0, 8.64e15, Date.now())
    };
  }

  function cleanBlock(b) {
    if (!b || typeof b !== 'object') return null;
    if (!TIME_RE.test(b.start) || !TIME_RE.test(b.end) || b.start >= b.end) return null;
    var label = str(b.label, LIMITS.name);
    var subjectId = typeof b.subjectId === 'string' && ID_RE.test(b.subjectId) ? b.subjectId : null;
    if (!label && !subjectId) return null;
    return { id: id(b.id), day: int(b.day, 1, 7, 1), start: b.start, end: b.end, subjectId: subjectId, label: label, room: str(b.room, 30) };
  }

  function cleanCourse(c) {
    if (!c || typeof c !== 'object') return null;
    var name = str(c.name, LIMITS.name);
    var credits = num(c.credits, -1e6, 1e6);
    if (!name || credits === null || credits < 0.5 || credits > 30) return null;
    return { id: id(c.id), name: name, credits: credits, grade: num(c.grade, 0, 100) };
  }

  function cleanPeriod(p) {
    if (!p || typeof p !== 'object') return null;
    var name = str(p.name, LIMITS.name);
    if (!name) return null;
    return { id: id(p.id), name: name, courses: list(p.courses, LIMITS.courses).map(cleanCourse).filter(Boolean) };
  }

  /** Rebuilds a safe data object from anything (storage, imported file...). */
  function sanitize(raw) {
    var d = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
    var s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    d.settings = {
      lang: oneOf(s.lang, ['es', 'en'], null),
      system: oneOf(s.system, ['hn', 'us'], 'hn'),
      parciales: int(s.parciales, 1, LIMITS.maxParciales, 4),
      min: int(s.min, 1, 100, 70),
      work: int(s.work, 1, 120, 25),
      short: int(s.short, 1, 60, 5),
      long: int(s.long, 1, 90, 15),
      rounds: int(s.rounds, 2, 10, 4)
    };
    d.subjects = list(raw.subjects, LIMITS.subjects).map(cleanSubject).filter(Boolean);
    var subjectIds = d.subjects.map(function (x) { return x.id; });
    d.tasks = list(raw.tasks, LIMITS.tasks).map(cleanTask).filter(Boolean).map(function (t) {
      if (t.subjectId && subjectIds.indexOf(t.subjectId) === -1) t.subjectId = null;
      return t;
    });
    d.schedule = list(raw.schedule, LIMITS.blocks).map(cleanBlock).filter(Boolean).map(function (b) {
      if (b.subjectId && subjectIds.indexOf(b.subjectId) === -1) b.subjectId = null;
      return b;
    }).filter(function (b) { return b.subjectId || b.label; });
    var u = raw.uni && typeof raw.uni === 'object' ? raw.uni : {};
    d.uni = { min: int(u.min, 1, 100, 70), periods: list(u.periods, LIMITS.periods).map(cleanPeriod).filter(Boolean) };
    var st = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    d.stats = {
      date: typeof st.date === 'string' && DATE_RE.test(st.date) ? st.date : null,
      sessions: int(st.sessions, 0, 1000, 0),
      minutes: int(st.minutes, 0, 100000, 0),
      totalSessions: int(st.totalSessions, 0, 1e6, 0)
    };
    return d;
  }

  // -------------------------------------------------------------- storage
  function load() {
    try {
      var text = root.localStorage.getItem(KEY);
      return text ? sanitize(JSON.parse(text)) : defaults();
    } catch (e) { return defaults(); }
  }

  function save(data) {
    try { root.localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  function clearAll() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // -------------------------------------------------------------- backups
  function exportJSON(data) {
    return JSON.stringify({ app: 'StudyDesk', exported: new Date().toISOString(), data: data }, null, 2);
  }

  /** Parses a backup file. Throws on anything that is not a StudyDesk backup. */
  function importJSON(text) {
    if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('tooLarge');
    var parsed = JSON.parse(text);
    if (!parsed || parsed.app !== 'StudyDesk' || !parsed.data) throw new Error('notBackup');
    return sanitize(parsed.data);
  }

  var api = { KEY: KEY, COLORS: COLORS, LIMITS: LIMITS, uid: uid, defaults: defaults, sanitize: sanitize,
              load: load, save: save, clearAll: clearAll, exportJSON: exportJSON, importJSON: importJSON };
  root.StudyDesk = root.StudyDesk || {};
  root.StudyDesk.store = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
