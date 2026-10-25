/*!
 * StudyDesk — Pomodoro timer logic
 *
 * The timer stores the moment it should end (endsAt) instead of counting
 * seconds, so it stays accurate even if the phone locks or the tab sleeps.
 * Every function returns a new state object.
 *
 * Author: Asaf Rojas (Sworfish Tech) — MIT License
 */
(function (root) {
  'use strict';

  var MIN = 60 * 1000;

  function durationFor(mode, settings) {
    var m = mode === 'short' ? settings.short : mode === 'long' ? settings.long : settings.work;
    return m * MIN;
  }

  function create(settings) {
    return { mode: 'focus', round: 1, running: false, endsAt: null, remaining: durationFor('focus', settings) };
  }

  function start(state, now) {
    if (state.running) return state;
    return Object.assign({}, state, { running: true, endsAt: now + state.remaining });
  }

  function pause(state, now) {
    if (!state.running) return state;
    return Object.assign({}, state, { running: false, endsAt: null, remaining: Math.max(0, state.endsAt - now) });
  }

  function remaining(state, now) {
    return state.running ? Math.max(0, state.endsAt - now) : state.remaining;
  }

  function isFinished(state, now) { return state.running && now >= state.endsAt; }

  /** Moves to the next phase: focus → short break (long break every N rounds) → focus. */
  function advance(state, settings) {
    var mode, round = state.round;
    if (state.mode === 'focus') {
      mode = round % settings.rounds === 0 ? 'long' : 'short';
    } else {
      mode = 'focus';
      round = state.mode === 'long' ? 1 : round + 1;
    }
    return { mode: mode, round: round, running: false, endsAt: null, remaining: durationFor(mode, settings) };
  }

  function setMode(state, mode, settings) {
    return { mode: mode, round: state.round, running: false, endsAt: null, remaining: durationFor(mode, settings) };
  }

  /** "24:59" style label. */
  function format(ms) {
    var total = Math.ceil(ms / 1000);
    var m = Math.floor(total / 60), s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var api = { create: create, start: start, pause: pause, remaining: remaining, isFinished: isFinished,
              advance: advance, setMode: setMode, durationFor: durationFor, format: format };
  root.StudyDesk = root.StudyDesk || {};
  root.StudyDesk.pomodoro = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
