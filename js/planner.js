/*!
 * StudyDesk — schedule and task helpers (pure functions, easy to test)
 * Author: Asaf Rojas (Sworfish Tech) — MIT License
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ dates
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Local date as "YYYY-MM-DD" (not UTC, so it matches the user's calendar). */
  function localDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Whole days from today until the due date (negative = overdue). */
  function daysUntil(due, todayStr) {
    var a = Date.UTC.apply(null, todayStr.split('-').map(function (x, i) { return i === 1 ? x - 1 : +x; }));
    var b = Date.UTC.apply(null, due.split('-').map(function (x, i) { return i === 1 ? x - 1 : +x; }));
    return Math.round((b - a) / 86400000);
  }

  // ------------------------------------------------------------ tasks
  function dueStatus(task, todayStr) {
    if (task.done) return 'done';
    if (!task.due) return 'nodate';
    var d = daysUntil(task.due, todayStr);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 7) return 'week';
    return 'later';
  }

  /** Groups tasks for the list, each group sorted by due date. */
  function groupTasks(tasks, todayStr) {
    var groups = { overdue: [], today: [], week: [], later: [], nodate: [], done: [] };
    tasks.forEach(function (t) { groups[dueStatus(t, todayStr)].push(t); });
    var byDue = function (a, b) {
      if (a.due !== b.due) return (a.due || '9999') < (b.due || '9999') ? -1 : 1;
      return (a.created || 0) - (b.created || 0);
    };
    Object.keys(groups).forEach(function (k) { groups[k].sort(byDue); });
    groups.done.reverse();
    return groups;
  }

  /** Next pending tasks for the "Today" view (overdue first). */
  function upcomingTasks(tasks, todayStr, limit) {
    var g = groupTasks(tasks, todayStr);
    return g.overdue.concat(g.today, g.week, g.later).slice(0, limit || 5);
  }

  // ------------------------------------------------------------ schedule
  function toMinutes(hhmm) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    return m ? +m[1] * 60 + +m[2] : null;
  }

  /** JS getDay() is 0 = Sunday; StudyDesk uses 1 = Monday … 7 = Sunday. */
  function isoDay(date) { var d = date.getDay(); return d === 0 ? 7 : d; }

  function sortBlocks(blocks) {
    return blocks.slice().sort(function (a, b) {
      return a.day - b.day || toMinutes(a.start) - toMinutes(b.start);
    });
  }

  /** Class happening now and the next one (searching up to a week ahead). */
  function nowAndNext(blocks, date) {
    var today = isoDay(date);
    var mins = date.getHours() * 60 + date.getMinutes();
    var sorted = sortBlocks(blocks);
    var current = null, next = null;
    sorted.forEach(function (b) {
      if (b.day === today && toMinutes(b.start) <= mins && mins < toMinutes(b.end)) current = b;
    });
    for (var offset = 0; offset < 7 && !next; offset++) {
      var day = ((today - 1 + offset) % 7) + 1;
      for (var i = 0; i < sorted.length; i++) {
        var b = sorted[i];
        if (b.day !== day) continue;
        if (offset === 0 && toMinutes(b.start) <= mins) continue;
        next = { block: b, dayOffset: offset, startsIn: offset === 0 ? toMinutes(b.start) - mins : null };
        break;
      }
    }
    return { current: current, next: next };
  }

  /** Blocks on the same day whose times overlap with the given one. */
  function overlaps(blocks, candidate) {
    var s = toMinutes(candidate.start), e = toMinutes(candidate.end);
    return blocks.filter(function (b) {
      return b.id !== candidate.id && b.day === candidate.day && toMinutes(b.start) < e && s < toMinutes(b.end);
    });
  }

  var api = {
    localDateStr: localDateStr, daysUntil: daysUntil, dueStatus: dueStatus, groupTasks: groupTasks,
    upcomingTasks: upcomingTasks, toMinutes: toMinutes, isoDay: isoDay, sortBlocks: sortBlocks,
    nowAndNext: nowAndNext, overlaps: overlaps
  };
  root.StudyDesk = root.StudyDesk || {};
  root.StudyDesk.planner = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
