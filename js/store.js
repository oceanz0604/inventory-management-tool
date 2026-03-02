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
  function addUser(user) { const u = getUsers(); u.push(user); _set(KEYS.USERS, u); }
  function findUserByEmail(email) { return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()); }
  function getUserById(id) { return getUsers().find(u => u.id === id); }
  function getCurrentUser() { return _get(KEYS.CURRENT_USER); }
  function setCurrentUser(user) { _set(KEYS.CURRENT_USER, user); }
  function clearCurrentUser() { localStorage.removeItem(KEYS.CURRENT_USER); }

  // ========== Categories ==========
  function getCategories() { return _get(KEYS.CATEGORIES) || []; }
  function addCategory(cat) { const c = getCategories(); c.push(cat); _set(KEYS.CATEGORIES, c); return cat; }
  function updateCategory(id, updates) { _set(KEYS.CATEGORIES, getCategories().map(c => c.id === id ? { ...c, ...updates } : c)); }
  function deleteCategory(id) { _set(KEYS.CATEGORIES, getCategories().filter(c => c.id !== id)); }
  function getCategoryById(id) { return getCategories().find(c => c.id === id); }

  // ========== Locations ==========
  function getLocations() { return _get(KEYS.LOCATIONS) || []; }
  function getLocationsByOwner(ownerId) { return getLocations().filter(l => l.ownerId === ownerId); }
  function getLocationById(id) { return getLocations().find(l => l.id === id); }
  function addLocation(loc) { const locs = getLocations(); locs.push(loc); _set(KEYS.LOCATIONS, locs); return loc; }
  function updateLocation(id, updates) { _set(KEYS.LOCATIONS, getLocations().map(l => l.id === id ? { ...l, ...updates } : l)); }
  function deleteLocation(id) {
    _set(KEYS.LOCATIONS, getLocations().filter(l => l.id !== id));
    _set(KEYS.STOCK, getStock().filter(s => s.locationId !== id));
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
  function addProduct(prod) { const p = getProducts(); p.push(prod); _set(KEYS.PRODUCTS, p); return prod; }
  function updateProduct(id, updates) { _set(KEYS.PRODUCTS, getProducts().map(p => p.id === id ? { ...p, ...updates } : p)); }
  function deleteProduct(id) {
    _set(KEYS.PRODUCTS, getProducts().filter(p => p.id !== id));
    _set(KEYS.STOCK, getStock().filter(s => s.productId !== id));
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

  function setStock(productId, locationId, quantity, minStock) {
    const all = getStock();
    const idx = all.findIndex(s => s.productId === productId && s.locationId === locationId);
    if (idx >= 0) {
      all[idx].quantity = quantity;
      if (minStock !== undefined) all[idx].minStock = minStock;
    } else {
      all.push({ id: generateId(), productId, locationId, quantity, minStock: minStock || 0 });
    }
    _set(KEYS.STOCK, all);
  }

  function adjustStock(productId, locationId, delta) {
    const all = getStock();
    const idx = all.findIndex(s => s.productId === productId && s.locationId === locationId);
    if (idx >= 0) {
      all[idx].quantity = Math.max(0, all[idx].quantity + delta);
    } else if (delta > 0) {
      all.push({ id: generateId(), productId, locationId, quantity: delta, minStock: 0 });
    }
    _set(KEYS.STOCK, all);
  }

  function getTotalStockForProduct(productId) {
    return getStockByProduct(productId).reduce((sum, s) => sum + s.quantity, 0);
  }

  function getLowStockItems(ownerId) {
    const ownerStock = getStockByOwner(ownerId);
    return ownerStock.filter(s => s.quantity <= s.minStock);
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
            buyerProduct = { id: generateId(), ownerId: order.buyerId, name: item.name, sku: item.sku || 'AUTO-' + generateId().slice(0, 4).toUpperCase(), categoryId: '', costPrice: item.unitPrice, price: item.unitPrice, description: 'Auto-created from purchase order ' + order.orderNumber, isPublished: false, createdAt: new Date().toISOString() };
            addProduct(buyerProduct);
          } else {
            updateProduct(buyerProduct.id, { costPrice: item.unitPrice });
          }
          adjustStock(buyerProduct.id, buyerDefaultLoc.id, item.qty);
        }
      });
    }

    _set(KEYS.ORDERS, orders);
    return orders[idx];
  }

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
      paymentMethod: paymentMethod || 'cash',
      customerName: customerName || 'Walk-in',
      createdAt: new Date().toISOString(),
    };
    items.forEach(i => adjustStock(i.productId, locationId, -i.qty));
    const all = _get(KEYS.POS_SALES) || [];
    all.push(sale);
    _set(KEYS.POS_SALES, all);
    return sale;
  }

  function getPosSalesToday(ownerId) {
    const today = new Date().toDateString();
    return getPosSales(ownerId).filter(s => new Date(s.createdAt).toDateString() === today);
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

  // ========== Seed Demo Data ==========
  function _clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  function seedDemoData() {
    const expectedIds = ['user_a', 'user_b', 'user_c', 'user_d', 'user_e'];
    const existing = getUsers();
    const allPresent = expectedIds.every(id => existing.some(u => u.id === id));
    const sampleProd = getProductById('prod_a1');
    const hasCostPrice = sampleProd && sampleProd.costPrice !== undefined;
    if (allPresent && getLocations().length > 0 && hasCostPrice) return;
    _clearAll();

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
      { id: 'user_a', name: 'TechSupply Co', email: 'admin@techsupply.com', password: 'h_demo', shopName: 'TechSupply Co', createdAt: new Date().toISOString() },
      { id: 'user_b', name: 'GreenGoods', email: 'admin@greengoods.com', password: 'h_demo', shopName: 'GreenGoods', createdAt: new Date().toISOString() },
      { id: 'user_c', name: 'MediPharma', email: 'admin@medipharma.com', password: 'h_demo', shopName: 'MediPharma', createdAt: new Date().toISOString() },
      { id: 'user_d', name: 'BuildRight Hardware', email: 'admin@buildright.com', password: 'h_demo', shopName: 'BuildRight Hardware', createdAt: new Date().toISOString() },
      { id: 'user_e', name: 'FreshBite Catering', email: 'admin@freshbite.com', password: 'h_demo', shopName: 'FreshBite Catering', createdAt: new Date().toISOString() },
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

    const products = [
      // TechSupply Co (user_a) - Electronics, Furniture, Office Supplies
      { id: 'prod_a1', ownerId: 'user_a', name: 'Wireless Mouse', sku: 'TS-ELEC-001', categoryId: 'cat_elec', costPrice: 15.00, price: 29.99, description: 'Ergonomic wireless mouse with USB receiver', isPublished: true, createdAt: da(30) },
      { id: 'prod_a2', ownerId: 'user_a', name: 'USB-C Hub', sku: 'TS-ELEC-002', categoryId: 'cat_elec', costPrice: 22.00, price: 49.99, description: '7-in-1 USB-C multiport adapter', isPublished: true, createdAt: da(28) },
      { id: 'prod_a3', ownerId: 'user_a', name: '27" 4K Monitor', sku: 'TS-ELEC-003', categoryId: 'cat_elec', costPrice: 240.00, price: 399.99, description: 'IPS 4K UHD monitor with USB-C input', isPublished: true, createdAt: da(25) },
      { id: 'prod_a4', ownerId: 'user_a', name: 'Mechanical Keyboard', sku: 'TS-ELEC-004', categoryId: 'cat_elec', costPrice: 38.00, price: 79.99, description: 'RGB mechanical keyboard, Cherry MX Blue', isPublished: true, createdAt: da(22) },
      { id: 'prod_a5', ownerId: 'user_a', name: 'Webcam HD 1080p', sku: 'TS-ELEC-005', categoryId: 'cat_elec', costPrice: 28.00, price: 59.99, description: 'Full HD webcam with built-in mic', isPublished: true, createdAt: da(20) },
      { id: 'prod_a6', ownerId: 'user_a', name: 'Standing Desk', sku: 'TS-FURN-001', categoryId: 'cat_furn', costPrice: 180.00, price: 349.99, description: 'Electric height-adjustable standing desk', isPublished: true, createdAt: da(40) },
      { id: 'prod_a7', ownerId: 'user_a', name: 'Office Chair', sku: 'TS-FURN-002', categoryId: 'cat_furn', costPrice: 95.00, price: 199.99, description: 'Mesh ergonomic office chair', isPublished: true, createdAt: da(38) },
      { id: 'prod_a8', ownerId: 'user_a', name: 'A4 Paper (500 sheets)', sku: 'TS-SUPP-001', categoryId: 'cat_supp', costPrice: 4.00, price: 8.99, description: 'Premium white A4 paper, 80gsm', isPublished: true, createdAt: da(50) },
      { id: 'prod_a9', ownerId: 'user_a', name: 'Ballpoint Pens (12pk)', sku: 'TS-SUPP-002', categoryId: 'cat_supp', costPrice: 2.00, price: 5.49, description: 'Blue ink ballpoint pens', isPublished: false, createdAt: da(48) },
      { id: 'prod_a10', ownerId: 'user_a', name: 'Stapler Heavy Duty', sku: 'TS-SUPP-003', categoryId: 'cat_supp', costPrice: 5.50, price: 12.49, description: 'Staples up to 60 sheets', isPublished: true, createdAt: da(45) },

      // GreenGoods (user_b) - Food & Beverage, Clothing
      { id: 'prod_b1', ownerId: 'user_b', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', categoryId: 'cat_food', costPrice: 9.00, price: 18.99, description: 'Premium arabica, medium roast', isPublished: true, createdAt: da(20) },
      { id: 'prod_b2', ownerId: 'user_b', name: 'Bottled Water (24pk)', sku: 'GG-FOOD-002', categoryId: 'cat_food', costPrice: 6.00, price: 12.99, description: '500ml bottled spring water', isPublished: true, createdAt: da(18) },
      { id: 'prod_b3', ownerId: 'user_b', name: 'Green Tea Box (100ct)', sku: 'GG-FOOD-003', categoryId: 'cat_food', costPrice: 4.50, price: 9.99, description: 'Organic green tea bags', isPublished: true, createdAt: da(15) },
      { id: 'prod_b4', ownerId: 'user_b', name: 'Snack Bar Variety (36pk)', sku: 'GG-FOOD-004', categoryId: 'cat_food', costPrice: 12.00, price: 22.49, description: 'Assorted granola and protein bars', isPublished: true, createdAt: da(12) },
      { id: 'prod_b5', ownerId: 'user_b', name: 'Branded T-Shirt', sku: 'GG-CLTH-001', categoryId: 'cat_clth', costPrice: 10.00, price: 24.99, description: 'Company branded cotton t-shirt', isPublished: true, createdAt: da(25) },
      { id: 'prod_b6', ownerId: 'user_b', name: 'Winter Jacket', sku: 'GG-CLTH-002', categoryId: 'cat_clth', costPrice: 45.00, price: 89.99, description: 'Water-resistant winter jacket', isPublished: true, createdAt: da(22) },
      { id: 'prod_b7', ownerId: 'user_b', name: 'Safety Vest', sku: 'GG-CLTH-003', categoryId: 'cat_clth', costPrice: 6.00, price: 14.99, description: 'High-visibility reflective vest', isPublished: true, createdAt: da(20) },

      // MediPharma (user_c) - Healthcare
      { id: 'prod_c1', ownerId: 'user_c', name: 'Surgical Gloves (100pk)', sku: 'MP-HLTH-001', categoryId: 'cat_health', costPrice: 7.00, price: 14.99, description: 'Nitrile powder-free surgical gloves, medium', isPublished: true, createdAt: da(35) },
      { id: 'prod_c2', ownerId: 'user_c', name: 'N95 Masks (50pk)', sku: 'MP-HLTH-002', categoryId: 'cat_health', costPrice: 15.00, price: 29.99, description: 'NIOSH-approved N95 respirator masks', isPublished: true, createdAt: da(32) },
      { id: 'prod_c3', ownerId: 'user_c', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', categoryId: 'cat_health', costPrice: 3.50, price: 8.49, description: '70% alcohol gel hand sanitizer', isPublished: true, createdAt: da(28) },
      { id: 'prod_c4', ownerId: 'user_c', name: 'First Aid Kit (Pro)', sku: 'MP-HLTH-004', categoryId: 'cat_health', costPrice: 22.00, price: 45.99, description: '120-piece professional first aid kit', isPublished: true, createdAt: da(25) },
      { id: 'prod_c5', ownerId: 'user_c', name: 'Digital Thermometer', sku: 'MP-HLTH-005', categoryId: 'cat_health', costPrice: 8.00, price: 19.99, description: 'Contactless infrared thermometer', isPublished: true, createdAt: da(22) },
      { id: 'prod_c6', ownerId: 'user_c', name: 'Blood Pressure Monitor', sku: 'MP-HLTH-006', categoryId: 'cat_health', costPrice: 28.00, price: 59.99, description: 'Automatic upper arm blood pressure cuff', isPublished: true, createdAt: da(18) },
      { id: 'prod_c7', ownerId: 'user_c', name: 'Disinfectant Spray (500ml)', sku: 'MP-HLTH-007', categoryId: 'cat_health', costPrice: 2.80, price: 6.99, description: 'Hospital-grade surface disinfectant', isPublished: true, createdAt: da(15) },
      { id: 'prod_c8', ownerId: 'user_c', name: 'Lab Coat (White)', sku: 'MP-CLTH-001', categoryId: 'cat_clth', costPrice: 16.00, price: 34.99, description: 'Professional white lab coat, unisex', isPublished: false, createdAt: da(30) },

      // BuildRight Hardware (user_d) - Hardware & Tools, Furniture
      { id: 'prod_d1', ownerId: 'user_d', name: 'Cordless Drill 20V', sku: 'BR-TOOL-001', categoryId: 'cat_tools', costPrice: 42.00, price: 89.99, description: '20V lithium-ion cordless drill/driver kit', isPublished: true, createdAt: da(30) },
      { id: 'prod_d2', ownerId: 'user_d', name: 'Hammer (16oz)', sku: 'BR-TOOL-002', categoryId: 'cat_tools', costPrice: 8.00, price: 18.99, description: 'Fiberglass handle claw hammer', isPublished: true, createdAt: da(28) },
      { id: 'prod_d3', ownerId: 'user_d', name: 'Measuring Tape (25ft)', sku: 'BR-TOOL-003', categoryId: 'cat_tools', costPrice: 5.00, price: 12.49, description: 'Auto-locking steel measuring tape', isPublished: true, createdAt: da(25) },
      { id: 'prod_d4', ownerId: 'user_d', name: 'Screwdriver Set (40pc)', sku: 'BR-TOOL-004', categoryId: 'cat_tools', costPrice: 15.00, price: 34.99, description: 'Magnetic tip screwdriver set with case', isPublished: true, createdAt: da(22) },
      { id: 'prod_d5', ownerId: 'user_d', name: 'LED Work Light', sku: 'BR-TOOL-005', categoryId: 'cat_tools', costPrice: 10.00, price: 24.99, description: '1000-lumen rechargeable LED work light', isPublished: true, createdAt: da(20) },
      { id: 'prod_d6', ownerId: 'user_d', name: 'Safety Goggles', sku: 'BR-TOOL-006', categoryId: 'cat_tools', costPrice: 4.00, price: 9.99, description: 'Anti-fog impact-resistant safety goggles', isPublished: true, createdAt: da(18) },
      { id: 'prod_d7', ownerId: 'user_d', name: 'Industrial Shelving Unit', sku: 'BR-FURN-001', categoryId: 'cat_furn', costPrice: 70.00, price: 149.99, description: '5-tier heavy-duty steel shelving, 2000lb capacity', isPublished: true, createdAt: da(35) },
      { id: 'prod_d8', ownerId: 'user_d', name: 'Workbench (6ft)', sku: 'BR-FURN-002', categoryId: 'cat_furn', costPrice: 140.00, price: 279.99, description: 'Solid wood top workbench with storage', isPublished: true, createdAt: da(33) },

      // FreshBite Catering (user_e) - Food & Beverage
      { id: 'prod_e1', ownerId: 'user_e', name: 'Catering Tray (Large)', sku: 'FB-FOOD-001', categoryId: 'cat_food', costPrice: 22.00, price: 45.99, description: 'Large aluminum catering tray with lid', isPublished: true, createdAt: da(20) },
      { id: 'prod_e2', ownerId: 'user_e', name: 'Premium Olive Oil (5L)', sku: 'FB-FOOD-002', categoryId: 'cat_food', costPrice: 20.00, price: 38.99, description: 'Extra virgin olive oil, cold-pressed', isPublished: true, createdAt: da(18) },
      { id: 'prod_e3', ownerId: 'user_e', name: 'Chef Knife Set (8pc)', sku: 'FB-TOOL-001', categoryId: 'cat_tools', costPrice: 55.00, price: 129.99, description: 'Professional German steel chef knife set', isPublished: true, createdAt: da(25) },
      { id: 'prod_e4', ownerId: 'user_e', name: 'Disposable Plates (200pk)', sku: 'FB-SUPP-001', categoryId: 'cat_supp', costPrice: 8.00, price: 19.99, description: 'Compostable 9-inch dinner plates', isPublished: true, createdAt: da(15) },
      { id: 'prod_e5', ownerId: 'user_e', name: 'Bulk Rice (25kg)', sku: 'FB-FOOD-003', categoryId: 'cat_food', costPrice: 14.00, price: 28.99, description: 'Premium basmati rice, 25kg sack', isPublished: true, createdAt: da(12) },
      { id: 'prod_e6', ownerId: 'user_e', name: 'Cooking Apron (3pk)', sku: 'FB-CLTH-001', categoryId: 'cat_clth', costPrice: 9.00, price: 22.99, description: 'Waterproof chef apron with pockets', isPublished: true, createdAt: da(10) },
      { id: 'prod_e7', ownerId: 'user_e', name: 'Stainless Steel Mixing Bowls (5pc)', sku: 'FB-TOOL-002', categoryId: 'cat_tools', costPrice: 14.00, price: 32.99, description: 'Nested mixing bowls with non-slip base', isPublished: true, createdAt: da(8) },
    ];
    _set(KEYS.PRODUCTS, products);

    const stock = [
      // TechSupply Co
      { id: generateId(), productId: 'prod_a1', locationId: 'loc_a1', quantity: 45, minStock: 10 },
      { id: generateId(), productId: 'prod_a1', locationId: 'loc_a2', quantity: 12, minStock: 5 },
      { id: generateId(), productId: 'prod_a2', locationId: 'loc_a1', quantity: 3, minStock: 5 },
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
      // GreenGoods
      { id: generateId(), productId: 'prod_b1', locationId: 'loc_b1', quantity: 25, minStock: 5 },
      { id: generateId(), productId: 'prod_b2', locationId: 'loc_b1', quantity: 4, minStock: 8 },
      { id: generateId(), productId: 'prod_b2', locationId: 'loc_b2', quantity: 18, minStock: 5 },
      { id: generateId(), productId: 'prod_b3', locationId: 'loc_b1', quantity: 38, minStock: 10 },
      { id: generateId(), productId: 'prod_b4', locationId: 'loc_b1', quantity: 7, minStock: 10 },
      { id: generateId(), productId: 'prod_b4', locationId: 'loc_b2', quantity: 15, minStock: 5 },
      { id: generateId(), productId: 'prod_b5', locationId: 'loc_b1', quantity: 75, minStock: 15 },
      { id: generateId(), productId: 'prod_b6', locationId: 'loc_b1', quantity: 8, minStock: 10 },
      { id: generateId(), productId: 'prod_b7', locationId: 'loc_b1', quantity: 50, minStock: 20 },
      { id: generateId(), productId: 'prod_b7', locationId: 'loc_b2', quantity: 30, minStock: 10 },
      // MediPharma
      { id: generateId(), productId: 'prod_c1', locationId: 'loc_c1', quantity: 200, minStock: 50 },
      { id: generateId(), productId: 'prod_c1', locationId: 'loc_c2', quantity: 80, minStock: 20 },
      { id: generateId(), productId: 'prod_c2', locationId: 'loc_c1', quantity: 150, minStock: 30 },
      { id: generateId(), productId: 'prod_c2', locationId: 'loc_c2', quantity: 40, minStock: 15 },
      { id: generateId(), productId: 'prod_c3', locationId: 'loc_c1', quantity: 300, minStock: 50 },
      { id: generateId(), productId: 'prod_c4', locationId: 'loc_c1', quantity: 25, minStock: 10 },
      { id: generateId(), productId: 'prod_c4', locationId: 'loc_c2', quantity: 8, minStock: 5 },
      { id: generateId(), productId: 'prod_c5', locationId: 'loc_c1', quantity: 60, minStock: 15 },
      { id: generateId(), productId: 'prod_c6', locationId: 'loc_c1', quantity: 18, minStock: 10 },
      { id: generateId(), productId: 'prod_c7', locationId: 'loc_c1', quantity: 0, minStock: 25 },
      { id: generateId(), productId: 'prod_c8', locationId: 'loc_c1', quantity: 12, minStock: 5 },
      // BuildRight Hardware
      { id: generateId(), productId: 'prod_d1', locationId: 'loc_d1', quantity: 35, minStock: 10 },
      { id: generateId(), productId: 'prod_d2', locationId: 'loc_d1', quantity: 80, minStock: 20 },
      { id: generateId(), productId: 'prod_d3', locationId: 'loc_d1', quantity: 65, minStock: 15 },
      { id: generateId(), productId: 'prod_d4', locationId: 'loc_d1', quantity: 22, minStock: 8 },
      { id: generateId(), productId: 'prod_d5', locationId: 'loc_d1', quantity: 3, minStock: 10 },
      { id: generateId(), productId: 'prod_d6', locationId: 'loc_d1', quantity: 100, minStock: 25 },
      { id: generateId(), productId: 'prod_d7', locationId: 'loc_d1', quantity: 9, minStock: 5 },
      { id: generateId(), productId: 'prod_d8', locationId: 'loc_d1', quantity: 4, minStock: 3 },
      // FreshBite Catering
      { id: generateId(), productId: 'prod_e1', locationId: 'loc_e1', quantity: 60, minStock: 20 },
      { id: generateId(), productId: 'prod_e2', locationId: 'loc_e2', quantity: 15, minStock: 5 },
      { id: generateId(), productId: 'prod_e3', locationId: 'loc_e1', quantity: 10, minStock: 3 },
      { id: generateId(), productId: 'prod_e4', locationId: 'loc_e1', quantity: 5, minStock: 15 },
      { id: generateId(), productId: 'prod_e5', locationId: 'loc_e2', quantity: 40, minStock: 10 },
      { id: generateId(), productId: 'prod_e6', locationId: 'loc_e1', quantity: 18, minStock: 5 },
      { id: generateId(), productId: 'prod_e7', locationId: 'loc_e1', quantity: 12, minStock: 4 },
    ];
    _set(KEYS.STOCK, stock);

    const orders = [
      // Original A <-> B orders
      { id: 'ord_1', orderNumber: 'ORD-1001', buyerId: 'user_b', sellerId: 'user_a', fulfillmentLocationId: 'loc_a1', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', qty: 10, unitPrice: 29.99 }, { productId: 'prod_a5', name: 'Webcam HD 1080p', sku: 'TS-ELEC-005', qty: 5, unitPrice: 59.99 }], status: 'delivered', total: 599.85, createdAt: da(14), updatedAt: da(10) },
      { id: 'ord_2', orderNumber: 'ORD-1002', buyerId: 'user_a', sellerId: 'user_b', fulfillmentLocationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', qty: 20, unitPrice: 18.99 }], status: 'shipped', total: 379.80, createdAt: da(7), updatedAt: da(3) },
      { id: 'ord_3', orderNumber: 'ORD-1003', buyerId: 'user_b', sellerId: 'user_a', fulfillmentLocationId: null, items: [{ productId: 'prod_a6', name: 'Standing Desk', sku: 'TS-FURN-001', qty: 2, unitPrice: 349.99 }, { productId: 'prod_a7', name: 'Office Chair', sku: 'TS-FURN-002', qty: 3, unitPrice: 199.99 }], status: 'approved', total: 1299.95, createdAt: da(5), updatedAt: da(4) },
      { id: 'ord_4', orderNumber: 'ORD-1004', buyerId: 'user_a', sellerId: 'user_b', fulfillmentLocationId: null, items: [{ productId: 'prod_b5', name: 'Branded T-Shirt', sku: 'GG-CLTH-001', qty: 50, unitPrice: 24.99 }], status: 'pending', total: 1249.50, createdAt: da(2), updatedAt: da(2) },
      { id: 'ord_5', orderNumber: 'ORD-1005', buyerId: 'user_b', sellerId: 'user_a', fulfillmentLocationId: null, items: [{ productId: 'prod_a3', name: '27" 4K Monitor', sku: 'TS-ELEC-003', qty: 5, unitPrice: 399.99 }], status: 'pending', total: 1999.95, createdAt: da(1), updatedAt: da(1) },
      // MediPharma orders
      { id: 'ord_6', orderNumber: 'ORD-1006', buyerId: 'user_c', sellerId: 'user_a', fulfillmentLocationId: 'loc_a1', items: [{ productId: 'prod_a1', name: 'Wireless Mouse', sku: 'TS-ELEC-001', qty: 20, unitPrice: 29.99 }, { productId: 'prod_a2', name: 'USB-C Hub', sku: 'TS-ELEC-002', qty: 10, unitPrice: 49.99 }], status: 'delivered', total: 1099.70, createdAt: da(20), updatedAt: da(16) },
      { id: 'ord_7', orderNumber: 'ORD-1007', buyerId: 'user_a', sellerId: 'user_c', fulfillmentLocationId: 'loc_c1', items: [{ productId: 'prod_c4', name: 'First Aid Kit (Pro)', sku: 'MP-HLTH-004', qty: 5, unitPrice: 45.99 }, { productId: 'prod_c3', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', qty: 30, unitPrice: 8.49 }], status: 'delivered', total: 484.65, createdAt: da(18), updatedAt: da(13) },
      { id: 'ord_8', orderNumber: 'ORD-1008', buyerId: 'user_d', sellerId: 'user_c', fulfillmentLocationId: null, items: [{ productId: 'prod_c1', name: 'Surgical Gloves (100pk)', sku: 'MP-HLTH-001', qty: 10, unitPrice: 14.99 }, { productId: 'prod_c6', name: 'Blood Pressure Monitor', sku: 'MP-HLTH-006', qty: 2, unitPrice: 59.99 }], status: 'approved', total: 269.88, createdAt: da(6), updatedAt: da(5) },
      { id: 'ord_9', orderNumber: 'ORD-1009', buyerId: 'user_e', sellerId: 'user_c', fulfillmentLocationId: null, items: [{ productId: 'prod_c2', name: 'N95 Masks (50pk)', sku: 'MP-HLTH-002', qty: 5, unitPrice: 29.99 }, { productId: 'prod_c3', name: 'Hand Sanitizer (1L)', sku: 'MP-HLTH-003', qty: 20, unitPrice: 8.49 }], status: 'pending', total: 319.75, createdAt: da(1), updatedAt: da(1) },
      // BuildRight Hardware orders
      { id: 'ord_10', orderNumber: 'ORD-1010', buyerId: 'user_e', sellerId: 'user_d', fulfillmentLocationId: 'loc_d1', items: [{ productId: 'prod_d7', name: 'Industrial Shelving Unit', sku: 'BR-FURN-001', qty: 3, unitPrice: 149.99 }], status: 'shipped', total: 449.97, createdAt: da(8), updatedAt: da(4) },
      { id: 'ord_11', orderNumber: 'ORD-1011', buyerId: 'user_b', sellerId: 'user_d', fulfillmentLocationId: null, items: [{ productId: 'prod_d6', name: 'Safety Goggles', sku: 'BR-TOOL-006', qty: 30, unitPrice: 9.99 }, { productId: 'prod_d5', name: 'LED Work Light', sku: 'BR-TOOL-005', qty: 10, unitPrice: 24.99 }], status: 'pending', total: 549.60, createdAt: da(2), updatedAt: da(2) },
      { id: 'ord_12', orderNumber: 'ORD-1012', buyerId: 'user_d', sellerId: 'user_a', fulfillmentLocationId: null, items: [{ productId: 'prod_a8', name: 'A4 Paper (500 sheets)', sku: 'TS-SUPP-001', qty: 50, unitPrice: 8.99 }, { productId: 'prod_a10', name: 'Stapler Heavy Duty', sku: 'TS-SUPP-003', qty: 10, unitPrice: 12.49 }], status: 'approved', total: 574.40, createdAt: da(4), updatedAt: da(3) },
      // FreshBite Catering orders
      { id: 'ord_13', orderNumber: 'ORD-1013', buyerId: 'user_e', sellerId: 'user_b', fulfillmentLocationId: 'loc_b1', items: [{ productId: 'prod_b1', name: 'Coffee Beans (1kg)', sku: 'GG-FOOD-001', qty: 50, unitPrice: 18.99 }, { productId: 'prod_b3', name: 'Green Tea Box (100ct)', sku: 'GG-FOOD-003', qty: 20, unitPrice: 9.99 }], status: 'delivered', total: 1149.30, createdAt: da(15), updatedAt: da(11) },
      { id: 'ord_14', orderNumber: 'ORD-1014', buyerId: 'user_c', sellerId: 'user_e', fulfillmentLocationId: null, items: [{ productId: 'prod_e4', name: 'Disposable Plates (200pk)', sku: 'FB-SUPP-001', qty: 10, unitPrice: 19.99 }], status: 'pending', total: 199.90, createdAt: da(1), updatedAt: da(1) },
      { id: 'ord_15', orderNumber: 'ORD-1015', buyerId: 'user_d', sellerId: 'user_e', fulfillmentLocationId: 'loc_e1', items: [{ productId: 'prod_e6', name: 'Cooking Apron (3pk)', sku: 'FB-CLTH-001', qty: 5, unitPrice: 22.99 }], status: 'shipped', total: 114.95, createdAt: da(5), updatedAt: da(2) },
    ];
    _set(KEYS.ORDERS, orders);
    _set(KEYS.ORDER_SEQ, 1015);
  }

  return {
    generateId,
    getUsers, addUser, findUserByEmail, getUserById,
    getCurrentUser, setCurrentUser, clearCurrentUser,
    getCategories, addCategory, updateCategory, deleteCategory, getCategoryById,
    getLocations, getLocationsByOwner, getLocationById, addLocation, updateLocation, deleteLocation, getDefaultLocation,
    getProducts, getProductsByOwner, getPublishedProducts, getProductById, addProduct, updateProduct, deleteProduct,
    getStock, getStockByOwner, getStockByLocation, getStockByProduct, getStockRecord, setStock, adjustStock, getTotalStockForProduct, getLowStockItems,
    getOrders, getOrderById, getSalesOrders, getPurchaseOrders, createOrder, updateOrderStatus,
    getPosSales, createPosSale, getPosSalesToday,
    getCart, setCart, clearCart, addToCart, updateCartItemQty, getCartItemCount,
    seedDemoData,
  };
})();
