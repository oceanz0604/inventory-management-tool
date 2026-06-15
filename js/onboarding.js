// Getting-started wizard for fresh owners. Creates real data (locations,
// products, stock, recipes) via the Store, persists the current step to the
// owner's profile so it resumes after the app is closed, and only disappears
// once the final step is submitted (or auto-completes for existing accounts).
const Onboarding = (() => {
  const STEPS = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'locations', label: 'Locations' },
    { key: 'products', label: 'Products' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'recipes', label: 'Recipes' },
    { key: 'finish', label: 'Finish' },
  ];
  let step = 0;
  let recipeIngredients = [];

  function init() {
    document.getElementById('ob-next').addEventListener('click', _next);
    document.getElementById('ob-back').addEventListener('click', _back);
    document.getElementById('ob-skip').addEventListener('click', _skip);
  }

  // Decide whether to show the wizard for the current user.
  function maybeStart() {
    if (!Auth.isOwnerLevel()) return; // owners only — not workers / super admin
    const ob = Auth.getOnboarding();
    if (ob.completed) return;
    // Existing accounts that already have data shouldn't be nagged.
    if (ob.step == null && _hasData()) { Auth.setOnboarding({ completed: true }); return; }
    step = Math.min(ob.step || 0, STEPS.length - 1);
    _open();
  }

  function _hasData() {
    const oid = Auth.ownerId();
    return Store.getProductsByOwner(oid).length > 0 ||
      Store.getRecipes(oid).length > 0 ||
      Store.getLocationsByOwner(oid).length > 1;
  }

  function _open() { document.getElementById('onboarding-overlay').classList.remove('hidden'); _render(); }
  function _close() { document.getElementById('onboarding-overlay').classList.add('hidden'); }

  function _goto(n) {
    step = Math.max(0, Math.min(n, STEPS.length - 1));
    Auth.setOnboarding({ step }); // checkpoint
    _render();
  }

  function _back() { if (step > 0) _goto(step - 1); }
  function _skip() { _close(); } // re-appears next app open until completed

  function _next() {
    const key = STEPS[step].key;
    if (key === 'welcome') {
      const name = (document.getElementById('ob-shop-name').value || '').trim();
      if (name) Auth.updateProfile({ name, shopName: name });
    }
    if (key === 'products' && Store.getProductsByOwner(Auth.ownerId()).length === 0) {
      App.showToast('Add at least one product to continue', 'warning');
      return;
    }
    if (key === 'finish') { _finish(); return; }
    _goto(step + 1);
  }

  function _finish() {
    // setOnboarding updates the local profile synchronously and mirrors to the
    // cloud in the background, so close right away — no waiting on the network.
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
      inventory: _renderInventory, recipes: _renderRecipes, finish: _renderFinish,
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
    _setHead('Welcome to \u091D\u091F\u092A\u091F', "Let's set up your shop in a few quick steps. You can add as many locations, products, and recipes as you like.");
    const u = Auth.getUser();
    document.getElementById('ob-content').innerHTML =
      '<div class="form-group"><label for="ob-shop-name">Shop name</label>' +
      '<input type="text" id="ob-shop-name" placeholder="e.g. Sharma General Store" value="' + _attr(u ? (u.shopName || u.name || '') : '') + '"></div>';
  }

  // ---- Locations ----
  function _renderLocations() {
    _setHead('Add your locations', 'Warehouses or shops where you hold stock. We created a "Main Warehouse" for you — add more if you need them.');
    document.getElementById('ob-content').innerHTML =
      '<div class="ob-grid">' +
      '<div class="form-group" style="margin:0"><label>Name</label><input type="text" id="ob-loc-name" placeholder="e.g. Shop Counter"></div>' +
      '<div class="form-group" style="margin:0"><label>Address</label><input type="text" id="ob-loc-address" placeholder="Optional"></div>' +
      '</div>' +
      '<button class="btn btn-secondary" id="ob-loc-add" style="margin-top:.6rem"><i class="fas fa-plus"></i> Add location</button>' +
      '<div class="ob-list" id="ob-loc-list"></div>';
    document.getElementById('ob-loc-add').addEventListener('click', () => {
      const name = (document.getElementById('ob-loc-name').value || '').trim();
      if (!name) { App.showToast('Enter a location name', 'warning'); return; }
      Store.addLocation({ id: Store.generateId(), ownerId: Auth.ownerId(), name, address: (document.getElementById('ob-loc-address').value || '').trim(), isDefault: false });
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

  // ---- Products ----
  function _renderProducts() {
    _setHead('Add your products', 'These power your catalog, POS, shop, and field orders. Add at least one to continue.');
    const cats = Store.getCategories();
    document.getElementById('ob-content').innerHTML =
      '<div class="ob-grid">' +
      '<div class="form-group" style="margin:0"><label>Name</label><input type="text" id="ob-prod-name" placeholder="e.g. Parle-G Biscuit"></div>' +
      '<div class="form-group" style="margin:0"><label>SKU</label><input type="text" id="ob-prod-sku" placeholder="Auto if blank"></div>' +
      '<div class="form-group" style="margin:0"><label>Sell price (\u20B9)</label><input type="number" id="ob-prod-price" min="0" step="0.01" value="0"></div>' +
      '<div class="form-group" style="margin:0"><label>Cost price (\u20B9)</label><input type="number" id="ob-prod-cost" min="0" step="0.01" value="0"></div>' +
      '<div class="form-group" style="margin:0"><label>Unit</label><input type="text" id="ob-prod-unit" value="pcs"></div>' +
      '<div class="form-group" style="margin:0"><label>GST %</label><input type="number" id="ob-prod-gst" min="0" step="0.01" value="0"></div>' +
      '<div class="form-group" style="margin:0;grid-column:1/-1"><label>Category</label><input type="text" id="ob-prod-cat" list="ob-cat-list" placeholder="Optional — type to create"><datalist id="ob-cat-list">' + cats.map(c => '<option value="' + _attr(c.name) + '"></option>').join('') + '</datalist></div>' +
      '</div>' +
      '<button class="btn btn-secondary" id="ob-prod-add" style="margin-top:.6rem"><i class="fas fa-plus"></i> Add product</button>' +
      '<div class="ob-list" id="ob-prod-list"></div>';
    document.getElementById('ob-prod-add').addEventListener('click', _addProduct);
    _renderProdList();
  }
  function _resolveCategory(name) {
    name = (name || '').trim();
    if (!name) return '';
    const found = Store.getCategories().find(c => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    return Store.addCategory({ id: Store.generateId(), name, color: '#6d5dfc' }).id;
  }
  function _addProduct() {
    const name = (document.getElementById('ob-prod-name').value || '').trim();
    if (!name) { App.showToast('Enter a product name', 'warning'); return; }
    const price = parseFloat(document.getElementById('ob-prod-price').value) || 0;
    const cost = parseFloat(document.getElementById('ob-prod-cost').value) || 0;
    const unit = (document.getElementById('ob-prod-unit').value || 'pcs').trim();
    const gst = parseFloat(document.getElementById('ob-prod-gst').value) || 0;
    const sku = (document.getElementById('ob-prod-sku').value || '').trim() || ('SKU-' + Store.generateId().slice(0, 5).toUpperCase());
    const categoryId = _resolveCategory(document.getElementById('ob-prod-cat').value);
    Store.addProduct({ id: Store.generateId(), ownerId: Auth.ownerId(), name, sku, categoryId, costPrice: cost, price, unit, gstRate: gst, isPublished: true, createdAt: new Date().toISOString() });
    App.showToast('Product added', 'success');
    document.getElementById('ob-prod-name').value = '';
    document.getElementById('ob-prod-sku').value = '';
    _renderProdList();
  }
  function _renderProdList() {
    const prods = Store.getProductsByOwner(Auth.ownerId());
    document.getElementById('ob-prod-list').innerHTML = prods.length
      ? prods.map(p => '<div class="ob-list-item"><span><i class="fas fa-box"></i> ' + _esc(p.name) + '</span><span>\u20B9' + (p.price || 0) + '</span></div>').join('')
      : '<div class="ob-list-empty">No products yet</div>';
  }

  // ---- Inventory ----
  function _renderInventory() {
    _setHead('Set opening stock', 'Optional — record how much you currently hold of each product at each location.');
    const prods = Store.getProductsByOwner(Auth.ownerId());
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    document.getElementById('ob-content').innerHTML =
      (prods.length === 0
        ? '<div class="ob-list-empty">Add a product first to set its stock.</div>'
        : '<div class="ob-grid">' +
          '<div class="form-group" style="margin:0"><label>Product</label><select id="ob-inv-product" class="select-input">' + prods.map(p => '<option value="' + p.id + '">' + _esc(p.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group" style="margin:0"><label>Location</label><select id="ob-inv-location" class="select-input">' + locs.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('') + '</select></div>' +
          '<div class="form-group" style="margin:0"><label>Quantity</label><input type="number" id="ob-inv-qty" min="0" value="0"></div>' +
          '<div class="form-group" style="margin:0"><label>Low-stock alert</label><input type="number" id="ob-inv-min" min="0" value="0"></div>' +
          '</div>' +
          '<button class="btn btn-secondary" id="ob-inv-add" style="margin-top:.6rem"><i class="fas fa-plus"></i> Set stock</button>') +
      '<div class="ob-list" id="ob-inv-list"></div>';
    if (prods.length) document.getElementById('ob-inv-add').addEventListener('click', () => {
      const pid = document.getElementById('ob-inv-product').value;
      const lid = document.getElementById('ob-inv-location').value;
      const qty = parseInt(document.getElementById('ob-inv-qty').value, 10) || 0;
      const min = parseInt(document.getElementById('ob-inv-min').value, 10) || 0;
      Store.setStock(pid, lid, qty, min);
      App.showToast('Stock set', 'success');
      _renderInvList();
    });
    _renderInvList();
  }
  function _renderInvList() {
    const stock = Store.getStockByOwner(Auth.ownerId()).filter(s => s.quantity > 0 || s.minStock > 0);
    document.getElementById('ob-inv-list').innerHTML = stock.length
      ? stock.map(s => { const p = Store.getProductById(s.productId); const l = Store.getLocationById(s.locationId); return '<div class="ob-list-item"><span><i class="fas fa-warehouse"></i> ' + _esc(p ? p.name : '?') + ' @ ' + _esc(l ? l.name : '?') + '</span><span><strong>' + s.quantity + '</strong></span></div>'; }).join('')
      : '<div class="ob-list-empty">No stock entries yet</div>';
  }

  // ---- Recipes (optional) ----
  function _renderRecipes() {
    _setHead('Add recipes / BOM', "Optional — define how a finished product is made from ingredients. Skip if you don't manufacture.");
    recipeIngredients = [];
    const prods = Store.getProductsByOwner(Auth.ownerId());
    if (prods.length === 0) {
      document.getElementById('ob-content').innerHTML = '<div class="ob-list-empty">Add products first to build a recipe.</div><div class="ob-list" id="ob-rec-list"></div>';
      _renderRecList();
      return;
    }
    const opts = prods.map(p => '<option value="' + p.id + '">' + _esc(p.name) + '</option>').join('');
    document.getElementById('ob-content').innerHTML =
      '<div class="ob-grid">' +
      '<div class="form-group" style="margin:0"><label>Recipe name</label><input type="text" id="ob-rec-name" placeholder="e.g. Masala Chai"></div>' +
      '<div class="form-group" style="margin:0"><label>Makes (product)</label><select id="ob-rec-output" class="select-input">' + opts + '</select></div>' +
      '<div class="form-group" style="margin:0"><label>Output qty</label><input type="number" id="ob-rec-outqty" min="1" value="1"></div>' +
      '</div>' +
      '<div class="ob-grid" style="margin-top:.5rem">' +
      '<div class="form-group" style="margin:0"><label>Ingredient</label><select id="ob-rec-ing-product" class="select-input">' + opts + '</select></div>' +
      '<div class="form-group" style="margin:0"><label>Qty</label><input type="number" id="ob-rec-ing-qty" min="1" value="1"></div>' +
      '</div>' +
      '<button class="btn btn-secondary" id="ob-rec-ing-add" style="margin-top:.5rem"><i class="fas fa-plus"></i> Add ingredient</button>' +
      '<div class="ob-list" id="ob-rec-ing-list"></div>' +
      '<button class="btn btn-primary" id="ob-rec-save" style="margin-top:.6rem"><i class="fas fa-save"></i> Save recipe</button>' +
      '<div class="ob-list" id="ob-rec-list"></div>';
    document.getElementById('ob-rec-ing-add').addEventListener('click', () => {
      const pid = document.getElementById('ob-rec-ing-product').value;
      const qty = parseInt(document.getElementById('ob-rec-ing-qty').value, 10) || 1;
      recipeIngredients.push({ productId: pid, qty });
      _renderIngList();
    });
    document.getElementById('ob-rec-save').addEventListener('click', () => {
      const name = (document.getElementById('ob-rec-name').value || '').trim();
      if (!name) { App.showToast('Enter a recipe name', 'warning'); return; }
      if (recipeIngredients.length === 0) { App.showToast('Add at least one ingredient', 'warning'); return; }
      Store.addRecipe({
        id: Store.generateId(), ownerId: Auth.ownerId(), name,
        outputProductId: document.getElementById('ob-rec-output').value,
        outputQty: parseInt(document.getElementById('ob-rec-outqty').value, 10) || 1,
        ingredients: recipeIngredients.slice(), createdAt: new Date().toISOString(),
      });
      App.showToast('Recipe saved', 'success');
      recipeIngredients = [];
      _renderRecipes();
    });
    _renderIngList();
    _renderRecList();
  }
  function _renderIngList() {
    const el = document.getElementById('ob-rec-ing-list');
    if (!el) return;
    el.innerHTML = recipeIngredients.length
      ? recipeIngredients.map((i, idx) => { const p = Store.getProductById(i.productId); return '<div class="ob-list-item"><span>' + _esc(p ? p.name : '?') + ' \u00d7 ' + i.qty + '</span><button class="btn-icon delete" data-ing="' + idx + '"><i class="fas fa-xmark"></i></button></div>'; }).join('')
      : '<div class="ob-list-empty">No ingredients added</div>';
    el.querySelectorAll('[data-ing]').forEach(b => b.addEventListener('click', e => { recipeIngredients.splice(+e.currentTarget.dataset.ing, 1); _renderIngList(); }));
  }
  function _renderRecList() {
    const el = document.getElementById('ob-rec-list');
    if (!el) return;
    const recs = Store.getRecipes(Auth.ownerId());
    el.innerHTML = recs.length
      ? recs.map(r => '<div class="ob-list-item"><span><i class="fas fa-mortar-pestle"></i> ' + _esc(r.name) + '</span></div>').join('')
      : '<div class="ob-list-empty">No recipes yet (optional)</div>';
  }

  // ---- Finish ----
  function _renderFinish() {
    _setHead("You're all set!", "Review what you've added, then finish to start using \u091D\u091F\u092A\u091F.");
    const oid = Auth.ownerId();
    const counts = [
      ['Locations', Store.getLocationsByOwner(oid).length, 'fa-location-dot'],
      ['Products', Store.getProductsByOwner(oid).length, 'fa-box'],
      ['Stock entries', Store.getStockByOwner(oid).filter(s => s.quantity > 0).length, 'fa-warehouse'],
      ['Recipes', Store.getRecipes(oid).length, 'fa-mortar-pestle'],
    ];
    document.getElementById('ob-content').innerHTML = '<div class="ob-list">' +
      counts.map(c => '<div class="ob-list-item"><span><i class="fas ' + c[2] + '"></i> ' + c[0] + '</span><span><strong>' + c[1] + '</strong></span></div>').join('') +
      '</div>';
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function _attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

  return { init, maybeStart };
})();
