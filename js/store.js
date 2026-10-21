const Store = (() => {
  const KEYS = {
    USERS: 'ims_users',
    CURRENT_USER: 'ims_current_user',
    CATEGORIES: 'ims_categories',
    LOCATIONS: 'ims_locations',
    PRODUCTS: 'ims_products',
    STOCK: 'ims_stock',
    ORDERS: 'ims_orders',
    CART: 'ims_cart',
    ORDER_SEQ: 'ims_order_seq',
    POS_SALES: 'ims_pos_sales',
    POS_SEQ: 'ims_pos_seq',
    RECIPES: 'ims_recipes',
    KHATA: 'ims_khata',
    KHATA_SEQ: 'ims_khata_seq',
    PARTIES: 'ims_parties',
    COMPANIES: 'ims_companies',
    BATCHES: 'ims_batches',
  };

  function _get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- Cloud (Firestore) write-through ----------
  // localStorage stays the synchronous read cache; every mutation also mirrors
  // the changed document to Firestore (fire-and-forget) when a backend is live.
  const COLL = {
    [KEYS.USERS]: 'users', [KEYS.CATEGORIES]: 'categories', [KEYS.LOCATIONS]: 'locations',
    [KEYS.PRODUCTS]: 'products', [KEYS.STOCK]: 'stock', [KEYS.ORDERS]: 'orders',
    [KEYS.POS_SALES]: 'pos_sales', [KEYS.RECIPES]: 'recipes', [KEYS.KHATA]: 'khata',
    [KEYS.PARTIES]: 'parties', [KEYS.BATCHES]: 'batches',
  };
  function _cloudOn() { return typeof window !== 'undefined' && window.Firebase && Firebase.isEnabled(); }
  function _cloudSave(collection, doc) {
    if (_cloudOn() && doc) Firebase.save(collection, doc).catch(e => console.warn('[sync] save ' + collection, e && e.message));
  }
  function _cloudRemove(collection, id) {
    if (_cloudOn() && id) Firebase.remove(collection, id).catch(e => console.warn('[sync] remove ' + collection, e && e.message));
  }
  function _ownerOfLocation(locationId) {
    const loc = getLocationById(locationId);
    return loc ? loc.ownerId : null;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function _nextOrderNumber() {
    const seq = (_get(KEYS.ORDER_SEQ) || 1000) + 1;
    _set(KEYS.ORDER_SEQ, seq);
    return 'ORD-' + seq;
  }

  // ========== Users ==========
  function getUsers() { return _get(KEYS.USERS) || []; }
  function addUser(user) { const u = getUsers(); u.push(user); _set(KEYS.USERS, u); _cloudSave('users', user); }
  function upsertUserLocal(user) {
    const u = getUsers().filter(x => x.id !== user.id);
    u.push(user); _set(KEYS.USERS, u);
  }
  function removeUserLocal(id) { _set(KEYS.USERS, getUsers().filter(x => x.id !== id)); }
  function findUserByEmail(email) { return getUsers().find(u => (u.email || '').toLowerCase() === (email || '').toLowerCase()); }
  function getUserById(id) { return getUsers().find(u => u.id === id); }
  function getCurrentUser() { return _get(KEYS.CURRENT_USER); }
  function setCurrentUser(user) { _set(KEYS.CURRENT_USER, user); }
  function clearCurrentUser() { localStorage.removeItem(KEYS.CURRENT_USER); }

  // ========== Categories ==========
  function getCategories() { return _get(KEYS.CATEGORIES) || []; }
  function addCategory(cat) { const c = getCategories(); c.push(cat); _set(KEYS.CATEGORIES, c); _cloudSave('categories', cat); return cat; }
  function updateCategory(id, updates) {
    let merged = null;
    _set(KEYS.CATEGORIES, getCategories().map(c => c.id === id ? (merged = { ...c, ...updates }) : c));
    _cloudSave('categories', merged);
  }
  function deleteCategory(id) { _set(KEYS.CATEGORIES, getCategories().filter(c => c.id !== id)); _cloudRemove('categories', id); }
  function getCategoryById(id) { return getCategories().find(c => c.id === id); }

  // ========== Locations ==========
  function getLocations() { return _get(KEYS.LOCATIONS) || []; }
  function getLocationsByOwner(ownerId) { return getLocations().filter(l => l.ownerId === ownerId); }
  function getLocationById(id) { return getLocations().find(l => l.id === id); }
  function addLocation(loc) { const locs = getLocations(); locs.push(loc); _set(KEYS.LOCATIONS, locs); _cloudSave('locations', loc); return loc; }
  function updateLocation(id, updates) {
    let merged = null;
    _set(KEYS.LOCATIONS, getLocations().map(l => l.id === id ? (merged = { ...l, ...updates }) : l));
    _cloudSave('locations', merged);
  }
  function deleteLocation(id) {
    const removedStock = getStock().filter(s => s.locationId === id);
    const removedBatches = (_get(KEYS.BATCHES) || []).filter(b => b.locationId === id);
    _set(KEYS.LOCATIONS, getLocations().filter(l => l.id !== id));
    _set(KEYS.STOCK, getStock().filter(s => s.locationId !== id));
    _set(KEYS.BATCHES, (_get(KEYS.BATCHES) || []).filter(b => b.locationId !== id));
    _cloudRemove('locations', id);
    removedStock.forEach(s => _cloudRemove('stock', s.id));
    removedBatches.forEach(b => _cloudRemove('batches', b.id));
  }
  function getDefaultLocation(ownerId) {
    const locs = getLocationsByOwner(ownerId);
    return locs.find(l => l.isDefault) || locs[0] || null;
  }

  // ========== Products ==========
  // type: 'raw' (ingredient, never sold), 'simple' (trading good), 'complex' (made
  // from a recipe). Sellable = simple | complex. Raw products are never published.
  function isSellableType(type) { return type === 'simple' || type === 'complex'; }
  function getProducts() { return _get(KEYS.PRODUCTS) || []; }
  function getProductsByOwner(ownerId) { return getProducts().filter(p => p.ownerId === ownerId); }
  function getProductsByType(ownerId, type) { return getProductsByOwner(ownerId).filter(p => (p.type || 'simple') === type); }
  function getSellableProducts(ownerId) { return getProductsByOwner(ownerId).filter(p => isSellableType(p.type || 'simple')); }
  function getIngredientProducts(ownerId) { return getProductsByOwner(ownerId).filter(p => (p.type || 'simple') !== 'complex'); }
  function getPublishedProducts(ownerId) { return getProducts().filter(p => p.ownerId === ownerId && p.isPublished && isSellableType(p.type || 'simple')); }
  function getProductById(id) { return getProducts().find(p => p.id === id); }
  function addProduct(prod) { const p = getProducts(); p.push(prod); _set(KEYS.PRODUCTS, p); _cloudSave('products', prod); return prod; }
  function updateProduct(id, updates) {
    let merged = null;
    _set(KEYS.PRODUCTS, getProducts().map(p => p.id === id ? (merged = { ...p, ...updates }) : p));
    _cloudSave('products', merged);
  }
  function deleteProduct(id) {
    const removedStock = getStock().filter(s => s.productId === id);
    const removedBatches = (_get(KEYS.BATCHES) || []).filter(b => b.productId === id);
    _set(KEYS.PRODUCTS, getProducts().filter(p => p.id !== id));
    _set(KEYS.STOCK, getStock().filter(s => s.productId !== id));
    _set(KEYS.BATCHES, (_get(KEYS.BATCHES) || []).filter(b => b.productId !== id));
    _cloudRemove('products', id);
    removedStock.forEach(s => _cloudRemove('stock', s.id));
    removedBatches.forEach(b => _cloudRemove('batches', b.id));
  }

  // ========== Stock (product x location) ==========
  function getStock() { return _get(KEYS.STOCK) || []; }
  function getStockByOwner(ownerId) {
    const locIds = new Set(getLocationsByOwner(ownerId).map(l => l.id));
    return getStock().filter(s => locIds.has(s.locationId));
  }
  function getStockByLocation(locationId) { return getStock().filter(s => s.locationId === locationId); }
  function getStockByProduct(productId) { return getStock().filter(s => s.productId === productId); }
  function getStockRecord(productId, locationId) { return getStock().find(s => s.productId === productId && s.locationId === locationId); }

  function setStock(productId, locationId, quantity, minStock, extra) {
    const all = getStock();
    const idx = all.findIndex(s => s.productId === productId && s.locationId === locationId);
    let rec;
    if (idx >= 0) {
      rec = all[idx];
      rec.quantity = quantity;
      if (minStock !== undefined) rec.minStock = minStock;
      if (extra) Object.assign(rec, extra);
      if (!rec.ownerId) rec.ownerId = _ownerOfLocation(locationId);
    } else {
      rec = { id: generateId(), ownerId: _ownerOfLocation(locationId), productId, locationId, quantity, minStock: minStock || 0, ...(extra || {}) };
      all.push(rec);
    }
    _set(KEYS.STOCK, all);
    _cloudSave('stock', rec);
  }

  function adjustStock(productId, locationId, delta) {
    const all = getStock();
    const idx = all.findIndex(s => s.productId === productId && s.locationId === locationId);
    let rec = null;
    if (idx >= 0) {
      rec = all[idx];
      rec.quantity = Math.max(0, rec.quantity + delta);
      if (!rec.ownerId) rec.ownerId = _ownerOfLocation(locationId);
    } else if (delta > 0) {
      rec = { id: generateId(), ownerId: _ownerOfLocation(locationId), productId, locationId, quantity: delta, minStock: 0 };
      all.push(rec);
    }
    _set(KEYS.STOCK, all);
    if (rec) _cloudSave('stock', rec);
  }

  function getTotalStockForProduct(productId) {
    return getStockByProduct(productId).reduce((sum, s) => sum + s.quantity, 0);
  }

  function getLowStockItems(ownerId) {
    const ownerStock = getStockByOwner(ownerId);
    return ownerStock.filter(s => s.quantity <= s.minStock);
  }

  function getExpiringStock(ownerId, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + (days || 30));
    return getBatches(ownerId).filter(b => b.qty > 0 && b.expiryDate && new Date(b.expiryDate) <= cutoff);
  }

  // ========== Batches / Lots ==========
  // Purchases (and production) create batches. Each batch carries its own unit
  // cost + optional shelf life. A product x location stock record caches the sum.
  function getBatches(ownerId) {
    const all = _get(KEYS.BATCHES) || [];
    return ownerId ? all.filter(b => b.ownerId === ownerId) : all;
  }
  function getBatchById(id) { return (_get(KEYS.BATCHES) || []).find(b => b.id === id); }
  function getBatchesByProduct(productId, locationId) {
    return (_get(KEYS.BATCHES) || []).filter(b => b.productId === productId && (!locationId || b.locationId === locationId));
  }
  function _lotOrder(a, b) {
    const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
    const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
    if (ax !== bx) return ax - bx; // earliest expiry first (FEFO)
    return new Date(a.purchaseDate || a.createdAt) - new Date(b.purchaseDate || b.createdAt);
  }
  function availableLots(productId, locationId) {
    return getBatchesByProduct(productId, locationId).filter(b => b.qty > 0).sort(_lotOrder);
  }
  function getBatchQty(productId, locationId) {
    return getBatchesByProduct(productId, locationId).reduce((s, b) => s + Math.max(0, b.qty), 0);
  }

  function addBatch(batch) {
    batch.id = batch.id || generateId();
    batch.ownerId = batch.ownerId || _ownerOfLocation(batch.locationId);
    batch.qty = Math.max(0, batch.qty || 0);
    batch.unitCost = batch.unitCost || 0;
    batch.origQty = batch.origQty != null ? batch.origQty : batch.qty;
    batch.createdAt = batch.createdAt || new Date().toISOString();
    batch.purchaseDate = batch.purchaseDate || batch.createdAt;
    batch.expiryDate = batch.expiryDate || null;
    const all = _get(KEYS.BATCHES) || [];
    all.push(batch);
    _set(KEYS.BATCHES, all);
    _cloudSave('batches', batch);
    _recountStock(batch.productId, batch.locationId);
    _recalcProductCost(batch.productId);
    return batch;
  }
  function updateBatch(id, updates, opts) {
    let merged = null;
    _set(KEYS.BATCHES, (_get(KEYS.BATCHES) || []).map(b => b.id === id ? (merged = { ...b, ...updates }) : b));
    if (merged) {
      _cloudSave('batches', merged);
      if (!opts || !opts.defer) {
        _recountStock(merged.productId, merged.locationId);
        _recalcProductCost(merged.productId);
      }
    }
    return merged;
  }
  function deleteBatch(id) {
    const b = getBatchById(id);
    _set(KEYS.BATCHES, (_get(KEYS.BATCHES) || []).filter(x => x.id !== id));
    _cloudRemove('batches', id);
    if (b) { _recountStock(b.productId, b.locationId); _recalcProductCost(b.productId); }
  }

  // Keep the product x location stock record's quantity in sync with its batches.
  function _recountStock(productId, locationId) {
    if (!productId || !locationId) return;
    const qty = getBatchQty(productId, locationId);
    const rec = getStockRecord(productId, locationId);
    setStock(productId, locationId, qty, rec ? rec.minStock : 0);
  }

  // Auto-pick lots to satisfy a quantity (earliest expiry first), optionally
  // forcing a preferred batch to the front. Returns picks or null if short.
  function pickLots(productId, locationId, qty, preferredBatchId) {
    const lots = availableLots(productId, locationId);
    if (preferredBatchId) {
      const i = lots.findIndex(l => l.id === preferredBatchId);
      if (i > 0) { const [pl] = lots.splice(i, 1); lots.unshift(pl); }
    }
    let need = qty; const picks = [];
    for (const l of lots) { if (need <= 0) break; const take = Math.min(l.qty, need); picks.push({ batchId: l.id, qty: take }); need -= take; }
    return need > 0.0001 ? null : picks;
  }

  // Decrement chosen batches; returns total COGS consumed.
  function consumeLots(picks) {
    let cost = 0;
    const touched = [];
    (picks || []).forEach(pk => {
      const b = getBatchById(pk.batchId);
      if (!b) return;
      const take = Math.max(0, Math.min(b.qty, pk.qty));
      cost += take * (b.unitCost || 0);
      updateBatch(b.id, { qty: b.qty - take }, { defer: true });
      touched.push({ productId: b.productId, locationId: b.locationId });
    });
    const seenLoc = {};
    const seenProd = {};
    touched.forEach(t => {
      const locKey = t.productId + '|' + t.locationId;
      if (!seenLoc[locKey]) { seenLoc[locKey] = true; _recountStock(t.productId, t.locationId); }
      seenProd[t.productId] = true;
    });
    Object.keys(seenProd).forEach(id => _recalcProductCost(id));
    return cost;
  }

  // ---- Product cost (derived) ----
  // raw/simple: weighted average of remaining batches (fallback to last batch).
  // complex: making cost from the current recipe + ingredient costs.
  // Per company. Missing/true keeps today's behaviour: MTO sales need ingredient stock.
  // false: sell make-to-order items without deducting raw quantities. Cost still
  // uses each ingredient's latest purchase batch (fallback: saved cost price).
  function tracksIngredientStock(ownerId) {
    if (!ownerId) return true;
    const c = getCompanyById(ownerId);
    if (!c || c.trackIngredientStock == null) return true;
    return c.trackIngredientStock !== false;
  }

  function latestBatchCost(productId) {
    const all = getBatchesByProduct(productId).slice().sort((a, b) => {
      const ta = new Date(a.createdAt || a.purchaseDate || 0).getTime();
      const tb = new Date(b.createdAt || b.purchaseDate || 0).getTime();
      return tb - ta;
    });
    if (!all.length) return null;
    return { unitCost: Number(all[0].unitCost) || 0, batch: all[0] };
  }

  function ingredientRate(product) {
    if (!product) return 0;
    if (product.ownerId && !tracksIngredientStock(product.ownerId)) {
      const latest = latestBatchCost(product.id);
      if (latest) return latest.unitCost;
    }
    return Number(product.costPrice) || 0;
  }

  function calcMakingCost(product) {
    if (!product || !product.recipe || !product.recipe.ingredients) return product ? (product.costPrice || 0) : 0;
    let cost = 0;
    product.recipe.ingredients.forEach(ing => {
      const ip = getProductById(ing.productId);
      if (ip) cost += ingredientRate(ip) * _ingQty(ing);
    });
    const out = product.recipe.outputQty || 1;
    return out > 0 ? cost / out : cost;
  }
  function _recalcProductCost(productId) {
    const p = getProductById(productId);
    if (!p) return;
    let cost;
    if ((p.type || 'simple') === 'complex') {
      cost = calcMakingCost(p);
    } else {
      const bs = getBatchesByProduct(productId).filter(b => b.qty > 0);
      const tot = bs.reduce((s, b) => s + b.qty, 0);
      if (tot > 0) cost = bs.reduce((s, b) => s + b.qty * b.unitCost, 0) / tot;
      else {
        const all = getBatchesByProduct(productId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        cost = all.length ? all[0].unitCost : (p.costPrice || 0);
      }
    }
    const rounded = Math.round((cost || 0) * 100) / 100;
    if (rounded !== p.costPrice) updateProduct(productId, { costPrice: rounded });
  }

  function getProductStockValue(productId) {
    return getBatchesByProduct(productId).reduce((s, b) => s + Math.max(0, b.qty) * (b.unitCost || 0), 0);
  }

  // Make-to-order: complex items with a recipe deduct ingredients on sale
  // instead of requiring a finished-goods Produce step first.
  function isMakeToOrder(product) {
    if (!product) return false;
    if (product.fulfillment === 'stock') return false;
    const recipe = product.recipe;
    return (product.type || 'simple') === 'complex'
      && recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0;
  }

  function _ingQty(ing) {
    const q = Number(ing && ing.qty) || 0;
    const waste = Math.max(0, Number(ing && ing.wastagePct) || 0);
    return q * (1 + waste / 100);
  }

  function _bomNeeds(product, qty) {
    const recipe = product.recipe || { outputQty: 1, ingredients: [] };
    const scale = (Number(qty) || 0) / Math.max(1, Number(recipe.outputQty) || 1);
    return (recipe.ingredients || []).map(ing => ({
      productId: ing.productId,
      qty: _ingQty(ing) * scale,
    })).filter(n => n.productId && n.qty > 0);
  }

  function checkBom(product, locationId, qty) {
    if (product && product.ownerId && !tracksIngredientStock(product.ownerId)) {
      return { ok: true, shortages: [], untracked: true };
    }
    const shortages = [];
    _bomNeeds(product, qty).forEach(need => {
      const have = getBatchQty(need.productId, locationId);
      if (have + 1e-6 < need.qty) {
        const ip = getProductById(need.productId);
        shortages.push({ productId: need.productId, name: ip ? ip.name : 'ingredient', need: need.qty, have: have });
      }
    });
    return { ok: shortages.length === 0, shortages };
  }

  function maxMakeQty(product, locationId) {
    if (!isMakeToOrder(product)) return getBatchQty(product.id, locationId);
    if (product.ownerId && !tracksIngredientStock(product.ownerId)) return Infinity;
    const recipe = product.recipe;
    const out = Math.max(1, Number(recipe.outputQty) || 1);
    let max = Infinity;
    (recipe.ingredients || []).forEach(ing => {
      const per = _ingQty(ing);
      if (per <= 0) return;
      const have = getBatchQty(ing.productId, locationId);
      max = Math.min(max, Math.floor((have / per) * out + 1e-9));
    });
    if (max === Infinity) return 0;
    return Math.max(0, max);
  }

  function availableSellQty(product, locationId) {
    if (!product) return 0;
    if (isMakeToOrder(product)) return maxMakeQty(product, locationId);
    return getBatchQty(product.id, locationId);
  }

  function consumeForSale(product, locationId, qty, preferredBatchId) {
    if (isMakeToOrder(product)) {
      if (product.ownerId && !tracksIngredientStock(product.ownerId)) {
        const unit = calcMakingCost(product);
        return { success: true, picks: [], cost: unit * (Number(qty) || 0), untracked: true };
      }
      const check = checkBom(product, locationId, qty);
      if (!check.ok) return { success: false, shortages: check.shortages, picks: [], cost: 0 };
      const allPicks = [];
      _bomNeeds(product, qty).forEach(need => {
        const picks = pickLots(need.productId, locationId, need.qty);
        (picks || []).forEach(pk => allPicks.push({ ...pk, productId: need.productId }));
      });
      const cost = consumeLots(allPicks);
      return { success: true, picks: allPicks, cost };
    }
    const picks = pickLots(product.id, locationId, qty, preferredBatchId);
    if (!picks) {
      return {
        success: false,
        shortages: [{ productId: product.id, name: product.name, need: qty, have: getBatchQty(product.id, locationId) }],
        picks: [],
        cost: 0,
      };
    }
    const cost = consumeLots(picks);
    return { success: true, picks: picks.map(pk => ({ ...pk, productId: product.id })), cost };
  }

  function _formatShortages(shortages) {
    return (shortages || []).map(s =>
      (s.name || 'item') + ' (need ' + (Math.round(s.need * 1000) / 1000) + ', have ' + (Math.round(s.have * 1000) / 1000) + ')'
    ).join('; ');
  }

  // Produce a complex product: consume the chosen ingredient lots, compute the
  // actual making cost, and create a finished batch at that cost.
  function produceComplex(productId, locationId, qty, lotChoices) {
    const p = getProductById(productId);
    if (!p || (p.type || 'simple') !== 'complex' || !p.recipe) return { success: false, message: 'Not a complex product' };
    if (!locationId) return { success: false, message: 'Select a location' };
    qty = Math.max(1, qty || 1);
    if (p.ownerId && !tracksIngredientStock(p.ownerId)) {
      const unit = Math.round((calcMakingCost(p) || 0) * 100) / 100;
      addBatch({ productId, locationId, batchNumber: 'PROD-' + generateId().slice(0, 5).toUpperCase(), unitCost: unit, qty, note: 'Produced without deducting ingredients' });
      return { success: true, cost: unit * qty, unitCost: unit, untracked: true };
    }
    const allPicks = [];
    const needs = _bomNeeds(p, qty);
    for (const need of needs) {
      const picks = pickLots(need.productId, locationId, need.qty, (lotChoices || {})[need.productId]);
      if (!picks) {
        const ip = getProductById(need.productId);
        return { success: false, message: 'Not enough ' + (ip ? ip.name : 'ingredient') + ' at this location (need ' + need.qty + ')' };
      }
      picks.forEach(pk => allPicks.push(pk));
    }
    const cost = consumeLots(allPicks);
    const unit = qty > 0 ? cost / qty : cost;
    addBatch({ productId, locationId, batchNumber: 'PROD-' + generateId().slice(0, 5).toUpperCase(), unitCost: Math.round(unit * 100) / 100, qty, note: 'Produced ' + qty });
    return { success: true, cost, unitCost: unit };
  }

  // ========== Orders ==========
  function getOrders() { return _get(KEYS.ORDERS) || []; }
  function getOrderById(id) { return getOrders().find(o => o.id === id); }
  function getSalesOrders(sellerId) { return getOrders().filter(o => o.sellerId === sellerId); }
  function getPurchaseOrders(buyerId) { return getOrders().filter(o => o.buyerId === buyerId); }

  function createOrder(buyerId, sellerId, items) {
    const order = {
      id: generateId(),
      orderNumber: _nextOrderNumber(),
      buyerId,
      sellerId,
      fulfillmentLocationId: null,
      items,
      status: 'pending',
      total: items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const orders = getOrders();
    orders.push(order);
    _set(KEYS.ORDERS, orders);
    _cloudSave('orders', order);
    return order;
  }

  function updateOrderStatus(orderId, status, fulfillmentLocationId) {
    const orders = getOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx < 0) return null;
    orders[idx].status = status;
    orders[idx].updatedAt = new Date().toISOString();
    if (fulfillmentLocationId) orders[idx].fulfillmentLocationId = fulfillmentLocationId;

    if (status === 'delivered') {
      const order = orders[idx];
      const buyerDefaultLoc = getDefaultLocation(order.buyerId);
      order.items.forEach(item => {
        if (order.fulfillmentLocationId) {
          const product = getProductById(item.productId);
          if (product && isMakeToOrder(product)) {
            const res = consumeForSale(product, order.fulfillmentLocationId, item.qty);
            if (res.success) item.costPrice = res.cost / Math.max(1, item.qty);
          } else {
            const picks = pickLots(item.productId, order.fulfillmentLocationId, item.qty);
            if (picks) item.costPrice = consumeLots(picks) / Math.max(1, item.qty);
          }
        }
        if (buyerDefaultLoc) {
          let buyerProduct = getProductsByOwner(order.buyerId).find(p => p.name === item.name);
          if (!buyerProduct) {
            buyerProduct = { id: generateId(), ownerId: order.buyerId, name: item.name, type: 'simple', sku: item.sku || 'AUTO-' + generateId().slice(0, 4).toUpperCase(), categoryId: '', costPrice: item.unitPrice, price: item.unitPrice, unit: 'pcs', gstRate: 0, description: 'Auto-created from purchase order ' + order.orderNumber, isPublished: false, createdAt: new Date().toISOString() };
            addProduct(buyerProduct);
          }
          addBatch({ productId: buyerProduct.id, locationId: buyerDefaultLoc.id, unitCost: item.unitPrice, qty: item.qty, batchNumber: 'PO-' + order.orderNumber, note: 'Received ' + order.orderNumber });
        }
      });
    }

    _set(KEYS.ORDERS, orders);
    _cloudSave('orders', orders[idx]);
    return orders[idx];
  }

  function _pushOrder(order) {
    const orders = getOrders();
    orders.push(order);
    _set(KEYS.ORDERS, orders);
    _cloudSave('orders', order);
    return order;
  }

  // Manual purchase from an off-platform seller: buyer = company (ownerId),
  // seller = a custom party. Items reference the company's own products.
  function createManualPurchase(ownerId, sellerPartyId, items, locationId) {
    return _pushOrder({
      id: generateId(), orderNumber: _nextOrderNumber(), kind: 'manual_purchase',
      buyerId: ownerId, sellerId: null, sellerPartyId: sellerPartyId,
      fulfillmentLocationId: locationId || null, items: items,
      status: 'pending', total: items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      amountPaid: 0, paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }

  // Field sale placed by a marketing worker to their own company.
  function createFieldSale(ownerId, customerPartyId, items, createdBy) {
    return _pushOrder({
      id: generateId(), orderNumber: _nextOrderNumber(), kind: 'field_sale',
      sellerId: ownerId, buyerId: null, customerPartyId: customerPartyId, createdBy: createdBy || null,
      fulfillmentLocationId: null, items: items,
      status: 'pending', total: items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      amountPaid: 0, paymentStatus: 'unpaid',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }

  function _setOrder(orderId, mutate) {
    const orders = getOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx < 0) return null;
    mutate(orders[idx]);
    orders[idx].updatedAt = new Date().toISOString();
    _set(KEYS.ORDERS, orders);
    _cloudSave('orders', orders[idx]);
    return orders[idx];
  }

  function acceptOrder(orderId) { return _setOrder(orderId, o => { o.status = 'accepted'; }); }
  function cancelOrder(orderId) { return _setOrder(orderId, o => { o.status = 'cancelled'; }); }

  // Deliver a field sale: reduce stock, record payment, post any shortfall to
  // Khata as credit against the customer (they owe the company).
  function fulfillFieldSale(orderId, amountReceived, locationId, lotChoices) {
    const order = getOrderById(orderId);
    if (!order) return { success: false, message: 'Order not found' };
    const loc = locationId || order.fulfillmentLocationId || (getDefaultLocation(order.sellerId) || {}).id;
    if (!loc) return { success: false, message: 'No location selected' };
    // Verify every line can be satisfied before any batch is reduced. Make-to-order
    // lines used to consume ingredients inside this loop, so a later short line
    // left raw stock already deducted.
    const plan = [];
    const ingredientNeed = {};
    const simpleNeed = {};
    for (const i of order.items) {
      const product = getProductById(i.productId);
      if (product && isMakeToOrder(product)) {
        const untracked = product.ownerId && !tracksIngredientStock(product.ownerId);
        if (!untracked) {
          const check = checkBom(product, loc, i.qty);
          if (!check.ok) return { success: false, message: 'Not enough ingredients for ' + (i.name || product.name) };
          _bomNeeds(product, i.qty).forEach(n => {
            ingredientNeed[n.productId] = (ingredientNeed[n.productId] || 0) + n.qty;
          });
        }
        plan.push({ item: i, mto: true, product });
      } else {
        const picks = pickLots(i.productId, loc, i.qty, (lotChoices || {})[i.productId]);
        if (!picks) return { success: false, message: 'Not enough stock of ' + i.name + ' at this location' };
        simpleNeed[i.productId] = (simpleNeed[i.productId] || 0) + i.qty;
        plan.push({ item: i, picks: true });
      }
    }
    for (const pid of Object.keys(ingredientNeed)) {
      if (getBatchQty(pid, loc) + 1e-6 < ingredientNeed[pid]) {
        const ip = getProductById(pid);
        return { success: false, message: 'Not enough ingredients for ' + (ip ? ip.name : 'ingredient') };
      }
    }
    for (const pid of Object.keys(simpleNeed)) {
      if (getBatchQty(pid, loc) + 1e-6 < simpleNeed[pid]) {
        const prod = getProductById(pid);
        return { success: false, message: 'Not enough stock of ' + (prod ? prod.name : pid) + ' at this location' };
      }
    }
    for (const p of plan) {
      if (p.mto) {
        const res = consumeForSale(p.product, loc, p.item.qty);
        if (!res.success) return { success: false, message: 'Not enough ingredients for ' + (p.item.name || p.product.name) };
        p.item.costPrice = res.cost / Math.max(1, p.item.qty);
      } else {
        const picks = pickLots(p.item.productId, loc, p.item.qty, (lotChoices || {})[p.item.productId]);
        if (!picks) return { success: false, message: 'Not enough stock of ' + p.item.name + ' at this location' };
        p.item.costPrice = consumeLots(picks) / Math.max(1, p.item.qty);
      }
    }
    _setOrder(orderId, o => { o.items = order.items; });
    const paid = Math.max(0, amountReceived || 0);
    const balance = order.total - paid;
    const updated = _setOrder(orderId, o => {
      o.fulfillmentLocationId = loc || o.fulfillmentLocationId;
      o.amountPaid = paid;
      if (balance > 0.0001) { o.status = 'open'; o.paymentStatus = paid > 0 ? 'partial' : 'unpaid'; }
      else { o.status = 'completed'; o.paymentStatus = 'paid'; }
    });
    if (balance > 0.0001) {
      const party = getPartyById(order.customerPartyId);
      addKhataEntry({ ownerId: order.sellerId, partyId: order.customerPartyId, partyName: party ? party.name : 'Customer', type: 'credit', amount: balance, description: order.orderNumber + ' delivered, balance due', orderId: order.id });
    }
    return { success: true, order: updated };
  }

  // Receive a manual purchase: add stock, refresh cost, record payment, and post
  // any unpaid balance to Khata as a debit (the company owes the seller).
  function receiveManualPurchase(orderId, amountPaid, locationId) {
    const order = getOrderById(orderId);
    if (!order) return { success: false, message: 'Order not found' };
    const loc = locationId || order.fulfillmentLocationId || (getDefaultLocation(order.buyerId) || {}).id;
    if (!loc) return { success: false, message: 'No location selected' };
    order.items.forEach(i => {
      addBatch({
        productId: i.productId, locationId: loc, unitCost: i.unitPrice, qty: i.qty,
        expiryDate: i.expiryDate || null, supplierPartyId: order.sellerPartyId || null,
        batchNumber: i.batchNumber || ('PUR-' + generateId().slice(0, 5).toUpperCase()),
        note: 'Purchase ' + order.orderNumber,
      });
    });
    const paid = Math.max(0, amountPaid || 0);
    const balance = order.total - paid;
    const updated = _setOrder(orderId, o => {
      o.fulfillmentLocationId = loc;
      o.amountPaid = paid;
      if (balance > 0.0001) { o.status = 'open'; o.paymentStatus = paid > 0 ? 'partial' : 'unpaid'; }
      else { o.status = 'completed'; o.paymentStatus = 'paid'; }
    });
    if (balance > 0.0001) {
      const party = getPartyById(order.sellerPartyId);
      addKhataEntry({ ownerId: order.buyerId, partyId: order.sellerPartyId, partyName: party ? party.name : 'Seller', type: 'debit', amount: balance, description: order.orderNumber + ' received, balance payable', orderId: order.id });
    }
    return { success: true, order: updated };
  }

  // Settle the remaining balance on an open order.
  function settleOrder(orderId) { return _setOrder(orderId, o => { o.status = 'completed'; o.paymentStatus = 'paid'; o.amountPaid = o.total; }); }

  // ========== POS Sales ==========
  function _nextReceiptNumber() {
    const seq = (_get(KEYS.POS_SEQ) || 5000) + 1;
    _set(KEYS.POS_SEQ, seq);
    return 'RCT-' + seq;
  }

  function getPosSales(ownerId) { return (_get(KEYS.POS_SALES) || []).filter(s => s.ownerId === ownerId); }

  function createPosSale(ownerId, locationId, items, paymentMethod, customerName) {
    const issues = [];
    items.forEach(i => {
      const product = getProductById(i.productId);
      if (!product) { issues.push({ name: i.name || i.productId, need: i.qty, have: 0 }); return; }
      if (isMakeToOrder(product)) {
        const check = checkBom(product, locationId, i.qty);
        if (!check.ok) issues.push.apply(issues, check.shortages);
      } else {
        const have = getBatchQty(i.productId, locationId);
        if (have + 1e-6 < i.qty) issues.push({ name: product.name, need: i.qty, have });
      }
    });
    if (issues.length) {
      return { success: false, message: 'Not enough stock: ' + _formatShortages(issues), shortages: issues };
    }

    const sale = {
      id: generateId(),
      receiptNumber: _nextReceiptNumber(),
      ownerId,
      locationId,
      items: items.map(i => ({ ...i })),
      subtotal: items.reduce((s, i) => s + i.qty * i.price, 0),
      taxAmount: items.reduce((s, i) => s + i.qty * i.price * ((i.gstRate || 0) / 100), 0),
      paymentMethod: paymentMethod || 'cash',
      customerName: customerName || 'Walk-in',
      createdAt: new Date().toISOString(),
      stockShort: false,
    };
    sale.total = sale.subtotal + sale.taxAmount;
    const allConsumed = [];
    sale.items.forEach(i => {
      const product = getProductById(i.productId);
      const res = consumeForSale(product, locationId, i.qty, i.batchId);
      i.costPrice = res.cost / Math.max(1, i.qty);
      i.makeToOrder = isMakeToOrder(product);
      delete i.lots; delete i.batchId;
      allConsumed.push.apply(allConsumed, res.picks || []);
    });
    sale.consumedLots = allConsumed;
    const all = _get(KEYS.POS_SALES) || [];
    all.push(sale);
    _set(KEYS.POS_SALES, all);
    _cloudSave('pos_sales', sale);
    return { success: true, sale };
  }

  function getPosSalesToday(ownerId) {
    const today = new Date().toDateString();
    return getPosSales(ownerId).filter(s => new Date(s.createdAt).toDateString() === today);
  }

  // ========== Recipes (BOM) ==========
  function getRecipes(ownerId) { return (_get(KEYS.RECIPES) || []).filter(r => r.ownerId === ownerId); }
  function getRecipeById(id) { return (_get(KEYS.RECIPES) || []).find(r => r.id === id); }
  function addRecipe(recipe) { const all = _get(KEYS.RECIPES) || []; all.push(recipe); _set(KEYS.RECIPES, all); _cloudSave('recipes', recipe); return recipe; }
  function updateRecipe(id, updates) {
    let merged = null;
    _set(KEYS.RECIPES, (_get(KEYS.RECIPES) || []).map(r => r.id === id ? (merged = { ...r, ...updates }) : r));
    _cloudSave('recipes', merged);
  }
  function deleteRecipe(id) { _set(KEYS.RECIPES, (_get(KEYS.RECIPES) || []).filter(r => r.id !== id)); _cloudRemove('recipes', id); }

  function produceRecipe(recipeId, locationId, qty) {
    const recipe = getRecipeById(recipeId);
    if (!recipe) return { success: false, message: 'Recipe not found' };
    for (const ing of recipe.ingredients) {
      const needed = ing.qty * qty;
      const rec = getStockRecord(ing.productId, locationId);
      if (!rec || rec.quantity < needed) {
        const prod = getProductById(ing.productId);
        return { success: false, message: 'Not enough ' + (prod ? prod.name : 'ingredient') + ' (need ' + needed + ', have ' + (rec ? rec.quantity : 0) + ')' };
      }
    }
    for (const ing of recipe.ingredients) {
      adjustStock(ing.productId, locationId, -(ing.qty * qty));
    }
    adjustStock(recipe.outputProductId, locationId, recipe.outputQty * qty);
    return { success: true };
  }

  function calcRecipeCost(recipe) {
    let cost = 0;
    for (const ing of recipe.ingredients) {
      const prod = getProductById(ing.productId);
      if (prod) cost += (prod.costPrice || 0) * ing.qty;
    }
    return recipe.outputQty > 0 ? cost / recipe.outputQty : cost;
  }

  // ========== Khata (Credit Ledger) ==========
  function _nextKhataNumber() {
    const seq = (_get(KEYS.KHATA_SEQ) || 100) + 1;
    _set(KEYS.KHATA_SEQ, seq);
    return 'KH-' + seq;
  }

  function getKhataEntries(ownerId) { return (_get(KEYS.KHATA) || []).filter(k => k.ownerId === ownerId); }
  function getKhataByParty(ownerId, partyId) { return getKhataEntries(ownerId).filter(k => k.partyId === partyId); }

  function addKhataEntry(entry) {
    entry.id = entry.id || generateId();
    entry.entryNumber = entry.entryNumber || _nextKhataNumber();
    entry.createdAt = entry.createdAt || new Date().toISOString();
    const all = _get(KEYS.KHATA) || [];
    all.push(entry);
    _set(KEYS.KHATA, all);
    _cloudSave('khata', entry);
    return entry;
  }

  function getKhataBalance(ownerId, partyId) {
    const entries = getKhataByParty(ownerId, partyId);
    return entries.reduce((bal, e) => bal + (e.type === 'credit' ? e.amount : -e.amount), 0);
  }

  function getKhataParties(ownerId) {
    const entries = getKhataEntries(ownerId);
    const map = {};
    entries.forEach(e => {
      if (!map[e.partyId]) map[e.partyId] = { partyId: e.partyId, partyName: e.partyName, total: 0 };
      map[e.partyId].total += e.type === 'credit' ? e.amount : -e.amount;
    });
    return Object.values(map);
  }

  // ========== Custom Parties (off-platform customers / sellers) ==========
  function getParties(ownerId) { return (_get(KEYS.PARTIES) || []).filter(p => p.ownerId === ownerId); }
  function getPartiesByType(ownerId, type) {
    return getParties(ownerId).filter(p => p.type === type || p.type === 'both');
  }
  function getPartyById(id) { return (_get(KEYS.PARTIES) || []).find(p => p.id === id); }
  function addParty(party) {
    party.id = party.id || generateId();
    party.createdAt = party.createdAt || new Date().toISOString();
    const all = _get(KEYS.PARTIES) || [];
    all.push(party);
    _set(KEYS.PARTIES, all);
    _cloudSave('parties', party);
    return party;
  }
  function updateParty(id, updates) {
    let merged = null;
    _set(KEYS.PARTIES, (_get(KEYS.PARTIES) || []).map(p => p.id === id ? (merged = { ...p, ...updates }) : p));
    _cloudSave('parties', merged);
    return merged;
  }
  function deleteParty(id) {
    _set(KEYS.PARTIES, (_get(KEYS.PARTIES) || []).filter(p => p.id !== id));
    _cloudRemove('parties', id);
  }

  // ========== Companies (tenants) ==========
  // A company doc id equals its owner's uid (== companyId used everywhere else).
  function getCompanies() { return _get(KEYS.COMPANIES) || []; }
  function getCompanyById(id) { return getCompanies().find(c => c.id === id) || null; }
  function addCompany(company) {
    company.createdAt = company.createdAt || new Date().toISOString();
    const all = getCompanies().filter(c => c.id !== company.id);
    all.push(company);
    _set(KEYS.COMPANIES, all);
    _cloudSave('companies', company);
    return company;
  }
  function upsertCompanyLocal(company) {
    const all = getCompanies().filter(c => c.id !== company.id);
    all.push(company); _set(KEYS.COMPANIES, all);
  }

  // ========== Revenue Aggregation (for reports) ==========
  function getRevenueData(ownerId, startDate, endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    const posSales = getPosSales(ownerId).filter(s => { const d = new Date(s.createdAt); return d >= start && d <= end; });
    const salesOrders = getSalesOrders(ownerId).filter(o => o.status === 'delivered' && new Date(o.updatedAt) >= start && new Date(o.updatedAt) <= end);
    let posRevenue = 0, posCost = 0, orderRevenue = 0, orderCost = 0;
    posSales.forEach(s => { s.items.forEach(i => { posRevenue += i.price * i.qty; posCost += (i.costPrice || 0) * i.qty; }); });
    salesOrders.forEach(o => { o.items.forEach(i => { orderRevenue += i.unitPrice * i.qty; const prod = getProductById(i.productId); orderCost += (prod ? prod.costPrice || 0 : 0) * i.qty; }); });
    return { posRevenue, posCost, orderRevenue, orderCost, totalRevenue: posRevenue + orderRevenue, totalCost: posCost + orderCost, totalProfit: (posRevenue + orderRevenue) - (posCost + orderCost) };
  }

  // ========== Cart ==========
  function getCart() { return _get(KEYS.CART) || { sellerId: null, items: [] }; }
  function setCart(cart) { _set(KEYS.CART, cart); }
  function clearCart() { localStorage.removeItem(KEYS.CART); }

  function addToCart(sellerId, productId, qty) {
    const cart = getCart();
    if (cart.sellerId && cart.sellerId !== sellerId) {
      return { success: false, message: 'Cart has items from another shop. Clear cart first.' };
    }
    cart.sellerId = sellerId;
    const idx = cart.items.findIndex(i => i.productId === productId);
    if (idx >= 0) {
      cart.items[idx].qty += qty;
    } else {
      cart.items.push({ productId, qty });
    }
    setCart(cart);
    return { success: true };
  }

  function updateCartItemQty(productId, qty) {
    const cart = getCart();
    if (qty <= 0) {
      cart.items = cart.items.filter(i => i.productId !== productId);
    } else {
      const idx = cart.items.findIndex(i => i.productId === productId);
      if (idx >= 0) cart.items[idx].qty = qty;
    }
    if (cart.items.length === 0) cart.sellerId = null;
    setCart(cart);
  }

  function getCartItemCount() {
    return getCart().items.reduce((s, i) => s + i.qty, 0);
  }

  // ========== Cloud hydration (Firestore -> local cache) ==========
  function _maxSeq(arr, field, prefix) {
    return (arr || []).reduce((m, x) => {
      const n = parseInt(String(x[field] || '').replace(prefix, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
  }
  function _recomputeSequences() {
    const os = _maxSeq(getOrders(), 'orderNumber', 'ORD-'); if (os) _set(KEYS.ORDER_SEQ, os);
    const ps = _maxSeq(_get(KEYS.POS_SALES), 'receiptNumber', 'RCT-'); if (ps) _set(KEYS.POS_SEQ, ps);
    const ks = _maxSeq(_get(KEYS.KHATA), 'entryNumber', 'KH-'); if (ks) _set(KEYS.KHATA_SEQ, ks);
  }

  // Pull the data this user is allowed to see into the local read cache.
  // Super admin gets a full god-view; normal users get their own data plus
  // the published marketplace catalog and the parties they trade with.
  // Never keep password material in the local read cache.
  function _stripUserSecrets(arr) { return (arr || []).map(u => { const { passwordHash, salt, ...rest } = u; return rest; }); }

  const SYNC_TTL_MS = 10 * 60 * 1000;
  const MARKET_TTL_MS = 6 * 60 * 60 * 1000;
  const POS_SYNC_DAYS = 30;

  function _syncStampKey(scopeId) { return 'ims_sync_at_' + scopeId; }
  function _posDaysKey(scopeId) { return 'ims_pos_days_' + scopeId; }
  function _sinceIso(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function _mergeById(existing, incoming) {
    const map = {};
    (existing || []).forEach(x => { if (x && x.id) map[x.id] = x; });
    (incoming || []).forEach(x => { if (x && x.id) map[x.id] = x; });
    return Object.values(map);
  }
  function _hasOwnProducts(scopeId) {
    return (getProducts() || []).some(p => p && p.ownerId === scopeId);
  }

  // Recent POS rows when the composite index exists. Otherwise the caller's
  // fallback reads the whole company, which is the old cost.
  async function _recentPos(scopeId, days) {
    const since = _sinceIso(days);
    const rows = await Firebase.listRecent('pos_sales', 'ownerId', scopeId, since);
    return { rows, days };
  }

  async function sync(user, opts) {
    opts = opts || {};
    if (!_cloudOn() || !user) return;
    const isAdmin = user.role === 'superadmin';
    const scopeId = user.companyId || user.id;
    if (!opts.force && !isAdmin && _hasOwnProducts(scopeId)) {
      const last = parseInt(localStorage.getItem(_syncStampKey(scopeId)) || '0', 10);
      if (last && Date.now() - last < SYNC_TTL_MS) return { skipped: true };
    }
    try {
      if (isAdmin) {
        const [users, cats, locs, prods, stock, orders, pos, recipes, khata, parties, companies, batches] = await Promise.all([
          Firebase.list('users'), Firebase.list('categories'), Firebase.list('locations'),
          Firebase.list('products'), Firebase.list('stock'), Firebase.list('orders'),
          Firebase.list('pos_sales'), Firebase.list('recipes'), Firebase.list('khata'), Firebase.list('parties'), Firebase.list('companies'), Firebase.list('batches'),
        ]);
        _set(KEYS.USERS, _stripUserSecrets(users)); _set(KEYS.CATEGORIES, cats); _set(KEYS.LOCATIONS, locs);
        _set(KEYS.PRODUCTS, prods); _set(KEYS.STOCK, stock); _set(KEYS.ORDERS, orders);
        _set(KEYS.POS_SALES, pos); _set(KEYS.RECIPES, recipes); _set(KEYS.KHATA, khata); _set(KEYS.PARTIES, parties); _set(KEYS.COMPANIES, companies); _set(KEYS.BATCHES, batches);
      } else {
        // Company users only. Marketplace catalogs load when Shop is opened.
        const [users, selfDoc, cats, locs, ownProds, stock, ordBuy, ordSell, recipes, khata, parties, batches] = await Promise.all([
          Firebase.listWhere('users', 'companyId', '==', scopeId),
          Firebase.getDoc('users', user.id),
          Firebase.list('categories'),
          Firebase.listByOwner('locations', scopeId),
          Firebase.listByOwner('products', scopeId),
          Firebase.listByOwner('stock', scopeId),
          Firebase.listWhere('orders', 'buyerId', '==', scopeId),
          Firebase.listWhere('orders', 'sellerId', '==', scopeId),
          Firebase.listByOwner('recipes', scopeId),
          Firebase.listByOwner('khata', scopeId),
          Firebase.listByOwner('parties', scopeId),
          Firebase.listByOwner('batches', scopeId),
        ]);
        if (selfDoc && !users.some(u => u.id === selfDoc.id)) users.push(selfDoc);
        let posRows;
        let posDays = POS_SYNC_DAYS;
        try {
          const recent = await _recentPos(scopeId, POS_SYNC_DAYS);
          posRows = recent.rows;
        } catch (e) {
          console.warn('[sync] recent sales query unavailable, reading company sales', e && e.message);
          posRows = await Firebase.listByOwner('pos_sales', scopeId);
          posDays = 3650;
        }
        const keptPub = getProducts().filter(p => p && p.isPublished && p.ownerId !== scopeId);
        const prodMap = {};
        ownProds.concat(keptPub).forEach(p => { prodMap[p.id] = p; });
        const ordMap = {}; ordBuy.concat(ordSell).forEach(o => { ordMap[o.id] = o; });
        const otherPos = (_get(KEYS.POS_SALES) || []).filter(s => s && s.ownerId !== scopeId);
        _set(KEYS.USERS, _stripUserSecrets(users)); _set(KEYS.CATEGORIES, cats); _set(KEYS.LOCATIONS, locs);
        _set(KEYS.PRODUCTS, Object.values(prodMap)); _set(KEYS.STOCK, stock);
        _set(KEYS.ORDERS, Object.values(ordMap));
        _set(KEYS.POS_SALES, otherPos.concat(posRows || []));
        _set(KEYS.RECIPES, recipes); _set(KEYS.KHATA, khata); _set(KEYS.PARTIES, parties); _set(KEYS.BATCHES, batches);
        localStorage.setItem(_posDaysKey(scopeId), String(posDays));
        let company = null;
        try { company = await Firebase.getDoc('companies', scopeId); } catch (e) { company = null; }
        const companyMap = {};
        getCompanies().forEach(c => { if (c && c.id) companyMap[c.id] = c; });
        if (company) companyMap[company.id] = company;
        _set(KEYS.COMPANIES, Object.values(companyMap));
      }
      _recomputeSequences();
      if (!isAdmin) localStorage.setItem(_syncStampKey(scopeId), String(Date.now()));
      return { skipped: false };
    } catch (e) {
      console.error('[sync] hydration failed:', e && e.message);
      throw e;
    }
  }

  // Published products and company names, only when someone opens Shop.
  async function syncMarketplace(opts) {
    opts = opts || {};
    if (!_cloudOn()) return;
    const last = parseInt(localStorage.getItem('ims_mkt_at') || '0', 10);
    if (!opts.force && last && Date.now() - last < MARKET_TTL_MS) return;
    const [pub, companies] = await Promise.all([
      Firebase.listWhere('products', 'isPublished', '==', true),
      Firebase.list('companies'),
    ]);
    const scopeId = (getCurrentUser() || {}).companyId || (getCurrentUser() || {}).id;
    const local = getProducts().filter(p => !p || p.ownerId === scopeId || !p.isPublished);
    const map = {};
    local.concat(pub || []).forEach(p => { if (p && p.id) map[p.id] = p; });
    _set(KEYS.PRODUCTS, Object.values(map));
    if (companies && companies.length) _set(KEYS.COMPANIES, companies);
    // Shop's Add button reads stock. Other companies' rows are not in the boot
    // cache, so fetch them here — one owner query per shop, cached with the catalog.
    const sellers = [];
    const seenSeller = {};
    (pub || []).forEach(p => {
      if (p && p.ownerId && p.ownerId !== scopeId && !seenSeller[p.ownerId]) {
        seenSeller[p.ownerId] = true;
        sellers.push(p.ownerId);
      }
    });
    const foreign = [];
    for (let i = 0; i < sellers.length; i++) {
      try {
        const rows = await Firebase.listByOwner('stock', sellers[i]);
        (rows || []).forEach(s => { if (s) foreign.push(s); });
      } catch (e) { /* catalog still renders; that shop shows as out of stock */ }
    }
    const stockMap = {};
    getStock().filter(s => s && s.ownerId === scopeId).concat(foreign).forEach(s => { if (s && s.id) stockMap[s.id] = s; });
    _set(KEYS.STOCK, Object.values(stockMap));
    localStorage.setItem('ims_mkt_at', String(Date.now()));
  }

  // Pull a wider POS window when Reports asks for more than the boot cache.
  async function ensurePosSales(ownerId, days) {
    if (!_cloudOn() || !ownerId) return;
    const need = Math.max(POS_SYNC_DAYS, days || POS_SYNC_DAYS);
    const covered = parseInt(localStorage.getItem(_posDaysKey(ownerId)) || '0', 10);
    if (covered >= need) return;
    let rows;
    try {
      rows = (await _recentPos(ownerId, need)).rows;
    } catch (e) {
      console.warn('[sync] could not extend sales history', e && e.message);
      return;
    }
    const others = (_get(KEYS.POS_SALES) || []).filter(s => s && s.ownerId !== ownerId);
    const mine = (_get(KEYS.POS_SALES) || []).filter(s => s && s.ownerId === ownerId);
    _set(KEYS.POS_SALES, others.concat(_mergeById(mine, rows)));
    localStorage.setItem(_posDaysKey(ownerId), String(need));
    _recomputeSequences();
  }

  function _clearLocalData() {
    [KEYS.CATEGORIES, KEYS.LOCATIONS, KEYS.PRODUCTS, KEYS.STOCK, KEYS.ORDERS,
     KEYS.POS_SALES, KEYS.RECIPES, KEYS.KHATA, KEYS.PARTIES, KEYS.COMPANIES, KEYS.BATCHES, KEYS.USERS, KEYS.CART].forEach(k => localStorage.removeItem(k));
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.indexOf('ims_sync_at_') === 0 || k.indexOf('ims_pos_days_') === 0 || k === 'ims_mkt_at')) drop.push(k);
    }
    drop.forEach(k => localStorage.removeItem(k));
  }


  return {
    generateId,
    getUsers, addUser, upsertUserLocal, removeUserLocal, findUserByEmail, getUserById,
    getCurrentUser, setCurrentUser, clearCurrentUser,
    getCategories, addCategory, updateCategory, deleteCategory, getCategoryById,
    getLocations, getLocationsByOwner, getLocationById, addLocation, updateLocation, deleteLocation, getDefaultLocation,
    getProducts, getProductsByOwner, getProductsByType, getSellableProducts, getIngredientProducts, getPublishedProducts, getProductById, addProduct, updateProduct, deleteProduct, isSellableType,
    getStock, getStockByOwner, getStockByLocation, getStockByProduct, getStockRecord, setStock, adjustStock, getTotalStockForProduct, getLowStockItems, getExpiringStock,
    getBatches, getBatchById, getBatchesByProduct, availableLots, getBatchQty, addBatch, updateBatch, deleteBatch, pickLots, consumeLots,     calcMakingCost, getProductStockValue, produceComplex,
    tracksIngredientStock, latestBatchCost, ingredientRate,
    isMakeToOrder, checkBom, maxMakeQty, availableSellQty, consumeForSale, _formatShortages,
    getOrders, getOrderById, getSalesOrders, getPurchaseOrders, createOrder, updateOrderStatus,
    createManualPurchase, createFieldSale, acceptOrder, cancelOrder, fulfillFieldSale, receiveManualPurchase, settleOrder,
    getParties, getPartiesByType, getPartyById, addParty, updateParty, deleteParty,
    getPosSales, createPosSale, getPosSalesToday,
    getRecipes, getRecipeById, addRecipe, updateRecipe, deleteRecipe, produceRecipe, calcRecipeCost,
    getKhataEntries, getKhataByParty, addKhataEntry, getKhataBalance, getKhataParties,
    getRevenueData,
    getCart, setCart, clearCart, addToCart, updateCartItemQty, getCartItemCount,
    getCompanies, getCompanyById, addCompany, sync, syncMarketplace, ensurePosSales, _clearLocalData,
  };
})();
