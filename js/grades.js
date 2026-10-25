/*!
 * StudyDesk — grade calculations
 *
 * Built for the Honduran system: each subject has N "parciales" (4 by default),
 * each graded from 0 to 100, and you pass with an average of 70 or more.
 * A parcial can be typed directly or built from activities (the "acumulativo"):
 * each activity is worth some points and the parcial grade is the sum of the
 * points you got.
 *
 * Author: Asaf Rojas (Sworfish Tech) — MIT License
 */
(function (root) {
  'use strict';

  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /** Grade of one parcial (0–100) or null if it has no grade yet. */
  function parcialGrade(parcial) {
    if (!parcial) return null;
    if (parcial.mode === 'items') {
      var items = parcial.items || [];
      var graded = items.filter(function (it) { return typeof it.score === 'number'; });
      if (!graded.length) return null;
      var sum = graded.reduce(function (s, it) { return s + it.score; }, 0);
      return round1(clamp(sum, 0, 100));
    }
    return typeof parcial.grade === 'number' ? round1(clamp(parcial.grade, 0, 100)) : null;
  }

  /** Points of a parcial that have not been assigned to any activity yet. */
  function parcialInfo(parcial) {
    var items = (parcial && parcial.items) || [];
    var assigned = items.reduce(function (s, it) { return s + (it.value || 0); }, 0);
    var possible = items.reduce(function (s, it) { return s + (typeof it.score === 'number' ? it.value || 0 : 0); }, 0);
    return {
      assigned: round1(assigned),          // points already planned (tareas, exámenes...)
      unassigned: round1(Math.max(0, 100 - assigned)),
      possibleSoFar: round1(possible),     // points of activities already graded
      lost: round1(Math.max(0, possible - items.reduce(function (s, it) { return s + (typeof it.score === 'number' ? it.score : 0); }, 0)))
    };
  }

  /**
   * Summary of a subject.
   * @param {object} subject  { parciales: [...], goal?: number }
   * @param {object} settings { parciales: 4, min: 70 }
   */
  function subjectSummary(subject, settings) {
    var n = settings.parciales;
    var min = settings.min;
    var target = typeof subject.goal === 'number' ? subject.goal : min;
    var grades = [];
    for (var i = 0; i < n; i++) grades.push(parcialGrade((subject.parciales || [])[i]));
    var done = grades.filter(function (g) { return g !== null; });
    var sum = done.reduce(function (s, g) { return s + g; }, 0);
    var remaining = n - done.length;
    var avg = done.length ? round1(sum / done.length) : null;

    var result = { grades: grades, done: done.length, total: n, average: avg, target: target, needed: null, final: null, status: 'empty' };

    if (remaining === 0) {
      result.final = round1(sum / n);
      result.status = result.final >= min ? 'passed' : 'failed';
      result.metGoal = result.final >= target;
      return result;
    }
    // Average you need in each remaining parcial to reach the target.
    var needed = (target * n - sum) / remaining;
    result.needed = round1(Math.max(needed, 0));
    if (done.length === 0) result.status = 'empty';
    else if (needed <= 0) result.status = 'secured';
    else if (needed > 100) result.status = 'impossible';
    else if (avg >= min) result.status = 'onTrack';
    else result.status = 'atRisk';
    return result;
  }

  /** Overall view across all subjects. */
  function overview(subjects, settings) {
    var summaries = subjects.map(function (s) { return subjectSummary(s, settings); });
    var withAvg = summaries.filter(function (s) { return s.average !== null; });
    var avg = withAvg.length
      ? round1(withAvg.reduce(function (t, s) { return t + (s.final !== null ? s.final : s.average); }, 0) / withAvg.length)
      : null;
    var risk = summaries.filter(function (s) { return s.status === 'atRisk' || s.status === 'impossible' || s.status === 'failed'; }).length;
    return { average: avg, subjects: subjects.length, graded: withAvg.length, atRisk: risk, summaries: summaries };
  }

  /**
   * Year summary for the school: overall average, average of each parcial
   * across all subjects, and how many subjects are passing.
   */
  function yearSummary(subjects, settings) {
    var ov = overview(subjects, settings);
    var perParcial = [];
    for (var i = 0; i < settings.parciales; i++) {
      var vals = ov.summaries.map(function (s) { return s.grades[i]; }).filter(function (g) { return g !== null; });
      perParcial.push(vals.length ? round1(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null);
    }
    var passing = ov.summaries.filter(function (s) {
      var value = s.final !== null ? s.final : s.average;
      return value !== null && value >= settings.min;
    }).length;
    return { average: ov.average, perParcial: perParcial, passing: passing, graded: ov.graded, subjects: ov.subjects, atRisk: ov.atRisk };
  }

  // ------------------------------------------------- letter grades and GPA
  // Common US scale published by the College Board (BigFuture): A 90–100 = 4.0,
  // B 80–89 = 3.0, C 70–79 = 2.0, D 65–69 = 1.0, F below 65 = 0.0.
  // Each school or university may use its own cutoffs, so this is an estimate.
  var LETTERS = [
    { min: 90, letter: 'A', points: 4 },
    { min: 80, letter: 'B', points: 3 },
    { min: 70, letter: 'C', points: 2 },
    { min: 65, letter: 'D', points: 1 },
    { min: 0, letter: 'F', points: 0 }
  ];

  function toLetter(pct) {
    if (pct === null || pct === undefined || !isFinite(pct)) return null;
    for (var i = 0; i < LETTERS.length; i++) {
      if (pct >= LETTERS[i].min) return { letter: LETTERS[i].letter, points: LETTERS[i].points };
    }
    return { letter: 'F', points: 0 };
  }

  /** GPA (0–4) from percentages, optionally weighted (credits). */
  function gpa(values, weights) {
    var total = 0, weightSum = 0;
    values.forEach(function (v, i) {
      if (v === null || v === undefined) return;
      var w = weights ? weights[i] : 1;
      total += toLetter(v).points * w;
      weightSum += w;
    });
    return weightSum ? Math.round(total / weightSum * 100) / 100 : null;
  }

  // ------------------------------------------------------------ university
  // Índice académico (UNAH style): sum of grade × credits (UV) / total credits.
  // The global index counts every graded course, passed or not; the
  // graduation index counts only the courses you passed.
  function weightedIndex(courses, onlyPassed, min) {
    var sum = 0, credits = 0;
    courses.forEach(function (c) {
      if (typeof c.grade !== 'number' || !(c.credits > 0)) return;
      if (onlyPassed && c.grade < min) return;
      sum += c.grade * c.credits;
      credits += c.credits;
    });
    return credits ? round1(sum / credits) : null;
  }

  function periodSummary(period, min) {
    var courses = period.courses || [];
    var graded = courses.filter(function (c) { return typeof c.grade === 'number' && c.credits > 0; });
    return {
      index: weightedIndex(courses, false, min),
      credits: graded.reduce(function (s, c) { return s + c.credits; }, 0),
      passedCredits: graded.filter(function (c) { return c.grade >= min; }).reduce(function (s, c) { return s + c.credits; }, 0),
      failed: graded.filter(function (c) { return c.grade < min; }).length,
      gpa: gpa(graded.map(function (c) { return c.grade; }), graded.map(function (c) { return c.credits; }))
    };
  }

  function universitySummary(periods, min) {
    var all = [];
    periods.forEach(function (p) { all = all.concat(p.courses || []); });
    var graded = all.filter(function (c) { return typeof c.grade === 'number' && c.credits > 0; });
    return {
      globalIndex: weightedIndex(all, false, min),
      graduationIndex: weightedIndex(all, true, min),
      credits: graded.reduce(function (s, c) { return s + c.credits; }, 0),
      passedCredits: graded.filter(function (c) { return c.grade >= min; }).reduce(function (s, c) { return s + c.credits; }, 0),
      courses: graded.length,
      gpa: gpa(graded.map(function (c) { return c.grade; }), graded.map(function (c) { return c.credits; }))
    };
  }

  var api = {
    parcialGrade: parcialGrade, parcialInfo: parcialInfo, subjectSummary: subjectSummary, overview: overview,
    yearSummary: yearSummary, toLetter: toLetter, gpa: gpa, weightedIndex: weightedIndex,
    periodSummary: periodSummary, universitySummary: universitySummary, round1: round1
  };
  root.StudyDesk = root.StudyDesk || {};
  root.StudyDesk.grades = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
