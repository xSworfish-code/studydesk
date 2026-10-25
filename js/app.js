/*!
 * StudyDesk — UI
 * User data is only ever written to the page with textContent / value /
 * setAttribute (never innerHTML). The CSP also enforces Trusted Types.
 * Author: Asaf Rojas (Sworfish Tech) — MIT License
 */
(function () {
  'use strict';

  var SD = window.StudyDesk;
  var i18n = SD.i18n, t = i18n.t, store = SD.store, grades = SD.grades, planner = SD.planner, pomo = SD.pomodoro;
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ['today', 'grades', 'tasks', 'schedule', 'focus', 'settings'];
  var RING = 2 * Math.PI * 96;

  var state = {
    data: store.load(),
    view: 'today',
    color: 'yellow',
    timer: null,
    audio: null,
    items: null,         // { subjectId, index } while the activities dialog is open
    grTab: 'school',     // 'school' or 'uni' inside the Grades view
    subjectCards: {}     // subjectId -> references to update the card without rebuilding it
  };
  state.timer = pomo.create(state.data.settings);

  // ------------------------------------------------------------- helpers
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function num(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString(i18n.lang, { maximumFractionDigits: 1 }); }
  function todayStr() { return planner.localDateStr(new Date()); }
  function save() { store.save(state.data); }
  function subjectById(id) { return state.data.subjects.filter(function (s) { return s.id === id; })[0] || null; }
  function blockName(b) { var s = b.subjectId && subjectById(b.subjectId); return s ? s.name : b.label; }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function parcialLabel(n) { return t(state.data.settings.system === 'us' ? 'gr.quarter' : 'gr.parcial', { n: n }); }
  function letterOf(v) { var l = grades.toLetter(v); return l ? l.letter : ''; }

  var toastTimer;
  function toast(msg) {
    var box = $('toast');
    box.textContent = msg;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 3500);
  }

  function confirmDialog(text) {
    var dlg = $('confirm-dialog');
    if (typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(text));
    $('confirm-text').textContent = text;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(function (resolve) {
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      });
    });
  }

  function whenText(due) {
    var d = planner.daysUntil(due, todayStr());
    if (d === 0) return t('tk.dueToday');
    if (d === 1) return t('tk.dayLeft');
    if (d > 1) return t('tk.daysLeft', { n: d });
    if (d === -1) return t('tk.lateOne');
    return t('tk.late', { n: -d });
  }

  function fillSubjectSelect(select) {
    var current = select.value;
    clear(select);
    var none = el('option', '', t('common.none'));
    none.value = '';
    select.appendChild(none);
    state.data.subjects.forEach(function (s) {
      var o = el('option', '', s.name);
      o.value = s.id;
      select.appendChild(o);
    });
    if (current && subjectById(current)) select.value = current;
  }

  // -------------------------------------------------------- translations
  function applyTranslations() {
    document.documentElement.lang = i18n.lang;
    document.title = t('meta.title');
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (n) { n.placeholder = t(n.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (n) { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
    document.querySelectorAll('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.setLang === i18n.lang)); });
    var daySel = $('block-day'), keep = daySel.value || '1';
    clear(daySel);
    for (var d = 1; d <= 6; d++) { var o = el('option', '', t('day.' + d)); o.value = String(d); daySel.appendChild(o); }
    daySel.value = keep;
    renderAll();
  }

  function renderAll() {
    renderToday(); renderGrades(); renderTasks(); renderSchedule(); renderTimer(); renderSettings();
  }

  // --------------------------------------------------------------- views
  function showView(id, focus) {
    if (VIEWS.indexOf(id) === -1) id = 'today';
    state.view = id;
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.viewId !== id; });
    document.querySelectorAll('[data-view]').forEach(function (b) {
      if (b.dataset.view === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
    if (id === 'today') renderToday();
    if (id === 'schedule') renderSchedule();
    window.scrollTo(0, 0);
    if (focus) $('main').focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view, true); });
  });

  // --------------------------------------------------------------- today
  function renderToday() {
    var now = new Date();
    var h = now.getHours();
    $('today-greeting').textContent = t(h < 12 ? 'today.morning' : h < 18 ? 'today.afternoon' : 'today.evening');
    $('today-date').textContent = capitalize(now.toLocaleDateString(i18n.lang, { weekday: 'long', day: 'numeric', month: 'long' }));

    var label = $('today-class-label'), name = $('today-class-name'), meta = $('today-class-meta');
    var nn = planner.nowAndNext(state.data.schedule, now);
    label.textContent = t('today.now');
    name.classList.remove('soft');
    if (!state.data.schedule.length) {
      name.textContent = t('today.noSchedule');
      name.classList.add('soft');
      meta.textContent = '';
    } else if (nn.current) {
      name.textContent = blockName(nn.current);
      var subject = nn.current.subjectId && subjectById(nn.current.subjectId);
      $('today-class').dataset.color = subject ? subject.color : '';
      meta.textContent = t('today.until', { t: nn.current.end }) + (nn.current.room ? ', ' + nn.current.room : '');
    } else {
      name.textContent = t('today.noClass');
      name.classList.add('soft');
      meta.textContent = '';
    }
    var next = $('today-next');
    next.hidden = !nn.next;
    if (nn.next) {
      var b = nn.next.block, when;
      if (nn.next.dayOffset === 0) when = t('today.startsIn', { n: nn.next.startsIn });
      else if (nn.next.dayOffset === 1) when = t('today.tomorrow', { t: b.start });
      else when = t('today.onDay', { d: t('day.' + b.day), t: b.start });
      $('today-next-text').textContent = blockName(b) + ', ' + when.charAt(0).toLowerCase() + when.slice(1);
    }

    var ov = grades.overview(state.data.subjects, state.data.settings);
    $('today-avg-number').textContent = num(ov.average);
    $('today-avg-number').className = 'big-number' + (ov.average !== null && ov.average < state.data.settings.min ? ' low' : '');
    $('today-avg-note').textContent = !ov.graded ? t('today.noGrades')
      : ov.atRisk === 0 ? t('today.allGood') : ov.atRisk === 1 ? t('today.atRiskOne') : t('today.atRisk', { n: ov.atRisk });

    var list = $('today-tasks');
    clear(list);
    var upcoming = planner.upcomingTasks(state.data.tasks, todayStr(), 5);
    if (!upcoming.length) list.appendChild(el('li', 'muted', t('today.noTasks')));
    upcoming.forEach(function (task) {
      var li = el('li');
      var s = task.subjectId && subjectById(task.subjectId);
      if (s) { var chip = el('span', 'subj-chip', s.name); chip.dataset.color = s.color; li.appendChild(chip); }
      li.appendChild(el('span', 't-title', task.title));
      if (task.due) {
        var late = planner.daysUntil(task.due, todayStr()) < 0;
        li.appendChild(el('span', 'when' + (late ? ' late' : ''), whenText(task.due)));
      }
      list.appendChild(li);
    });

    var st = state.data.stats;
    $('today-focus-count').textContent = String(st.date === todayStr() ? st.sessions : 0);
  }
  $('today-focus-btn').addEventListener('click', function () {
    showView('focus', false);
    if (!state.timer.running) toggleTimer();
  });

  // -------------------------------------------------------------- grades
  function renderSwatches() {
    var row = $('subject-colors');
    clear(row);
    row.setAttribute('role', 'radiogroup');
    store.COLORS.forEach(function (c) {
      var b = el('button', 'swatch');
      b.type = 'button';
      b.dataset.color = c;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state.color === c));
      b.setAttribute('aria-label', t('color.' + c));
      b.addEventListener('click', function () { state.color = c; renderSwatches(); });
      row.appendChild(b);
    });
  }

  $('subject-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('subject-name');
    var name = input.value.trim().slice(0, 60);
    if (!name || state.data.subjects.length >= store.LIMITS.subjects) { input.focus(); return; }
    var parciales = [];
    for (var i = 0; i < store.LIMITS.maxParciales; i++) parciales.push({ mode: 'direct', grade: null, items: [] });
    state.data.subjects.push({ id: store.uid(), name: name, color: state.color, goal: null, parciales: parciales });
    var colors = store.COLORS;
    state.color = colors[(colors.indexOf(state.color) + 1) % colors.length];
    input.value = '';
    save();
    renderGrades();
    renderTasks();
    renderSchedule();
    input.focus();
  });

  function statusTag(status) {
    var cls = { onTrack: 'ok', secured: 'ok', passed: 'ok', atRisk: 'warn', impossible: 'bad', failed: 'bad', empty: '' }[status];
    return { cls: 'tag ' + (cls || ''), text: t('st.' + status) };
  }

  function neededText(sum, settings) {
    var p = { need: num(sum.needed), target: num(sum.target), n: sum.total, min: settings.min, final: num(sum.final) };
    switch (sum.status) {
      case 'empty': return t('need.empty', p);
      case 'secured': return t('need.secured', p);
      case 'impossible': return t('need.impossible', p);
      case 'passed': return t('need.passed', p);
      case 'failed': return t('need.failed', p);
      default: return t('need.normal', p);
    }
  }

  function buildSubjectCard(subject) {
    var settings = state.data.settings;
    var card = el('article', 'card subject');
    card.dataset.color = subject.color;
    var head = el('div', 'subject-head');
    var title = el('h2', 'subject-name');
    title.appendChild(el('span', 'hl', subject.name));
    head.appendChild(title);
    var tag = el('span', 'tag');
    head.appendChild(tag);
    var letter = el('span', 'grade-letter');
    letter.hidden = true;
    head.appendChild(letter);
    var avg = el('div', 'subject-avg');
    var avgNum = el('span');
    var avgLabel = el('small');
    avg.appendChild(avgNum);
    avg.appendChild(avgLabel);
    head.appendChild(avg);
    card.appendChild(head);

    var body = el('div', 'subject-body');
    var grid = el('div', 'parciales');
    grid.style.setProperty('--n', String(Math.min(settings.parciales, 4)));
    var inputs = [];
    for (var i = 0; i < settings.parciales; i++) {
      (function (idx) {
        var cell = el('div', 'parcial');
        var inputId = 'g-' + subject.id + '-' + idx;
        var lab = el('label', '', parcialLabel(idx + 1));
        lab.htmlFor = inputId;
        var input = el('input', 'input grade-input');
        input.id = inputId;
        input.type = 'number';
        input.min = '0';
        input.max = '100';
        input.step = '0.1';
        input.inputMode = 'decimal';
        input.addEventListener('change', function () {
          var p = subject.parciales[idx];
          if (input.value.trim() === '') p.grade = null;
          else {
            var v = Number(input.value);
            if (!isFinite(v) || v < 0 || v > 100) { input.value = p.grade === null ? '' : String(p.grade); return; }
            p.grade = Math.round(v * 10) / 10;
          }
          save();
          updateSubjectCard(subject.id);
        });
        var itemsBtn = el('button', 'items-btn', t('gr.byItems'));
        itemsBtn.type = 'button';
        itemsBtn.addEventListener('click', function () { openItems(subject.id, idx); });
        cell.appendChild(lab);
        cell.appendChild(input);
        cell.appendChild(itemsBtn);
        grid.appendChild(cell);
        inputs.push(input);
      })(i);
    }
    body.appendChild(grid);
    var needed = el('p', 'needed');
    body.appendChild(needed);

    var foot = el('div', 'subject-foot');
    var goalField = el('label', 'field goal-field');
    goalField.appendChild(el('span', '', t('gr.goal')));
    var goal = el('input', 'input');
    goal.type = 'number';
    goal.min = '1';
    goal.max = '100';
    goal.inputMode = 'numeric';
    goal.placeholder = String(settings.min);
    goal.value = subject.goal === null ? '' : String(subject.goal);
    goal.title = t('gr.goalHint', { min: settings.min });
    goal.addEventListener('change', function () {
      var v = Number(goal.value);
      subject.goal = goal.value.trim() === '' || !isFinite(v) ? null : Math.min(100, Math.max(1, Math.round(v)));
      goal.value = subject.goal === null ? '' : String(subject.goal);
      save();
      updateSubjectCard(subject.id);
    });
    goalField.appendChild(goal);
    foot.appendChild(goalField);
    var del = el('button', 'btn btn-ghost', t('gr.deleteSubject'));
    del.type = 'button';
    del.addEventListener('click', function () {
      confirmDialog(t('gr.deleteConfirm', { name: subject.name })).then(function (ok) {
        if (!ok) return;
        state.data.subjects = state.data.subjects.filter(function (s) { return s.id !== subject.id; });
        state.data.tasks.forEach(function (tk) { if (tk.subjectId === subject.id) tk.subjectId = null; });
        state.data.schedule = state.data.schedule.filter(function (b) { return b.subjectId !== subject.id || b.label; })
          .map(function (b) { if (b.subjectId === subject.id) b.subjectId = null; return b; });
        save();
        renderGrades(); renderTasks(); renderSchedule();
      });
    });
    foot.appendChild(del);
    body.appendChild(foot);
    card.appendChild(body);

    state.subjectCards[subject.id] = { tag: tag, letter: letter, avgNum: avgNum, avgLabel: avgLabel, inputs: inputs, needed: needed };
    updateSubjectCard(subject.id);
    return card;
  }

  function updateSubjectCard(id) {
    var refs = state.subjectCards[id], subject = subjectById(id);
    if (!refs || !subject) return;
    var settings = state.data.settings;
    var sum = grades.subjectSummary(subject, settings);
    var tag = statusTag(sum.status);
    refs.tag.className = tag.cls;
    refs.tag.textContent = tag.text;
    refs.avgNum.textContent = num(sum.final !== null ? sum.final : sum.average);
    refs.avgLabel.textContent = t(sum.final !== null ? 'gr.final' : 'gr.average');
    refs.inputs.forEach(function (input, i) {
      var p = subject.parciales[i];
      var g = sum.grades[i];
      var fromItems = p.mode === 'items' && p.items.length > 0;
      input.disabled = fromItems;
      if (document.activeElement !== input) input.value = g === null ? '' : String(g);
      input.classList.toggle('pass', g !== null && g >= settings.min);
      input.classList.toggle('fail', g !== null && g < settings.min);
    });
    refs.needed.textContent = neededText(sum, settings);
    var value = sum.final !== null ? sum.final : sum.average;
    refs.letter.hidden = settings.system !== 'us' || value === null;
    refs.letter.textContent = letterOf(value);
    renderYear();
  }

  // Year summary card: overall average, per-parcial averages, letter and GPA.
  function renderYear() {
    var settings = state.data.settings;
    var y = grades.yearSummary(state.data.subjects, settings);
    $('year-avg').textContent = num(y.average);
    $('year-avg').className = 'big-number' + (y.average !== null && y.average < settings.min ? ' low' : '');
    var equiv = $('year-equiv');
    clear(equiv);
    if (y.average === null) {
      equiv.textContent = t('yr.empty');
    } else {
      var values = state.data.subjects.map(function (s) {
        var sum = grades.subjectSummary(s, settings);
        return sum.final !== null ? sum.final : sum.average;
      });
      var badge = el('span', 'grade-letter', letterOf(y.average));
      equiv.appendChild(badge);
      equiv.appendChild(document.createTextNode(t('yr.equiv', { l: letterOf(y.average), g: num(grades.gpa(values)) })));
    }
    $('year-passing').textContent = y.subjects ? t('yr.passing', { p: y.passing, n: y.subjects }) : '';
    $('year-per-label').textContent = t(settings.system === 'us' ? 'yr.perQuarter' : 'yr.perParcial');
    var per = $('year-per');
    clear(per);
    y.perParcial.forEach(function (v, i) {
      var li = el('li');
      li.appendChild(el('span', '', parcialLabel(i + 1)));
      li.appendChild(el('strong', '', num(v)));
      per.appendChild(li);
    });
  }

  // Tabs inside Grades: school / university
  function setGradesTab(tab) {
    state.grTab = tab === 'uni' ? 'uni' : 'school';
    document.querySelectorAll('[data-gr-tab]').forEach(function (b) {
      var on = b.dataset.grTab === state.grTab;
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('gr-school').hidden = state.grTab !== 'school';
    $('gr-uni').hidden = state.grTab !== 'uni';
  }
  document.querySelectorAll('[data-gr-tab]').forEach(function (b) {
    b.addEventListener('click', function () { setGradesTab(b.dataset.grTab); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setGradesTab(state.grTab === 'school' ? 'uni' : 'school');
        document.querySelector('[data-gr-tab="' + state.grTab + '"]').focus();
      }
    });
  });

  // ---------------------------------------------------------- university
  function periodById(id) { return state.data.uni.periods.filter(function (p) { return p.id === id; })[0] || null; }

  $('period-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('period-name');
    var name = input.value.trim().slice(0, 60);
    if (!name || state.data.uni.periods.length >= store.LIMITS.periods) { input.focus(); return; }
    state.data.uni.periods.push({ id: store.uid(), name: name, courses: [] });
    input.value = '';
    save();
    renderUni();
  });

  function courseStatus(c, min) {
    if (typeof c.grade !== 'number') return { cls: 'tag', text: t('uni.pending') };
    return c.grade >= min ? { cls: 'tag ok', text: t('uni.passed') } : { cls: 'tag bad', text: t('uni.failed') };
  }

  function buildPeriodCard(period) {
    var min = state.data.uni.min;
    var card = el('article', 'card period');
    var head = el('div', 'period-head');
    head.appendChild(el('h2', 'period-name', period.name));
    var idx = el('div', 'period-index');
    var idxNum = el('strong');
    idx.appendChild(idxNum);
    idx.appendChild(el('small', '', t('uni.periodIndex')));
    head.appendChild(idx);
    card.appendChild(head);

    var body = el('div', 'period-body');
    var list = el('ul', 'courses');
    if (!period.courses.length) {
      body.appendChild(el('p', 'hint', t('uni.noCourses')));
    } else {
      var h = el('li', 'courses-head');
      h.setAttribute('aria-hidden', 'true');
      [t('uni.course'), t('uni.uv'), t('uni.grade')].forEach(function (x) { h.appendChild(el('span', '', x)); });
      h.appendChild(el('span', 'c-status'));
      h.appendChild(el('span'));
      list.appendChild(h);
    }
    period.courses.forEach(function (c) {
      var li = el('li');
      li.appendChild(el('span', 'course-name', c.name));
      var uv = el('input', 'input');
      uv.type = 'number'; uv.min = '0.5'; uv.max = '30'; uv.step = '0.5'; uv.inputMode = 'decimal';
      uv.value = String(c.credits);
      uv.setAttribute('aria-label', t('uni.uv') + ': ' + c.name);
      uv.addEventListener('change', function () {
        var v = Number(uv.value);
        if (!isFinite(v) || v < 0.5 || v > 30) { uv.value = String(c.credits); return; }
        c.credits = v; save(); renderUni();
      });
      var gr = el('input', 'input');
      gr.type = 'number'; gr.min = '0'; gr.max = '100'; gr.step = '0.1'; gr.inputMode = 'decimal';
      gr.value = typeof c.grade === 'number' ? String(c.grade) : '';
      if (typeof c.grade === 'number') gr.classList.add(c.grade >= min ? 'pass' : 'fail');
      gr.setAttribute('aria-label', t('uni.grade') + ': ' + c.name);
      gr.addEventListener('change', function () {
        if (gr.value.trim() === '') c.grade = null;
        else {
          var v = Number(gr.value);
          if (!isFinite(v) || v < 0 || v > 100) { gr.value = typeof c.grade === 'number' ? String(c.grade) : ''; return; }
          c.grade = Math.round(v * 10) / 10;
        }
        save(); renderUni();
      });
      var st = courseStatus(c, min);
      var status = el('span', st.cls + ' c-status', st.text);
      var x = el('button', 'x-btn', '×');
      x.type = 'button';
      x.setAttribute('aria-label', t('common.delete') + ': ' + c.name);
      x.addEventListener('click', function () {
        period.courses = period.courses.filter(function (o) { return o.id !== c.id; });
        save(); renderUni();
      });
      li.appendChild(uv); li.appendChild(gr); li.appendChild(status); li.appendChild(x);
      list.appendChild(li);
    });
    if (period.courses.length) body.appendChild(list);

    var foot = el('div', 'period-foot');
    var form = el('form', 'add-row compact');
    form.noValidate = true;
    var fName = el('label', 'field grow'); fName.appendChild(el('span', '', t('uni.course')));
    var nameIn = el('input', 'input'); nameIn.type = 'text'; nameIn.maxLength = 60; nameIn.autocomplete = 'off'; nameIn.placeholder = t('uni.coursePlaceholder');
    fName.appendChild(nameIn);
    var fUv = el('label', 'field small'); fUv.appendChild(el('span', '', t('uni.uv')));
    var uvIn = el('input', 'input'); uvIn.type = 'number'; uvIn.min = '0.5'; uvIn.max = '30'; uvIn.step = '0.5'; uvIn.inputMode = 'decimal';
    fUv.appendChild(uvIn);
    var fGr = el('label', 'field small'); fGr.appendChild(el('span', '', t('uni.grade')));
    var grIn = el('input', 'input'); grIn.type = 'number'; grIn.min = '0'; grIn.max = '100'; grIn.step = '0.1'; grIn.inputMode = 'decimal';
    fGr.appendChild(grIn);
    var addBtn = el('button', 'btn btn-secondary', t('uni.addCourse')); addBtn.type = 'submit';
    form.appendChild(fName); form.appendChild(fUv); form.appendChild(fGr); form.appendChild(addBtn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameIn.value.trim().slice(0, 60);
      var credits = Number(uvIn.value);
      if (!name) { nameIn.focus(); return; }
      if (!isFinite(credits) || credits < 0.5 || credits > 30) { uvIn.focus(); return; }
      if (period.courses.length >= store.LIMITS.courses) return;
      var g = grIn.value.trim() === '' ? null : Number(grIn.value);
      if (g !== null && (!isFinite(g) || g < 0 || g > 100)) { grIn.focus(); return; }
      period.courses.push({ id: store.uid(), name: name, credits: credits, grade: g === null ? null : Math.round(g * 10) / 10 });
      save();
      renderUni(period.id);
    });
    foot.appendChild(form);
    var del = el('button', 'btn btn-ghost', t('uni.deletePeriod'));
    del.type = 'button';
    del.addEventListener('click', function () {
      confirmDialog(t('uni.deletePeriodConfirm', { name: period.name })).then(function (ok) {
        if (!ok) return;
        state.data.uni.periods = state.data.uni.periods.filter(function (p) { return p.id !== period.id; });
        save(); renderUni();
      });
    });
    foot.appendChild(del);
    body.appendChild(foot);
    card.appendChild(body);

    var ps = grades.periodSummary(period, min);
    idxNum.textContent = num(ps.index);
    card.dataset.periodId = period.id;
    return card;
  }

  function renderUni(focusPeriodId) {
    var uni = state.data.uni;
    var u = grades.universitySummary(uni.periods, uni.min);
    $('uni-global').textContent = num(u.globalIndex);
    $('uni-grad').textContent = num(u.graduationIndex);
    $('uni-credits').textContent = num(u.passedCredits);
    $('uni-credits-of').textContent = t('uni.creditsOf', { p: num(u.passedCredits), t: num(u.credits) });
    $('uni-gpa').textContent = u.gpa === null ? '—' : num(u.gpa);
    $('uni-min-note').textContent = t('uni.minNote', { min: uni.min });
    var list = $('period-list');
    clear(list);
    $('periods-empty').hidden = uni.periods.length > 0;
    uni.periods.forEach(function (p) { list.appendChild(buildPeriodCard(p)); });
    if (focusPeriodId) {
      var card = list.querySelector('[data-period-id="' + focusPeriodId + '"] .period-foot input');
      if (card) card.focus();
    }
  }

  function renderGrades() {
    $('gr-lead').textContent = t(state.data.settings.system === 'us' ? 'gr.leadUs' : 'gr.lead', { min: state.data.settings.min });
    renderSwatches();
    var list = $('subject-list');
    clear(list);
    state.subjectCards = {};
    $('subjects-empty').hidden = state.data.subjects.length > 0;
    state.data.subjects.forEach(function (s) { list.appendChild(buildSubjectCard(s)); });
    renderYear();
    renderUni();
    setGradesTab(state.grTab);
  }

  // ------------------------------------------------ parcial activities dialog
  function currentParcial() {
    var s = state.items && subjectById(state.items.subjectId);
    return s ? { subject: s, parcial: s.parciales[state.items.index] } : null;
  }

  function openItems(subjectId, index) {
    state.items = { subjectId: subjectId, index: index };
    var ctx = currentParcial();
    $('items-title').textContent = ctx.subject.name + ': ' + t('gr.items', { n: index + 1 });
    renderItems();
    var dlg = $('items-dialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('item-name').focus();
  }

  function renderItems() {
    var ctx = currentParcial();
    if (!ctx) return;
    var p = ctx.parcial;
    var info = grades.parcialInfo(p);
    var g = grades.parcialGrade(p);
    $('items-info').textContent = p.items.length
      ? t('gr.itemsInfo', { got: num(g || 0), possible: num(info.possibleSoFar), free: num(info.unassigned) })
      : t('gr.noItems');
    var list = $('items-list');
    clear(list);
    if (p.items.length) {
      var head = el('li', 'items-head');
      head.setAttribute('aria-hidden', 'true');
      head.appendChild(el('span', '', t('gr.itemName')));
      head.appendChild(el('span', '', t('gr.itemValue')));
      head.appendChild(el('span', '', t('gr.itemScore')));
      head.appendChild(el('span'));
      list.appendChild(head);
    }
    p.items.forEach(function (it) {
      var li = el('li');
      li.appendChild(el('span', 'item-name', it.name));
      var value = el('input', 'input');
      value.type = 'number'; value.min = '0'; value.max = '100'; value.step = '0.5';
      value.value = String(it.value);
      value.setAttribute('aria-label', t('gr.itemValue') + ' ' + it.name);
      value.addEventListener('change', function () {
        var others = info.assigned - it.value;
        var v = Number(value.value);
        if (!isFinite(v) || v <= 0) { value.value = String(it.value); return; }
        it.value = Math.min(v, 100 - others);
        if (typeof it.score === 'number' && it.score > it.value) it.score = it.value;
        save(); renderItems(); updateSubjectCard(ctx.subject.id);
      });
      var score = el('input', 'input');
      score.type = 'number'; score.min = '0'; score.step = '0.5';
      score.max = String(it.value);
      score.value = typeof it.score === 'number' ? String(it.score) : '';
      score.setAttribute('aria-label', t('gr.itemScore') + ' ' + it.name);
      score.addEventListener('change', function () {
        if (score.value.trim() === '') it.score = null;
        else {
          var v = Number(score.value);
          if (!isFinite(v) || v < 0) { score.value = typeof it.score === 'number' ? String(it.score) : ''; return; }
          it.score = Math.min(v, it.value);
        }
        save(); renderItems(); updateSubjectCard(ctx.subject.id);
      });
      var x = el('button', 'x-btn', '×');
      x.type = 'button';
      x.setAttribute('aria-label', t('common.delete') + ' ' + it.name);
      x.addEventListener('click', function () {
        p.items = p.items.filter(function (o) { return o.id !== it.id; });
        if (!p.items.length) p.mode = 'direct';
        save(); renderItems(); updateSubjectCard(ctx.subject.id);
      });
      li.appendChild(value);
      li.appendChild(score);
      li.appendChild(x);
      list.appendChild(li);
    });
    $('item-value').max = String(info.unassigned);
  }

  $('item-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ctx = currentParcial();
    if (!ctx) return;
    var p = ctx.parcial;
    var info = grades.parcialInfo(p);
    var name = $('item-name').value.trim().slice(0, 60);
    var value = Number($('item-value').value);
    var scoreRaw = $('item-score').value.trim();
    if (!name) { $('item-name').focus(); return; }
    if (!isFinite(value) || value <= 0 || value > info.unassigned || p.items.length >= store.LIMITS.items) { $('item-value').focus(); return; }
    var score = scoreRaw === '' ? null : Math.min(Math.max(0, Number(scoreRaw) || 0), value);
    p.items.push({ id: store.uid(), name: name, value: value, score: score });
    p.mode = 'items';
    $('item-name').value = ''; $('item-value').value = ''; $('item-score').value = '';
    save(); renderItems(); updateSubjectCard(ctx.subject.id);
    $('item-name').focus();
  });
  $('items-close').addEventListener('click', function () { $('items-dialog').close(); });
  $('items-dialog').addEventListener('close', function () { state.items = null; });

  // --------------------------------------------------------------- tasks
  $('task-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('task-title').value.trim().slice(0, 120);
    if (!title || state.data.tasks.length >= store.LIMITS.tasks) { $('task-title').focus(); return; }
    var due = $('task-due').value;
    state.data.tasks.push({
      id: store.uid(), title: title, subjectId: $('task-subject').value || null,
      due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null, done: false, created: Date.now()
    });
    $('task-title').value = '';
    save();
    renderTasks();
    $('task-title').focus();
  });

  function renderTasks(focusId) {
    fillSubjectSelect($('task-subject'));
    var wrap = $('task-groups');
    clear(wrap);
    $('tasks-empty').hidden = state.data.tasks.length > 0;
    var groups = planner.groupTasks(state.data.tasks, todayStr());
    ['overdue', 'today', 'week', 'later', 'nodate', 'done'].forEach(function (key) {
      var items = groups[key];
      if (!items.length) return;
      var sec = el('section', 'task-group group-' + key);
      var h = el('h2', '', t('tk.g.' + key));
      h.appendChild(el('span', 'count', String(items.length)));
      sec.appendChild(h);
      var ul = el('ul', 'task-list');
      items.forEach(function (task) {
        var li = el('li', 'task' + (task.done ? ' done' : ''));
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = task.done;
        cb.id = 'task-' + task.id;
        cb.setAttribute('aria-label', t('tk.markDone') + ': ' + task.title);
        cb.addEventListener('change', function () {
          task.done = cb.checked;
          save();
          renderTasks(task.id);
        });
        li.appendChild(cb);
        var main = el('div', 'task-main');
        main.appendChild(el('div', 'task-title', task.title));
        var meta = el('div', 'task-meta');
        var s = task.subjectId && subjectById(task.subjectId);
        if (s) { var chip = el('span', 'subj-chip', s.name); chip.dataset.color = s.color; meta.appendChild(chip); }
        if (task.due) {
          var late = !task.done && planner.daysUntil(task.due, todayStr()) < 0;
          meta.appendChild(el('span', 'when' + (late ? ' late' : ''), whenText(task.due)));
        }
        if (meta.childNodes.length) main.appendChild(meta);
        li.appendChild(main);
        var x = el('button', 'x-btn', '×');
        x.type = 'button';
        x.setAttribute('aria-label', t('common.delete') + ': ' + task.title);
        x.addEventListener('click', function () {
          state.data.tasks = state.data.tasks.filter(function (o) { return o.id !== task.id; });
          save();
          renderTasks();
        });
        li.appendChild(x);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      if (key === 'done') {
        var clr = el('button', 'link-btn', t('tk.clearDone'));
        clr.type = 'button';
        clr.addEventListener('click', function () {
          state.data.tasks = state.data.tasks.filter(function (o) { return !o.done; });
          save();
          renderTasks();
        });
        sec.appendChild(clr);
      }
      wrap.appendChild(sec);
    });
    if (focusId && $('task-' + focusId)) $('task-' + focusId).focus();
  }

  // ------------------------------------------------------------ schedule
  $('block-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('block-msg');
    msg.className = 'form-msg';
    var block = {
      id: store.uid(), day: Number($('block-day').value) || 1,
      start: $('block-start').value, end: $('block-end').value,
      subjectId: $('block-subject').value || null,
      label: $('block-label').value.trim().slice(0, 60), room: $('block-room').value.trim().slice(0, 30)
    };
    var s = planner.toMinutes(block.start), en = planner.toMinutes(block.end);
    if (s === null || en === null || en <= s) { msg.textContent = t('sc.invalid'); return; }
    if (!block.subjectId && !block.label) { msg.textContent = t('sc.needName'); return; }
    if (state.data.schedule.length >= store.LIMITS.blocks) return;
    var clash = planner.overlaps(state.data.schedule, block);
    state.data.schedule.push(block);
    save();
    msg.textContent = clash.length ? t('sc.overlap', { name: blockName(clash[0]) }) : '';
    msg.classList.toggle('warn', clash.length > 0);
    // Next class usually starts when this one ends.
    $('block-start').value = block.end;
    var next = en + (en - s);
    if (next < 24 * 60) $('block-end').value = String(Math.floor(next / 60)).padStart(2, '0') + ':' + String(next % 60).padStart(2, '0');
    $('block-label').value = '';
    $('block-room').value = '';
    renderSchedule();
  });

  function renderSchedule() {
    fillSubjectSelect($('block-subject'));
    var week = $('week');
    clear(week);
    var blocks = planner.sortBlocks(state.data.schedule);
    $('schedule-empty').hidden = blocks.length > 0;
    week.hidden = !blocks.length;
    if (!blocks.length) return;
    var now = new Date();
    var current = planner.nowAndNext(blocks, now).current;
    var lastDay = blocks.some(function (b) { return b.day === 6; }) ? 6 : 5;
    if (blocks.some(function (b) { return b.day === 7; })) lastDay = 7;
    week.style.setProperty('--days', String(lastDay));
    for (var d = 1; d <= lastDay; d++) {
      var col = el('section', 'day-col' + (planner.isoDay(now) === d ? ' is-today' : ''));
      col.appendChild(el('h2', '', t('day.' + d)));
      var dayBlocks = blocks.filter(function (b) { return b.day === d; });
      if (!dayBlocks.length) col.appendChild(el('p', 'day-free', t('sc.free')));
      dayBlocks.forEach(function (b) {
        var card = el('div', 'block' + (current && current.id === b.id ? ' now' : ''));
        var s = b.subjectId && subjectById(b.subjectId);
        if (s) card.dataset.color = s.color;
        card.appendChild(el('div', 'block-name', blockName(b)));
        card.appendChild(el('div', 'block-time', b.start + ' - ' + b.end));
        if (b.room) card.appendChild(el('div', 'block-room', b.room));
        var x = el('button', 'x-btn', '×');
        x.type = 'button';
        x.setAttribute('aria-label', t('common.delete') + ': ' + blockName(b) + ' ' + b.start);
        x.addEventListener('click', function () {
          state.data.schedule = state.data.schedule.filter(function (o) { return o.id !== b.id; });
          save();
          renderSchedule();
        });
        card.appendChild(x);
        col.appendChild(card);
      });
      week.appendChild(col);
    }
  }

  // ------------------------------------------------------------ pomodoro
  var tickHandle = null;

  function renderTimer() {
    var s = state.data.settings, tm = state.timer, now = Date.now();
    var rem = pomo.remaining(tm, now), total = pomo.durationFor(tm.mode, s);
    $('timer').textContent = pomo.format(rem);
    $('ring').dataset.mode = tm.mode;
    $('ring-progress').style.strokeDasharray = String(RING);
    $('ring-progress').style.strokeDashoffset = String(RING * (1 - rem / total));
    $('round').textContent = t('po.round', { r: ((tm.round - 1) % s.rounds) + 1, n: s.rounds });
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-checked', String(b.dataset.mode === tm.mode));
    });
    $('po-toggle').textContent = t(tm.running ? 'po.pause' : rem < total ? 'po.resume' : 'po.start');
    var st = state.data.stats, isToday = st.date === todayStr();
    $('po-stats').textContent = t('po.today', { s: isToday ? st.sessions : 0, m: isToday ? st.minutes : 0 });
    document.title = tm.running ? pomo.format(rem) + ' ' + t(tm.mode === 'focus' ? 'po.focus' : tm.mode === 'short' ? 'po.short' : 'po.long') : t('meta.title');
    $('po-work').value = String(s.work);
    $('po-short').value = String(s.short);
    $('po-long').value = String(s.long);
    $('po-rounds').value = String(s.rounds);
    renderNotifyButton();
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      state.audio = state.audio || new Ctx();
      var ctx = state.audio;
      [0, 0.35, 0.7].forEach(function (offset) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.3);
      });
    } catch (e) { /* audio not available */ }
  }

  function notify(text) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var opts = { body: text, icon: 'icons/icon-192.png', tag: 'studydesk-timer' };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification('StudyDesk', opts); }).catch(function () {});
    } else {
      try { new Notification('StudyDesk', opts); } catch (e) { /* ignore */ }
    }
  }

  function completePhase() {
    var s = state.data.settings, st = state.data.stats, today = todayStr();
    var wasFocus = state.timer.mode === 'focus';
    if (wasFocus) {
      if (st.date !== today) { st.date = today; st.sessions = 0; st.minutes = 0; }
      st.sessions++;
      st.minutes += s.work;
      st.totalSessions++;
      save();
    }
    state.timer = pomo.advance(state.timer, s);
    stopTicking();
    beep();
    var msg = t(wasFocus ? 'po.doneFocus' : 'po.doneBreak');
    toast(msg);
    notify(msg);
    renderTimer();
  }

  function tick() {
    if (pomo.isFinished(state.timer, Date.now())) completePhase();
    else renderTimer();
  }
  function startTicking() { stopTicking(); tickHandle = setInterval(tick, 250); }
  function stopTicking() { if (tickHandle) clearInterval(tickHandle); tickHandle = null; }

  function toggleTimer() {
    if (state.timer.running) { state.timer = pomo.pause(state.timer, Date.now()); stopTicking(); }
    else {
      state.timer = pomo.start(state.timer, Date.now());
      startTicking();
      try { var Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx && !state.audio) state.audio = new Ctx(); } catch (e) { /* ignore */ }
    }
    renderTimer();
  }
  $('po-toggle').addEventListener('click', toggleTimer);
  $('po-reset').addEventListener('click', function () { state.timer = pomo.setMode(state.timer, state.timer.mode, state.data.settings); stopTicking(); renderTimer(); });
  $('po-skip').addEventListener('click', function () { state.timer = pomo.advance(state.timer, state.data.settings); stopTicking(); renderTimer(); });
  document.querySelectorAll('.mode-chips [data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { state.timer = pomo.setMode(state.timer, b.dataset.mode, state.data.settings); stopTicking(); renderTimer(); });
  });
  [['po-work', 'work', 1, 120], ['po-short', 'short', 1, 60], ['po-long', 'long', 1, 90], ['po-rounds', 'rounds', 2, 10]].forEach(function (cfg) {
    $(cfg[0]).addEventListener('change', function () {
      var v = Math.round(Number(this.value));
      if (!isFinite(v)) v = state.data.settings[cfg[1]];
      state.data.settings[cfg[1]] = Math.min(cfg[3], Math.max(cfg[2], v));
      save();
      if (!state.timer.running) state.timer = pomo.setMode(state.timer, state.timer.mode, state.data.settings);
      renderTimer();
    });
  });

  function renderNotifyButton() {
    var btn = $('po-notify');
    if (!('Notification' in window)) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.textContent = t(Notification.permission === 'granted' ? 'po.notifyOn' : Notification.permission === 'denied' ? 'po.notifyBlocked' : 'po.notify');
    btn.disabled = Notification.permission !== 'default';
  }
  $('po-notify').addEventListener('click', function () {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(renderNotifyButton, renderNotifyButton);
    }
  });
  // When the tab wakes up, catch up immediately (the timer is based on timestamps).
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.timer.running) tick(); });

  // ------------------------------------------------------------ settings
  function renderSettings() {
    $('set-parciales').value = String(state.data.settings.parciales);
    $('set-min').value = String(state.data.settings.min);
    $('set-uni-min').value = String(state.data.uni.min);
    document.querySelectorAll('[data-set-system]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.setSystem === state.data.settings.system));
    });
  }
  document.querySelectorAll('[data-set-system]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = state.data.settings, sys = b.dataset.setSystem;
      if (s.system === sys) return;
      s.system = sys;
      // Typical passing grade for each system (the user can still change it).
      if (sys === 'us' && s.min === 70) { s.min = 65; toast(t('set.systemChanged', { min: 65 })); }
      else if (sys === 'hn' && s.min === 65) { s.min = 70; toast(t('set.systemChanged', { min: 70 })); }
      else toast(t('saved'));
      save();
      renderSettings(); renderGrades(); renderToday();
    });
  });
  $('set-uni-min').addEventListener('change', function () {
    var v = Math.round(Number(this.value));
    state.data.uni.min = isFinite(v) ? Math.min(100, Math.max(1, v)) : 70;
    this.value = String(state.data.uni.min);
    save(); toast(t('saved')); renderUni();
  });
  $('set-parciales').addEventListener('change', function () {
    state.data.settings.parciales = Math.min(6, Math.max(1, Number(this.value) || 4));
    save(); toast(t('saved')); renderGrades(); renderToday();
  });
  $('set-min').addEventListener('change', function () {
    var v = Math.round(Number(this.value));
    state.data.settings.min = isFinite(v) ? Math.min(100, Math.max(1, v)) : 70;
    this.value = String(state.data.settings.min);
    save(); toast(t('saved')); renderGrades(); renderToday();
  });
  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.data.settings.lang = b.dataset.setLang;
      i18n.setLang(b.dataset.setLang);
      save();
      applyTranslations();
    });
  });

  $('export-btn').addEventListener('click', function () {
    var blob = new Blob([store.exportJSON(state.data)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = 'studydesk-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast(t('set.importError')); return; }
    file.text().then(function (text) {
      var data = store.importJSON(text);       // throws if it is not a valid backup
      return confirmDialog(t('set.importConfirm')).then(function (ok) {
        if (!ok) return;
        data.settings.lang = data.settings.lang || i18n.lang;
        state.data = data;
        save();
        i18n.setLang(data.settings.lang);
        state.timer = pomo.create(state.data.settings);
        applyTranslations();
        toast(t('set.imported'));
      });
    }).catch(function () { toast(t('set.importError')); });
  });

  $('clear-btn').addEventListener('click', function () {
    confirmDialog(t('set.dangerConfirm')).then(function (ok) {
      if (!ok) return;
      var lang = i18n.lang;
      store.clearAll();
      state.data = store.defaults();
      state.data.settings.lang = lang;
      save();
      state.timer = pomo.create(state.data.settings);
      stopTicking();
      renderAll();
      toast(t('set.cleared'));
    });
  });

  // Install as an app (PWA)
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    $('install-btn').hidden = false;
  });
  $('install-btn').addEventListener('click', function () {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent = null;
    $('install-btn').hidden = true;
  });
  $('install-card').hidden = window.matchMedia('(display-mode: standalone)').matches;

  // ----------------------------------------------------------------- boot
  var gh = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (gh) {
    var repo = location.pathname.split('/').filter(Boolean)[0] || (gh[1] + '.github.io');
    document.querySelectorAll('.repo-link').forEach(function (a) { a.href = 'https://github.com/' + gh[1] + '/' + repo; });
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    // Trusted Types is enforced by the CSP, so the worker URL must come from a
    // policy. This one only ever allows the exact string "sw.js".
    var swUrl = 'sw.js';
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      var policy = window.trustedTypes.createPolicy('studydesk-sw', {
        createScriptURL: function (u) { if (u === 'sw.js') return u; throw new TypeError('URL not allowed'); }
      });
      swUrl = policy.createScriptURL('sw.js');
    }
    navigator.serviceWorker.register(swUrl).catch(function () { /* offline mode not available */ });
  }

  i18n.setLang(i18n.detect(state.data.settings.lang));
  applyTranslations();
  showView((location.hash || '').replace('#', ''), false);
  // Keep "now" up to date (current class, greeting) once a minute.
  setInterval(function () {
    if (state.view === 'today') renderToday();
    if (state.view === 'schedule') renderSchedule();
  }, 60000);
  // Save before leaving, just in case.
  window.addEventListener('pagehide', save);
})();
