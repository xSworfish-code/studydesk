const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../js/store.js');

// ------------------------------------------------------------ validation
test('sanitize returns defaults for garbage', () => {
  for (const bad of [null, 42, 'x', [], { subjects: 'no' }]) {
    const d = store.sanitize(bad);
    assert.equal(d.settings.parciales, 4);
    assert.equal(d.settings.min, 70);
    assert.deepEqual(d.subjects, []);
  }
});

test('sanitize clamps numbers and drops invalid records', () => {
  const d = store.sanitize({
    settings: { parciales: '9', min: -5, work: 9999 },
    subjects: [{ name: 'Mate', color: 'red', parciales: [{ grade: 150 }, { grade: 'abc' }] }, { name: '' }, null],
    tasks: [{ title: 'ok', due: '2026-13-01' }, { title: '', due: '2026-10-01' }, { title: 'x', subjectId: 'zzzzzzz' }],
    schedule: [{ day: 1, start: '08:00', end: '07:00', label: 'bad' }, { day: 9, start: '07:00', end: '07:45', label: 'ok' }]
  });
  assert.equal(d.settings.parciales, 6);
  assert.equal(d.settings.min, 1);
  assert.equal(d.settings.work, 120);
  assert.equal(d.subjects.length, 1);
  assert.equal(d.subjects[0].color, 'yellow');
  assert.equal(d.subjects[0].parciales[0].grade, 100);
  assert.equal(d.subjects[0].parciales[1].grade, null);
  assert.equal(d.tasks.length, 2);
  assert.equal(d.tasks[0].due, null);
  assert.equal(d.tasks[1].subjectId, null, 'unknown subject ids are removed');
  assert.equal(d.schedule.length, 1);
  assert.equal(d.schedule[0].day, 7);
});

test('sanitize limits sizes and string lengths', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ name: 'S' + i }));
  const d = store.sanitize({ subjects: many, tasks: [{ title: 'x'.repeat(5000) }] });
  assert.equal(d.subjects.length, store.LIMITS.subjects);
  assert.equal(d.tasks[0].title.length, 120);
});

test('sanitize ignores prototype pollution attempts', () => {
  const d = store.sanitize(JSON.parse('{"__proto__": {"polluted": true}, "settings": {"__proto__": {"x": 1}}}'));
  assert.equal({}.polluted, undefined);
  assert.equal(d.polluted, undefined);
});

test('backup round trip and rejection of other files', () => {
  const data = store.sanitize({ subjects: [{ name: 'Física', parciales: [{ grade: 80 }] }] });
  const restored = store.importJSON(store.exportJSON(data));
  assert.equal(restored.subjects[0].name, 'Física');
  assert.equal(restored.subjects[0].parciales[0].grade, 80);
  assert.throws(() => store.importJSON('{"hello": 1}'), /notBackup/);
  assert.throws(() => store.importJSON('not json'));
  assert.throws(() => store.importJSON('x'.repeat(3 * 1024 * 1024)), /tooLarge/);
});

test('uid produces unique ids that pass validation', () => {
  const ids = new Set(Array.from({ length: 500 }, () => store.uid()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[a-z0-9]{6,24}$/);
});

// ------------------------------------------------------- source security
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const jsFiles = fs.readdirSync(path.join(root, 'js')).map((f) => path.join(root, 'js', f)).concat(path.join(root, 'sw.js'));
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('no HTML injection sinks, eval or Math.random in the code', () => {
  const banned = [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/, /Math\.random/];
  for (const f of jsFiles) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    for (const re of banned) assert.ok(!re.test(src), `${path.basename(f)} matches ${re}`);
  }
});

test('strict Content Security Policy with Trusted Types', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const d of ["default-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "require-trusted-types-for 'script'", 'trusted-types studydesk-sw']) {
    assert.ok(csp.includes(d), 'CSP includes ' + d);
  }
  assert.ok(!/unsafe-inline|unsafe-eval|https?:|\*/.test(csp), 'no unsafe sources, wildcards or external hosts');
});

test('no inline scripts, styles, event handlers or third-party resources', () => {
  assert.ok(!/<script\b[^>]*>\s*\S/.test(html.replace(/<script\b[^>]*src=[^>]*><\/script>/g, '')));
  assert.ok(!/\sstyle="/.test(html));
  assert.ok(!/\son[a-z]+\s*=/.test(html));
  const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  for (const u of external) assert.match(u, /^https:\/\/github\.com\//, u);
});

test('translations are complete in both languages', () => {
  const { STRINGS } = require('../js/i18n.js');
  assert.deepEqual(Object.keys(STRINGS.es).sort(), Object.keys(STRINGS.en).sort());
  for (const m of html.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)) {
    assert.ok(m[1] in STRINGS.es, 'missing translation: ' + m[1]);
  }
});

test('the service worker caches every app file that exists', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const files = [...sw.matchAll(/'([^']+\.(?:html|css|js|woff2|svg|png|webmanifest))'/g)].map((m) => m[1]);
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), 'missing ' + f);
});

test('university data and school system are validated', () => {
  const d = store.sanitize({
    settings: { system: 'uk' },
    uni: { min: '65', periods: [
      { name: 'I Periodo', courses: [{ name: 'Cálculo', credits: '5', grade: 88 }, { name: '', credits: 4 }, { name: 'x', credits: -1 }, { name: 'y', credits: 50 }] },
      { name: '' }, 'bad'] }
  });
  assert.equal(d.settings.system, 'hn');
  assert.equal(d.uni.min, 65);
  assert.equal(d.uni.periods.length, 1);
  assert.deepEqual(d.uni.periods[0].courses.map((c) => [c.name, c.credits, c.grade]), [['Cálculo', 5, 88]]);
  assert.equal(store.sanitize({ settings: { system: 'us' } }).settings.system, 'us');
});
