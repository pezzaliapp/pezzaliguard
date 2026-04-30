/* ===================================================================
   PezzaliGuard — app.js
   Vanilla JS. No frameworks, no external libs.
   All data lives in localStorage. No network calls of any kind.
   =================================================================== */

(() => {
  'use strict';

  /* -----------------------------------------------------------------
     0. Constants
     ----------------------------------------------------------------- */
  const STORAGE_KEY = 'pezzaliguard:db:v1';
  const DB_VERSION  = '1.0.0';

  // Categories used in the dropdown — single source of truth.
  const CATEGORIES = [
    'SPAM', 'Call Center', 'Truffa', 'Energia', 'Trading',
    'Sospetto', 'Cliente', 'Fornitore', 'Famiglia', 'Lavoro', 'Altro'
  ];

  /* -----------------------------------------------------------------
     1. Storage layer
        - single localStorage key holding the whole db
        - atomic write, simple to reason about
     ----------------------------------------------------------------- */
  const Storage = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return Storage._empty();
        const parsed = JSON.parse(raw);
        // shape sanity-check
        if (!parsed || !Array.isArray(parsed.entries)) return Storage._empty();
        return parsed;
      } catch (err) {
        console.warn('[storage] load failed, resetting', err);
        return Storage._empty();
      }
    },
    save(db) {
      db.updated = new Date().toISOString();
      db.version = db.version || DB_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    },
    wipe() { localStorage.removeItem(STORAGE_KEY); },
    _empty() {
      return {
        version: DB_VERSION,
        updated: null,
        entries: []
      };
    }
  };

  /* -----------------------------------------------------------------
     2. State
     ----------------------------------------------------------------- */
  const state = {
    db: Storage.load(),
    currentView: 'dashboard',
    searchSpam: '',
    searchWhite: '',
    filter: 'all',     // all | block | identify
    sort: 'recent'     // recent | oldest | az
  };

  /* -----------------------------------------------------------------
     3. Helpers
     ----------------------------------------------------------------- */

  // Generate a short unique id
  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // Normalize a phone number to E.164-style digits only (no '+').
  // Defaults to Italy (+39) when no country code is supplied.
  function normalizeNumber(input) {
    let s = String(input || '').trim();
    if (!s) return '';

    const isIntl = s.startsWith('+') || s.startsWith('00');
    let digits = s.replace(/\D/g, '');
    if (s.startsWith('00')) digits = digits.slice(2);

    if (!isIntl) {
      // Local format → assume Italy
      // If digits already start with 39 and have valid international length, leave as is.
      const looksItalian = digits.startsWith('39') && digits.length >= 11 && digits.length <= 13;
      if (!looksItalian) digits = '39' + digits;
    }
    return digits;
  }

  // Pretty display: "+39 333 1234567" / "+39 02 1234 5678" / "+44 20 12345678"
  function formatNumberForDisplay(digits) {
    if (!digits) return '';
    if (digits.startsWith('39')) {
      const rest = digits.slice(2);
      if (rest.startsWith('3')) {
        // Italian mobile: prefix(3) + 3 + rest
        return '+39 ' + rest.slice(0, 3) + ' ' + rest.slice(3);
      }
      if (rest.startsWith('0')) {
        // Italian landline: rough split → city code (2-4) + rest
        const city = rest.length > 9 ? rest.slice(0, 3) : rest.slice(0, 2);
        return '+39 ' + city + ' ' + rest.slice(city.length);
      }
      return '+39 ' + rest;
    }
    // Generic: +CC then groups of 3
    return '+' + digits.replace(/(\d{2,3})(?=(\d{3})+$)/g, '$1 ');
  }

  // Format ISO date → IT short string
  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const today = new Date(); today.setHours(0,0,0,0);
      const yest  = new Date(today); yest.setDate(yest.getDate()-1);
      const day   = new Date(d);     day.setHours(0,0,0,0);
      const time  = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      if (day.getTime() === today.getTime()) return `oggi ${time}`;
      if (day.getTime() === yest.getTime())  return `ieri ${time}`;
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  // Escape HTML for safe insertion
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* -----------------------------------------------------------------
     4. Toast system
     ----------------------------------------------------------------- */
  function toast(msg, kind = '') {
    const stack = document.getElementById('toastStack');
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    stack.appendChild(t);
    setTimeout(() => t.remove(), 2900);
  }

  /* -----------------------------------------------------------------
     5. Confirm dialog (promise-based)
     ----------------------------------------------------------------- */
  function confirmDialog(message, { okText = 'Conferma', danger = true } = {}) {
    return new Promise(resolve => {
      const modal  = document.getElementById('confirm');
      const msgEl  = document.getElementById('confirmMsg');
      const okBtn  = document.getElementById('confirmOk');
      msgEl.textContent = message;
      okBtn.textContent = okText;
      okBtn.classList.toggle('btn-danger', danger);
      okBtn.classList.toggle('btn-primary', !danger);
      modal.hidden = false;

      const close = (val) => {
        modal.hidden = true;
        okBtn.removeEventListener('click', onOk);
        modal.querySelectorAll('[data-confirm-close]').forEach(b => b.removeEventListener('click', onCancel));
        resolve(val);
      };
      const onOk = () => close(true);
      const onCancel = () => close(false);
      okBtn.addEventListener('click', onOk);
      modal.querySelectorAll('[data-confirm-close]').forEach(b => b.addEventListener('click', onCancel));
    });
  }

  /* -----------------------------------------------------------------
     6. CRUD API
     ----------------------------------------------------------------- */
  function getAll()        { return state.db.entries; }
  function getById(id)     { return state.db.entries.find(e => e.id === id); }
  function getByDigits(d)  { return state.db.entries.find(e => e.numberDigits === d); }

  function upsert(record) {
    const now = new Date().toISOString();
    if (record.id) {
      const idx = state.db.entries.findIndex(e => e.id === record.id);
      if (idx >= 0) {
        state.db.entries[idx] = { ...state.db.entries[idx], ...record, updatedAt: now };
      }
    } else {
      // New record — collision check
      const existing = getByDigits(record.numberDigits);
      if (existing) {
        // overwrite existing instead of duplicating
        state.db.entries[state.db.entries.indexOf(existing)] = {
          ...existing, ...record, id: existing.id, updatedAt: now
        };
      } else {
        state.db.entries.push({
          id: uid(),
          createdAt: now,
          updatedAt: now,
          ...record
        });
      }
    }
    Storage.save(state.db);
  }

  function remove(id) {
    state.db.entries = state.db.entries.filter(e => e.id !== id);
    Storage.save(state.db);
  }

  function counts() {
    const c = { all: 0, block: 0, identify: 0, whitelist: 0 };
    for (const e of state.db.entries) {
      c.all++;
      if (e.action in c) c[e.action]++;
    }
    return c;
  }

  /* -----------------------------------------------------------------
     7. Rendering
     ----------------------------------------------------------------- */
  function render() {
    renderDashboard();
    renderNumbersList();
    renderWhitelist();
    document.getElementById('dbVersion').textContent    = state.db.version || DB_VERSION;
    document.getElementById('footerVersion').textContent = 'v' + (state.db.version || DB_VERSION);
  }

  function renderDashboard() {
    const c = counts();
    document.getElementById('dbTotal').textContent     = c.all;
    document.getElementById('countBlock').textContent  = c.block;
    document.getElementById('countIdentify').textContent = c.identify;
    document.getElementById('countWhitelist').textContent = c.whitelist;
    document.getElementById('dbUpdated').textContent   = formatDate(state.db.updated);

    // status pill
    const pill = document.getElementById('dbStatePill');
    pill.classList.remove('warn','bad');
    if (c.all === 0) {
      pill.textContent = 'VUOTO'; pill.classList.add('warn');
    } else if (c.all > 5000) {
      pill.textContent = 'GRANDE'; pill.classList.add('warn');
    } else {
      pill.textContent = 'OK';
    }

    // recent list (5 most recent)
    const recent = [...state.db.entries]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 5);

    const recentEl = document.getElementById('recentList');
    if (recent.length === 0) {
      recentEl.innerHTML = `
        <div class="empty-state">
          <p>Nessun numero ancora archiviato.</p>
          <p class="empty-sub">Aggiungi il primo numero o importa un CSV.</p>
        </div>`;
    } else {
      recentEl.innerHTML = recent.map(entryHTML).join('');
      bindEntryRows(recentEl);
    }
  }

  function renderNumbersList() {
    const list  = document.getElementById('numbersList');
    const meta  = document.getElementById('listCount');
    const q     = state.searchSpam.trim().toLowerCase();

    let items = state.db.entries.filter(e => e.action !== 'whitelist');

    if (state.filter !== 'all') items = items.filter(e => e.action === state.filter);
    if (q) {
      items = items.filter(e =>
        (e.numberDigits || '').includes(q) ||
        (e.label || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }

    items = sortItems(items, state.sort);

    meta.textContent = items.length === 1 ? '1 numero' : `${items.length} numeri`;

    if (items.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${q ? 'Nessun risultato per la ricerca.' : 'Nessun numero spam in archivio.'}</p>
          <p class="empty-sub">${q ? 'Prova con un\'altra parola chiave.' : 'Tocca il pulsante + in basso a destra per aggiungerne uno.'}</p>
        </div>`;
    } else {
      list.innerHTML = items.map(entryHTML).join('');
      bindEntryRows(list);
    }
  }

  function renderWhitelist() {
    const list = document.getElementById('whitelistList');
    const meta = document.getElementById('whitelistCount');
    const q = state.searchWhite.trim().toLowerCase();

    let items = state.db.entries.filter(e => e.action === 'whitelist');
    if (q) {
      items = items.filter(e =>
        (e.numberDigits || '').includes(q) ||
        (e.label || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }
    items = sortItems(items, state.sort);

    meta.textContent = items.length === 1 ? '1 numero' : `${items.length} numeri`;

    if (items.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${q ? 'Nessun risultato.' : 'Whitelist vuota.'}</p>
          <p class="empty-sub">${q ? '' : 'Aggiungi numeri sicuri di clienti, fornitori, famiglia o lavoro.'}</p>
        </div>`;
    } else {
      list.innerHTML = items.map(entryHTML).join('');
      bindEntryRows(list);
    }
  }

  function sortItems(items, mode) {
    const arr = [...items];
    if (mode === 'recent') arr.sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    else if (mode === 'oldest') arr.sort((a,b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
    else if (mode === 'az') arr.sort((a,b) => (a.label || '').localeCompare(b.label || ''));
    return arr;
  }

  function entryHTML(e) {
    const display = formatNumberForDisplay(e.numberDigits);
    const tag     = e.action === 'block' ? 'BLOCCA'
                  : e.action === 'identify' ? 'IDENTIFICA'
                  : 'WHITELIST';
    const cat     = e.category || 'Altro';
    const lbl     = e.label || cat;
    return `
      <article class="entry" data-id="${esc(e.id)}" data-action="${esc(e.action)}">
        <div class="entry-badge"></div>
        <div class="entry-main">
          <div class="entry-num">${esc(display)}</div>
          <div class="entry-meta">
            <span class="entry-tag">${esc(tag)}</span>
            <span>${esc(lbl)}</span>
          </div>
        </div>
        <button class="entry-action" aria-label="Modifica">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </article>
    `;
  }

  function bindEntryRows(container) {
    container.querySelectorAll('.entry').forEach(el => {
      el.addEventListener('click', () => openModal(el.dataset.id));
    });
  }

  /* -----------------------------------------------------------------
     8. View routing
     ----------------------------------------------------------------- */
  function showView(name) {
    state.currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    // Reset scroll on view change for cleanliness
    window.scrollTo({ top: 0, behavior: 'instant' });
    // FAB hides on tools view (no contextual add there)
    document.getElementById('fab').style.display = (name === 'tools') ? 'none' : 'grid';
  }

  /* -----------------------------------------------------------------
     9. Modal — add / edit
     ----------------------------------------------------------------- */
  function openModal(idOrPreset) {
    const modal = document.getElementById('modal');
    const form  = document.getElementById('entryForm');
    const title = document.getElementById('modalTitle');
    const meta  = document.getElementById('f_meta');
    const delBtn = document.getElementById('deleteBtn');

    form.reset();

    let preset = null;
    let editing = null;

    if (typeof idOrPreset === 'string') {
      editing = getById(idOrPreset);
    } else if (idOrPreset && typeof idOrPreset === 'object') {
      preset = idOrPreset;
    }

    if (editing) {
      title.textContent = 'Modifica numero';
      document.getElementById('f_id').value     = editing.id;
      document.getElementById('f_number').value = formatNumberForDisplay(editing.numberDigits);
      document.getElementById('f_label').value  = CATEGORIES.includes(editing.category) ? editing.category : 'Altro';
      // If label differs from category → put in custom
      const labelMatchesCat = editing.label === editing.category;
      document.getElementById('f_label_custom').value = labelMatchesCat ? '' : (editing.label || '');
      document.getElementById('f_notes').value  = editing.notes || '';
      const radio = form.querySelector(`input[name="action"][value="${editing.action}"]`);
      if (radio) radio.checked = true;
      delBtn.hidden = false;
      meta.textContent = `Aggiunto: ${formatDate(editing.createdAt)} · ID: ${editing.id.slice(0,8)}`;
    } else {
      title.textContent = 'Nuovo numero';
      document.getElementById('f_id').value = '';
      delBtn.hidden = true;
      // Apply preset (e.g., from "add whitelist" quick action)
      const action = (preset && preset.action) || 'block';
      const radio = form.querySelector(`input[name="action"][value="${action}"]`);
      if (radio) radio.checked = true;
      // Default category by action
      const defaultCat = action === 'whitelist' ? 'Cliente' : 'SPAM';
      document.getElementById('f_label').value = defaultCat;
      meta.textContent = '';
    }

    modal.hidden = false;
    setTimeout(() => document.getElementById('f_number').focus(), 60);
  }

  function closeModal() {
    document.getElementById('modal').hidden = true;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const id     = document.getElementById('f_id').value;
    const rawNum = document.getElementById('f_number').value;
    const cat    = document.getElementById('f_label').value;
    const custom = document.getElementById('f_label_custom').value.trim();
    const notes  = document.getElementById('f_notes').value.trim();
    const actionEl = document.querySelector('input[name="action"]:checked');

    const digits = normalizeNumber(rawNum);
    if (!digits || digits.length < 5) {
      toast('Numero non valido.', 'error');
      return;
    }
    if (!actionEl) {
      toast('Seleziona un\'azione.', 'error');
      return;
    }

    const record = {
      id: id || undefined,
      numberDigits: digits,
      category: cat,
      label: custom || cat,
      action: actionEl.value,
      notes
    };

    upsert(record);
    closeModal();
    render();
    toast(id ? 'Numero aggiornato.' : 'Numero salvato.', 'success');
  }

  function handleDelete() {
    const id = document.getElementById('f_id').value;
    if (!id) return;
    confirmDialog('Eliminare definitivamente questo numero?', { okText: 'Elimina', danger: true })
      .then(ok => {
        if (!ok) return;
        remove(id);
        closeModal();
        render();
        toast('Numero eliminato.', 'warn');
      });
  }

  /* -----------------------------------------------------------------
     10. Import / Export
     ----------------------------------------------------------------- */

  // Build the iOS-friendly JSON payload exactly as the user spec requires.
  function buildExportJSON() {
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      version: DB_VERSION,
      updated: today,
      identify: [],
      block: [],
      whitelist: []
    };
    for (const e of state.db.entries) {
      const numAsInt = Number(e.numberDigits);
      // Guard: Number() can lose precision above 15 digits. Fall back to string.
      const safeNum = Number.isSafeInteger(numAsInt) ? numAsInt : e.numberDigits;
      if (e.action === 'identify') {
        payload.identify.push({ number: safeNum, label: e.label || e.category || 'SPAM' });
      } else if (e.action === 'block') {
        payload.block.push(safeNum);
      } else if (e.action === 'whitelist') {
        payload.whitelist.push({ number: safeNum, label: e.label || e.category || 'Whitelist' });
      }
    }
    return payload;
  }

  function exportJSON() {
    const payload = buildExportJSON();
    downloadFile('spam-numbers.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Esportato spam-numbers.json', 'success');
  }

  function exportWhitelistJSON() {
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      version: DB_VERSION,
      updated: today,
      whitelist: state.db.entries
        .filter(e => e.action === 'whitelist')
        .map(e => ({
          number: Number.isSafeInteger(Number(e.numberDigits)) ? Number(e.numberDigits) : e.numberDigits,
          label: e.label || e.category || 'Whitelist'
        }))
    };
    downloadFile('whitelist.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Whitelist esportata.', 'success');
  }

  function exportCSV() {
    const header = 'number,label,action,notes\n';
    const rows = state.db.entries.map(e => csvRow([
      e.numberDigits,
      e.label || e.category || '',
      e.action,
      e.notes || ''
    ])).join('\n');
    downloadFile('pezzaliguard-export.csv', header + rows, 'text/csv');
    toast('CSV esportato.', 'success');
  }

  function csvRow(values) {
    return values.map(v => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',');
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ---------- IMPORT ----------

  let pendingImportType = null; // 'json' | 'csv' | null (auto-detect)

  function triggerImport(kind) {
    pendingImportType = kind || null;
    const fi = document.getElementById('fileInput');
    fi.value = '';
    fi.click();
  }

  function handleFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const kind = pendingImportType
                 || (file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
      try {
        if (kind === 'json') importJSON(text);
        else                 importCSV(text);
      } catch (err) {
        console.error(err);
        toast('Errore di import: ' + (err.message || err), 'error');
      }
    };
    reader.onerror = () => toast('Impossibile leggere il file.', 'error');
    reader.readAsText(file, 'utf-8');
  }

  async function importJSON(text) {
    const data = JSON.parse(text);
    const incoming = [];

    // Accept two shapes:
    //   1) The export shape  { identify:[], block:[], whitelist:[] }
    //   2) Internal shape    { entries: [...] }
    if (Array.isArray(data.entries)) {
      for (const e of data.entries) {
        const digits = normalizeNumber(e.numberDigits || e.number);
        if (!digits) continue;
        incoming.push({
          numberDigits: digits,
          category: e.category || 'Altro',
          label: e.label || e.category || 'SPAM',
          action: ['identify','block','whitelist'].includes(e.action) ? e.action : 'identify',
          notes: e.notes || ''
        });
      }
    } else {
      if (Array.isArray(data.identify)) {
        for (const it of data.identify) {
          const digits = normalizeNumber(it && it.number);
          if (!digits) continue;
          incoming.push({
            numberDigits: digits,
            category: 'SPAM',
            label: (it && it.label) || 'SPAM',
            action: 'identify',
            notes: ''
          });
        }
      }
      if (Array.isArray(data.block)) {
        for (const it of data.block) {
          const digits = normalizeNumber(typeof it === 'object' ? it.number : it);
          if (!digits) continue;
          incoming.push({
            numberDigits: digits,
            category: 'SPAM',
            label: (typeof it === 'object' && it.label) || 'Blacklist',
            action: 'block',
            notes: ''
          });
        }
      }
      if (Array.isArray(data.whitelist)) {
        for (const it of data.whitelist) {
          const digits = normalizeNumber(typeof it === 'object' ? it.number : it);
          if (!digits) continue;
          incoming.push({
            numberDigits: digits,
            category: 'Cliente',
            label: (typeof it === 'object' && it.label) || 'Whitelist',
            action: 'whitelist',
            notes: ''
          });
        }
      }
    }

    if (incoming.length === 0) {
      toast('Il file JSON non contiene numeri validi.', 'warn');
      return;
    }

    const choice = await chooseImportStrategy(incoming.length);
    if (!choice) return;
    applyImport(incoming, choice);
  }

  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast('CSV vuoto.', 'warn');
      return;
    }

    // Detect header
    const first = rows[0].map(h => h.trim().toLowerCase());
    const hasHeader = ['number','label','action','notes'].some(h => first.includes(h));
    const idx = {
      number: hasHeader ? first.indexOf('number')  : 0,
      label:  hasHeader ? first.indexOf('label')   : 1,
      action: hasHeader ? first.indexOf('action')  : 2,
      notes:  hasHeader ? first.indexOf('notes')   : 3
    };
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const incoming = [];
    for (const r of dataRows) {
      const number = idx.number >= 0 ? r[idx.number] : r[0];
      if (!number) continue;
      const digits = normalizeNumber(number);
      if (!digits) continue;
      const action = (idx.action >= 0 ? (r[idx.action] || '') : '').trim().toLowerCase();
      const validAction = ['identify','block','whitelist'].includes(action) ? action : 'identify';
      const label = (idx.label >= 0 ? (r[idx.label] || '') : '').trim();
      const notes = (idx.notes >= 0 ? (r[idx.notes] || '') : '').trim();
      const category = CATEGORIES.includes(label) ? label : (validAction === 'whitelist' ? 'Cliente' : 'SPAM');
      incoming.push({
        numberDigits: digits,
        category,
        label: label || category,
        action: validAction,
        notes
      });
    }

    if (incoming.length === 0) {
      toast('Nessuna riga valida nel CSV.', 'warn');
      return;
    }

    chooseImportStrategy(incoming.length).then(choice => {
      if (!choice) return;
      applyImport(incoming, choice);
    });
  }

  // Minimal CSV parser (handles quoted fields with commas / "" escaping)
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    text = text.replace(/\r\n?/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => (c || '').trim() !== ''));
  }

  function chooseImportStrategy(count) {
    return confirmDialog(
      `Trovati ${count} numeri. Sostituire l'intero database o unire ai numeri esistenti?\n\n` +
      `(Conferma = SOSTITUISCI · Annulla per scegliere "unisci")`,
      { okText: 'Sostituisci', danger: true }
    ).then(replaceAll => {
      if (replaceAll) return 'replace';
      // Second prompt for "merge or cancel"
      return confirmDialog(
        `Vuoi unire i ${count} numeri al database esistente? I duplicati verranno aggiornati.`,
        { okText: 'Unisci', danger: false }
      ).then(merge => merge ? 'merge' : null);
    });
  }

  function applyImport(incoming, strategy) {
    if (strategy === 'replace') {
      state.db.entries = [];
    }
    let added = 0, updated = 0;
    const now = new Date().toISOString();
    for (const inc of incoming) {
      const existing = getByDigits(inc.numberDigits);
      if (existing) {
        Object.assign(existing, inc, { updatedAt: now });
        updated++;
      } else {
        state.db.entries.push({ id: uid(), createdAt: now, updatedAt: now, ...inc });
        added++;
      }
    }
    Storage.save(state.db);
    render();
    toast(`Import completato: ${added} aggiunti, ${updated} aggiornati.`, 'success');
  }

  /* -----------------------------------------------------------------
     11. Quick stats
     ----------------------------------------------------------------- */
  function showStats() {
    const total = state.db.entries.length;
    if (total === 0) {
      toast('Database vuoto.', 'warn');
      return;
    }
    const byCategory = {};
    for (const e of state.db.entries) {
      const k = e.category || 'Altro';
      byCategory[k] = (byCategory[k] || 0) + 1;
    }
    const lines = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `• ${k}: ${v}`);
    confirmDialog(
      `Database: ${total} numeri\nUltima modifica: ${formatDate(state.db.updated)}\n\n` +
      `Per categoria:\n${lines.join('\n')}`,
      { okText: 'OK', danger: false }
    );
  }

  /* -----------------------------------------------------------------
     12. Wipe DB
     ----------------------------------------------------------------- */
  async function wipeDB() {
    const ok = await confirmDialog(
      'Cancellare TUTTO il database? Questa operazione non si può annullare. Esporta prima un backup.',
      { okText: 'Cancella tutto', danger: true }
    );
    if (!ok) return;
    Storage.wipe();
    state.db = Storage.load();
    render();
    toast('Database cancellato.', 'warn');
  }

  /* -----------------------------------------------------------------
     13. Privacy info dialog
     ----------------------------------------------------------------- */
  function showPrivacy() {
    confirmDialog(
      'PezzaliGuard è 100% locale. Non viene inviato alcun dato a server, non ci sono account, ' +
      'cookie pubblicitari o tracker. I dati restano nel tuo browser (localStorage).\n\n' +
      'IMPORTANTE: su iPhone, una PWA NON può bloccare le chiamate. Questa app gestisce il database e ' +
      'genera un file spam-numbers.json che alimenterà la futura app iOS nativa con CallKit.',
      { okText: 'Capito', danger: false }
    );
  }

  /* -----------------------------------------------------------------
     14. Wiring everything up on DOMContentLoaded
     ----------------------------------------------------------------- */
  function bindGlobalEvents() {

    // Bottom nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });

    // FAB
    document.getElementById('fab').addEventListener('click', () => {
      const action = state.currentView === 'whitelist' ? 'whitelist' : 'block';
      openModal({ action });
    });

    // Quick actions
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => handleAction(el.dataset.action));
    });

    // Search bar (spam list)
    const searchEl = document.getElementById('searchInput');
    searchEl.addEventListener('input', () => {
      state.searchSpam = searchEl.value;
      searchEl.parentElement.classList.toggle('has-value', !!searchEl.value);
      renderNumbersList();
    });
    document.getElementById('searchClear').addEventListener('click', () => {
      searchEl.value = '';
      state.searchSpam = '';
      searchEl.parentElement.classList.remove('has-value');
      renderNumbersList();
      searchEl.focus();
    });

    // Search bar (whitelist)
    const whiteSearch = document.getElementById('whitelistSearch');
    whiteSearch.addEventListener('input', () => {
      state.searchWhite = whiteSearch.value;
      renderWhitelist();
    });

    // Filter chips
    document.getElementById('filterChips').addEventListener('click', (ev) => {
      const c = ev.target.closest('.chip');
      if (!c) return;
      state.filter = c.dataset.filter;
      document.querySelectorAll('#filterChips .chip').forEach(x => x.classList.toggle('active', x === c));
      renderNumbersList();
    });

    // Sort toggle
    document.getElementById('sortToggle').addEventListener('click', (e) => {
      const order = ['recent', 'oldest', 'az'];
      const labels = { recent: 'Più recenti ▾', oldest: 'Meno recenti ▾', az: 'A → Z ▾' };
      const next = order[(order.indexOf(state.sort) + 1) % order.length];
      state.sort = next;
      e.target.textContent = labels[next];
      renderNumbersList();
      renderWhitelist();
    });

    // Whitelist quick export
    document.getElementById('exportWhitelistBtn').addEventListener('click', exportWhitelistJSON);

    // Modal close
    document.querySelectorAll('#modal [data-close]').forEach(el => {
      el.addEventListener('click', closeModal);
    });

    // Form
    document.getElementById('entryForm').addEventListener('submit', handleSubmit);
    document.getElementById('deleteBtn').addEventListener('click', handleDelete);

    // Privacy info
    document.getElementById('quickInfoBtn').addEventListener('click', showPrivacy);

    // File input
    document.getElementById('fileInput').addEventListener('change', handleFile);

    // ESC closes modal
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (!document.getElementById('modal').hidden) closeModal();
      }
    });
  }

  function handleAction(name) {
    switch (name) {
      case 'add-spam':         openModal({ action: 'block' }); break;
      case 'add-whitelist':    openModal({ action: 'whitelist' }); break;
      case 'export-json':      exportJSON(); break;
      case 'export-csv':       exportCSV(); break;
      case 'export-whitelist': exportWhitelistJSON(); break;
      case 'import':           triggerImport(); break;
      case 'import-json':      triggerImport('json'); break;
      case 'import-csv':       triggerImport('csv'); break;
      case 'show-stats':       showStats(); break;
      case 'wipe-db':          wipeDB(); break;
    }
  }

  /* -----------------------------------------------------------------
     14b. Community lists (importable phone-number databases)
     ----------------------------------------------------------------- */
  const CommunityLists = {
    indexUrl: 'community-lists/index.json',
    cache: null,

    // Load the directory of available lists from the local index.json
    async loadIndex() {
      if (CommunityLists.cache) return CommunityLists.cache;
      try {
        const res = await fetch(CommunityLists.indexUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        CommunityLists.cache = data;
        return data;
      } catch (err) {
        console.warn('[community] index load failed', err);
        return null;
      }
    },

    // Render the cards inside #communityLists
    async render() {
      const root  = document.getElementById('communityLists');
      const empty = document.getElementById('communityListsEmpty');
      if (!root) return;

      const data = await CommunityLists.loadIndex();
      if (!data || !Array.isArray(data.lists) || data.lists.length === 0) {
        if (empty) empty.innerHTML = '<p>Nessuna lista community disponibile.</p>';
        return;
      }

      root.innerHTML = data.lists.map(list => CommunityLists.cardHTML(list)).join('');
      // Wire up buttons
      root.querySelectorAll('.community-import-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.listId;
          const list = data.lists.find(l => l.id === id);
          if (list) CommunityLists.handleImport(list, btn);
        });
      });
    },

    cardHTML(list) {
      const badgeClass = list.external ? 'cdn' : 'local';
      const badgeText  = list.external ? 'CDN' : 'Locale';
      const warning    = list.warning
        ? `<div class="community-warn">${esc(list.warning)}</div>`
        : '';
      return `
        <article class="community-card" data-list-id="${esc(list.id)}">
          <div class="community-card-main">
            <div class="community-card-title">
              ${esc(list.name)}
              <span class="community-card-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="community-card-desc">${esc(list.description)}</div>
            <div class="community-card-meta">
              <span><strong>Fonte:</strong> ${esc(list.source)}</span>
              <span><strong>Dimensione:</strong> ${esc(list.size_hint || '—')}</span>
              <span><strong>Categoria:</strong> ${esc(list.category || '—')}</span>
            </div>
            ${warning}
          </div>
          <div class="community-card-actions">
            <button class="community-import-btn primary" data-list-id="${esc(list.id)}">
              Importa nel database
            </button>
          </div>
        </article>
      `;
    },

    async handleImport(list, btnEl) {
      const card = btnEl.closest('.community-card');

      // External lists need explicit consent (privacy disclosure)
      if (list.external) {
        const ok = await confirmDialog(
          `Per scaricare "${list.name}" la PWA contatterà:\n\n${list.url}\n\n` +
          `Il tuo IP sarà visibile a quel server. I dati scaricati restano comunque locali sul tuo dispositivo.\n\nProcedere?`,
          { okText: 'Scarica', danger: false }
        );
        if (!ok) return;
      }

      CommunityLists.setCardState(card, btnEl, 'loading', 'Scaricamento…');

      try {
        const text = await CommunityLists.fetchWithTimeout(list.url, 12000);
        const incoming = CommunityLists.parse(text, list);
        if (incoming.length === 0) {
          CommunityLists.setCardState(card, btnEl, 'error', 'Lista vuota');
          toast('La lista non contiene numeri validi.', 'warn');
          return;
        }
        // Merge into local DB (do not auto-replace)
        applyImport(incoming, 'merge');
        CommunityLists.setCardState(card, btnEl, 'success', `Importati ${incoming.length} numeri ✓`);
      } catch (err) {
        console.warn('[community] import failed', err);
        CommunityLists.setCardState(card, btnEl, 'error', 'Errore download');
        toast('Errore: ' + (err.message || 'download fallito'), 'error');
      }
    },

    setCardState(card, btnEl, kind, label) {
      if (!card || !btnEl) return;
      card.classList.remove('is-loading','is-success','is-error');
      btnEl.disabled = false;
      if (kind === 'loading') {
        card.classList.add('is-loading');
        btnEl.disabled = true;
        btnEl.innerHTML = `<span class="community-spinner" aria-hidden="true"></span> ${esc(label)}`;
      } else if (kind === 'success') {
        card.classList.add('is-success');
        btnEl.textContent = label;
      } else if (kind === 'error') {
        card.classList.add('is-error');
        btnEl.textContent = label + ' — riprova';
      } else {
        btnEl.textContent = 'Importa nel database';
      }
    },

    // fetch with abortable timeout
    fetchWithTimeout(url, ms) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal, cache: 'no-cache' })
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .finally(() => clearTimeout(t));
    },

    // Convert raw list content to internal records, based on declared format
    parse(text, list) {
      const fmt = list.format || 'csv';
      const defAction = list.default_action === 'block' ? 'block'
                      : list.default_action === 'whitelist' ? 'whitelist'
                      : 'identify';

      // ---- pezzaliguard-json: same shape as our spam-numbers.json ----
      if (fmt === 'pezzaliguard-json') {
        const data = JSON.parse(text);
        const out = [];
        const pushItems = (arr, action, fallbackLabel) => {
          if (!Array.isArray(arr)) return;
          for (const it of arr) {
            const num = (typeof it === 'object' && it !== null) ? it.number : it;
            const label = (typeof it === 'object' && it !== null && it.label) ? it.label : fallbackLabel;
            const digits = normalizeNumber(num);
            if (!digits) continue;
            out.push({
              numberDigits: digits,
              category: 'SPAM',
              label,
              action,
              notes: 'Importato da: ' + list.name
            });
          }
        };
        pushItems(data.identify,  'identify',  'SPAM');
        pushItems(data.block,     'block',     'Blacklist');
        pushItems(data.whitelist, 'whitelist', 'Whitelist');
        return out;
      }

      // ---- csv-numbers-only: one number per line, optional comma comment after ----
      if (fmt === 'csv-numbers-only' || fmt === 'txt') {
        const out = [];
        const lines = text.split(/\r?\n/);
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          if (line.startsWith('#') || line.startsWith('//')) continue;
          // Take everything up to the first comma/semicolon (NOT space, since
          // numbers like "+39 02 8088 6927" contain spaces).
          const token = line.split(/[,;]/)[0].trim();
          const digits = normalizeNumber(token);
          if (!digits || digits.length < 6) continue;
          out.push({
            numberDigits: digits,
            category: 'SPAM',
            label: list.name,
            action: defAction,
            notes: 'Importato da: ' + list.name
          });
        }
        return out;
      }

      // ---- csv with header: number,label,action,notes ----
      if (fmt === 'csv') {
        const rows = parseCSV(text);
        if (rows.length === 0) return [];
        const first = rows[0].map(h => (h || '').trim().toLowerCase());
        const hasHeader = ['number','label','action','notes'].some(h => first.includes(h));
        const idx = {
          number: hasHeader ? first.indexOf('number') : 0,
          label:  hasHeader ? first.indexOf('label')  : 1,
          action: hasHeader ? first.indexOf('action') : 2,
          notes:  hasHeader ? first.indexOf('notes')  : 3
        };
        const dataRows = hasHeader ? rows.slice(1) : rows;
        const out = [];
        for (const r of dataRows) {
          const num = idx.number >= 0 ? r[idx.number] : r[0];
          if (!num) continue;
          const digits = normalizeNumber(num);
          if (!digits || digits.length < 6) continue;
          const action = (idx.action >= 0 ? (r[idx.action] || '') : '').trim().toLowerCase();
          const validAction = ['identify','block','whitelist'].includes(action) ? action : defAction;
          const label = (idx.label >= 0 ? (r[idx.label] || '') : '').trim() || list.name;
          out.push({
            numberDigits: digits,
            category: 'SPAM',
            label,
            action: validAction,
            notes: 'Importato da: ' + list.name
          });
        }
        return out;
      }

      throw new Error('Formato lista non supportato: ' + fmt);
    }
  };

  /* -----------------------------------------------------------------
     15. Service worker registration
     ----------------------------------------------------------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // Use a relative URL so it works under any GitHub Pages subpath.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .catch(err => console.warn('[sw] registration failed', err));
    });
  }

  /* -----------------------------------------------------------------
     16. Init
     ----------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    bindGlobalEvents();
    render();
    registerSW();
    CommunityLists.render();
  });

})();
