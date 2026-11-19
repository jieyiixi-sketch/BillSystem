/* CableFlow – UI logic. Depends on Calc (calc.js), Store (storage.js), Drive (drive.js). */
(() => {
  'use strict';

  const { r2, money, amountInWords, today, plusDays, nextNumber, defaultNotes, convertNotes, uuid } = Calc;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const FIELDS = [
    'customerName', 'customerAddress', 'customerContact', 'customerId', 'preparedBy',
    'personInCharge', 'poNumber', 'projectSite', 'projectDate', 'completion',
    'paymentTerms', 'docNumber', 'docDate', 'quotationRef', 'validUntil', 'notes'
  ];
  const SETTING_FIELDS = [
    'companyName', 'companyReg', 'companyAddress', 'companyPhone', 'companyEmail',
    'bankDetails', 'defaultPreparedBy', 'googleClientId'
  ];

  const state = { currentId: null, driveFileId: '', type: 'Quotation', dirty: false };

  /* ---------- helpers ---------- */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const debounce = (fn, ms) => {
    let id;
    return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  };

  const fit = (t) => {
    t.style.height = 'auto';
    if (t.scrollHeight) t.style.height = t.scrollHeight + 'px'; // 0 when the view is hidden
  };
  const fitAll = () => $$('#items .product, #items .desc').forEach(fit);

  const markDirty = () => { state.dirty = true; };
  const confirmDiscard = () => !state.dirty || confirm('You have unsaved changes. Discard them?');

  /* ---------- line items ---------- */
  function addRow(item = {}) {
    const { product = '', description = '', qty = 1, price = 0 } = item;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><textarea class="product" rows="2" placeholder="e.g. Cat6 cabling">${esc(product)}</textarea></td>
      <td><textarea class="desc" rows="4" placeholder="Work description">${esc(description)}</textarea></td>
      <td><input class="qty" type="number" min="0" step="0.01" value="${esc(qty)}"></td>
      <td><input class="price" type="number" min="0" step="0.01" value="${esc(price)}"></td>
      <td class="amount"></td>
      <td class="no-print"><button type="button" class="remove" aria-label="Remove row">×</button></td>`;
    $('#items').append(tr);

    const textareas = tr.querySelectorAll('textarea');
    textareas.forEach((textarea) => textarea.addEventListener('input', () => fit(textarea)));
    tr.querySelectorAll('input,textarea').forEach((i) => i.addEventListener('input', calculate));
    tr.querySelector('.remove').onclick = () => {
      tr.remove();
      calculate();
      markDirty();
    };
    textareas.forEach(fit);
    calculate();
  }

  function calculate() {
    const rows = $$('#items tr');
    const t = Calc.totals({
      items: rows.map((r) => ({ qty: r.querySelector('.qty').value, price: r.querySelector('.price').value })),
      discount: $('#discount').value,
      tax: $('#tax').value,
      other: $('#other').value,
      deposit: $('#deposit').value
    });
    rows.forEach((r, i) => (r.querySelector('.amount').textContent = t.lines[i].toFixed(2)));
    $('#subtotal').textContent = money(t.subtotal);
    $('#grandTotal').textContent = money(t.total);
    $('#total').textContent = money(t.total);
    $('#balance').textContent = money(t.balance);
    $('#amountWords').textContent = amountInWords(t.total);
    return t.total;
  }

  /* ---------- form <-> document ---------- */
  function collect() {
    const d = {
      id: state.currentId || uuid(),
      driveFileId: state.driveFileId || '',
      type: $('#docType').value,
      discount: Number($('#discount').value) || 0,
      tax: Number($('#tax').value) || 0,
      other: Number($('#other').value) || 0,
      deposit: Number($('#deposit').value) || 0,
      total: calculate(),
      updatedAt: new Date().toISOString(),
      items: $$('#items tr').map((r) => ({
        product: r.querySelector('.product').value,
        description: r.querySelector('.desc').value,
        qty: Number(r.querySelector('.qty').value) || 0,
        price: Number(r.querySelector('.price').value) || 0
      }))
    };
    FIELDS.forEach((k) => (d[k] = $('#' + k).value.trim()));
    return d;
  }

  function fill(d, { dirty = false } = {}) {
    // only treat the doc as "saved" if it really exists in storage
    state.currentId = d.id && Store.getDocs().some((x) => x.id === d.id) ? d.id : null;
    state.driveFileId = d.driveFileId || '';
    state.type = d.type || 'Quotation';

    $('#docType').value = state.type;
    FIELDS.forEach((k) => ($('#' + k).value = d[k] ?? ''));
    $('#discount').value = d.discount || 0;
    $('#tax').value = d.tax || 0;
    $('#other').value = d.other || 0;
    $('#deposit').value = d.deposit || 0;

    $('#items').innerHTML = '';
    (d.items?.length ? d.items : [{}]).forEach(addRow);

    syncHeader();
    state.dirty = dirty;
    $('#saveState').textContent = state.currentId ? 'Saved document' : 'Not saved yet';
  }

  function blank(type = 'Quotation') {
    const date = today();
    fill({
      type,
      docNumber: nextNumber(type, Store.getDocs()),
      docDate: date,
      validUntil: type === 'Quotation' ? plusDays(date, 30) : '',
      projectDate: date,
      preparedBy: Store.getSettings().defaultPreparedBy || '',
      completion: '30 days',
      paymentTerms: 'DUE ON RECEIPT',
      items: [{
        product: 'STRUCTURE CABLING',
        description: 'Supply and provide Cat6 UTP installation, termination, testing and labelling',
        qty: 1,
        price: 0
      }],
      notes: defaultNotes(type)
    });
  }

  function syncHeader() {
    const type = $('#docType').value;
    const invoice = type === 'Invoice';
    const referenceFormat = type !== 'Cash Sales';
    $('#docTitle').textContent = type.toUpperCase();
    $('#docNumberOut').textContent = $('#docNumber').value;
    $('#pageTitle').textContent = (state.currentId ? 'Edit ' : 'New ') + type;
    $('#documentPaper').classList.toggle('invoice-format', invoice);
    $('#documentPaper').classList.toggle('reference-format', referenceFormat);
    $('#billToLabel').textContent = invoice ? 'CUSTOMER DETAILS' : `${type.toUpperCase()} FOR / BILL TO`;
    $('#numberLabel').textContent = invoice ? 'Invoice #' : 'Quotation #';
    $('#personLabel').textContent = invoice ? 'Name' : 'Person Incharge';
    $('#poLabel').textContent = invoice ? 'Cust PO' : 'PO Number';
    $('#projectLabel').textContent = invoice ? 'Project' : 'Project Site';
    $('#productHeading').textContent = invoice ? 'ITEM' : 'PRODUCT';
    $('#descriptionHeading').textContent = 'DESCRIPTION';
    $('#notesLabel').textContent = invoice ? 'INVOICE NOTES' : 'TERMS & CONDITIONS';
    $('#footerMessage').textContent = invoice
      ? 'Thank you for the opportunity to provide you our services.'
      : type === 'Quotation' ? '' : 'Thank you for your business.';
    $('#signatureLabel').textContent = referenceFormat ? 'Confirmation Signature and Date' : 'Authorised signature';
    $('#quotationContact').style.display = type === 'Quotation' ? 'block' : 'none';
    $('#quotationContactName').textContent = $('#preparedBy').value || 'Prepared by';
    $('#validLabel').style.display = type === 'Quotation' ? 'grid' : 'none';
    $('#referenceLabel').style.display = invoice ? 'grid' : 'none';
    $('#amountWords').style.display = invoice ? 'block' : 'none';
    $('#invoicePayment').style.display = invoice ? 'block' : 'none';
    $('#discountRow').style.display = referenceFormat ? 'none' : 'flex';
    $('#taxRow').style.display = referenceFormat ? 'none' : 'flex';
    $('#grandTotalRow').style.display = referenceFormat ? 'flex' : 'none';
    $('#othersRow').style.display = type === 'Quotation' ? 'flex' : 'none';
    const showPayment = type !== 'Quotation';
    $('#depositRow').style.display = showPayment ? 'flex' : 'none';
    $('#balanceRow').style.display = showPayment ? 'flex' : 'none';
  }

  /* ---------- save / convert ---------- */
  async function save() {
    const d = collect();
    if (!d.docNumber || !d.customerName) return toast('Add a document number and customer name');

    const docs = Store.getDocs();
    if (docs.some((x) => x.id !== d.id && x.type === d.type && x.docNumber === d.docNumber)) {
      return toast(`${d.docNumber} already exists — use a different number`);
    }
    const i = docs.findIndex((x) => x.id === d.id);
    if (i < 0) docs.unshift(d); else docs.splice(i, 1, d);
    if (!Store.setDocs(docs)) return toast('Could not save: browser storage is full or blocked');

    state.currentId = d.id;
    state.dirty = false;
    Store.clearDraft();
    syncHeader();
    $('#saveState').textContent = 'Saved ' + new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
    renderRecords();

    const settings = Store.getSettings();
    if (!settings.driveEnabled) return toast('Document saved');
    try {
      const file = await Drive.backup(d, settings.googleClientId);
      state.driveFileId = file.id;
      const latest = Store.getDocs();
      const j = latest.findIndex((x) => x.id === d.id);
      if (j >= 0) { latest[j].driveFileId = file.id; Store.setDocs(latest); }
      toast('Saved and backed up to Google Drive');
    } catch (e) {
      toast('Saved locally. Drive: ' + e.message);
    }
  }

  function convert(type) {
    if (state.type === type) return toast(`Already a ${type}`);
    const d = collect();
    const from = d.type;
    d.id = null;
    d.driveFileId = '';
    d.type = type;
    d.docNumber = nextNumber(type, Store.getDocs());
    d.docDate = today();
    d.validUntil = '';
    d.deposit = type === 'Invoice' ? r2(d.total * 0.5) : 0;
    d.notes = convertNotes(d.notes, from, type);
    fill(d, { dirty: true });
    toast(`Converted to ${type} — save when ready`);
  }

  function duplicate() {
    const d = collect();
    d.id = null;
    d.driveFileId = '';
    d.docNumber = nextNumber(d.type, Store.getDocs());
    fill(d, { dirty: true });
    toast('Copy created — save when ready');
  }

  /* ---------- company settings ---------- */
  function applySettings() {
    const s = Store.getSettings();
    const companyName = s.companyName || 'AKVIRUS NETWORK PTE LTD';
    const companyAddress = s.companyAddress || '302 Sims Avenue, #01-11, SMART SUITES Singapore 387516';
    const companyPhone = s.companyPhone || '6683 6666';
    const companyEmail = s.companyEmail || 'ak_ops@akvirus.com';
    $('#companyNameOut').textContent = companyName;
    $('#companyPayeeOut').textContent = companyName;
    $('#companyInfoOut').textContent = `${companyAddress} Tel: ${companyPhone} | Email: ${companyEmail}`;
    $('#companyPaymentOut').textContent = [
      `UEN: ${s.companyReg || '202023329C'}`,
      s.bankDetails || 'Bank: MayBank Singapore Limited\nAccount No.: 04011560903'
    ].join('\n');
  }

  function loadSettings() {
    const s = Store.getSettings();
    SETTING_FIELDS.forEach((k) => ($('#' + k).value = s[k] || ''));
    $('#driveEnabled').checked = !!s.driveEnabled;
    applySettings();
    if (s.driveEnabled && s.googleClientId) Drive.preload();
  }

  function saveSettings() {
    const s = {};
    SETTING_FIELDS.forEach((k) => (s[k] = $('#' + k).value.trim()));
    s.driveEnabled = $('#driveEnabled').checked;
    if (!Store.setSettings(s)) return toast('Could not save: browser storage is full or blocked');
    applySettings();
    if (s.driveEnabled && s.googleClientId) Drive.preload();
    toast('Settings saved');
  }

  async function connectDrive() {
    try {
      await Drive.connect($('#googleClientId').value.trim());
      $('#driveStatus').textContent = 'Connected for this session';
      toast('Google Drive connected');
    } catch (e) {
      toast('Drive: ' + e.message);
    }
  }

  /* ---------- saved documents ---------- */
  function renderRecords() {
    const q = $('#search').value.trim().toLowerCase();
    const all = Store.getDocs();
    const docs = all.filter((d) => `${d.customerName || ''} ${d.docNumber || ''}`.toLowerCase().includes(q));
    $('#recordCount').textContent = all.length;
    $('#recordList').innerHTML = docs.length
      ? docs.map((d) => `
        <div class="record">
          <div><strong>${esc(d.customerName || 'Unnamed customer')}</strong><small>${esc(d.docNumber)} · ${esc(d.docDate)}</small></div>
          <div class="type">${esc(d.type)}</div>
          <div class="money">${money(d.total)}</div>
          <div class="row-actions">
            <button type="button" data-open="${esc(d.id)}">Open</button>
            <button type="button" data-copy="${esc(d.id)}">Copy</button>
            <button type="button" data-delete="${esc(d.id)}">Delete</button>
          </div>
        </div>`).join('')
      : `<div class="empty">${all.length ? 'No documents match your search.' : 'No saved documents yet.'}</div>`;
  }

  function onRecordClick(e) {
    const { open, copy, delete: del } = e.target.dataset;
    const id = open || copy || del;
    if (!id) return;
    const docs = Store.getDocs();
    const d = docs.find((x) => x.id === id);
    if (!d) return;

    if (del) {
      if (!confirm(`Delete ${d.docNumber}?`)) return;
      Store.setDocs(docs.filter((x) => x.id !== id));
      if (state.currentId === id) { state.currentId = null; state.dirty = true; syncHeader(); }
      renderRecords();
      return toast('Document deleted');
    }
    if (!confirmDiscard()) return;
    if (copy) {
      fill({ ...d, id: null, driveFileId: '', docNumber: nextNumber(d.type, docs) }, { dirty: true });
    } else {
      fill(d);
    }
    showView('editor');
  }

  function showView(id) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
    $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
    if (id === 'records') renderRecords();
    if (id === 'editor') fitAll();
  }

  /* ---------- draft auto-save ---------- */
  function restoreDraft() {
    const draft = Store.getDraft();
    if (!draft || !draft.docNumber) return false;
    if (confirm('An unsaved draft was found from last time. Restore it?')) {
      fill(draft, { dirty: true });
      return true;
    }
    Store.clearDraft();
    return false;
  }

  /* ---------- events ---------- */
  function bind() {
    $('#addItem').onclick = () => { addRow(); markDirty(); };
    ['discount', 'tax', 'other', 'deposit'].forEach((id) => ($('#' + id).oninput = calculate));
    $('#docNumber').addEventListener('input', syncHeader);
    $('#preparedBy').addEventListener('input', syncHeader);

    $('#docType').onchange = () => {
      const type = $('#docType').value;
      if (!state.currentId) {
        $('#docNumber').value = nextNumber(type, Store.getDocs());
        $('#notes').value = convertNotes($('#notes').value, state.type, type);
        $('#validUntil').value = type === 'Quotation' ? plusDays($('#docDate').value || today(), 30) : '';
      }
      state.type = type;
      syncHeader();
    };

    $('#save').onclick = save;
    $('#print').onclick = () => {
      showView('editor');
      fitAll();
      window.print();
    };
    $('#convertInvoice').onclick = () => convert('Invoice');
    $('#convertCash').onclick = () => convert('Cash Sales');
    $('#duplicate').onclick = duplicate;
    $('#newDoc').onclick = () => {
      if (!confirmDiscard()) return;
      blank();
      showView('editor');
    };
    $$('nav button').forEach((b) => (b.onclick = () => showView(b.dataset.view)));

    $('#search').oninput = debounce(renderRecords, 200);
    $('#recordList').onclick = onRecordClick;
    $('#saveSettings').onclick = saveSettings;
    $('#connectDrive').onclick = connectDrive;

    // any edit inside the editor marks the document as unsaved
    $('#editor').addEventListener('input', markDirty);

    // logo is optional: hide it if the file is missing
    $('#companyLogo').addEventListener('error', (e) => (e.target.style.display = 'none'));

    window.addEventListener('beforeprint', fitAll);
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    setInterval(() => { if (state.dirty) Store.setDraft(collect()); }, 30000);
  }

  /* ---------- start ---------- */
  bind();
  loadSettings();
  if (!restoreDraft()) blank();
  renderRecords();
})();
