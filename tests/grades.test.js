const test = require('node:test');
const assert = require('node:assert/strict');
const { parcialGrade, parcialInfo, subjectSummary, overview } = require('../js/grades.js');

const settings = { parciales: 4, min: 70 };
const subject = (...g) => ({ parciales: g.map((x) => ({ mode: 'direct', grade: x, items: [] })) });

test('parcial grade from a direct value or from activities', () => {
  assert.equal(parcialGrade({ mode: 'direct', grade: 85 }), 85);
  assert.equal(parcialGrade({ mode: 'direct', grade: null }), null);
  assert.equal(parcialGrade({ mode: 'items', items: [{ value: 30, score: 25 }, { value: 40, score: null }, { value: 30, score: 28 }] }), 53);
  assert.equal(parcialGrade({ mode: 'items', items: [{ value: 30, score: null }] }), null);
});

test('parcialInfo reports assigned, unassigned and lost points', () => {
  const info = parcialInfo({ items: [{ value: 30, score: 25 }, { value: 40, score: null }, { value: 20, score: 18 }] });
  assert.deepEqual(info, { assigned: 90, unassigned: 10, possibleSoFar: 50, lost: 7 });
});

test('needed grade for the remaining parciales', () => {
  const s = subjectSummary(subject(80, 90, null, null), settings);
  assert.equal(s.average, 85);
  assert.equal(s.needed, 55);         // (70*4 - 170) / 2
  assert.equal(s.status, 'onTrack');
});

test('status: at risk, impossible, secured', () => {
  assert.equal(subjectSummary(subject(50, 55, null, null), settings).status, 'atRisk');
  const imp = subjectSummary(subject(30, 20, null, null), settings);
  assert.equal(imp.status, 'impossible');
  assert.equal(imp.needed, 115);
  const sec = subjectSummary(subject(95, 95, 95, null), settings);
  assert.equal(sec.status, 'secured');
  assert.equal(sec.needed, 0);
});

test('final grade when all parciales are done', () => {
  const pass = subjectSummary(subject(70, 60, 80, 75), settings);
  assert.equal(pass.final, 71.3);
  assert.equal(pass.status, 'passed');
  const fail = subjectSummary(subject(60, 60, 70, 65), settings);
  assert.equal(fail.status, 'failed');
});

test('a personal goal changes the needed grade but not the pass mark', () => {
  const s = subjectSummary(Object.assign(subject(88, 79, null, null), { goal: 90 }), settings);
  assert.equal(s.target, 90);
  assert.equal(s.needed, 96.5);
  assert.equal(s.status, 'onTrack');
});

test('works with 3 parciales and a different passing grade', () => {
  const s = subjectSummary(subject(60, null, null), { parciales: 3, min: 60 });
  assert.equal(s.total, 3);
  assert.equal(s.needed, 60);
});

test('empty subject needs the target average in every parcial', () => {
  const s = subjectSummary(subject(null, null, null, null), settings);
  assert.equal(s.status, 'empty');
  assert.equal(s.needed, 70);
});

test('overview averages subjects and counts the ones at risk', () => {
  const o = overview([subject(80, 90), subject(50, 55), subject(null)], settings);
  assert.equal(o.subjects, 3);
  assert.equal(o.graded, 2);
  assert.equal(o.average, 68.8);
  assert.equal(o.atRisk, 1);
});

// ------------------------------------------------------------ year summary
const { yearSummary, toLetter, gpa, weightedIndex, periodSummary, universitySummary } = require('../js/grades.js');

test('year summary: overall average, average per parcial and passing count', () => {
  const y = yearSummary([subject(80, 90, null, null), subject(50, 55, null, null), subject(98, 100, 95, null)], settings);
  assert.equal(y.average, 78.4);
  assert.deepEqual(y.perParcial, [76, 81.7, 95, null]);
  assert.equal(y.passing, 2);
  assert.equal(y.subjects, 3);
});

// -------------------------------------------------------- letters and GPA
test('percent to letter grade on the College Board scale', () => {
  const letters = [95, 90, 89.9, 80, 75, 69, 65, 64.9].map((v) => toLetter(v).letter).join('');
  assert.equal(letters, 'AABBCDDF');
  assert.equal(toLetter(85).points, 3);
  assert.equal(toLetter(null), null);
});

test('GPA is the average of letter points, optionally weighted by credits', () => {
  assert.equal(gpa([95, 85, 72]), 3);
  assert.equal(gpa([95, 60], [4, 2]), 2.67);
  assert.equal(gpa([null, null]), null);
});

// --------------------------------------------------------------- university
const periods = [
  { courses: [{ credits: 5, grade: 85 }, { credits: 4, grade: 96 }, { credits: 4, grade: 62 }, { credits: 4, grade: 88 }] },
  { courses: [{ credits: 5, grade: 78 }, { credits: 4, grade: null }] }
];

test('academic index weights each grade by its credits (UV)', () => {
  // (85*5 + 96*4 + 62*4 + 88*4 + 78*5) / 22 = 1799 / 22
  const u = universitySummary(periods, 70);
  assert.equal(u.globalIndex, 81.8);
  assert.equal(u.credits, 22);
  assert.equal(u.passedCredits, 18);
  assert.equal(u.courses, 5);
});

test('graduation index only counts passed courses', () => {
  // (1799 - 62*4) / 18
  assert.equal(universitySummary(periods, 70).graduationIndex, 86.2);
  assert.equal(weightedIndex(periods[0].courses, true, 70), 89.3); // (425 + 384 + 352) / 13
});

test('period summary and courses without grade', () => {
  const p = periodSummary(periods[1], 70);
  assert.equal(p.index, 78);
  assert.equal(p.credits, 5);
  assert.equal(p.failed, 0);
  assert.equal(periodSummary({ courses: [] }, 70).index, null);
});
