/* Pure helpers: money maths, dates, document numbering.
   Works in the browser (global `Calc`) and in Node (require) so it can be unit-tested. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PREFIX = { Quotation: 'QAK', Invoice: 'INV', 'Cash Sales': 'CS' };

  const NOTES = {
    Quotation: [
      '* Price quoted does not include supply and installation of cable support systems unless stated.',
      '* Quotation is valid for 30 days.',
      '* Payment: 50% upon confirmation, balance upon job completion.',
      '* Additional work outside the stated scope will be charged accordingly.',
      '* Prices are in Singapore Dollars.'
    ].join('\n'),
    Invoice: [
      '* Payment is due according to the terms stated above.',
      '* Please make payment to the bank account shown in the header.',
      '* Additional work outside the stated scope will be charged accordingly.',
      '* Prices are in Singapore Dollars.'
    ].join('\n'),
    'Cash Sales': [
      '* Payment received in full. Thank you.',
      '* Prices are in Singapore Dollars.'
    ].join('\n')
  };

  /* ---------- numbers ---------- */
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  /** Round to 2 decimals, avoiding floating point drift (1.005 -> 1.01). */
  const r2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  const money = (n) =>
    'S$ ' + num(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function amountInWords(value) {
    const n = Math.floor(Math.max(0, num(value)));
    if (!n) return 'SINGAPORE DOLLAR ZERO ONLY';
    const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
    const tens = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
    const underThousand = (v) => [
      v >= 100 ? `${ones[Math.floor(v / 100)]} HUNDRED` : '',
      v % 100 < 20 ? ones[v % 100] : `${tens[Math.floor((v % 100) / 10)]}${v % 10 ? `-${ones[v % 10]}` : ''}`
    ].filter(Boolean).join(' ');
    const groups = [[1e9, 'BILLION'], [1e6, 'MILLION'], [1e3, 'THOUSAND']];
    let rest = n;
    const words = [];
    groups.forEach(([size, name]) => {
      if (rest >= size) {
        words.push(`${underThousand(Math.floor(rest / size))} ${name}`);
        rest %= size;
      }
    });
    if (rest) words.push(underThousand(rest));
    return `SINGAPORE DOLLAR ${words.join(' ')} ONLY`;
  }

  const lineAmount = (qty, price) => r2(num(qty) * num(price));

  /**
   * items: [{qty, price}], discount % (0-100), tax % (>=0), deposit (amount)
   * Every line is rounded first, so the lines always add up to the subtotal.
   */
  function totals({ items = [], discount = 0, tax = 0, other = 0, deposit = 0 } = {}) {
    const lines = items.map((i) => lineAmount(i.qty, i.price));
    const subtotal = r2(lines.reduce((a, b) => a + b, 0));
    const discountPct = clamp(num(discount), 0, 100);
    const taxPct = Math.max(0, num(tax));
    const net = r2(subtotal * (1 - discountPct / 100));
    const taxAmount = r2(net * (taxPct / 100));
    const total = r2(net + taxAmount + num(other));
    const balance = Math.max(0, r2(total - Math.max(0, num(deposit))));
    return { lines, subtotal, discountAmount: r2(subtotal - net), net, taxAmount, total, balance };
  }

  /* ---------- dates (local time, never UTC) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  function plusDays(dateStr, n) {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return ymd(new Date(y, m - 1, d + n));
  }

  /* ---------- numbering ---------- */
  function nextNumber(type, docs = []) {
    const prefix = PREFIX[type] || 'DOC';
    const nums = docs
      .filter((d) => d && d.type === type && String(d.docNumber || '').startsWith(prefix + '-'))
      .map((d) => Number((String(d.docNumber).match(/(\d+)$/) || [0, 0])[1]) || 0);
    return `${prefix}-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
  }

  /* ---------- terms & conditions ---------- */
  const defaultNotes = (type) => NOTES[type] || '';

  /** Swap the notes when the type changes: untouched defaults are replaced,
   *  hand-edited notes only lose the "valid for N days" line. */
  function convertNotes(notes, from, to) {
    const current = String(notes || '').trim();
    if (!current || current === defaultNotes(from).trim()) return defaultNotes(to);
    if (to === 'Quotation') return notes;
    return String(notes).split('\n').filter((l) => !/valid for \d+ days/i.test(l)).join('\n');
  }

  /* ---------- ids ---------- */
  function uuid() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  return { PREFIX, r2, money, amountInWords, lineAmount, totals, ymd, today, plusDays, nextNumber, defaultNotes, convertNotes, uuid };
});
