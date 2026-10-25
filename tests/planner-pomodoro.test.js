const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../js/planner.js');
const po = require('../js/pomodoro.js');

// ------------------------------------------------------------------ tasks
test('daysUntil counts calendar days', () => {
  assert.equal(p.daysUntil('2026-11-01', '2026-10-26'), 6);
  assert.equal(p.daysUntil('2026-10-25', '2026-10-26'), -1);
  assert.equal(p.daysUntil('2027-01-01', '2026-12-31'), 1);
});

test('tasks are grouped by due date', () => {
  const tasks = [
    { title: 'a', due: '2026-10-20' }, { title: 'b', due: '2026-10-26' }, { title: 'c', due: '2026-10-30' },
    { title: 'd', due: '2026-12-01' }, { title: 'e', due: null }, { title: 'f', due: '2026-10-01', done: true }
  ];
  const g = p.groupTasks(tasks, '2026-10-26');
  const titles = (k) => g[k].map((x) => x.title);
  assert.deepEqual(titles('overdue'), ['a']);
  assert.deepEqual(titles('today'), ['b']);
  assert.deepEqual(titles('week'), ['c']);
  assert.deepEqual(titles('later'), ['d']);
  assert.deepEqual(titles('nodate'), ['e']);
  assert.deepEqual(titles('done'), ['f']);
  assert.deepEqual(p.upcomingTasks(tasks, '2026-10-26', 3).map((x) => x.title), ['a', 'b', 'c']);
});

test('localDateStr uses the local calendar', () => {
  assert.equal(p.localDateStr(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

// --------------------------------------------------------------- schedule
const blocks = [
  { id: 'a', day: 1, start: '07:00', end: '07:45' },
  { id: 'b', day: 1, start: '08:00', end: '08:45' },
  { id: 'c', day: 3, start: '07:00', end: '07:45' }
];

test('current and next class', () => {
  const monday810 = new Date(2026, 9, 26, 8, 10);
  const r = p.nowAndNext(blocks, monday810);
  assert.equal(r.current.id, 'b');
  assert.equal(r.next.block.id, 'c');
  assert.equal(r.next.dayOffset, 2);
  const monday650 = new Date(2026, 9, 26, 6, 50);
  const r2 = p.nowAndNext(blocks, monday650);
  assert.equal(r2.current, null);
  assert.equal(r2.next.block.id, 'a');
  assert.equal(r2.next.startsIn, 10);
});

test('next class wraps around the week', () => {
  const friday = new Date(2026, 9, 30, 12, 0);
  const r = p.nowAndNext(blocks, friday);
  assert.equal(r.next.block.id, 'a');
  assert.equal(r.next.dayOffset, 3);
});

test('overlapping classes are detected', () => {
  assert.equal(p.overlaps(blocks, { id: 'x', day: 1, start: '07:30', end: '08:10' }).length, 2);
  assert.equal(p.overlaps(blocks, { id: 'x', day: 1, start: '07:45', end: '08:00' }).length, 0);
});

test('toMinutes validates times', () => {
  assert.equal(p.toMinutes('07:45'), 465);
  assert.equal(p.toMinutes('25:00'), null);
  assert.equal(p.toMinutes('7:45'), null);
});

// --------------------------------------------------------------- pomodoro
const S = { work: 25, short: 5, long: 15, rounds: 4 };

test('timer counts down from timestamps and finishes', () => {
  let s = po.start(po.create(S), 0);
  assert.equal(po.format(po.remaining(s, 1000)), '24:59');
  assert.equal(po.isFinished(s, 25 * 60000 - 1), false);
  assert.equal(po.isFinished(s, 25 * 60000), true);
});

test('pause keeps the remaining time', () => {
  let s = po.start(po.create(S), 0);
  s = po.pause(s, 60000);
  assert.equal(s.remaining, 24 * 60000);
  assert.equal(po.remaining(s, 999999), 24 * 60000);
});

test('phases cycle with a long break every 4 rounds', () => {
  let s = po.create(S);
  const seq = [];
  for (let i = 0; i < 8; i++) { s = po.advance(s, S); seq.push(s.mode); }
  assert.deepEqual(seq, ['short', 'focus', 'short', 'focus', 'short', 'focus', 'long', 'focus']);
  assert.equal(po.durationFor('long', S), 15 * 60000);
});
