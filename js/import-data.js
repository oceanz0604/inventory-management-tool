/* ============================================================
   Zentory — Bulk import (CSV / Excel)
   ------------------------------------------------------------
   Guided flow: upload -> auto-map columns -> preview & validate
   -> commit. Creates products AND optional opening stock (as a
   purchase batch) in one pass. CSV is parsed natively; .xlsx/.xls
   uses SheetJS (window.XLSX) if available.
   ============================================================ */
const ImportData = (() => {
  // Target fields we can import, with header synonyms for auto-mapping.
  const FIELDS = [
    { key: 'name', label: 'Name', required: true, syn: ['name', 'product', 'product name', 'item', 'item name', 'description'] },
    { key: 'sku', label: 'SKU', syn: ['sku', 'code', 'item code', 'product code', 'barcode'] },
    { key: 'type', label: 'Type (raw/simple)', syn: ['type', 'product type'] },
    { key: 'category', label: 'Category', syn: ['category', 'group', 'sector'] },
    { key: 'unit', label: 'Unit', syn: ['unit', 'uom', 'unit of measure'] },
    { key: 'hsnCode', label: 'HSN Code', syn: ['hsn', 'hsn code', 'hsncode'] },
    { key: 'gstRate', label: 'GST %', numeric: true, syn: ['gst', 'gst%', 'gst rate', 'tax', 'tax%'] },
    { key: 'costPrice', label: 'Cost Price', numeric: true, syn: ['cost', 'cost price', 'purchase price', 'buy price', 'rate'] },
    { key: 'price', label: 'Selling Price', numeric: true, syn: ['selling price', 'sell price', 'sale price', 'price', 'sp'] },
    { key: 'mrp', label: 'MRP', numeric: true, syn: ['mrp', 'max retail price'] },
    { key: 'wholesalePrice', label: 'Wholesale Price', numeric: true, syn: ['wholesale', 'wholesale price', 'ws price'] },
    { key: 'openingStock', label: 'Opening Stock', numeric: true, syn: ['opening stock', 'stock', 'qty', 'quantity', 'opening qty'] },
    { key: 'location', label: 'Location', syn: ['location', 'store', 'warehouse', 'branch'] },
    { key: 'batchNumber', label: 'Batch Number', syn: ['batch', 'batch number', 'lot', 'lot number'] },
    { key: 'expiryDate', label: 'Expiry Date', syn: ['expiry', 'expiry date', 'exp', 'exp date', 'best before'] },
    { key: 'minStock', label: 'Min Stock', numeric: true, syn: ['min stock', 'minimum stock', 'reorder', 'reorder level', 'min'] },
  ];

  const TEMPLATE_HEADERS = ['Name', 'SKU', 'Type', 'Category', 'Unit', 'HSN Code', 'GST %', 'Cost Price', 'Selling Price', 'MRP', 'Wholesale Price', 'Opening Stock', 'Location', 'Batch Number', 'Expiry Date (YYYY-MM-DD)', 'Min Stock'];
  const TEMPLATE_SAMPLE = ['Wireless Mouse', '', 'simple', 'Electronics', 'pcs', '8471', '18', '250', '499', '599', '400', '20', '', '', '', '5'];

  let headers = [];
  let rows = [];          // array of arrays (raw cell strings)
  let mapping = {};       // fieldKey -> header index (or -1)

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function init() {
    const btn = document.getElementById('import-btn');
    if (btn) btn.addEventListener('click', open);
    document.getElementById('import-template-btn').addEventListener('click', _downloadTemplate);
    document.getElementById('import-file').addEventListener('change', _onFile);
    document.getElementById('import-map-back').addEventListener('click', () => _showStep('upload'));
    document.getElementById('import-map-next').addEventListener('click', _buildPreview);
    document.getElementById('import-preview-back').addEventListener('click', () => _showStep('map'));
    document.getElementById('import-commit-btn').addEventListener('click', _commit);
  }

  function open() {
    headers = []; rows = []; mapping = {};
    document.getElementById('import-file').value = '';
    _showStep('upload');
    document.getElementById('import-modal').classList.remove('hidden');
  }

  function _showStep(step) {
    ['upload', 'map', 'preview'].forEach(s =>
      document.getElementById('import-step-' + s).classList.toggle('hidden', s !== step));
    const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
    show('import-map-back', step === 'map');
    show('import-map-next', step === 'map');
    show('import-preview-back', step === 'preview');
    show('import-commit-btn', step === 'preview');
  }

  // ---------- Template ----------
  function _downloadTemplate() {
    const csv = [TEMPLATE_HEADERS, TEMPLATE_SAMPLE].map(r => r.map(_csvCell).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'zentory-import-template.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function _csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // ---------- File parsing ----------
  function _onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isExcel = /\.(xlsx|xls)$/.test(name);
    if (isExcel && !window.XLSX) {
      App.showToast('Excel support is still loading. Please retry, or use a CSV file.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let parsed;
        if (isExcel) parsed = _parseExcel(ev.target.result);
        else parsed = _parseCSV(ev.target.result);
        if (!parsed.headers.length || !parsed.rows.length) {
          App.showToast('No data rows found in the file', 'warning'); return;
        }
        headers = parsed.headers;
        rows = parsed.rows;
        _autoMap();
        _renderMapping();
        _showStep('map');
      } catch (err) {
        console.error(err);
        App.showToast('Could not read the file: ' + (err && err.message || 'unknown error'), 'error');
      }
    };
    reader.onerror = () => App.showToast('Failed to read file', 'error');
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  function _parseExcel(buf) {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: true, defval: '' });
    const hdr = (aoa.shift() || []).map(h => String(h == null ? '' : h).trim());
    const body = aoa.filter(r => r.some(c => String(c == null ? '' : c).trim() !== ''))
      .map(r => hdr.map((_, i) => r[i]));
    return { headers: hdr, rows: body };
  }

  // Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines).
  function _parseCSV(text) {
    text = text.replace(/^\ufeff/, '');
    const out = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); out.push(row); }
    const hdr = (out.shift() || []).map(h => h.trim());
    const body = out.filter(r => r.some(c => (c || '').trim() !== ''))
      .map(r => hdr.map((_, i) => r[i]));
    return { headers: hdr, rows: body };
  }

  // ---------- Mapping ----------
  function _norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9%]/g, ''); }
  function _autoMap() {
    const normHeaders = headers.map(_norm);
    FIELDS.forEach(f => {
      let idx = -1;
      for (const syn of f.syn) {
        const ns = _norm(syn);
        idx = normHeaders.findIndex(h => h === ns);
        if (idx >= 0) break;
      }
      if (idx < 0) {
        for (const syn of f.syn) {
          const ns = _norm(syn);
          idx = normHeaders.findIndex(h => h && (h.includes(ns) || ns.includes(h)));
          if (idx >= 0) break;
        }
      }
      mapping[f.key] = idx;
    });
  }

  function _renderMapping() {
    const opts = (sel) => '<option value="-1">— skip —</option>' +
      headers.map((h, i) => '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + _esc(h || ('Column ' + (i + 1))) + '</option>').join('');
    const body = document.getElementById('import-map-body');
    body.innerHTML = FIELDS.map(f =>
      '<div class="import-map-row">' +
      '<label>' + _esc(f.label) + (f.required ? ' <span style="color:var(--danger)">*</span>' : '') + '</label>' +
      '<select class="select-input" data-field="' + f.key + '">' + opts(mapping[f.key]) + '</select>' +
      '</div>'
    ).join('');
    body.querySelectorAll('select').forEach(sel =>
      sel.addEventListener('change', () => { mapping[sel.dataset.field] = parseInt(sel.value, 10); }));
    document.getElementById('import-map-count').textContent = rows.length + ' row' + (rows.length !== 1 ? 's' : '') + ' detected';
  }

  // ---------- Validation / preview ----------
  function _num(v) {
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function _cell(r, key) {
    const i = mapping[key];
    if (i == null || i < 0) return '';
    const v = r[i];
    return v == null ? '' : (v instanceof Date ? v : String(v)).toString().trim();
  }
  function _parseDate(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return _iso(m[1], m[2], m[3]);
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return _iso(m[3], m[2], m[1]);
    if (/^\d+$/.test(s)) { // Excel serial date
      const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
    const d = new Date(s);
    return isNaN(d) ? undefined : d.toISOString().slice(0, 10);
  }
  function _iso(y, m, d) {
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(dt) ? undefined : dt.toISOString().slice(0, 10);
  }

  function _validate() {
    const owner = Auth.ownerId();
    const locs = Store.getLocationsByOwner(owner);
    const locByName = new Map(locs.map(l => [l.name.toLowerCase().trim(), l]));
    const defaultLoc = Store.getDefaultLocation(owner);
    const existingNames = new Set(Store.getProductsByOwner(owner).map(p => (p.name || '').toLowerCase().trim()));
    const existingSkus = new Set(Store.getProductsByOwner(owner).map(p => (p.sku || '').toUpperCase()));
    const seenSku = new Set();
    const seenName = new Set();

    return rows.map((r, ri) => {
      const notes = [];
      let status = 'ok';
      const name = _cell(r, 'name');
      if (!name) return { ri, status: 'error', notes: ['Missing name'], data: null };

      const nkey = name.toLowerCase();
      if (existingNames.has(nkey) || seenName.has(nkey)) { notes.push('Duplicate product name — skipped'); return { ri, status: 'error', notes, data: null, name }; }
      seenName.add(nkey);

      let type = _cell(r, 'type').toLowerCase();
      if (type === 'complex') { notes.push('Complex needs a recipe — imported as Simple'); type = 'simple'; status = 'warn'; }
      if (type !== 'raw' && type !== 'simple') type = 'simple';
      const sellable = Store.isSellableType(type);

      let sku = _cell(r, 'sku').toUpperCase();
      if (sku) {
        if (existingSkus.has(sku) || seenSku.has(sku)) { notes.push('SKU "' + sku + '" already exists — auto-generating'); sku = ''; status = 'warn'; }
        else seenSku.add(sku);
      }

      const gstRate = _num(_cell(r, 'gstRate'));
      const costPrice = _num(_cell(r, 'costPrice'));
      const price = sellable ? _num(_cell(r, 'price')) : 0;
      const mrp = sellable ? _num(_cell(r, 'mrp')) : 0;
      const wholesalePrice = sellable ? _num(_cell(r, 'wholesalePrice')) : 0;
      if (mrp > 0 && price > mrp) { notes.push('Selling price exceeds MRP'); status = status === 'ok' ? 'warn' : status; }

      const openingStock = Math.max(0, _num(_cell(r, 'openingStock')));
      const minStock = Math.max(0, _num(_cell(r, 'minStock')));
      let locId = null, locLabel = '';
      if (openingStock > 0) {
        const locName = _cell(r, 'location');
        if (locName) {
          const found = locByName.get(locName.toLowerCase().trim());
          if (!found) return { ri, status: 'error', notes: ['Unknown location: "' + locName + '"'], data: null, name };
          locId = found.id; locLabel = found.name;
        } else if (defaultLoc) { locId = defaultLoc.id; locLabel = defaultLoc.name; }
        else return { ri, status: 'error', notes: ['Opening stock given but no location exists — add a location first'], data: null, name };
      }

      let expiryDate = null;
      const rawExp = _cell(r, 'expiryDate');
      if (rawExp) {
        const parsed = _parseDate(rawExp);
        if (parsed === undefined) { notes.push('Unrecognized expiry date — ignored'); status = status === 'ok' ? 'warn' : status; }
        else expiryDate = parsed;
      }

      return {
        ri, status, notes, name,
        data: {
          type, name, sku, categoryName: _cell(r, 'category'),
          unit: _cell(r, 'unit') || 'pcs',
          gstRate, costPrice, price, mrp, wholesalePrice, sellable,
          hsnCode: _cell(r, 'hsnCode'),
          openingStock, minStock, locId, locLabel, batchNumber: _cell(r, 'batchNumber'), expiryDate,
        },
      };
    });
  }

  let _validated = [];
  function _buildPreview() {
    if (mapping.name == null || mapping.name < 0) { App.showToast('Please map the required "Name" column', 'warning'); return; }
    _validated = _validate();
    const ok = _validated.filter(r => r.status === 'ok').length;
    const warn = _validated.filter(r => r.status === 'warn').length;
    const err = _validated.filter(r => r.status === 'error').length;

    document.getElementById('import-preview-summary').innerHTML =
      '<span class="import-badge ok"><i class="fas fa-check"></i> ' + ok + ' ready</span>' +
      '<span class="import-badge warn"><i class="fas fa-triangle-exclamation"></i> ' + warn + ' with warnings</span>' +
      '<span class="import-badge err"><i class="fas fa-xmark"></i> ' + err + ' skipped</span>';

    const shown = _validated.slice(0, 200);
    document.getElementById('import-preview-body').innerHTML = shown.map(r => {
      const d = r.data;
      const icon = r.status === 'ok' ? '<i class="fas fa-check" style="color:var(--success)"></i>'
        : r.status === 'warn' ? '<i class="fas fa-triangle-exclamation" style="color:var(--warning)"></i>'
          : '<i class="fas fa-xmark" style="color:var(--danger)"></i>';
      return '<tr class="import-row-' + r.status + '">' +
        '<td>' + icon + '</td>' +
        '<td>' + _esc(r.name || '—') + '</td>' +
        '<td>' + (d ? _esc(d.type) : '—') + '</td>' +
        '<td>' + (d ? _esc(d.categoryName || '—') : '—') + '</td>' +
        '<td>' + (d ? d.openingStock : '—') + (d && d.locLabel ? ' @ ' + _esc(d.locLabel) : '') + '</td>' +
        '<td style="color:var(--text-secondary);font-size:.82rem">' + _esc(r.notes.join('; ')) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('import-preview-more').textContent = _validated.length > 200 ? '+ ' + (_validated.length - 200) + ' more rows (all will be imported)' : '';

    const importable = ok + warn;
    const btn = document.getElementById('import-commit-btn');
    btn.disabled = importable === 0;
    btn.innerHTML = '<i class="fas fa-file-import"></i> Import ' + importable + ' product' + (importable !== 1 ? 's' : '');
    _showStep('preview');
  }

  // ---------- Commit ----------
  function _commit() {
    const owner = Auth.ownerId();
    const catCache = new Map();
    Store.getCategories().forEach(c => catCache.set((c.name || '').toLowerCase().trim(), c.id));
    const usedSkus = new Set(Store.getProductsByOwner(owner).map(p => (p.sku || '').toUpperCase()));

    let products = 0, stocked = 0;
    _validated.filter(r => r.data && r.status !== 'error').forEach(({ data }) => {
      let categoryId = '';
      if (data.categoryName) {
        const ck = data.categoryName.toLowerCase().trim();
        if (catCache.has(ck)) categoryId = catCache.get(ck);
        else { const color = (typeof CATALOG !== 'undefined') ? CATALOG.colorFor(data.categoryName) : '#6366f1'; const cat = Store.addCategory({ id: Store.generateId(), name: data.categoryName, color: color }); catCache.set(ck, cat.id); categoryId = cat.id; }
      }
      let sku = data.sku;
      if (!sku) { do { sku = 'IMP-' + Math.floor(10000 + Math.random() * 90000); } while (usedSkus.has(sku)); }
      usedSkus.add(sku);

      const productId = Store.generateId();
      Store.addProduct({
        id: productId, ownerId: owner, type: data.type, name: data.name, sku,
        categoryId, unit: data.unit,
        price: data.price, mrp: data.mrp, wholesalePrice: data.wholesalePrice,
        costPrice: 0, gstRate: data.gstRate, hsnCode: data.hsnCode, description: '',
        isPublished: false, recipe: null, createdAt: new Date().toISOString(),
      });
      products++;

      if (data.openingStock > 0 && data.locId) {
        Store.addBatch({
          productId, locationId: data.locId, qty: data.openingStock,
          unitCost: data.costPrice, batchNumber: data.batchNumber || null, expiryDate: data.expiryDate || null,
        });
        if (data.minStock > 0) {
          const qty = Store.getBatchQty(productId, data.locId);
          Store.setStock(productId, data.locId, qty, data.minStock);
        }
        stocked++;
      }
    });

    document.getElementById('import-modal').classList.add('hidden');
    App.showToast('Imported ' + products + ' product' + (products !== 1 ? 's' : '') + (stocked ? ' \u00b7 ' + stocked + ' with opening stock' : ''), 'success');
    Products.populateFilters();
    Products.render();
    Inventory.refreshFilters();
    Inventory.render();
    Dashboard.refresh();
  }

  return { init, open };
})();
