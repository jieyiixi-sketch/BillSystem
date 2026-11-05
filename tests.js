const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Calc = require('./dist/js/calc.js');

const dist = (f) => path.join(__dirname, 'dist', f);

/* ---------- money ---------- */
test('totals: 100 x 3, 10% discount, 9% tax', () => {
  const t = Calc.totals({ items: [{ qty: 3, price: 100 }], discount: 10, tax: 9 });
  assert.equal(t.subtotal, 300);
  assert.equal(t.net, 270);
  assert.equal(t.taxAmount, 24.3);
  assert.equal(t.total, 294.3);
});

test('totals: no floating point drift (0.1 + 0.2 = 0.30)', () => {
  const t = Calc.totals({ items: [{ qty: 1, price: 0.1 }, { qty: 1, price: 0.2 }] });
  assert.equal(t.subtotal, 0.3);
});

test('totals: lines add up to the subtotal after rounding', () => {
  const items = [{ qty: 3, price: 0.335 }, { qty: 3, price: 0.335 }, { qty: 3, price: 0.335 }];
  const t = Calc.totals({ items });
  assert.equal(Calc.r2(t.lines.reduce((a, b) => a + b, 0)), t.subtotal);
});

test('r2 rounds half up correctly', () => {
  assert.equal(Calc.r2(1.005), 1.01);
  assert.equal(Calc.r2(2.675), 2.68);
});

test('balance = total - deposit and never negative', () => {
  const items = [{ qty: 1, price: 1000 }];
  assert.equal(Calc.totals({ items, deposit: 500 }).balance, 500);
  assert.equal(Calc.totals({ items, deposit: 5000 }).balance, 0);
});

test('bad input is treated as zero; discount is clamped to 0-100', () => {
  const t = Calc.totals({ items: [{ qty: 'abc', price: '' }, { qty: 2, price: 50 }], discount: 150 });
  assert.equal(t.subtotal, 100);
  assert.equal(t.total, 0);
});

test('money formats as S$ with 2 decimals', () => {
  assert.match(Calc.money(1234.5), /^S\$ 1,234\.50$/);
  assert.match(Calc.money(undefined), /^S\$ 0\.00$/);
});

/* ---------- dates ---------- */
test('today() uses local date parts (regression: UTC off-by-one)', () => {
  const d = new Date(2026, 10, 5, 0, 30); // 5 Nov 2026, 00:30 local
  assert.equal(Calc.ymd(d), '2026-11-05');
});

test('plusDays crosses month and year boundaries', () => {
  assert.equal(Calc.plusDays('2026-01-31', 30), '2026-03-02');
  assert.equal(Calc.plusDays('2026-12-15', 30), '2027-01-14');
  assert.equal(Calc.plusDays('2026-11-05', 30), '2026-12-05');
});

/* ---------- numbering ---------- */
test('nextNumber starts at 0001 with no documents', () => {
  assert.equal(Calc.nextNumber('Quotation', []), 'QAK-0001');
  assert.equal(Calc.nextNumber('Invoice', []), 'INV-0001');
  assert.equal(Calc.nextNumber('Cash Sales', []), 'CS-0001');
});

test('nextNumber uses docNumber and does not throw (regression: d.number)', () => {
  const docs = [
    { type: 'Quotation', docNumber: 'QAK-0007' },
    { type: 'Quotation', docNumber: 'QAK-0003' },
    { type: 'Invoice', docNumber: 'INV-0020' }
  ];
  assert.equal(Calc.nextNumber('Quotation', docs), 'QAK-0008');
  assert.equal(Calc.nextNumber('Invoice', docs), 'INV-0021');
  assert.equal(Calc.nextNumber('Cash Sales', docs), 'CS-0001');
});

test('nextNumber ignores malformed documents', () => {
  assert.equal(Calc.nextNumber('Quotation', [null, {}, { type: 'Quotation' }]), 'QAK-0001');
});

/* ---------- notes ---------- */
test('convertNotes replaces untouched default notes', () => {
  const out = Calc.convertNotes(Calc.defaultNotes('Quotation'), 'Quotation', 'Invoice');
  assert.equal(out, Calc.defaultNotes('Invoice'));
  assert.ok(!/valid for/i.test(out));
});

test('convertNotes keeps hand-edited notes but drops the validity line', () => {
  const out = Calc.convertNotes('* Custom term\n* Quotation is valid for 30 days.', 'Quotation', 'Invoice');
  assert.equal(out, '* Custom term');
});

/* ---------- ids ---------- */
test('uuid returns unique v4-style ids', () => {
  const a = Calc.uuid(), b = Calc.uuid();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

/* ---------- project structure ---------- */
test('all browser scripts parse', () => {
  for (const f of ['js/calc.js', 'js/storage.js', 'js/drive.js', 'js/app.js']) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(dist(f), 'utf8'), { filename: f }), f);
  }
});

test('index.html references files that exist', () => {
  const html = fs.readFileSync(dist('index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^":]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 5);
  for (const r of refs) assert.ok(fs.existsSync(dist(r)), `missing file: ${r}`);
});

test('index.html has the required fields and no eager Google script', () => {
  const html = fs.readFileSync(dist('index.html'), 'utf8');
  for (const id of ['customerId', 'projectSite', 'poNumber', 'googleClientId', 'docType', 'items', 'save', 'print'])
    assert.ok(html.includes(`id="${id}"`), `missing field: ${id}`);
  assert.ok(!html.includes('accounts.google.com'));
});

test('every element id used by app.js exists in index.html', () => {
  const html = fs.readFileSync(dist('index.html'), 'utf8');
  const js = fs.readFileSync(dist('js/app.js'), 'utf8');
  const used = new Set([...js.matchAll(/\$\('#([A-Za-z]+)'\)/g)].map((m) => m[1]));
  for (const id of used) assert.ok(html.includes(`id="${id}"`), `app.js uses #${id} but index.html lacks it`);
});

test('app.js keeps its core features', () => {
  const js = fs.readFileSync(dist('js/app.js'), 'utf8');
  for (const t of ["convert('Invoice')", "convert('Cash Sales')", 'Drive.backup', 'window.print()'])
    assert.ok(js.includes(t), `missing: ${t}`);
});
