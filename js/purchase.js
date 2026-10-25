const Purchase = (() => {
  let items = [];

  function init() {
    const search = document.getElementById('po-search');
    if (!search) return;
    search.addEventListener('input', renderProducts);
    document.getElementById('po-cat-filter').addEventListener('change', renderProducts);
    document.getElementById('po-clear').addEventListener('click', () => { items = []; _renderBill(); renderProducts(); });
    document.getElementById('po-submit').addEventListener('click', _submit);
    document.getElementById('po-back-orders').addEventListener('click', () => App.goTo('orders'));
    document.getElementById('po-add-seller').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof SearchableSelect !== 'undefined') SearchableSelect.closeAll();
      if (typeof Parties === 'undefined') { App.showToast('Suppliers are not available right now', 'error'); return; }
      Parties.openModal(null, {
        defaultType: 'seller',
        onAdded: (p) => {
          _populateFilters();
          const sel = document.getElementById('po-seller');
          if (p && p.id && sel) sel.value = p.id;
          if (typeof SearchableSelect !== 'undefined') SearchableSelect.refresh(sel);
        },
      });
    });
  }

  function refresh() {
    _populateFilters();
    renderProducts();
    _renderBill();
    SearchableSelect.enhanceAll(document.getElementById('view-purchase'));
  }

  function _populateFilters() {
    const keepCat = document.getElementById('po-cat-filter').value;
    const keepSeller = document.getElementById('po-seller').value;
    const keepLoc = document.getElementById('po-location').value;
    const cats = Store.getCategories();
    document.getElementById('po-cat-filter').innerHTML = '<option value="">All Categories</option>' +
      cats.map(c => '<option value="' + c.id + '">' + _esc(c.name) + '</option>').join('');
    if (keepCat) document.getElementById('po-cat-filter').value = keepCat;
    const sellers = Store.getPartiesByType(Auth.ownerId(), 'seller');
    document.getElementById('po-seller').innerHTML = '<option value="">-- Select supplier --</option>' +
      sellers.map(s => '<option value="' + s.id + '">' + _esc(s.name) + '</option>').join('');
    if (keepSeller) document.getElementById('po-seller').value = keepSeller;
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    document.getElementById('po-location').innerHTML = locs.map(l =>
      '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('');
    if (keepLoc) document.getElementById('po-location').value = keepLoc;
  }

  function _stockable() {
    return Store.getProductsByOwner(Auth.ownerId()).filter(p => (p.type || 'simple') !== 'complex');
  }

  function renderProducts() {
    const search = document.getElementById('po-search').value.toLowerCase().trim();
    const cat = document.getElementById('po-cat-filter').value;
    let prods = _stockable();
    if (cat) prods = prods.filter(p => p.categoryId === cat);
    if (search) prods = prods.filter(p => p.name.toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search));
    const grid = document.getElementById('po-product-grid');
    const empty = document.getElementById('no-po-products');
    if (!prods.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = prods.map(p => {
      const line = items.find(i => i.productId === p.id);
      const qty = line ? line.qty : 0;
      return '<div class="pos-item-card ' + (qty > 0 ? 'in-bill' : '') + '" onclick="Purchase.add(\'' + p.id + '\')">' +
        '<div class="pos-item-icon"><i class="fas fa-box"></i></div>' +
        '<div class="pos-item-copy"><div class="pos-item-name">' + _esc(p.name) + '</div>' +
        '<div class="pos-item-stock">' + _esc(p.unit || 'pcs') + ' · ' + _esc(p.sku || '') + '</div></div>' +
        '<div class="pos-item-price">\u20B9' + (p.costPrice || 0).toFixed(2) + '</div>' +
        (qty > 0 ? '<div class="pos-item-badge">' + qty + '</div>' : '') + '</div>';
    }).join('');
  }

  function add(productId) {
    const p = Store.getProductById(productId);
    if (!p) return;
    const existing = items.find(i => i.productId === productId);
    if (existing) existing.qty += 1;
    else items.push({
      productId: p.id, name: p.name, sku: p.sku || '', qty: 1,
      unitPrice: p.costPrice || 0, expiryDate: '',
    });
    _renderBill();
    renderProducts();
  }

  function updateLine(idx, field, value) {
    const line = items[idx];
    if (!line) return;
    if (field === 'qty') line.qty = Math.max(0.01, parseFloat(value) || 1);
    if (field === 'unitPrice') line.unitPrice = Math.max(0, parseFloat(value) || 0);
    if (field === 'lineTotal') {
      const total = Math.max(0, parseFloat(value) || 0);
      line.unitPrice = line.qty > 0 ? Math.round((total / line.qty) * 100) / 100 : 0;
    }
    if (field === 'expiryDate') line.expiryDate = value || '';
    _renderBill();
    renderProducts();
  }

  function remove(idx) {
    items.splice(idx, 1);
    _renderBill();
    renderProducts();
  }

  function _renderBill() {
    const box = document.getElementById('po-bill-items');
    if (!items.length) {
      box.innerHTML = '<div class="pos-bill-empty"><i class="fas fa-hand-pointer"></i><p>Tap products to add</p></div>';
    } else {
      box.innerHTML = items.map((i, idx) =>
        '<div class="po-bill-row">' +
          '<div class="po-bill-row-top"><strong>' + _esc(i.name) + '</strong>' +
          '<button class="pos-bill-row-remove" onclick="Purchase.remove(' + idx + ')" title="Remove"><i class="fas fa-xmark"></i></button></div>' +
          '<div class="po-bill-meta">' +
            '<label>Qty <input class="po-qty" type="number" min="0.01" step="0.01" value="' + i.qty + '" onchange="Purchase.updateLine(' + idx + ',\'qty\',this.value)"></label>' +
            '<label>Unit <input class="po-cost" type="number" min="0" step="0.01" value="' + i.unitPrice + '" onchange="Purchase.updateLine(' + idx + ',\'unitPrice\',this.value)"></label>' +
            '<label>Line ₹ <input class="po-line" type="number" min="0" step="0.01" value="' + (i.qty * i.unitPrice).toFixed(2) + '" onchange="Purchase.updateLine(' + idx + ',\'lineTotal\',this.value)"></label>' +
            '<label>Expiry <input class="po-expiry" type="date" value="' + (i.expiryDate || '') + '" onchange="Purchase.updateLine(' + idx + ',\'expiryDate\',this.value)"></label>' +
            '<span class="po-line-total">\u20B9' + (i.qty * i.unitPrice).toFixed(2) + '</span>' +
          '</div></div>').join('');
    }
    const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    document.getElementById('po-item-count').textContent = String(items.length);
    document.getElementById('po-total').textContent = '\u20B9' + total.toFixed(2);
  }

  function _submit(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      const sellerId = document.getElementById('po-seller').value;
      const locId = document.getElementById('po-location').value;
      if (!sellerId) { App.showToast('Select a supplier', 'warning'); return; }
      if (!locId) { App.showToast('Select a location', 'warning'); return; }
      if (!items.length) { App.showToast('Add at least one product', 'warning'); return; }
      const paid = parseFloat(document.getElementById('po-paid').value) || 0;
      const payload = items.map(i => ({
        productId: i.productId, name: i.name, sku: i.sku, qty: i.qty,
        unitPrice: i.unitPrice, expiryDate: i.expiryDate || null,
      }));
      const order = Store.createManualPurchase(Auth.ownerId(), sellerId, payload, locId);
      const received = Store.receiveManualPurchase(order.id, paid, locId);
      if (!received || received.success === false) {
        App.showToast((received && received.message) || 'Could not complete this purchase', 'error');
        return;
      }
      items = [];
      document.getElementById('po-paid').value = 0;
      _renderBill();
      if (typeof Inventory !== 'undefined') Inventory.render();
      if (typeof Dashboard !== 'undefined') Dashboard.refresh();
      App.showToast('Purchase recorded. Stock & Khata updated.', 'success');
      App.goTo('orders');
    } catch (err) {
      App.showToast((err && err.message) || 'Could not complete this purchase', 'error');
    }
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  return { init, refresh, add, updateLine, remove, renderProducts };
})();
