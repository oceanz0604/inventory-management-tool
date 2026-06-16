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

  async function sync(user) {
    if (!_cloudOn() || !user) return;
    const isAdmin = user.role === 'superadmin';
    try {
      if (isAdmin) {
        const [users, cats, locs, prods, stock, orders, pos, recipes, khata, parties, companies] = await Promise.all([
          Firebase.list('users'), Firebase.list('categories'), Firebase.list('locations'),
          Firebase.list('products'), Firebase.list('stock'), Firebase.list('orders'),
          Firebase.list('pos_sales'), Firebase.list('recipes'), Firebase.list('khata'), Firebase.list('parties'), Firebase.list('companies'),
        ]);
        _set(KEYS.USERS, _stripUserSecrets(users)); _set(KEYS.CATEGORIES, cats); _set(KEYS.LOCATIONS, locs);
        _set(KEYS.PRODUCTS, prods); _set(KEYS.STOCK, stock); _set(KEYS.ORDERS, orders);
        _set(KEYS.POS_SALES, pos); _set(KEYS.RECIPES, recipes); _set(KEYS.KHATA, khata); _set(KEYS.PARTIES, parties); _set(KEYS.COMPANIES, companies);
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
        const prodMap = {}; ownProds.concat(pubProds).forEach(p => { prodMap[p.id] = p; });
        const ordMap = {}; ordBuy.concat(ordSell).forEach(o => { ordMap[o.id] = o; });
        _set(KEYS.USERS, _stripUserSecrets(users)); _set(KEYS.CATEGORIES, cats); _set(KEYS.LOCATIONS, locs);
        _set(KEYS.PRODUCTS, Object.values(prodMap)); _set(KEYS.STOCK, stock);
        _set(KEYS.ORDERS, Object.values(ordMap)); _set(KEYS.POS_SALES, pos);
        _set(KEYS.RECIPES, recipes); _set(KEYS.KHATA, khata); _set(KEYS.PARTIES, parties);
        let company = null;
        try { company = await Firebase.getDoc('companies', scopeId); } catch (e) { company = null; }
        _set(KEYS.COMPANIES, company ? [company] : []);
      }
      _recomputeSequences();
    } catch (e) {
      console.error('[sync] hydration failed:', e && e.message);
    }
  }

  function _clearLocalData() {
    [KEYS.CATEGORIES, KEYS.LOCATIONS, KEYS.PRODUCTS, KEYS.STOCK, KEYS.ORDERS,
     KEYS.POS_SALES, KEYS.RECIPES, KEYS.KHATA, KEYS.PARTIES, KEYS.COMPANIES, KEYS.USERS, KEYS.CART].forEach(k => localStorage.removeItem(k));
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
    getCompanies, getCompanyById, addCompany, sync, _clearLocalData,
  };
})();
