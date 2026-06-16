const Products = (() => {
  let editingId = null;
  let currentSort = { field: 'name', direction: 'asc' };

  const TYPE_HINTS = {
    raw: 'Bought as ingredients (in batches at different rates). Never sold or published. No selling price.',
    simple: 'Bought from vendors in batches and resold as-is. Cost is the weighted average of your purchase batches.',
    complex: 'Made from a recipe. Cost is auto-calculated from the ingredients consumed when you Produce it.',
  };

  function _currentType() { return document.getElementById('product-type').value || 'simple'; }

  function _applyTypeUI(type) {
    const sellable = Store.isSellableType(type);
    document.getElementById('product-pricing-section').classList.toggle('hidden', !sellable);
    document.getElementById('product-recipe-section').classList.toggle('hidden', type !== 'complex');
    document.getElementById('product-publish-group').classList.toggle('hidden', !sellable);
    const priceInput = document.getElementById('product-price');
    priceInput.required = sellable;
    document.getElementById('product-type-hint').textContent = TYPE_HINTS[type] || '';
    if (type === 'complex' && document.querySelectorAll('#product-ingredients .ingredient-row').length === 0) _addIngredientRow();
    _updateMarginPreview();
    _calcMakingCost();
  }

  function _updateMarginPreview() {
    const cost = parseFloat(document.getElementById('product-cost-price').value) || 0;
    const sell = parseFloat(document.getElementById('product-price').value) || 0;
    const mrp = parseFloat(document.getElementById('product-mrp').value) || 0;
    const preview = document.getElementById('product-margin-preview');
    if (mrp > 0 && sell > mrp) { preview.value = 'Sell > MRP!'; preview.style.color = 'var(--danger)'; return; }
    preview.style.color = '';
    if (sell > 0) {
      const margin = ((sell - cost) / sell * 100).toFixed(1);
      preview.value = '\u20B9' + cost.toFixed(2) + ' cost \u00b7 ' + margin + '%';
    } else {
      preview.value = '\u20B9' + cost.toFixed(2) + ' cost';
    }
  }

  function init() {
    document.getElementById('add-product-btn').addEventListener('click', () => openModal());
    document.getElementById('add-first-product-btn').addEventListener('click', () => openModal());
    document.getElementById('product-form').addEventListener('submit', _handleSubmit);
    document.getElementById('product-search').addEventListener('input', render);
    document.getElementById('product-filter-category').addEventListener('change', render);
    document.getElementById('product-filter-published').addEventListener('change', render);
    document.getElementById('product-price').addEventListener('input', _updateMarginPreview);
    document.getElementById('product-mrp').addEventListener('input', _updateMarginPreview);
    document.getElementById('product-type').addEventListener('change', () => _applyTypeUI(_currentType()));
    document.getElementById('product-add-ingredient').addEventListener('click', () => _addIngredientRow());
    document.getElementById('product-recipe-outqty').addEventListener('input', _calcMakingCost);

    // Produce flow
    document.getElementById('produce-btn').addEventListener('click', () => openProduce());
    document.getElementById('produce-form').addEventListener('submit', _handleProduce);
    document.getElementById('produce-product').addEventListener('change', _renderProduceIngredients);
    document.getElementById('produce-location').addEventListener('change', _renderProduceIngredients);
    document.getElementById('produce-qty').addEventListener('input', _renderProduceIngredients);

    document.querySelectorAll('#view-products .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (currentSort.field === f) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        else { currentSort.field = f; currentSort.direction = 'asc'; }
        render();
      });
    });
  }

  function populateFilters() {
    const cats = Store.getCategories();
    const opts = cats.map(c => '<option value="' + c.id + '">' + _esc(c.name) + '</option>').join('');
    document.getElementById('product-filter-category').innerHTML = '<option value="">All Categories</option>' + opts;
    document.getElementById('product-category').innerHTML = '<option value="">Select category</option>' + opts;
    SearchableSelect.enhanceAll(document.getElementById('view-products'));
    SearchableSelect.enhance(document.getElementById('product-category'));
  }

  function render() {
    const search = document.getElementById('product-search').value.toLowerCase().trim();
    const catFilter = document.getElementById('product-filter-category').value;
    const pubFilter = document.getElementById('product-filter-published').value;

    let prods = Store.getProductsByOwner(Auth.ownerId());
    if (search) prods = prods.filter(p => p.name.toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search));
    if (catFilter) prods = prods.filter(p => p.categoryId === catFilter);
    if (pubFilter === '1') prods = prods.filter(p => p.isPublished);
    if (pubFilter === '0') prods = prods.filter(p => !p.isPublished);

    prods.sort((a, b) => {
      let va = a[currentSort.field], vb = b[currentSort.field];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      va = va == null ? 0 : va; vb = vb == null ? 0 : vb;
      if (va < vb) return currentSort.direction === 'asc' ? -1 : 1;
      if (va > vb) return currentSort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById('products-table-body');
    const empty = document.getElementById('no-products');
    const allProds = Store.getProductsByOwner(Auth.ownerId());

    if (allProds.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      tbody.closest('.card').querySelector('table').classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.closest('.card').querySelector('table').classList.remove('hidden');

    if (prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-secondary)">No products match your filters</td></tr>';
      return;
    }

    tbody.innerHTML = prods.map(p => {
      const type = p.type || 'simple';
      const sellable = Store.isSellableType(type);
      const cat = Store.getCategoryById(p.categoryId);
      const catTag = cat ? '<span class="category-tag"><span class="dot" style="background:' + cat.color + '"></span>' + _esc(cat.name) + '</span>' : '<span style="color:var(--text-light)">-</span>';
      const totalStock = Store.getTotalStockForProduct(p.id);
      const cost = type === 'complex' ? Store.calcMakingCost(p) : (p.costPrice || 0);
      const sell = sellable ? (p.price || 0) : 0;
      const margin = sell > 0 ? ((sell - cost) / sell * 100) : 0;
      const marginColor = margin >= 30 ? 'var(--success)' : margin >= 15 ? 'var(--warning)' : 'var(--danger)';
      const typeLabel = { raw: 'Raw', simple: 'Simple', complex: 'Complex' }[type];

      let actions = '<button class="btn-icon edit" title="Edit" onclick="Products.openModal(\'' + p.id + '\')"><i class="fas fa-pen"></i></button>';
      if (type === 'complex') actions = '<button class="btn-icon" title="Produce" onclick="Products.openProduce(\'' + p.id + '\')"><i class="fas fa-industry"></i></button>' + actions;
      actions += '<button class="btn-icon delete" title="Delete" onclick="Products.confirmDelete(\'' + p.id + '\')"><i class="fas fa-trash-can"></i></button>';

      const publishCell = sellable
        ? '<label class="toggle"><input type="checkbox" ' + (p.isPublished ? 'checked' : '') + ' onchange="Products.togglePublish(\'' + p.id + '\',this.checked)"><span class="slider"></span></label>'
        : '<span style="color:var(--text-light)">—</span>';

      return '<tr>' +
        '<td><strong>' + _esc(p.name) + '</strong></td>' +
        '<td><span class="type-pill ' + type + '">' + typeLabel + '</span></td>' +
        '<td><code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.8rem">' + _esc(p.sku) + '</code></td>' +
        '<td>' + catTag + '</td>' +
        '<td>' + _esc(p.unit || 'pcs') + '</td>' +
        '<td style="color:var(--text-secondary)">\u20B9' + cost.toFixed(2) + '</td>' +
        '<td>' + (sellable ? '\u20B9' + sell.toFixed(2) : '<span style="color:var(--text-light)">—</span>') + '</td>' +
        '<td>' + (p.gstRate || 0) + '%</td>' +
        '<td>' + (sellable ? '<span style="font-weight:600;color:' + marginColor + '">' + margin.toFixed(1) + '%</span>' : '<span style="color:var(--text-light)">—</span>') + '</td>' +
        '<td>' + totalStock.toLocaleString() + '</td>' +
        '<td>' + publishCell + '</td>' +
        '<td><div class="action-btns">' + actions + '</div></td></tr>';
    }).join('');
  }

  // ---------- Recipe builder (complex products) ----------
  function _ingredientOptions(selectedId) {
    const prods = Store.getIngredientProducts(Auth.ownerId()).filter(p => p.id !== editingId);
    return '<option value="">Select ingredient</option>' + prods.map(p =>
      '<option value="' + p.id + '"' + (selectedId === p.id ? ' selected' : '') + '>' + _esc(p.name) + ' (' + _esc(p.sku) + ')</option>').join('');
  }
  function _addIngredientRow(productId, qty) {
    const container = document.getElementById('product-ingredients');
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    const sel = document.createElement('select');
    sel.className = 'select-input ing-product';
    sel.innerHTML = _ingredientOptions(productId);
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number'; qtyInput.className = 'ing-qty'; qtyInput.step = '0.01'; qtyInput.min = '0.01';
    qtyInput.value = qty || 1; qtyInput.placeholder = 'Qty';
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn-icon delete'; del.title = 'Remove';
    del.innerHTML = '<i class="fas fa-xmark"></i>';
    row.appendChild(sel); row.appendChild(qtyInput); row.appendChild(del);
    container.appendChild(row);
    del.addEventListener('click', () => { row.remove(); _calcMakingCost(); });
    sel.addEventListener('change', _calcMakingCost);
    qtyInput.addEventListener('input', _calcMakingCost);
    SearchableSelect.enhance(sel);
    _calcMakingCost();
  }
  function _collectIngredients() {
    const rows = document.querySelectorAll('#product-ingredients .ingredient-row');
    const ings = [];
    rows.forEach(r => {
      const pid = r.querySelector('.ing-product').value;
      const q = parseFloat(r.querySelector('.ing-qty').value) || 0;
      if (pid && q > 0) ings.push({ productId: pid, qty: q });
    });
    return ings;
  }
  function _calcMakingCost() {
    if (_currentType() !== 'complex') return;
    const ings = _collectIngredients();
    let total = 0;
    ings.forEach(i => { const p = Store.getProductById(i.productId); if (p) total += (p.costPrice || 0) * i.qty; });
    const outQty = parseInt(document.getElementById('product-recipe-outqty').value, 10) || 1;
    const unit = outQty > 0 ? total / outQty : total;
    document.getElementById('product-makingcost').value = '\u20B9' + unit.toFixed(2);
    document.getElementById('product-cost-price').value = unit.toFixed(2);
  }

  function openModal(prodId) {
    editingId = prodId || null;
    const form = document.getElementById('product-form');
    const title = document.getElementById('product-modal-title');
    populateFilters();
    form.reset();
    document.getElementById('product-ingredients').innerHTML = '';

    if (editingId) {
      const p = Store.getProductById(editingId);
      if (!p) return;
      const type = p.type || 'simple';
      title.textContent = 'Edit Product';
      document.getElementById('product-type').value = type;
      document.getElementById('product-name').value = p.name;
      document.getElementById('product-sku').value = p.sku;
      document.getElementById('product-category').value = p.categoryId || '';
      document.getElementById('product-unit').value = p.unit || 'pcs';
      document.getElementById('product-cost-price').value = p.costPrice || 0;
      document.getElementById('product-price').value = p.price || 0;
      document.getElementById('product-mrp').value = p.mrp || 0;
      document.getElementById('product-wholesale').value = p.wholesalePrice || 0;
      document.getElementById('product-gst').value = p.gstRate != null ? p.gstRate : 18;
      document.getElementById('product-hsn').value = p.hsnCode || '';
      document.getElementById('product-description').value = p.description || '';
      document.getElementById('product-published').checked = !!p.isPublished;
      document.getElementById('product-recipe-outqty').value = (p.recipe && p.recipe.outputQty) || 1;
      if (type === 'complex' && p.recipe && p.recipe.ingredients) p.recipe.ingredients.forEach(ing => _addIngredientRow(ing.productId, ing.qty));
    } else {
      title.textContent = 'Add Product';
      document.getElementById('product-type').value = 'simple';
      document.getElementById('product-published').checked = true;
      document.getElementById('product-recipe-outqty').value = 1;
    }
    _applyTypeUI(_currentType());
    SearchableSelect.enhanceAll(document.getElementById('product-modal'));
    document.getElementById('product-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const type = _currentType();
    const sellable = Store.isSellableType(type);
    const data = {
      type,
      name: document.getElementById('product-name').value.trim(),
      sku: document.getElementById('product-sku').value.trim(),
      categoryId: document.getElementById('product-category').value,
      unit: document.getElementById('product-unit').value,
      price: sellable ? (parseFloat(document.getElementById('product-price').value) || 0) : 0,
      mrp: sellable ? (parseFloat(document.getElementById('product-mrp').value) || 0) : 0,
      wholesalePrice: sellable ? (parseFloat(document.getElementById('product-wholesale').value) || 0) : 0,
      gstRate: parseInt(document.getElementById('product-gst').value) || 0,
      hsnCode: document.getElementById('product-hsn').value.trim(),
      description: document.getElementById('product-description').value.trim(),
      isPublished: sellable ? document.getElementById('product-published').checked : false,
    };

    if (sellable && data.mrp > 0 && data.price > data.mrp) {
      App.showToast('Selling price cannot exceed MRP', 'warning');
      return;
    }

    if (type === 'complex') {
      const ings = _collectIngredients();
      if (ings.length === 0) { App.showToast('Add at least one ingredient to the recipe', 'warning'); return; }
      data.recipe = { outputQty: parseInt(document.getElementById('product-recipe-outqty').value, 10) || 1, ingredients: ings };
    } else {
      data.recipe = null;
    }

    if (editingId) {
      Store.updateProduct(editingId, data);
      App.showToast('Product updated', 'success');
    } else {
      data.id = Store.generateId();
      data.ownerId = Auth.ownerId();
      data.costPrice = type === 'complex' ? Store.calcMakingCost(data) : 0;
      data.createdAt = new Date().toISOString();
      Store.addProduct(data);
      App.showToast('Product added', 'success');
    }

    document.getElementById('product-modal').classList.add('hidden');
    editingId = null;
    render();
    Inventory.refreshFilters();
    Dashboard.refresh();
  }

  function togglePublish(prodId, val) {
    Store.updateProduct(prodId, { isPublished: val });
    App.showToast(val ? 'Product published' : 'Product unpublished', 'success');
  }

  function confirmDelete(prodId) {
    const p = Store.getProductById(prodId);
    if (!p) return;
    document.getElementById('delete-message').textContent = 'Delete product "' + p.name + '"? This also removes its stock batches.';
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      Store.deleteProduct(prodId);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Product deleted', 'success');
      render();
      Inventory.render();
      Dashboard.refresh();
    });
  }

  // ---------- Produce (complex products) ----------
  function openProduce(prodId) {
    const complex = Store.getProductsByType(Auth.ownerId(), 'complex');
    if (complex.length === 0) { App.showToast('Create a complex (manufactured) product first', 'warning'); return; }
    const pSel = document.getElementById('produce-product');
    pSel.innerHTML = '<option value="">Select product</option>' + complex.map(p => '<option value="' + p.id + '"' + (prodId === p.id ? ' selected' : '') + '>' + _esc(p.name) + '</option>').join('');
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    const lSel = document.getElementById('produce-location');
    lSel.innerHTML = '<option value="">Select location</option>' + locs.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('');
    document.getElementById('produce-qty').value = 1;
    _renderProduceIngredients();
    SearchableSelect.enhanceAll(document.getElementById('produce-modal'));
    document.getElementById('produce-modal').classList.remove('hidden');
    _renderProduceIngredients();
  }

  function _renderProduceIngredients() {
    const box = document.getElementById('produce-ingredients');
    const prod = Store.getProductById(document.getElementById('produce-product').value);
    const locId = document.getElementById('produce-location').value;
    const qty = Math.max(1, parseInt(document.getElementById('produce-qty').value, 10) || 1);
    if (!prod || !prod.recipe) { box.innerHTML = ''; document.getElementById('produce-cost').textContent = '\u20B90.00'; return; }
    let estCost = 0;
    box.innerHTML = '<div class="section-divider"><span>Ingredients to consume</span></div>' + prod.recipe.ingredients.map(ing => {
      const ip = Store.getProductById(ing.productId);
      const need = ing.qty * qty;
      const lots = locId ? Store.availableLots(ing.productId, locId) : [];
      const have = lots.reduce((s, l) => s + l.qty, 0);
      estCost += (ip ? ip.costPrice || 0 : 0) * need;
      const lotOpts = lots.length
        ? lots.map(l => '<option value="' + l.id + '">' + _esc(l.batchNumber || 'Batch') + ' \u00b7 ' + l.qty + ' left \u00b7 \u20B9' + (l.unitCost || 0).toFixed(2) + (l.expiryDate ? ' \u00b7 exp ' + new Date(l.expiryDate).toLocaleDateString('en-IN') : '') + '</option>').join('')
        : '<option value="">No stock</option>';
      const shortClass = have < need ? ' style="color:var(--danger)"' : '';
      return '<div class="produce-ing-row">' +
        '<div class="ing-need"><strong>' + _esc(ip ? ip.name : '?') + '</strong><br><span' + shortClass + '>need ' + need + ' \u00b7 have ' + have + '</span></div>' +
        '<select class="select-input produce-lot" data-pid="' + ing.productId + '">' + lotOpts + '</select>' +
        '</div>';
    }).join('');
    document.getElementById('produce-cost').textContent = '\u20B9' + (qty > 0 ? estCost : 0).toFixed(2);
    box.querySelectorAll('.produce-lot').forEach(sel => SearchableSelect.enhance(sel));
  }

  function _handleProduce(e) {
    e.preventDefault();
    const prodId = document.getElementById('produce-product').value;
    const locId = document.getElementById('produce-location').value;
    const qty = Math.max(1, parseInt(document.getElementById('produce-qty').value, 10) || 1);
    if (!prodId || !locId) { App.showToast('Select product and location', 'warning'); return; }
    const lotChoices = {};
    document.querySelectorAll('#produce-ingredients .produce-lot').forEach(sel => { if (sel.value) lotChoices[sel.dataset.pid] = sel.value; });
    const res = Store.produceComplex(prodId, locId, qty, lotChoices);
    if (res.success) {
      App.showToast('Produced ' + qty + ' unit(s). Cost \u20B9' + res.cost.toFixed(2) + '. Stock updated.', 'success');
      document.getElementById('produce-modal').classList.add('hidden');
      render();
      if (window.Inventory) Inventory.render();
      Dashboard.refresh();
    } else {
      App.showToast(res.message, 'error');
    }
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, render, openModal, togglePublish, confirmDelete, populateFilters, openProduce };
})();
