const Inventory = (() => {
  let currentSort = { field: 'product', direction: 'asc' };
  let mode = 'batch';            // 'batch' (add/edit lot) | 'min' (edit reorder level)
  let editingBatchId = null;
  const expanded = {};           // key `${productId}@${locationId}` -> true

  function init() {
    document.getElementById('add-stock-btn').addEventListener('click', () => openBatchModal());
    document.getElementById('add-first-stock-btn').addEventListener('click', () => openBatchModal());
    document.getElementById('stock-form').addEventListener('submit', _handleSubmit);
    document.getElementById('inventory-search').addEventListener('input', render);
    document.getElementById('filter-location').addEventListener('change', render);
    document.getElementById('filter-category').addEventListener('change', render);
    document.getElementById('filter-stock').addEventListener('change', render);

    document.querySelectorAll('#view-inventory .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (currentSort.field === f) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        else { currentSort.field = f; currentSort.direction = 'asc'; }
        render();
      });
    });
  }

  // Products that can be stocked via purchase batches (raw + simple; complex is
  // stocked by Produce only).
  function _stockableProducts() {
    return Store.getProductsByOwner(Auth.ownerId()).filter(p => (p.type || 'simple') !== 'complex');
  }

  function refreshFilters() {
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    const cats = Store.getCategories();
    const prods = _stockableProducts();
    const sellers = Store.getPartiesByType(Auth.ownerId(), 'seller');

    document.getElementById('filter-location').innerHTML = '<option value="">All Locations</option>' + locs.map(l => '<option value="' + l.id + '">' + _esc(l.name) + '</option>').join('');
    document.getElementById('filter-category').innerHTML = '<option value="">All Categories</option>' + cats.map(c => '<option value="' + c.id + '">' + _esc(c.name) + '</option>').join('');
    document.getElementById('stock-product').innerHTML = '<option value="">Select product</option>' + prods.map(p => '<option value="' + p.id + '">' + _esc(p.name) + ' (' + _esc(p.sku) + ')</option>').join('');
    document.getElementById('stock-location').innerHTML = '<option value="">Select location</option>' + locs.map(l => '<option value="' + l.id + '">' + _esc(l.name) + '</option>').join('');
    document.getElementById('stock-supplier').innerHTML = '<option value="">— None —</option>' + sellers.map(s => '<option value="' + s.id + '">' + _esc(s.name) + '</option>').join('');
    SearchableSelect.enhanceAll(document.getElementById('view-inventory'));
  }

  // Build product x location summary rows from the stock cache.
  function _summaries() {
    const search = document.getElementById('inventory-search').value.toLowerCase().trim();
    const locFilter = document.getElementById('filter-location').value;
    const catFilter = document.getElementById('filter-category').value;
    const stockFilter = document.getElementById('filter-stock').value;

    let rows = Store.getStockByOwner(Auth.ownerId()).map(s => {
      const product = Store.getProductById(s.productId);
      const location = Store.getLocationById(s.locationId);
      return { ...s, product, location };
    }).filter(s => s.product && s.location);

    if (search) rows = rows.filter(s => s.product.name.toLowerCase().includes(search) || (s.product.sku || '').toLowerCase().includes(search));
    if (locFilter) rows = rows.filter(s => s.locationId === locFilter);
    if (catFilter) rows = rows.filter(s => s.product.categoryId === catFilter);
    if (stockFilter === 'low') rows = rows.filter(s => s.quantity > 0 && s.quantity <= s.minStock);
    else if (stockFilter === 'out') rows = rows.filter(s => s.quantity === 0);
    else if (stockFilter === 'ok') rows = rows.filter(s => s.quantity > s.minStock);
    else if (stockFilter === 'expiring') rows = rows.filter(s => Store.availableLots(s.productId, s.locationId).some(b => {
      if (!b.expiryDate) return false;
      return Math.ceil((new Date(b.expiryDate) - new Date()) / 86400000) <= 30;
    }));

    rows.sort((a, b) => {
      let va, vb;
      if (currentSort.field === 'quantity') { va = a.quantity; vb = b.quantity; }
      else { va = a.product.name.toLowerCase(); vb = b.product.name.toLowerCase(); }
      if (va < vb) return currentSort.direction === 'asc' ? -1 : 1;
      if (va > vb) return currentSort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function render() {
    refreshFilters();
    const rows = _summaries();
    const allStock = Store.getStockByOwner(Auth.ownerId());
    const tbody = document.getElementById('inventory-table-body');
    const empty = document.getElementById('no-inventory');

    if (allStock.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      tbody.closest('.card').querySelector('table').classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.closest('.card').querySelector('table').classList.remove('hidden');

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary)">No stock matches your filters</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(s => {
      const key = s.productId + '@' + s.locationId;
      const isOpen = !!expanded[key];
      const type = s.product.type || 'simple';
      const badge = s.quantity === 0 ? '<span class="badge badge-danger">Out</span>' : s.quantity <= s.minStock ? '<span class="badge badge-warning">Low</span>' : '<span class="badge badge-success">In Stock</span>';
      const lots = Store.getBatchesByProduct(s.productId, s.locationId).filter(b => b.qty > 0).sort((a, b) => {
        const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return ax - bx;
      });
      const lotCount = lots.length;

      const main = '<tr>' +
        '<td>' + (lotCount ? '<button class="btn-icon" onclick="Inventory.toggle(\'' + key + '\')"><i class="fas fa-chevron-' + (isOpen ? 'down' : 'right') + '"></i></button>' : '') + '</td>' +
        '<td><strong>' + _esc(s.product.name) + '</strong> <code style="background:var(--bg);padding:1px 5px;border-radius:4px;font-size:.72rem">' + _esc(s.product.sku) + '</code></td>' +
        '<td><span class="type-pill ' + type + '">' + ({ raw: 'Raw', simple: 'Simple', complex: 'Complex' }[type]) + '</span></td>' +
        '<td>' + _esc(s.location.name) + '</td>' +
        '<td><strong>' + s.quantity + '</strong> <span style="color:var(--text-light);font-size:.75rem">(' + lotCount + ' lot' + (lotCount !== 1 ? 's' : '') + ')</span></td>' +
        '<td>' + s.minStock + '</td>' +
        '<td>' + badge + '</td>' +
        '<td><div class="action-btns">' +
        (type !== 'complex' ? '<button class="btn-icon" title="Add batch" onclick="Inventory.openBatchModal(null,\'' + s.productId + '\',\'' + s.locationId + '\')"><i class="fas fa-plus"></i></button>' : '') +
        '<button class="btn-icon edit" title="Set reorder level" onclick="Inventory.openMin(\'' + s.productId + '\',\'' + s.locationId + '\')"><i class="fas fa-sliders"></i></button>' +
        '</div></td></tr>';

      if (!isOpen || !lotCount) return main;

      const lotRows = lots.map(b => {
        let exp = '<span style="color:var(--text-light)">—</span>';
        if (b.expiryDate) {
          const d = Math.ceil((new Date(b.expiryDate) - new Date()) / 86400000);
          const color = d <= 0 ? 'var(--danger)' : d <= 30 ? 'var(--warning)' : 'var(--text-secondary)';
          exp = '<span style="color:' + color + '" title="' + new Date(b.expiryDate).toLocaleDateString('en-IN') + '">' + (d <= 0 ? 'Expired' : d + 'd') + '</span>';
        }
        const sup = b.supplierPartyId ? (Store.getPartyById(b.supplierPartyId) || {}).name : '';
        return '<tr>' +
          '<td><code style="font-size:.75rem">' + _esc(b.batchNumber || '—') + '</code></td>' +
          '<td>' + b.qty + '</td>' +
          '<td>\u20B9' + (b.unitCost || 0).toFixed(2) + '</td>' +
          '<td>' + exp + '</td>' +
          '<td>' + (sup ? _esc(sup) : (b.note ? '<span style="color:var(--text-light)">' + _esc(b.note) + '</span>' : '—')) + '</td>' +
          '<td><div class="action-btns">' +
          '<button class="btn-icon edit" title="Edit lot" onclick="Inventory.openBatchModal(\'' + b.id + '\')"><i class="fas fa-pen"></i></button>' +
          '<button class="btn-icon delete" title="Delete lot" onclick="Inventory.deleteBatch(\'' + b.id + '\')"><i class="fas fa-trash-can"></i></button>' +
          '</div></td></tr>';
      }).join('');

      return main + '<tr class="lots-subrow"><td></td><td colspan="7" style="padding:0">' +
        '<table class="data-table" style="margin:.25rem 0"><thead><tr><th>Lot #</th><th>Qty</th><th>Unit cost</th><th>Expiry</th><th>Supplier / Note</th><th></th></tr></thead><tbody>' + lotRows + '</tbody></table>' +
        '</td></tr>';
    }).join('');
  }

  function toggle(key) { expanded[key] = !expanded[key]; render(); }

  function _setBatchFieldsVisible(v) {
    document.getElementById('stock-batch-fields').classList.toggle('hidden', !v);
  }

  function openBatchModal(batchId, productId, locationId) {
    mode = 'batch';
    editingBatchId = batchId || null;
    refreshFilters();
    document.getElementById('stock-form').reset();
    document.getElementById('stock-batch-id').value = editingBatchId || '';
    _setBatchFieldsVisible(true);
    const prodSel = document.getElementById('stock-product');
    const locSel = document.getElementById('stock-location');

    if (editingBatchId) {
      const b = Store.getBatchById(editingBatchId);
      if (!b) return;
      document.getElementById('stock-modal-title').textContent = 'Edit Batch';
      prodSel.value = b.productId; locSel.value = b.locationId;
      prodSel.disabled = true; locSel.disabled = true;
      document.getElementById('stock-quantity').value = b.qty;
      document.getElementById('stock-cost').value = b.unitCost || 0;
      document.getElementById('stock-batch').value = b.batchNumber || '';
      document.getElementById('stock-expiry').value = b.expiryDate || '';
      document.getElementById('stock-supplier').value = b.supplierPartyId || '';
      const rec = Store.getStockRecord(b.productId, b.locationId);
      document.getElementById('stock-min').value = rec ? rec.minStock : 0;
    } else {
      document.getElementById('stock-modal-title').textContent = 'Add Purchase Batch';
      prodSel.disabled = false; locSel.disabled = false;
      if (productId) prodSel.value = productId;
      if (locationId) locSel.value = locationId;
      const rec = (productId && locationId) ? Store.getStockRecord(productId, locationId) : null;
      document.getElementById('stock-min').value = rec ? rec.minStock : 0;
    }
    SearchableSelect.enhanceAll(document.getElementById('stock-modal'));
    document.getElementById('stock-modal').classList.remove('hidden');
  }

  function openMin(productId, locationId) {
    mode = 'min';
    editingBatchId = null;
    refreshFilters();
    document.getElementById('stock-form').reset();
    _setBatchFieldsVisible(false);
    document.getElementById('stock-modal-title').textContent = 'Set Reorder Level';
    const prodSel = document.getElementById('stock-product');
    const locSel = document.getElementById('stock-location');
    prodSel.value = productId; locSel.value = locationId;
    prodSel.disabled = true; locSel.disabled = true;
    const rec = Store.getStockRecord(productId, locationId);
    document.getElementById('stock-min').value = rec ? rec.minStock : 0;
    SearchableSelect.enhanceAll(document.getElementById('stock-modal'));
    document.getElementById('stock-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('stock-product').value;
    const locationId = document.getElementById('stock-location').value;
    const min = parseInt(document.getElementById('stock-min').value, 10) || 0;
    if (!productId || !locationId) { App.showToast('Select product and location', 'warning'); return; }

    if (mode === 'min') {
      Store.setStock(productId, locationId, Store.getBatchQty(productId, locationId), min);
      App.showToast('Reorder level updated', 'success');
    } else {
      const qty = parseFloat(document.getElementById('stock-quantity').value) || 0;
      const unitCost = parseFloat(document.getElementById('stock-cost').value) || 0;
      const batchNumber = document.getElementById('stock-batch').value.trim();
      const expiryDate = document.getElementById('stock-expiry').value || null;
      const supplierPartyId = document.getElementById('stock-supplier').value || null;

      if (editingBatchId) {
        Store.updateBatch(editingBatchId, { qty, unitCost, batchNumber, expiryDate, supplierPartyId });
        App.showToast('Batch updated', 'success');
      } else {
        Store.addBatch({ productId, locationId, qty, unitCost, batchNumber: batchNumber || ('PUR-' + Store.generateId().slice(0, 5).toUpperCase()), expiryDate, supplierPartyId });
        App.showToast('Batch added. Stock & cost updated.', 'success');
      }
      Store.setStock(productId, locationId, Store.getBatchQty(productId, locationId), min);
    }

    document.getElementById('stock-product').disabled = false;
    document.getElementById('stock-location').disabled = false;
    document.getElementById('stock-modal').classList.add('hidden');
    editingBatchId = null; mode = 'batch';
    render();
    if (window.Products) Products.render();
    Dashboard.refresh();
  }

  function deleteBatch(batchId) {
    const b = Store.getBatchById(batchId);
    if (!b) return;
    document.getElementById('delete-message').textContent = 'Delete this lot (' + (b.batchNumber || 'batch') + ', ' + b.qty + ' units)?';
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      Store.deleteBatch(batchId);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Lot deleted', 'success');
      render();
      if (window.Products) Products.render();
      Dashboard.refresh();
    });
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, render, openBatchModal, openMin, toggle, deleteBatch, refreshFilters };
})();
