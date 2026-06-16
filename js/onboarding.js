// Getting-started wizard for fresh owners. Creates real data (locations,
// products, opening-stock batches) via the Store, persists the current step to
// the owner's profile so it resumes after the app is closed, and only
// disappears once the final step is submitted (or auto-completes for existing
// accounts). Complex (manufactured) products carry their recipe inline.
const Onboarding = (() => {
  const STEPS = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'locations', label: 'Locations' },
    { key: 'products', label: 'Products' },
    { key: 'inventory', label: 'Stock' },
    { key: 'finish', label: 'Finish' },
  ];
  let step = 0;
  let prodIngredients = [];

  function init() {
    document.getElementById('ob-next').addEventListener('click', _next);
    document.getElementById('ob-back').addEventListener('click', _back);
    document.getElementById('ob-skip').addEventListener('click', _skip);
  }

  function maybeStart() {
    if (!Auth.isOwnerLevel()) return;
    const ob = Auth.getOnboarding();
    if (ob.completed) return;
    if (ob.step == null && _hasData()) { Auth.setOnboarding({ completed: true }); return; }
    step = Math.min(ob.step || 0, STEPS.length - 1);
    _open();
  }

  function _hasData() {
    const oid = Auth.ownerId();
    return Store.getProductsByOwner(oid).length > 0 || Store.getLocationsByOwner(oid).length > 0;
  }

  function _open() { document.getElementById('onboarding-overlay').classList.remove('hidden'); _render(); }
  function _close() { document.getElementById('onboarding-overlay').classList.add('hidden'); }

  function _goto(n) {
    step = Math.max(0, Math.min(n, STEPS.length - 1));
    Auth.setOnboarding({ step });
    _render();
  }

  function _back() { if (step > 0) _goto(step - 1); }
  function _skip() { _close(); }

  function _next() {
    const key = STEPS[step].key;
    if (key === 'welcome') {
      const name = (document.getElementById('ob-shop-name').value || '').trim();
      if (name) Auth.updateProfile({ name, shopName: name });
    }
    if (key === 'locations' && Store.getLocationsByOwner(Auth.ownerId()).length === 0) {
      App.showToast('Add at least one location to continue', 'warning');
      return;
    }
    if (key === 'products' && Store.getProductsByOwner(Auth.ownerId()).length === 0) {
      App.showToast('Add at least one product to continue', 'warning');
      return;
    }
    if (key === 'finish') { _finish(); return; }
    _goto(step + 1);
  }

  function _finish() {
    Auth.setOnboarding({ completed: true, step: STEPS.length - 1 });
    _close();
    App.showToast('Setup complete! Welcome aboard.', 'success');
    if (window.App && App.goTo) App.goTo('dashboard');
  }

  function _render() {
    _renderStepper();
    const key = STEPS[step].key;
    document.getElementById('ob-back').style.visibility = step === 0 ? 'hidden' : 'visible';
    document.getElementById('ob-next').innerHTML = key === 'finish'
      ? '<i class="fas fa-check"></i> Finish setup'
      : 'Next <i class="fas fa-arrow-right"></i>';
    ({
      welcome: _renderWelcome, locations: _renderLocations, products: _renderProducts,
      inventory: _renderInventory, finish: _renderFinish,
    })[key]();
  }

  function _renderStepper() {
    document.getElementById('ob-stepper').innerHTML = STEPS.map((s, i) =>
      '<div class="ob-step ' + (i === step ? 'active' : (i < step ? 'done' : '')) + '"><div class="ob-bar"></div><span>' + s.label + '</span></div>').join('');
  }

  function _setHead(title, desc) {
    document.getElementById('ob-title').textContent = title;
    document.getElementById('ob-desc').textContent = desc;
  }

  // ---- Welcome ----
  function _renderWelcome() {
    _setHead('Welcome to \u091D\u091F\u092A\u091F', "Let's set up your shop in a few quick steps. You can add as many locations and products as you like.");
    const u = Auth.getUser();
    document.getElementById('ob-content').innerHTML =
      '<div class="form-group"><label for="ob-shop-name">Shop name</label>' +
      '<input type="text" id="ob-shop-name" placeholder="e.g. Sharma General Store" value="' + _attr(u ? (u.shopName || u.name || '') : '') + '"></div>';
  }

  // ---- Locations ----
  function _renderLocations() {
    _setHead('Add your locations', 'Warehouses or shops where you hold stock. Add at least one to continue.');
    document.getElementById('ob-content').innerHTML =
      '<div class="ob-grid">' +
      '<div class="form-group" style="margin:0"><label>Name</label><input type="text" id="ob-loc-name" placeholder="e.g. Main Shop"></div>' +
      '<div class="form-group" style="margin:0"><label>Address</label><input type="text" id="ob-loc-address" placeholder="Optional"></div>' +
      '</div>' +
      '<button class="btn btn-secondary" id="ob-loc-add" style="margin-top:.6rem"><i class="fas fa-plus"></i> Add location</button>' +
      '<div class="ob-list" id="ob-loc-list"></div>';
    document.getElementById('ob-loc-add').addEventListener('click', () => {
      const name = (document.getElementById('ob-loc-name').value || '').trim();
      if (!name) { App.showToast('Enter a location name', 'warning'); return; }
      const first = Store.getLocationsByOwner(Auth.ownerId()).length === 0;
      Store.addLocation({ id: Store.generateId(), ownerId: Auth.ownerId(), name, address: (document.getElementById('ob-loc-address').value || '').trim(), isDefault: first });
      App.showToast('Location added', 'success');
      document.getElementById('ob-loc-name').value = '';
      document.getElementById('ob-loc-address').value = '';
      _renderLocList();
    });
    _renderLocList();
  }
  function _renderLocList() {
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    document.getElementById('ob-loc-list').innerHTML = locs.length
      ? locs.map(l => '<div class="ob-list-item"><span><i class="fas fa-location-dot"></i> ' + _esc(l.name) + (l.isDefault ? ' \u00b7 Default' : '') + '</span></div>').join('')
      : '<div class="ob-list-empty">No locations yet</div>';
  }

  // ---- Products (type-aware) ----
  function _renderProducts() {
    _setHead('Add your products', 'Pick a type: raw materials (ingredients), simple trading goods, or complex items you manufacture from a recipe.');
    prodIngredients = [];
    const cats = Store.getCategories();
    document.getElementById('ob-content').innerHTML =
      '<div class="form-group" style="margin-bottom:.6rem"><label>Type</label>' +
      '<select id="ob-prod-type" class="select-input">' +
      '<option value="simple">Simple / Trading good</option>' +
      '<option value="raw">Raw material / Ingredient</option>' +
      '<option value="complex">Complex / Manufactured</option></select></div>' +
      '<div class="ob-grid">' +
      '<div class="form-group" style="margin:0"><label>Name</label><input type="text" id="ob-prod-name" placeholder="e.g. Parle-G Biscuit"></div>' +
      '<div class="form-group" style="margin:0"><label>SKU</label><input type="text" id="ob-prod-sku" placeholder="Auto if blank"></div>' +
      '<div class="form-group ob-price-field" style="margin:0"><label>Sell price (\u20B9)</label><input type="number" id="ob-prod-price" min="0" step="0.01" value="0"></div>' +
      '<div class="form-group" style="margin:0"><label>Unit</label><input type="text" id="ob-prod-unit" value="pcs"></div>' +
      '<div class="form-group" style="margin:0"><label>GST %</label><input type="number" id="ob-prod-gst" min="0" step="0.01" value="0"></div>' +
      '<div class="form-group" style="margin:0"><label>Category</label><input type="text" id="ob-prod-cat" list="ob-cat-list" placeholder="Optional"><datalist id="ob-cat-list">' + cats.map(c => '<option value="' + _attr(c.name) + '"></option>').join('') + '</datalist></div>' +
      '</div>' +
      '<div id="ob-recipe-box" class="hidden" style="margin-top:.6rem"></div>' +
      '<button class="btn btn-secondary" id="ob-prod-add" style="margin-top:.6rem"><i class="fas fa-plus"></i> Add product</button>' +
      '<div class="ob-list" id="ob-prod-list"></div>';

    if (typeof SearchableSelect !== 'undefined') SearchableSelect.enhance(document.getElementById('ob-prod-type'));
    document.getElementById('ob-prod-type').addEventListener('change', _onTypeChange);
    document.getElementById('ob-prod-add').addEventListener('click', _addProduct);
    _onTypeChange();
    _renderProdList();
  }

  function _onTypeChange() {
    const type = document.getElementById('ob-prod-type').value;
    const sellable = Store.isSellableType(type);
    document.querySelectorAll('#ob-content .ob-price-field').forEach(el => el.classList.toggle('hidden', !sellable));
    const box = document.getElementById('ob-recipe-box');
    if (type === 'complex') { box.classList.remove('hidden'); _renderRecipeBox(); }
    else { box.classList.add('hidden'); box.innerHTML = ''; prodIngredients = []; }
  }

  function _renderRecipeBox() {
    const ings = Store.getIngredientProducts(Auth.ownerId());
    const box = document.getElementById('ob-recipe-box');
    if (ings.length === 0) {
      box.innerHTML = '<div class="ob-list-empty">Add some raw / simple products first — they become this recipe\u2019s ingredients.</div>';
      return;
    }
    const opts = ings.map(p => '<option value="' + p.id + '">' + _esc(p.name) + '</option>').join('');
    box.innerHTML = '<div class="section-divider"><span>Recipe</span></div>' +
      '<div class="ob-grid">' +
      '<div class="form-group" style="margin:0"><label>Output qty per batch</label><input type="number" id="ob-prod-outqty" min="1" value="1"></div>' +
      '<div class="form-group" style="margin:0"><label>Ingredient</label><select id="ob-ing-product" class="select-input">' + opts + '</select></div>' +
      '<div class="form-group" style="margin:0"><label>Qty</label><input type="number" id="ob-ing-qty" min="0.01" step="0.01" value="1"></div>' +
      '</div>' +
      '<button class="btn btn-secondary" id="ob-ing-add" style="margin-top:.5rem"><i class="fas fa-plus"></i> Add ingredient</button>' +
      '<div class="ob-list" id="ob-ing-list"></div>';
    if (typeof SearchableSelect !== 'undefined') SearchableSelect.enhance(document.getElementById('ob-ing-product'));
    document.getElementById('ob-ing-add').addEventListener('click', () => {
      const pid = document.getElementById('ob-ing-product').value;
      const qty = parseFloat(document.getElementById('ob-ing-qty').value) || 1;
      if (pid) { prodIngredients.push({ productId: pid, qty }); _renderIngList(); }
    });
    _renderIngList();
  }
  function _renderIngList() {
    const el = document.getElementById('ob-ing-list');
    if (!el) return;
    el.innerHTML = prodIngredients.length
      ? prodIngredients.map((i, idx) => { const p = Store.getProductById(i.productId); return '<div class="ob-list-item"><span>' + _esc(p ? p.name : '?') + ' \u00d7 ' + i.qty + '</span><button class="btn-icon delete" data-ing="' + idx + '"><i class="fas fa-xmark"></i></button></div>'; }).join('')
      : '<div class="ob-list-empty">No ingredients added</div>';
    el.querySelectorAll('[data-ing]').forEach(b => b.addEventListener('click', e => { prodIngredients.splice(+e.currentTarget.dataset.ing, 1); _renderIngList(); }));
  }

  function _resolveCategory(name) {
    name = (name || '').trim();
    if (!name) return '';
    const found = Store.getCategories().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    return Store.addCategory({ id: Store.generateId(), name, color: '#6d5dfc' }).id;
  }

  function _addProduct() {
    const type = document.getElementById('ob-prod-type').value;
    const sellable = Store.isSellableType(type);
    const name = (document.getElementById('ob-prod-name').value || '').trim();
    if (!name) { App.showToast('Enter a product name', 'warning'); return; }
    const price = sellable ? (parseFloat(document.getElementById('ob-prod-price').value) || 0) : 0;
    const unit = (document.getElementById('ob-prod-unit').value || 'pcs').trim();
    const gst = parseFloat(document.getElementById('ob-prod-gst').value) || 0;
    const sku = (document.getElementById('ob-prod-sku').value || '').trim() || ('SKU-' + Store.generateId().slice(0, 5).toUpperCase());
    const categoryId = _resolveCategory(document.getElementById('ob-prod-cat').value);

    const data = {
      id: Store.generateId(), ownerId: Auth.ownerId(), type, name, sku, categoryId,
      costPrice: 0, price, unit, gstRate: gst, isPublished: sellable, createdAt: new Date().toISOString(),
    };
    if (type === 'complex') {
      if (prodIngredients.length === 0) { App.showToast('Add at least one ingredient for a complex product', 'warning'); return; }
      data.recipe = { outputQty: parseInt(document.getElementById('ob-prod-outqty').value, 10) || 1, ingredients: prodIngredients.slice() };
      data.costPrice = Store.calcMakingCost(data);
    }
    Store.addProduct(data);
    App.showToast('Product added', 'success');
    document.getElementById('ob-prod-name').value = '';
    document.getElementById('ob-prod-sku').value = '';
    prodIngredients = [];
    _onTypeChange();
    _renderProdList();
  }
  function _renderProdList() {
    const prods = Store.getProductsByOwner(Auth.ownerId());
    const labels = { raw: 'Raw', simple: 'Simple', complex: 'Complex' };
    document.getElementById('ob-prod-list').innerHTML = prods.length
      ? prods.map(p => '<div class="ob-list-item"><span><i class="fas fa-box"></i> ' + _esc(p.name) + ' <span class="type-pill ' + (p.type || 'simple') + '">' + labels[p.type || 'simple'] + '</span></span><span>' + (Store.isSellableType(p.type || 'simple') ? '\u20B9' + (p.price || 0) : '—') + '</span></div>').join('')
      : '<div class="ob-list-empty">No products yet</div>';
  }

  // ---- Opening stock (purchase batches) ----
  function _renderInventory() {
    _setHead('Set opening stock', 'Optional — record what you currently hold as purchase batches (with unit cost). Complex products get stock from Produce later.');
    const prods = Store.getProductsByOwner(Auth.ownerId()).filter(p => (p.type || 'simple') !== 'complex');
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    document.getElementById('ob-content').innerHTML =
      (prods.length === 0 || locs.length === 0
        ? '<div class="ob-list-empty">Add a stockable product and a location first.</div>'
        : '<div class="ob-grid">' +
          '<div class="form-group" style="margin:0"><label>Product</label><select id="ob-inv-product" class="select-input">' + prods.map(p => '<option value="' + p.id + '">' + _esc(p.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group" style="margin:0"><label>Location</label><select id="ob-inv-location" class="select-input">' + locs.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group" style="margin:0"><label>Quantity</label><input type="number" id="ob-inv-qty" min="0" value="0"></div>' +
          '<div class="form-group" style="margin:0"><label>Unit cost (\u20B9)</label><input type="number" id="ob-inv-cost" min="0" step="0.01" value="0"></div>' +
          '<div class="form-group" style="margin:0"><label>Expiry (optional)</label><input type="date" id="ob-inv-expiry"></div>' +
          '<div class="form-group" style="margin:0"><label>Low-stock alert</label><input type="number" id="ob-inv-min" min="0" value="0"></div>' +
          '</div>' +
          '<button class="btn btn-secondary" id="ob-inv-add" style="margin-top:.6rem"><i class="fas fa-plus"></i> Add batch</button>') +
      '<div class="ob-list" id="ob-inv-list"></div>';
    if (prods.length && locs.length) {
      if (typeof SearchableSelect !== 'undefined') {
        SearchableSelect.enhance(document.getElementById('ob-inv-product'));
        SearchableSelect.enhance(document.getElementById('ob-inv-location'));
      }
      document.getElementById('ob-inv-add').addEventListener('click', () => {
        const pid = document.getElementById('ob-inv-product').value;
        const lid = document.getElementById('ob-inv-location').value;
        const qty = parseFloat(document.getElementById('ob-inv-qty').value) || 0;
        const cost = parseFloat(document.getElementById('ob-inv-cost').value) || 0;
        const min = parseInt(document.getElementById('ob-inv-min').value, 10) || 0;
        const expiry = document.getElementById('ob-inv-expiry').value || null;
        if (qty <= 0) { App.showToast('Enter a quantity', 'warning'); return; }
        Store.addBatch({ productId: pid, locationId: lid, qty, unitCost: cost, expiryDate: expiry, batchNumber: 'OPEN-' + Store.generateId().slice(0, 4).toUpperCase(), note: 'Opening stock' });
        if (min > 0) Store.setStock(pid, lid, Store.getBatchQty(pid, lid), min);
        App.showToast('Batch added', 'success');
        document.getElementById('ob-inv-qty').value = 0;
        _renderInvList();
      });
    }
    _renderInvList();
  }
  function _renderInvList() {
    const stock = Store.getStockByOwner(Auth.ownerId()).filter(s => s.quantity > 0 || s.minStock > 0);
    document.getElementById('ob-inv-list').innerHTML = stock.length
      ? stock.map(s => { const p = Store.getProductById(s.productId); const l = Store.getLocationById(s.locationId); return '<div class="ob-list-item"><span><i class="fas fa-warehouse"></i> ' + _esc(p ? p.name : '?') + ' @ ' + _esc(l ? l.name : '?') + '</span><span><strong>' + s.quantity + '</strong></span></div>'; }).join('')
      : '<div class="ob-list-empty">No stock entries yet</div>';
  }

  // ---- Finish ----
  function _renderFinish() {
    _setHead("You're all set!", "Review what you've added, then finish to start using \u091D\u091F\u092A\u091F.");
    const oid = Auth.ownerId();
    const counts = [
      ['Locations', Store.getLocationsByOwner(oid).length, 'fa-location-dot'],
      ['Products', Store.getProductsByOwner(oid).length, 'fa-box'],
      ['Complex products', Store.getProductsByType(oid, 'complex').length, 'fa-industry'],
      ['Stock entries', Store.getStockByOwner(oid).filter(s => s.quantity > 0).length, 'fa-warehouse'],
    ];
    document.getElementById('ob-content').innerHTML = '<div class="ob-list">' +
      counts.map(c => '<div class="ob-list-item"><span><i class="fas ' + c[2] + '"></i> ' + c[0] + '</span><span><strong>' + c[1] + '</strong></span></div>').join('') +
      '</div>';
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function _attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

  return { init, maybeStart };
})();
