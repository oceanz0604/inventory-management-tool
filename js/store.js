const Store = (() => {
  const SEED_VERSION = 5;
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
    SEED_VER: 'ims_seed_ver',
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
    [KEYS.PARTIES]: 'parties',
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
  function findUserByEmail(email) { return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()); }
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
    _set(KEYS.LOCATIONS, getLocations().filter(l => l.id !== id));
    _set(KEYS.STOCK, getStock().filter(s => s.locationId !== id));
    _cloudRemove('locations', id);
    removedStock.forEach(s => _cloudRemove('stock', s.id));
  }
  function getDefaultLocation(ownerId) {
    const locs = getLocationsByOwner(ownerId);
    return locs.find(l => l.isDefault) || locs[0] || null;
  }

  // ========== Products ==========
  function getProducts() { return _get(KEYS.PRODUCTS) || []; }
  function getProductsByOwner(ownerId) { return getProducts().filter(p => p.ownerId === ownerId); }
  function getPublishedProducts(ownerId) { return getProducts().filter(p => p.ownerId === ownerId && p.isPublished); }
  function getProductById(id) { return getProducts().find(p => p.id === id); }
  function addProduct(prod) { const p = getProducts(); p.push(prod); _set(KEYS.PRODUCTS, p); _cloudSave('products', prod); return prod; }
  function updateProduct(id, updates) {
    let merged = null;
    _set(KEYS.PRODUCTS, getProducts().map(p => p.id === id ? (merged = { ...p, ...updates }) : p));
    _cloudSave('products', merged);
  }
  function deleteProduct(id) {
    const removedStock = getStock().filter(s => s.productId === id);
    _set(KEYS.PRODUCTS, getProducts().filter(p => p.id !== id));
    _set(KEYS.STOCK, getStock().filter(s => s.productId !== id));
    _cloudRemove('products', id);
    removedStock.forEach(s => _cloudRemove('stock', s.id));
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
    return getStockByOwner(ownerId).filter(s => {
      if (!s.expiryDate) return false;
      return new Date(s.expiryDate) <= cutoff;
    });
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
          adjustStock(item.productId, order.fulfillmentLocationId, -item.qty);
        }
        if (buyerDefaultLoc) {
          let buyerProduct = getProductsByOwner(order.buyerId).find(p => p.name === item.name);
          if (!buyerProduct) {
            buyerProduct = { id: generateId(), ownerId: order.buyerId, name: item.name, sku: item.sku || 'AUTO-' + generateId().slice(0, 4).toUpperCase(), categoryId: '', costPrice: item.unitPrice, price: item.unitPrice, unit: 'pcs', gstRate: 0, description: 'Auto-created from purchase order ' + order.orderNumber, isPublished: false, createdAt: new Date().toISOString() };
            addProduct(buyerProduct);
          } else {
            updateProduct(buyerProduct.id, { costPrice: item.unitPrice });
          }
          adjustStock(buyerProduct.id, buyerDefaultLoc.id, item.qty);
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
  function fulfillFieldSale(orderId, amountReceived, locationId) {
    const order = getOrderById(orderId);
    if (!order) return { success: false, message: 'Order not found' };
    const loc = locationId || order.fulfillmentLocationId || (getDefaultLocation(order.sellerId) || {}).id;
    if (loc) order.items.forEach(i => adjustStock(i.productId, loc, -i.qty));
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
      adjustStock(i.productId, loc, i.qty);
      const prod = getProductById(i.productId);
      if (prod) updateProduct(prod.id, { costPrice: i.unitPrice });
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
    const sale = {
      id: generateId(),
      receiptNumber: _nextReceiptNumber(),
      ownerId,
      locationId,
      items,
      subtotal: items.reduce((s, i) => s + i.qty * i.price, 0),
      taxAmount: items.reduce((s, i) => s + i.qty * i.price * ((i.gstRate || 0) / 100), 0),
      paymentMethod: paymentMethod || 'cash',
      customerName: customerName || 'Walk-in',
      createdAt: new Date().toISOString(),
    };
    sale.total = sale.subtotal + sale.taxAmount;
    items.forEach(i => adjustStock(i.productId, locationId, -i.qty));
    const all = _get(KEYS.POS_SALES) || [];
    all.push(sale);
    _set(KEYS.POS_SALES, all);
    _cloudSave('pos_sales', sale);
    return sale;
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
  async function sync(user) {
    if (!_cloudOn() || !user) return;
    const isAdmin = user.role === 'superadmin';
    try {
      if (isAdmin) {
        const [users, cats, locs, prods, stock, orders, pos, recipes, khata, parties] = await Promise.all([
          Firebase.list('users'), Firebase.list('categories'), Firebase.list('locations'),
          Firebase.list('products'), Firebase.list('stock'), Firebase.list('orders'),
          Firebase.list('pos_sales'), Firebase.list('recipes'), Firebase.list('khata'), Firebase.list('parties'),
        ]);
        _set(KEYS.USERS, users); _set(KEYS.CATEGORIES, cats); _set(KEYS.LOCATIONS, locs);
        _set(KEYS.PRODUCTS, prods); _set(KEYS.STOCK, stock); _set(KEYS.ORDERS, orders);
        _set(KEYS.POS_SALES, pos); _set(KEYS.RECIPES, recipes); _set(KEYS.KHATA, khata); _set(KEYS.PARTIES, parties);
      } else {
        // Workers scope to their company; owners scope to themselves.
        const scopeId = user.companyId || user.id;
        const [users, cats, locs, ownProds, pubProds, stock, ordBuy, ordSell, pos, recipes, khata, parties] = await Promise.all([
          Firebase.list('users'),
          Firebase.list('categories'),
          Firebase.listByOwner('locations', scopeId),
          Firebase.listByOwner('products', scopeId),
          Firebase.listWhere('products', 'isPublished', '==', true),
          Firebase.listByOwner('stock', scopeId),
          Firebase.listWhere('orders', 'buyerId', '==', scopeId),
          Firebase.listWhere('orders', 'sellerId', '==', scopeId),
          Firebase.listByOwner('pos_sales', scopeId),
          Firebase.listByOwner('recipes', scopeId),
          Firebase.listByOwner('khata', scopeId),
          Firebase.listByOwner('parties', scopeId),
        ]);
        // Shield regular users from seeded test data (demo shops + their catalog).
        const prodMap = {}; ownProds.concat(pubProds.filter(p => !p.isDemo)).forEach(p => { prodMap[p.id] = p; });
        const ordMap = {}; ordBuy.concat(ordSell).forEach(o => { ordMap[o.id] = o; });
        const realUsers = users.filter(u => !u.isDemo || u.companyId === scopeId || u.id === user.id);
        _set(KEYS.USERS, realUsers); _set(KEYS.CATEGORIES, cats); _set(KEYS.LOCATIONS, locs);
        _set(KEYS.PRODUCTS, Object.values(prodMap)); _set(KEYS.STOCK, stock);
        _set(KEYS.ORDERS, Object.values(ordMap)); _set(KEYS.POS_SALES, pos);
        _set(KEYS.RECIPES, recipes); _set(KEYS.KHATA, khata); _set(KEYS.PARTIES, parties);
      }
      _recomputeSequences();
    } catch (e) {
      console.error('[sync] hydration failed:', e && e.message);
    }
  }

  function _clearLocalData() {
    [KEYS.CATEGORIES, KEYS.LOCATIONS, KEYS.PRODUCTS, KEYS.STOCK, KEYS.ORDERS,
     KEYS.POS_SALES, KEYS.RECIPES, KEYS.KHATA, KEYS.PARTIES, KEYS.USERS, KEYS.CART].forEach(k => localStorage.removeItem(k));
  }

  // ========== Seed Demo Data ==========
  function _clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  // Push the demo dataset to Firestore once (super-admin only). Builds the demo
  // data locally (which sync() will overwrite right after) and batch-writes it.
  async function seedCloudIfNeeded() {
    if (!_cloudOn()) return;
    let meta = null;
    try { meta = await Firebase.getDoc('meta', 'seed'); } catch (e) { meta = null; }
    if (meta && meta.version === SEED_VERSION) return;
    _set(KEYS.SEED_VER, null);
    seedDemoData();
    const locOwner = {}; getLocations().forEach(l => { locOwner[l.id] = l.ownerId; });
    // Tag every seeded doc with isDemo so regular users can be shielded from test data.
    const demo = (arr) => (arr || []).map(x => ({ ...x, isDemo: true }));
    const stock = getStock().map(s => ({ ...s, ownerId: s.ownerId || locOwner[s.locationId] || null, isDemo: true }));
    const users = getUsers().map(u => { const { password, ...rest } = u; return { ...rest, isDemo: true }; });
    await Firebase.saveMany('categories', getCategories()); // categories are a shared global catalog
    await Firebase.saveMany('users', users);
    await Firebase.saveMany('locations', demo(getLocations()));
    await Firebase.saveMany('products', demo(getProducts()));
    await Firebase.saveMany('stock', stock);
    await Firebase.saveMany('orders', demo(getOrders()));
    await Firebase.saveMany('recipes', demo(_get(KEYS.RECIPES) || []));
    await Firebase.saveMany('khata', demo(_get(KEYS.KHATA) || []));
    await Firebase.saveMany('pos_sales', demo(_get(KEYS.POS_SALES) || []));
    try { await Firebase.getDb().collection('meta').doc('seed').set({ version: SEED_VERSION, seededAt: new Date().toISOString() }); } catch (e) { /* ignore */ }
  }

  function seedDemoData() {
    const ver = _get(KEYS.SEED_VER);
    if (ver === SEED_VERSION) return;
    _clearAll();
    _set(KEYS.SEED_VER, SEED_VERSION);

    const cats = [
      { id: 'cat_elec', name: 'Electronics', color: '#3b82f6' },
      { id: 'cat_furn', name: 'Furniture', color: '#f59e0b' },
      { id: 'cat_supp', name: 'Office Supplies', color: '#22c55e' },
      { id: 'cat_clth', name: 'Clothing', color: '#8b5cf6' },
      { id: 'cat_food', name: 'Food & Beverage', color: '#ef4444' },
      { id: 'cat_health', name: 'Healthcare', color: '#06b6d4' },
      { id: 'cat_tools', name: 'Hardware & Tools', color: '#f97316' },
    ];
    _set(KEYS.CATEGORIES, cats);

    const users = [
      { id: 'user_a', name: 'TechSupply Co', email: 'admin@techsupply.com', password: 'h_demo', shopName: 'TechSupply Co', gstin: '27AABCT1234F1ZH', createdAt: new Date().toISOString() },
      { id: 'user_b', name: 'GreenGoods', email: 'admin@greengoods.com', password: 'h_demo', shopName: 'GreenGoods', gstin: '27AABCG5678F1ZK', createdAt: new Date().toISOString() },
      { id: 'user_c', name: 'MediPharma', email: 'admin@medipharma.com', password: 'h_demo', shopName: 'MediPharma', gstin: '27AABCM9012F1ZL', createdAt: new Date().toISOString() },
      { id: 'user_d', name: 'BuildRight Hardware', email: 'admin@buildright.com', password: 'h_demo', shopName: 'BuildRight Hardware', gstin: '27AABCB3456F1ZM', createdAt: new Date().toISOString() },
      { id: 'user_e', name: 'FreshBite Catering', email: 'admin@freshbite.com', password: 'h_demo', shopName: 'FreshBite Catering', gstin: '', createdAt: new Date().toISOString() },
    ];
    _set(KEYS.USERS, users);

    const locations = [
      { id: 'loc_a1', ownerId: 'user_a', name: 'Main Warehouse', address: '100 Industrial Blvd, Austin TX', isDefault: true },
      { id: 'loc_a2', ownerId: 'user_a', name: 'Downtown Store', address: '42 Main St, Austin TX', isDefault: false },
      { id: 'loc_b1', ownerId: 'user_b', name: 'Central Hub', address: '88 Green Ave, Portland OR', isDefault: true },
      { id: 'loc_b2', ownerId: 'user_b', name: 'Eastside Outlet', address: '205 Burnside Rd, Portland OR', isDefault: false },
      { id: 'loc_c1', ownerId: 'user_c', name: 'Pharma Warehouse', address: '500 Health Pkwy, San Diego CA', isDefault: true },
      { id: 'loc_c2', ownerId: 'user_c', name: 'Clinic Supply Depot', address: '12 Medical Dr, San Diego CA', isDefault: false },
      { id: 'loc_d1', ownerId: 'user_d', name: 'Main Yard', address: '777 Builder Ln, Denver CO', isDefault: true },
      { id: 'loc_e1', ownerId: 'user_e', name: 'Kitchen HQ', address: '33 Culinary Way, Chicago IL', isDefault: true },
      { id: 'loc_e2', ownerId: 'user_e', name: 'Cold Storage', address: '34 Culinary Way, Chicago IL', isDefault: false },
    ];
    _set(KEYS.LOCATIONS, locations);

    const da = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const fut = (d) => new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
    const past = (d) => new Date(Date.now() - d * 86400000).toISOString().split('T')[0];

    const products = [
      { id: 'prod_a1', ownerId: 'user_a', name: 'Wireless Mouse', sku: 'TS-ELEC-001', categoryId: 'cat_elec', costPrice: 15, price: 29.99, mrp: 35, wholesalePrice: 22, unit: 'pcs', gstRate: 18, hsnCode: '8471', description: 'Ergonomic wireless mouse with USB receiver', isPublished: true, createdAt: da(30) },
      { id: 'prod_a2', ownerId: 'user_a', name: 'USB-C Hub', sku: 'TS-ELEC-002', categoryId: 'cat_elec', costPrice: 22, price: 49.99, mrp: 55, wholesalePrice: 38, unit: 'pcs', gstRate: 18, hsnCode: '8471', description: '7-in-1 USB-C multiport adapter', isPublished: true, createdAt: da(28) },
      { id: 'prod_a3', ownerId: 'user_a', name: '27" 4K Monitor', sku: 'TS-ELEC-003', categoryId: 'cat_elec', costPrice: 240, price: 399.99, mrp: 450, wholesalePrice: 340, unit: 'pcs', gstRate: 18, hsnCode: '8528', description: 'IPS 4K UHD monitor with USB-C input', isPublished: true, createdAt: da(25) },
      { id: 'prod_a4', ownerId: 'user_a', name: 'Mechanical Keyboard', sku: 'TS-ELEC-004', categoryId: 'cat_elec', costPrice: 38, price: 79.99, mrp: 90, wholesalePrice: 60, unit: 'pcs', gstRate: 18, hsnCode: '8471', description: 'RGB mechanical keyboard, Cherry MX Blue', isPublished: true, createdAt: da(22) },
      { id: 'prod_a5', ownerId: 'user_a', name: 'Webcam HD 1080p', sku: 'TS-ELEC-005', categoryId: 'cat_elec', costPrice: 28, price: 59.99, mrp: 65, wholesalePrice: 45, unit: 'pcs', gstRate: 18, hsnCode: '8525', description: 'Full HD webcam with built-in mic', isPublished: true, createdAt: da(20) },
      { id: 'prod_a6', ownerId: 'user_a', name: 'Standing Desk', sku: 'TS-FURN-001', categoryId: 'cat_furn', costPrice: 180, price: 349.99, mrp: 400, wholesalePrice: 280, unit: 'pcs', gstRate: 18, hsnCode: '9403', description: 'Electric height-adjustable standing desk', isPublished: true, createdAt: da(40) },
      { id: 'prod_a7', ownerId: 'user_a', name: 'Office Chair', sku: 'TS-FURN-002', categoryId: 'cat_furn', costPrice: 95, price: 199.99, mrp: 220, wholesalePrice: 160, unit: 'pcs', gstRate: 18, hsnCode: '9401', description: 'Mesh ergonomic office chair', isPublished: true, createdAt: da(38) },
      { id: 'prod_a8', ownerId: 'user_a', name: 'A4 Paper (500 sheets)', sku: 'TS-SUPP-001', categoryId: 'cat_supp', costPrice: 4, price: 8.99, mrp: 10, wholesalePrice: 6, unit: 'pack', gstRate: 12, hsnCode: '4802', description: 'Premium white A4 paper, 80gsm', isPublished: true, createdAt: da(50) },
      { id: 'prod_a9', ownerId: 'user_a', name: 'Ballpoint Pens (12pk)', sku: 'TS-SUPP-002', categoryId: 'cat_supp', costPrice: 2, price: 5.49, mrp: 6, wholesalePrice: 3.5, unit: 'pack', gstRate: 12, hsnCode: '9608', description: 'Blue ink ballpoint pens', isPublished: false, createdAt: da(48) },
      { id: 'prod_a10', ownerId: 'user_a', name: 'Stapler Heavy Duty', sku: 'TS-SUPP-003', categoryId: 'cat_supp', costPrice: 5.5, price: 12.49, mrp: 15, wholesalePrice: 9, unit: 'pcs', gstRate: 18, hsnCode: '8305', description: 'Staples up to 60 sheets', isPublished: true, createdAt: da(45) },
      { id: 'prod_b1', ownerId: 'user_b', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', categoryId: 'cat_food', costPrice: 9, price: 18.99, mrp: 22, wholesalePrice: 14, unit: 'kg', gstRate: 5, hsnCode: '0901', description: 'Premium arabica, medium roast', isPublished: true, createdAt: da(20) },
      { id: 'prod_b2', ownerId: 'user_b', name: 'Bottled Water (24pk)', sku: 'GG-FOOD-002', categoryId: 'cat_food', costPrice: 6, price: 12.99, mrp: 15, wholesalePrice: 9, unit: 'pack', gstRate: 18, hsnCode: '2201', description: '500ml bottled spring water', isPublished: true, createdAt: da(18) },
      { id: 'prod_b3', ownerId: 'user_b', name: 'Green Tea Box (100ct)', sku: 'GG-FOOD-003', categoryId: 'cat_food', costPrice: 4.5, price: 9.99, mrp: 12, wholesalePrice: 7, unit: 'box', gstRate: 5, hsnCode: '0902', description: 'Organic green tea bags', isPublished: true, createdAt: da(15) },
      { id: 'prod_b4', ownerId: 'user_b', name: 'Snack Bar Variety (36pk)', sku: 'GG-FOOD-004', categoryId: 'cat_food', costPrice: 12, price: 22.49, mrp: 25, wholesalePrice: 17, unit: 'pack', gstRate: 12, hsnCode: '1905', description: 'Assorted granola and protein bars', isPublished: true, createdAt: da(12) },
      { id: 'prod_b5', ownerId: 'user_b', name: 'Branded T-Shirt', sku: 'GG-CLTH-001', categoryId: 'cat_clth', costPrice: 10, price: 24.99, mrp: 30, wholesalePrice: 18, unit: 'pcs', gstRate: 5, hsnCode: '6109', description: 'Company branded cotton t-shirt', isPublished: true, createdAt: da(25) },
      { id: 'prod_b6', ownerId: 'user_b', name: 'Winter Jacket', sku: 'GG-CLTH-002', categoryId: 'cat_clth', costPrice: 45, price: 89.99, mrp: 100, wholesalePrice: 70, unit: 'pcs', gstRate: 12, hsnCode: '6201', description: 'Water-resistant winter jacket', isPublished: true, createdAt: da(22) },
      { id: 'prod_b7', ownerId: 'user_b', name: 'Safety Vest', sku: 'GG-CLTH-003', categoryId: 'cat_clth', costPrice: 6, price: 14.99, mrp: 18, wholesalePrice: 10, unit: 'pcs', gstRate: 5, hsnCode: '6211', description: 'High-visibility reflective vest', isPublished: true, createdAt: da(20) },
      { id: 'prod_c1', ownerId: 'user_c', name: 'Surgical Gloves (100pk)', sku: 'MP-HLTH-001', categoryId: 'cat_health', costPrice: 7, price: 14.99, mrp: 18, wholesalePrice: 10, unit: 'pack', gstRate: 12, hsnCode: '4015', description: 'Nitrile powder-free surgical gloves, medium', isPublished: true, createdAt: da(35) },
      { id: 'prod_c2', ownerId: 'user_c', name: 'N95 Masks (50pk)', sku: 'MP-HLTH-002', categoryId: 'cat_health', costPrice: 15, price: 29.99, mrp: 35, wholesalePrice: 22, unit: 'pack', gstRate: 12, hsnCode: '6307', description: 'NIOSH-approved N95 respirator masks', isPublished: true, createdAt: da(32) },
      { id: 'prod_c3', ownerId: 'user_c', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', categoryId: 'cat_health', costPrice: 3.5, price: 8.49, mrp: 10, wholesalePrice: 5.5, unit: 'L', gstRate: 18, hsnCode: '3808', description: '70% alcohol gel hand sanitizer', isPublished: true, createdAt: da(28) },
      { id: 'prod_c4', ownerId: 'user_c', name: 'First Aid Kit (Pro)', sku: 'MP-HLTH-004', categoryId: 'cat_health', costPrice: 22, price: 45.99, mrp: 50, wholesalePrice: 35, unit: 'pcs', gstRate: 18, hsnCode: '3006', description: '120-piece professional first aid kit', isPublished: true, createdAt: da(25) },
      { id: 'prod_c5', ownerId: 'user_c', name: 'Digital Thermometer', sku: 'MP-HLTH-005', categoryId: 'cat_health', costPrice: 8, price: 19.99, mrp: 25, wholesalePrice: 14, unit: 'pcs', gstRate: 12, hsnCode: '9025', description: 'Contactless infrared thermometer', isPublished: true, createdAt: da(22) },
      { id: 'prod_c6', ownerId: 'user_c', name: 'Blood Pressure Monitor', sku: 'MP-HLTH-006', categoryId: 'cat_health', costPrice: 28, price: 59.99, mrp: 70, wholesalePrice: 45, unit: 'pcs', gstRate: 12, hsnCode: '9018', description: 'Automatic upper arm blood pressure cuff', isPublished: true, createdAt: da(18) },
      { id: 'prod_c7', ownerId: 'user_c', name: 'Disinfectant Spray (500ml)', sku: 'MP-HLTH-007', categoryId: 'cat_health', costPrice: 2.8, price: 6.99, mrp: 8, wholesalePrice: 4.5, unit: 'pcs', gstRate: 18, hsnCode: '3808', description: 'Hospital-grade surface disinfectant', isPublished: true, createdAt: da(15) },
      { id: 'prod_c8', ownerId: 'user_c', name: 'Lab Coat (White)', sku: 'MP-CLTH-001', categoryId: 'cat_clth', costPrice: 16, price: 34.99, mrp: 40, wholesalePrice: 25, unit: 'pcs', gstRate: 5, hsnCode: '6211', description: 'Professional white lab coat, unisex', isPublished: false, createdAt: da(30) },
      { id: 'prod_d1', ownerId: 'user_d', name: 'Cordless Drill 20V', sku: 'BR-TOOL-001', categoryId: 'cat_tools', costPrice: 42, price: 89.99, mrp: 100, wholesalePrice: 65, unit: 'pcs', gstRate: 18, hsnCode: '8467', description: '20V lithium-ion cordless drill/driver kit', isPublished: true, createdAt: da(30) },
      { id: 'prod_d2', ownerId: 'user_d', name: 'Hammer (16oz)', sku: 'BR-TOOL-002', categoryId: 'cat_tools', costPrice: 8, price: 18.99, mrp: 22, wholesalePrice: 13, unit: 'pcs', gstRate: 18, hsnCode: '8205', description: 'Fiberglass handle claw hammer', isPublished: true, createdAt: da(28) },
      { id: 'prod_d3', ownerId: 'user_d', name: 'Measuring Tape (25ft)', sku: 'BR-TOOL-003', categoryId: 'cat_tools', costPrice: 5, price: 12.49, mrp: 15, wholesalePrice: 8.5, unit: 'pcs', gstRate: 18, hsnCode: '9017', description: 'Auto-locking steel measuring tape', isPublished: true, createdAt: da(25) },
      { id: 'prod_d4', ownerId: 'user_d', name: 'Screwdriver Set (40pc)', sku: 'BR-TOOL-004', categoryId: 'cat_tools', costPrice: 15, price: 34.99, mrp: 40, wholesalePrice: 25, unit: 'set', gstRate: 18, hsnCode: '8205', description: 'Magnetic tip screwdriver set with case', isPublished: true, createdAt: da(22) },
      { id: 'prod_d5', ownerId: 'user_d', name: 'LED Work Light', sku: 'BR-TOOL-005', categoryId: 'cat_tools', costPrice: 10, price: 24.99, mrp: 30, wholesalePrice: 18, unit: 'pcs', gstRate: 18, hsnCode: '9405', description: '1000-lumen rechargeable LED work light', isPublished: true, createdAt: da(20) },
      { id: 'prod_d6', ownerId: 'user_d', name: 'Safety Goggles', sku: 'BR-TOOL-006', categoryId: 'cat_tools', costPrice: 4, price: 9.99, mrp: 12, wholesalePrice: 6.5, unit: 'pcs', gstRate: 18, hsnCode: '9004', description: 'Anti-fog impact-resistant safety goggles', isPublished: true, createdAt: da(18) },
      { id: 'prod_d7', ownerId: 'user_d', name: 'Industrial Shelving Unit', sku: 'BR-FURN-001', categoryId: 'cat_furn', costPrice: 70, price: 149.99, mrp: 175, wholesalePrice: 110, unit: 'pcs', gstRate: 18, hsnCode: '9403', description: '5-tier heavy-duty steel shelving, 2000lb capacity', isPublished: true, createdAt: da(35) },
      { id: 'prod_d8', ownerId: 'user_d', name: 'Workbench (6ft)', sku: 'BR-FURN-002', categoryId: 'cat_furn', costPrice: 140, price: 279.99, mrp: 320, wholesalePrice: 220, unit: 'pcs', gstRate: 18, hsnCode: '9403', description: 'Solid wood top workbench with storage', isPublished: true, createdAt: da(33) },
      { id: 'prod_e1', ownerId: 'user_e', name: 'Catering Tray (Large)', sku: 'FB-FOOD-001', categoryId: 'cat_food', costPrice: 22, price: 45.99, mrp: 50, wholesalePrice: 35, unit: 'pcs', gstRate: 12, hsnCode: '7615', description: 'Large aluminum catering tray with lid', isPublished: true, createdAt: da(20) },
      { id: 'prod_e2', ownerId: 'user_e', name: 'Premium Olive Oil (5L)', sku: 'FB-FOOD-002', categoryId: 'cat_food', costPrice: 20, price: 38.99, mrp: 45, wholesalePrice: 30, unit: 'L', gstRate: 5, hsnCode: '1509', description: 'Extra virgin olive oil, cold-pressed', isPublished: true, createdAt: da(18) },
      { id: 'prod_e3', ownerId: 'user_e', name: 'Chef Knife Set (8pc)', sku: 'FB-TOOL-001', categoryId: 'cat_tools', costPrice: 55, price: 129.99, mrp: 150, wholesalePrice: 100, unit: 'set', gstRate: 18, hsnCode: '8211', description: 'Professional German steel chef knife set', isPublished: true, createdAt: da(25) },
      { id: 'prod_e4', ownerId: 'user_e', name: 'Disposable Plates (200pk)', sku: 'FB-SUPP-001', categoryId: 'cat_supp', costPrice: 8, price: 19.99, mrp: 22, wholesalePrice: 14, unit: 'pack', gstRate: 12, hsnCode: '4823', description: 'Compostable 9-inch dinner plates', isPublished: true, createdAt: da(15) },
      { id: 'prod_e5', ownerId: 'user_e', name: 'Bulk Rice (25kg)', sku: 'FB-FOOD-003', categoryId: 'cat_food', costPrice: 14, price: 28.99, mrp: 32, wholesalePrice: 20, unit: 'kg', gstRate: 5, hsnCode: '1006', description: 'Premium basmati rice, 25kg sack', isPublished: true, createdAt: da(12) },
      { id: 'prod_e6', ownerId: 'user_e', name: 'Cooking Apron (3pk)', sku: 'FB-CLTH-001', categoryId: 'cat_clth', costPrice: 9, price: 22.99, mrp: 28, wholesalePrice: 16, unit: 'pack', gstRate: 5, hsnCode: '6211', description: 'Waterproof chef apron with pockets', isPublished: true, createdAt: da(10) },
      { id: 'prod_e7', ownerId: 'user_e', name: 'Stainless Steel Mixing Bowls (5pc)', sku: 'FB-TOOL-002', categoryId: 'cat_tools', costPrice: 14, price: 32.99, mrp: 38, wholesalePrice: 24, unit: 'set', gstRate: 18, hsnCode: '7323', description: 'Nested mixing bowls with non-slip base', isPublished: true, createdAt: da(8) },
      { id: 'prod_e8', ownerId: 'user_e', name: 'Paneer Tikka Platter', sku: 'FB-PREP-001', categoryId: 'cat_food', costPrice: 0, price: 249, mrp: 299, wholesalePrice: 199, unit: 'pcs', gstRate: 5, hsnCode: '2106', description: 'Ready-to-serve paneer tikka platter (serves 4)', isPublished: true, createdAt: da(5) },
    ];
    _set(KEYS.PRODUCTS, products);

    const stock = [
      { id: generateId(), productId: 'prod_a1', locationId: 'loc_a1', quantity: 45, minStock: 10, batchNumber: 'BA-2025-001', expiryDate: null },
      { id: generateId(), productId: 'prod_a1', locationId: 'loc_a2', quantity: 12, minStock: 5, batchNumber: 'BA-2025-002', expiryDate: null },
      { id: generateId(), productId: 'prod_a2', locationId: 'loc_a1', quantity: 3, minStock: 5, batchNumber: '', expiryDate: null },
      { id: generateId(), productId: 'prod_a3', locationId: 'loc_a1', quantity: 18, minStock: 5 },
      { id: generateId(), productId: 'prod_a3', locationId: 'loc_a2', quantity: 4, minStock: 2 },
      { id: generateId(), productId: 'prod_a4', locationId: 'loc_a1', quantity: 0, minStock: 8 },
      { id: generateId(), productId: 'prod_a5', locationId: 'loc_a1', quantity: 32, minStock: 10 },
      { id: generateId(), productId: 'prod_a6', locationId: 'loc_a1', quantity: 12, minStock: 3 },
      { id: generateId(), productId: 'prod_a7', locationId: 'loc_a1', quantity: 2, minStock: 5 },
      { id: generateId(), productId: 'prod_a7', locationId: 'loc_a2', quantity: 3, minStock: 2 },
      { id: generateId(), productId: 'prod_a8', locationId: 'loc_a1', quantity: 120, minStock: 20 },
      { id: generateId(), productId: 'prod_a9', locationId: 'loc_a1', quantity: 0, minStock: 10 },
      { id: generateId(), productId: 'prod_a10', locationId: 'loc_a1', quantity: 14, minStock: 5 },
      { id: generateId(), productId: 'prod_b1', locationId: 'loc_b1', quantity: 25, minStock: 5, batchNumber: 'GB-2025-A', expiryDate: fut(180) },
      { id: generateId(), productId: 'prod_b2', locationId: 'loc_b1', quantity: 4, minStock: 8, batchNumber: 'GB-2025-B', expiryDate: fut(365) },
      { id: generateId(), productId: 'prod_b2', locationId: 'loc_b2', quantity: 18, minStock: 5 },
      { id: generateId(), productId: 'prod_b3', locationId: 'loc_b1', quantity: 38, minStock: 10, batchNumber: 'GB-2025-C', expiryDate: fut(90) },
      { id: generateId(), productId: 'prod_b4', locationId: 'loc_b1', quantity: 7, minStock: 10, batchNumber: 'GB-2025-D', expiryDate: fut(20) },
      { id: generateId(), productId: 'prod_b4', locationId: 'loc_b2', quantity: 15, minStock: 5 },
      { id: generateId(), productId: 'prod_b5', locationId: 'loc_b1', quantity: 75, minStock: 15 },
      { id: generateId(), productId: 'prod_b6', locationId: 'loc_b1', quantity: 8, minStock: 10 },
      { id: generateId(), productId: 'prod_b7', locationId: 'loc_b1', quantity: 50, minStock: 20 },
      { id: generateId(), productId: 'prod_b7', locationId: 'loc_b2', quantity: 30, minStock: 10 },
      { id: generateId(), productId: 'prod_c1', locationId: 'loc_c1', quantity: 200, minStock: 50, batchNumber: 'MC-LOT-001', expiryDate: fut(540) },
      { id: generateId(), productId: 'prod_c1', locationId: 'loc_c2', quantity: 80, minStock: 20, batchNumber: 'MC-LOT-002', expiryDate: fut(120) },
      { id: generateId(), productId: 'prod_c2', locationId: 'loc_c1', quantity: 150, minStock: 30, batchNumber: 'MC-LOT-003', expiryDate: fut(60) },
      { id: generateId(), productId: 'prod_c2', locationId: 'loc_c2', quantity: 40, minStock: 15, batchNumber: 'MC-LOT-004', expiryDate: fut(15) },
      { id: generateId(), productId: 'prod_c3', locationId: 'loc_c1', quantity: 300, minStock: 50, batchNumber: 'MC-LOT-005', expiryDate: fut(200) },
      { id: generateId(), productId: 'prod_c4', locationId: 'loc_c1', quantity: 25, minStock: 10 },
      { id: generateId(), productId: 'prod_c4', locationId: 'loc_c2', quantity: 8, minStock: 5 },
      { id: generateId(), productId: 'prod_c5', locationId: 'loc_c1', quantity: 60, minStock: 15 },
      { id: generateId(), productId: 'prod_c6', locationId: 'loc_c1', quantity: 18, minStock: 10 },
      { id: generateId(), productId: 'prod_c7', locationId: 'loc_c1', quantity: 0, minStock: 25, batchNumber: 'MC-LOT-006', expiryDate: past(5) },
      { id: generateId(), productId: 'prod_c8', locationId: 'loc_c1', quantity: 12, minStock: 5 },
      { id: generateId(), productId: 'prod_d1', locationId: 'loc_d1', quantity: 35, minStock: 10 },
      { id: generateId(), productId: 'prod_d2', locationId: 'loc_d1', quantity: 80, minStock: 20 },
      { id: generateId(), productId: 'prod_d3', locationId: 'loc_d1', quantity: 65, minStock: 15 },
      { id: generateId(), productId: 'prod_d4', locationId: 'loc_d1', quantity: 22, minStock: 8 },
      { id: generateId(), productId: 'prod_d5', locationId: 'loc_d1', quantity: 3, minStock: 10 },
      { id: generateId(), productId: 'prod_d6', locationId: 'loc_d1', quantity: 100, minStock: 25 },
      { id: generateId(), productId: 'prod_d7', locationId: 'loc_d1', quantity: 9, minStock: 5 },
      { id: generateId(), productId: 'prod_d8', locationId: 'loc_d1', quantity: 4, minStock: 3 },
      { id: generateId(), productId: 'prod_e1', locationId: 'loc_e1', quantity: 60, minStock: 20 },
      { id: generateId(), productId: 'prod_e2', locationId: 'loc_e2', quantity: 15, minStock: 5, batchNumber: 'FB-OIL-01', expiryDate: fut(270) },
      { id: generateId(), productId: 'prod_e3', locationId: 'loc_e1', quantity: 10, minStock: 3 },
      { id: generateId(), productId: 'prod_e4', locationId: 'loc_e1', quantity: 5, minStock: 15 },
      { id: generateId(), productId: 'prod_e5', locationId: 'loc_e2', quantity: 40, minStock: 10, batchNumber: 'FB-RICE-01', expiryDate: fut(365) },
      { id: generateId(), productId: 'prod_e6', locationId: 'loc_e1', quantity: 18, minStock: 5 },
      { id: generateId(), productId: 'prod_e7', locationId: 'loc_e1', quantity: 12, minStock: 4 },
      { id: generateId(), productId: 'prod_e8', locationId: 'loc_e1', quantity: 0, minStock: 2 },
    ];
    _set(KEYS.STOCK, stock);

    const orders = [
      { id: 'ord_1', orderNumber: 'ORD-1001', buyerId: 'user_b', sellerId: 'user_a', fulfillmentLocationId: 'loc_a1', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', qty: 10, unitPrice: 29.99 }, { productId: 'prod_a5', name: 'Webcam HD 1080p', sku: 'TS-ELEC-005', qty: 5, unitPrice: 59.99 }], status: 'delivered', total: 599.85, createdAt: da(14), updatedAt: da(10) },
      { id: 'ord_2', orderNumber: 'ORD-1002', buyerId: 'user_a', sellerId: 'user_b', fulfillmentLocationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', qty: 20, unitPrice: 18.99 }], status: 'shipped', total: 379.80, createdAt: da(7), updatedAt: da(3) },
      { id: 'ord_3', orderNumber: 'ORD-1003', buyerId: 'user_b', sellerId: 'user_a', fulfillmentLocationId: null, items: [{ productId: 'prod_a6', name: 'Standing Desk', sku: 'TS-FURN-001', qty: 2, unitPrice: 349.99 }, { productId: 'prod_a7', name: 'Office Chair', sku: 'TS-FURN-002', qty: 3, unitPrice: 199.99 }], status: 'approved', total: 1299.95, createdAt: da(5), updatedAt: da(4) },
      { id: 'ord_4', orderNumber: 'ORD-1004', buyerId: 'user_a', sellerId: 'user_b', fulfillmentLocationId: null, items: [{ productId: 'prod_b5', name: 'Branded T-Shirt', sku: 'GG-CLTH-001', qty: 50, unitPrice: 24.99 }], status: 'pending', total: 1249.50, createdAt: da(2), updatedAt: da(2) },
      { id: 'ord_5', orderNumber: 'ORD-1005', buyerId: 'user_b', sellerId: 'user_a', fulfillmentLocationId: null, items: [{ productId: 'prod_a3', name: '27" 4K Monitor', sku: 'TS-ELEC-003', qty: 5, unitPrice: 399.99 }], status: 'pending', total: 1999.95, createdAt: da(1), updatedAt: da(1) },
      { id: 'ord_6', orderNumber: 'ORD-1006', buyerId: 'user_c', sellerId: 'user_a', fulfillmentLocationId: 'loc_a1', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', qty: 20, unitPrice: 29.99 }, { productId: 'prod_a2', name: 'USB-C Hub', sku: 'TS-ELEC-002', qty: 10, unitPrice: 49.99 }], status: 'delivered', total: 1099.70, createdAt: da(20), updatedAt: da(16) },
      { id: 'ord_7', orderNumber: 'ORD-1007', buyerId: 'user_a', sellerId: 'user_c', fulfillmentLocationId: 'loc_c1', items: [{ productId: 'prod_c4', name: 'First Aid Kit (Pro)', sku: 'MP-HLTH-004', qty: 5, unitPrice: 45.99 }, { productId: 'prod_c3', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', qty: 30, unitPrice: 8.49 }], status: 'delivered', total: 484.65, createdAt: da(18), updatedAt: da(13) },
      { id: 'ord_8', orderNumber: 'ORD-1008', buyerId: 'user_d', sellerId: 'user_c', fulfillmentLocationId: null, items: [{ productId: 'prod_c1', name: 'Surgical Gloves (100pk)', sku: 'MP-HLTH-001', qty: 10, unitPrice: 14.99 }, { productId: 'prod_c6', name: 'Blood Pressure Monitor', sku: 'MP-HLTH-006', qty: 2, unitPrice: 59.99 }], status: 'approved', total: 269.88, createdAt: da(6), updatedAt: da(5) },
      { id: 'ord_9', orderNumber: 'ORD-1009', buyerId: 'user_e', sellerId: 'user_c', fulfillmentLocationId: null, items: [{ productId: 'prod_c2', name: 'N95 Masks (50pk)', sku: 'MP-HLTH-002', qty: 5, unitPrice: 29.99 }, { productId: 'prod_c3', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', qty: 20, unitPrice: 8.49 }], status: 'pending', total: 319.75, createdAt: da(1), updatedAt: da(1) },
      { id: 'ord_10', orderNumber: 'ORD-1010', buyerId: 'user_e', sellerId: 'user_d', fulfillmentLocationId: 'loc_d1', items: [{ productId: 'prod_d7', name: 'Industrial Shelving Unit', sku: 'BR-FURN-001', qty: 3, unitPrice: 149.99 }], status: 'shipped', total: 449.97, createdAt: da(8), updatedAt: da(4) },
      { id: 'ord_11', orderNumber: 'ORD-1011', buyerId: 'user_b', sellerId: 'user_d', fulfillmentLocationId: null, items: [{ productId: 'prod_d6', name: 'Safety Goggles', sku: 'BR-TOOL-006', qty: 30, unitPrice: 9.99 }, { productId: 'prod_d5', name: 'LED Work Light', sku: 'BR-TOOL-005', qty: 10, unitPrice: 24.99 }], status: 'pending', total: 549.60, createdAt: da(2), updatedAt: da(2) },
      { id: 'ord_12', orderNumber: 'ORD-1012', buyerId: 'user_d', sellerId: 'user_a', fulfillmentLocationId: null, items: [{ productId: 'prod_a8', name: 'A4 Paper (500 sheets)', sku: 'TS-SUPP-001', qty: 50, unitPrice: 8.99 }, { productId: 'prod_a10', name: 'Stapler Heavy Duty', sku: 'TS-SUPP-003', qty: 10, unitPrice: 12.49 }], status: 'approved', total: 574.40, createdAt: da(4), updatedAt: da(3) },
      { id: 'ord_13', orderNumber: 'ORD-1013', buyerId: 'user_e', sellerId: 'user_b', fulfillmentLocationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', qty: 50, unitPrice: 18.99 }, { productId: 'prod_b3', name: 'Green Tea Box (100ct)', sku: 'GG-FOOD-003', qty: 20, unitPrice: 9.99 }], status: 'delivered', total: 1149.30, createdAt: da(15), updatedAt: da(11) },
      { id: 'ord_14', orderNumber: 'ORD-1014', buyerId: 'user_c', sellerId: 'user_e', fulfillmentLocationId: null, items: [{ productId: 'prod_e4', name: 'Disposable Plates (200pk)', sku: 'FB-SUPP-001', qty: 10, unitPrice: 19.99 }], status: 'pending', total: 199.90, createdAt: da(1), updatedAt: da(1) },
      { id: 'ord_15', orderNumber: 'ORD-1015', buyerId: 'user_d', sellerId: 'user_e', fulfillmentLocationId: 'loc_e1', items: [{ productId: 'prod_e6', name: 'Cooking Apron (3pk)', sku: 'FB-CLTH-001', qty: 5, unitPrice: 22.99 }], status: 'shipped', total: 114.95, createdAt: da(5), updatedAt: da(2) },
    ];
    _set(KEYS.ORDERS, orders);
    _set(KEYS.ORDER_SEQ, 1015);

    const recipes = [
      { id: 'rcp_1', ownerId: 'user_e', name: 'Paneer Tikka Platter', outputProductId: 'prod_e8', outputQty: 4, ingredients: [{ productId: 'prod_e5', qty: 0.5 }, { productId: 'prod_e2', qty: 0.2 }, { productId: 'prod_e1', qty: 1 }], createdAt: da(4) },
      { id: 'rcp_2', ownerId: 'user_e', name: 'Bulk Tea Service (50 cups)', outputProductId: 'prod_e1', outputQty: 2, ingredients: [{ productId: 'prod_e5', qty: 0.25 }], createdAt: da(3) },
      { id: 'rcp_3', ownerId: 'user_c', name: 'Clinic Safety Kit', outputProductId: 'prod_c4', outputQty: 1, ingredients: [{ productId: 'prod_c1', qty: 1 }, { productId: 'prod_c2', qty: 0.5 }, { productId: 'prod_c3', qty: 0.5 }, { productId: 'prod_c7', qty: 1 }], createdAt: da(10) },
    ];
    _set(KEYS.RECIPES, recipes);

    const khata = [
      { id: 'kh_1', ownerId: 'user_a', partyId: 'user_b', partyName: 'GreenGoods', type: 'credit', amount: 599.85, description: 'ORD-1001 delivered, payment pending', orderId: 'ord_1', entryNumber: 'KH-101', createdAt: da(10) },
      { id: 'kh_2', ownerId: 'user_a', partyId: 'user_b', partyName: 'GreenGoods', type: 'debit', amount: 200, description: 'Partial payment received via UPI', orderId: null, entryNumber: 'KH-102', createdAt: da(6) },
      { id: 'kh_3', ownerId: 'user_a', partyId: 'user_c', partyName: 'MediPharma', type: 'credit', amount: 1099.70, description: 'ORD-1006 delivered, payment pending', orderId: 'ord_6', entryNumber: 'KH-103', createdAt: da(16) },
      { id: 'kh_4', ownerId: 'user_a', partyId: 'user_c', partyName: 'MediPharma', type: 'debit', amount: 1099.70, description: 'Full payment received', orderId: null, entryNumber: 'KH-104', createdAt: da(12) },
      { id: 'kh_5', ownerId: 'user_b', partyId: 'user_e', partyName: 'FreshBite Catering', type: 'credit', amount: 1149.30, description: 'ORD-1013 delivered, payment pending', orderId: 'ord_13', entryNumber: 'KH-105', createdAt: da(11) },
      { id: 'kh_6', ownerId: 'user_b', partyId: 'user_e', partyName: 'FreshBite Catering', type: 'debit', amount: 500, description: 'Partial payment received', orderId: null, entryNumber: 'KH-106', createdAt: da(7) },
    ];
    _set(KEYS.KHATA, khata);
    _set(KEYS.KHATA_SEQ, 106);

    const posSales = [
      { id: 'pos_1', receiptNumber: 'RCT-5001', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', price: 29.99, costPrice: 15, gstRate: 18, qty: 2 }, { productId: 'prod_a8', name: 'A4 Paper (500 sheets)', sku: 'TS-SUPP-001', price: 8.99, costPrice: 4, gstRate: 12, qty: 5 }], subtotal: 104.93, taxAmount: 16.17, total: 121.10, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(25) },
      { id: 'pos_2', receiptNumber: 'RCT-5002', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a4', name: 'Mechanical Keyboard', sku: 'TS-ELEC-004', price: 79.99, costPrice: 38, gstRate: 18, qty: 1 }, { productId: 'prod_a5', name: 'Webcam HD 1080p', sku: 'TS-ELEC-005', price: 59.99, costPrice: 28, gstRate: 18, qty: 1 }], subtotal: 139.98, taxAmount: 25.20, total: 165.18, paymentMethod: 'upi', customerName: 'Rahul S.', createdAt: da(22) },
      { id: 'pos_3', receiptNumber: 'RCT-5003', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', price: 29.99, costPrice: 15, gstRate: 18, qty: 3 }], subtotal: 89.97, taxAmount: 16.19, total: 106.16, paymentMethod: 'card', customerName: 'Walk-in', createdAt: da(18) },
      { id: 'pos_4', receiptNumber: 'RCT-5004', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a2', name: 'USB-C Hub', sku: 'TS-ELEC-002', price: 49.99, costPrice: 22, gstRate: 18, qty: 2 }, { productId: 'prod_a10', name: 'Stapler Heavy Duty', sku: 'TS-SUPP-003', price: 12.49, costPrice: 5.5, gstRate: 18, qty: 3 }], subtotal: 137.45, taxAmount: 24.74, total: 162.19, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(14) },
      { id: 'pos_5', receiptNumber: 'RCT-5005', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', price: 29.99, costPrice: 15, gstRate: 18, qty: 1 }, { productId: 'prod_a4', name: 'Mechanical Keyboard', sku: 'TS-ELEC-004', price: 79.99, costPrice: 38, gstRate: 18, qty: 2 }], subtotal: 189.97, taxAmount: 34.19, total: 224.16, paymentMethod: 'upi', customerName: 'Priya M.', createdAt: da(10) },
      { id: 'pos_6', receiptNumber: 'RCT-5006', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a8', name: 'A4 Paper (500 sheets)', sku: 'TS-SUPP-001', price: 8.99, costPrice: 4, gstRate: 12, qty: 10 }, { productId: 'prod_a5', name: 'Webcam HD 1080p', sku: 'TS-ELEC-005', price: 59.99, costPrice: 28, gstRate: 18, qty: 1 }], subtotal: 149.89, taxAmount: 21.58, total: 171.47, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(7) },
      { id: 'pos_7', receiptNumber: 'RCT-5007', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a3', name: '27" 4K Monitor', sku: 'TS-ELEC-003', price: 399.99, costPrice: 240, gstRate: 18, qty: 1 }], subtotal: 399.99, taxAmount: 72.00, total: 471.99, paymentMethod: 'card', customerName: 'Amit K.', createdAt: da(5) },
      { id: 'pos_8', receiptNumber: 'RCT-5008', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', price: 29.99, costPrice: 15, gstRate: 18, qty: 4 }, { productId: 'prod_a2', name: 'USB-C Hub', sku: 'TS-ELEC-002', price: 49.99, costPrice: 22, gstRate: 18, qty: 1 }], subtotal: 169.95, taxAmount: 30.59, total: 200.54, paymentMethod: 'upi', customerName: 'Walk-in', createdAt: da(3) },
      { id: 'pos_9', receiptNumber: 'RCT-5009', ownerId: 'user_a', locationId: 'loc_a2', items: [{ productId: 'prod_a4', name: 'Mechanical Keyboard', sku: 'TS-ELEC-004', price: 79.99, costPrice: 38, gstRate: 18, qty: 1 }], subtotal: 79.99, taxAmount: 14.40, total: 94.39, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(1) },
      { id: 'pos_10', receiptNumber: 'RCT-5010', ownerId: 'user_b', locationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', price: 18.99, costPrice: 9, gstRate: 5, qty: 3 }, { productId: 'prod_b3', name: 'Green Tea Box (100ct)', sku: 'GG-FOOD-003', price: 9.99, costPrice: 4.5, gstRate: 5, qty: 5 }], subtotal: 106.92, taxAmount: 5.35, total: 112.27, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(20) },
      { id: 'pos_11', receiptNumber: 'RCT-5011', ownerId: 'user_b', locationId: 'loc_b1', items: [{ productId: 'prod_b5', name: 'Branded T-Shirt', sku: 'GG-CLTH-001', price: 24.99, costPrice: 10, gstRate: 5, qty: 4 }, { productId: 'prod_b7', name: 'Safety Vest', sku: 'GG-CLTH-003', price: 14.99, costPrice: 6, gstRate: 5, qty: 6 }], subtotal: 189.90, taxAmount: 9.50, total: 199.40, paymentMethod: 'upi', customerName: 'Office Depot Order', createdAt: da(15) },
      { id: 'pos_12', receiptNumber: 'RCT-5012', ownerId: 'user_b', locationId: 'loc_b2', items: [{ productId: 'prod_b2', name: 'Bottled Water (24pk)', sku: 'GG-FOOD-002', price: 12.99, costPrice: 6, gstRate: 18, qty: 4 }, { productId: 'prod_b4', name: 'Snack Bar Variety (36pk)', sku: 'GG-FOOD-004', price: 22.49, costPrice: 12, gstRate: 12, qty: 2 }], subtotal: 96.94, taxAmount: 14.75, total: 111.69, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(12) },
      { id: 'pos_13', receiptNumber: 'RCT-5013', ownerId: 'user_b', locationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', price: 18.99, costPrice: 9, gstRate: 5, qty: 5 }, { productId: 'prod_b6', name: 'Winter Jacket', sku: 'GG-CLTH-002', price: 89.99, costPrice: 45, gstRate: 12, qty: 1 }], subtotal: 184.94, taxAmount: 15.55, total: 200.49, paymentMethod: 'card', customerName: 'Walk-in', createdAt: da(8) },
      { id: 'pos_14', receiptNumber: 'RCT-5014', ownerId: 'user_b', locationId: 'loc_b1', items: [{ productId: 'prod_b3', name: 'Green Tea Box (100ct)', sku: 'GG-FOOD-003', price: 9.99, costPrice: 4.5, gstRate: 5, qty: 10 }], subtotal: 99.90, taxAmount: 5.00, total: 104.90, paymentMethod: 'upi', customerName: 'Suresh P.', createdAt: da(4) },
      { id: 'pos_15', receiptNumber: 'RCT-5015', ownerId: 'user_b', locationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', price: 18.99, costPrice: 9, gstRate: 5, qty: 2 }, { productId: 'prod_b2', name: 'Bottled Water (24pk)', sku: 'GG-FOOD-002', price: 12.99, costPrice: 6, gstRate: 18, qty: 3 }], subtotal: 76.95, taxAmount: 8.91, total: 85.86, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(1) },
      { id: 'pos_16', receiptNumber: 'RCT-5016', ownerId: 'user_c', locationId: 'loc_c2', items: [{ productId: 'prod_c1', name: 'Surgical Gloves (100pk)', sku: 'MP-HLTH-001', price: 14.99, costPrice: 7, gstRate: 12, qty: 5 }, { productId: 'prod_c3', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', price: 8.49, costPrice: 3.5, gstRate: 18, qty: 10 }], subtotal: 159.85, taxAmount: 24.28, total: 184.13, paymentMethod: 'cash', customerName: 'City Hospital', createdAt: da(18) },
      { id: 'pos_17', receiptNumber: 'RCT-5017', ownerId: 'user_c', locationId: 'loc_c1', items: [{ productId: 'prod_c5', name: 'Digital Thermometer', sku: 'MP-HLTH-005', price: 19.99, costPrice: 8, gstRate: 12, qty: 3 }, { productId: 'prod_c6', name: 'Blood Pressure Monitor', sku: 'MP-HLTH-006', price: 59.99, costPrice: 28, gstRate: 12, qty: 2 }], subtotal: 179.95, taxAmount: 21.59, total: 201.54, paymentMethod: 'upi', customerName: 'Dr. Patel Clinic', createdAt: da(12) },
      { id: 'pos_18', receiptNumber: 'RCT-5018', ownerId: 'user_c', locationId: 'loc_c2', items: [{ productId: 'prod_c2', name: 'N95 Masks (50pk)', sku: 'MP-HLTH-002', price: 29.99, costPrice: 15, gstRate: 12, qty: 4 }, { productId: 'prod_c7', name: 'Disinfectant Spray (500ml)', sku: 'MP-HLTH-007', price: 6.99, costPrice: 2.8, gstRate: 18, qty: 8 }], subtotal: 175.88, taxAmount: 24.39, total: 200.27, paymentMethod: 'card', customerName: 'Walk-in', createdAt: da(6) },
      { id: 'pos_19', receiptNumber: 'RCT-5019', ownerId: 'user_c', locationId: 'loc_c1', items: [{ productId: 'prod_c4', name: 'First Aid Kit (Pro)', sku: 'MP-HLTH-004', price: 45.99, costPrice: 22, gstRate: 18, qty: 2 }], subtotal: 91.98, taxAmount: 16.56, total: 108.54, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(2) },
      { id: 'pos_20', receiptNumber: 'RCT-5020', ownerId: 'user_d', locationId: 'loc_d1', items: [{ productId: 'prod_d2', name: 'Hammer (16oz)', sku: 'BR-TOOL-002', price: 18.99, costPrice: 8, gstRate: 18, qty: 3 }, { productId: 'prod_d3', name: 'Measuring Tape (25ft)', sku: 'BR-TOOL-003', price: 12.49, costPrice: 5, gstRate: 18, qty: 2 }, { productId: 'prod_d6', name: 'Safety Goggles', sku: 'BR-TOOL-006', price: 9.99, costPrice: 4, gstRate: 18, qty: 5 }], subtotal: 131.90, taxAmount: 23.74, total: 155.64, paymentMethod: 'cash', customerName: 'Manoj Contractor', createdAt: da(16) },
      { id: 'pos_21', receiptNumber: 'RCT-5021', ownerId: 'user_d', locationId: 'loc_d1', items: [{ productId: 'prod_d1', name: 'Cordless Drill 20V', sku: 'BR-TOOL-001', price: 89.99, costPrice: 42, gstRate: 18, qty: 1 }, { productId: 'prod_d4', name: 'Screwdriver Set (40pc)', sku: 'BR-TOOL-004', price: 34.99, costPrice: 15, gstRate: 18, qty: 1 }], subtotal: 124.98, taxAmount: 22.50, total: 147.48, paymentMethod: 'upi', customerName: 'Walk-in', createdAt: da(10) },
      { id: 'pos_22', receiptNumber: 'RCT-5022', ownerId: 'user_d', locationId: 'loc_d1', items: [{ productId: 'prod_d5', name: 'LED Work Light', sku: 'BR-TOOL-005', price: 24.99, costPrice: 10, gstRate: 18, qty: 2 }, { productId: 'prod_d2', name: 'Hammer (16oz)', sku: 'BR-TOOL-002', price: 18.99, costPrice: 8, gstRate: 18, qty: 1 }], subtotal: 68.97, taxAmount: 12.41, total: 81.38, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: da(5) },
      { id: 'pos_23', receiptNumber: 'RCT-5023', ownerId: 'user_e', locationId: 'loc_e1', items: [{ productId: 'prod_e1', name: 'Catering Tray (Large)', sku: 'FB-FOOD-001', price: 45.99, costPrice: 22, gstRate: 12, qty: 3 }, { productId: 'prod_e4', name: 'Disposable Plates (200pk)', sku: 'FB-SUPP-001', price: 19.99, costPrice: 8, gstRate: 12, qty: 5 }], subtotal: 237.92, taxAmount: 28.55, total: 266.47, paymentMethod: 'cash', customerName: 'Wedding Order - Sharma', createdAt: da(20) },
      { id: 'pos_24', receiptNumber: 'RCT-5024', ownerId: 'user_e', locationId: 'loc_e1', items: [{ productId: 'prod_e2', name: 'Premium Olive Oil (5L)', sku: 'FB-FOOD-002', price: 38.99, costPrice: 20, gstRate: 5, qty: 2 }, { productId: 'prod_e5', name: 'Bulk Rice (25kg)', sku: 'FB-FOOD-003', price: 28.99, costPrice: 14, gstRate: 5, qty: 3 }], subtotal: 164.95, taxAmount: 8.25, total: 173.20, paymentMethod: 'upi', customerName: 'Hotel Sunshine', createdAt: da(14) },
      { id: 'pos_25', receiptNumber: 'RCT-5025', ownerId: 'user_e', locationId: 'loc_e1', items: [{ productId: 'prod_e1', name: 'Catering Tray (Large)', sku: 'FB-FOOD-001', price: 45.99, costPrice: 22, gstRate: 12, qty: 10 }, { productId: 'prod_e6', name: 'Cooking Apron (3pk)', sku: 'FB-CLTH-001', price: 22.99, costPrice: 9, gstRate: 5, qty: 2 }], subtotal: 505.88, taxAmount: 57.46, total: 563.34, paymentMethod: 'card', customerName: 'Corporate Event Catering', createdAt: da(8) },
      { id: 'pos_26', receiptNumber: 'RCT-5026', ownerId: 'user_e', locationId: 'loc_e1', items: [{ productId: 'prod_e7', name: 'Stainless Steel Mixing Bowls (5pc)', sku: 'FB-TOOL-002', price: 32.99, costPrice: 14, gstRate: 18, qty: 1 }, { productId: 'prod_e3', name: 'Chef Knife Set (8pc)', sku: 'FB-TOOL-001', price: 129.99, costPrice: 55, gstRate: 18, qty: 1 }], subtotal: 162.98, taxAmount: 29.34, total: 192.32, paymentMethod: 'upi', customerName: 'Walk-in', createdAt: da(3) },
    ];
    _set(KEYS.POS_SALES, posSales);
    _set(KEYS.POS_SEQ, 5026);
  }

  return {
    generateId,
    getUsers, addUser, upsertUserLocal, removeUserLocal, findUserByEmail, getUserById,
    getCurrentUser, setCurrentUser, clearCurrentUser,
    getCategories, addCategory, updateCategory, deleteCategory, getCategoryById,
    getLocations, getLocationsByOwner, getLocationById, addLocation, updateLocation, deleteLocation, getDefaultLocation,
    getProducts, getProductsByOwner, getPublishedProducts, getProductById, addProduct, updateProduct, deleteProduct,
    getStock, getStockByOwner, getStockByLocation, getStockByProduct, getStockRecord, setStock, adjustStock, getTotalStockForProduct, getLowStockItems, getExpiringStock,
    getOrders, getOrderById, getSalesOrders, getPurchaseOrders, createOrder, updateOrderStatus,
    createManualPurchase, createFieldSale, acceptOrder, cancelOrder, fulfillFieldSale, receiveManualPurchase, settleOrder,
    getParties, getPartiesByType, getPartyById, addParty, updateParty, deleteParty,
    getPosSales, createPosSale, getPosSalesToday,
    getRecipes, getRecipeById, addRecipe, updateRecipe, deleteRecipe, produceRecipe, calcRecipeCost,
    getKhataEntries, getKhataByParty, addKhataEntry, getKhataBalance, getKhataParties,
    getRevenueData,
    getCart, setCart, clearCart, addToCart, updateCartItemQty, getCartItemCount,
    seedDemoData, seedCloudIfNeeded, sync, _clearLocalData,
  };
})();
