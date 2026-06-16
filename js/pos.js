const POS = (() => {
  let bill = [];
  const catIcons = { cat_elec: 'fa-microchip', cat_furn: 'fa-couch', cat_supp: 'fa-paperclip', cat_clth: 'fa-shirt', cat_food: 'fa-mug-hot', cat_health: 'fa-heart-pulse', cat_tools: 'fa-wrench' };

  function init() {
    document.getElementById('pos-search').addEventListener('input', renderProducts);
    document.getElementById('pos-location').addEventListener('change', () => { renderProducts(); _renderBill(); });
    document.getElementById('pos-cat-filter').addEventListener('change', renderProducts);
    document.getElementById('pos-clear-bill').addEventListener('click', clearBill);
    document.getElementById('pos-checkout-btn').addEventListener('click', checkout);
    document.getElementById('pos-print-receipt').addEventListener('click', _printReceipt);
  }

  function populateFilters() {
    const user = Auth.getUser();
    const locations = Store.getLocationsByOwner(Auth.ownerId());
    const cats = Store.getCategories();
    const locSel = document.getElementById('pos-location');
    locSel.innerHTML = locations.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('');
    document.getElementById('pos-cat-filter').innerHTML = '<option value="">All</option>' + cats.map(c => '<option value="' + c.id + '">' + _esc(c.name) + '</option>').join('');
  }

  function renderProducts() {
    const user = Auth.getUser();
    const locId = document.getElementById('pos-location').value;
    const search = document.getElementById('pos-search').value.toLowerCase().trim();
    const catFilter = document.getElementById('pos-cat-filter').value;

    let products = Store.getSellableProducts(Auth.ownerId());
    if (catFilter) products = products.filter(p => p.categoryId === catFilter);
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search));

    const stockMap = {};
    if (locId) {
      Store.getStockByLocation(locId).forEach(s => { stockMap[s.productId] = s.quantity; });
    }

    const grid = document.getElementById('pos-product-grid');
    const empty = document.getElementById('no-pos-products');
    const available = products.filter(p => (stockMap[p.id] || 0) > 0);

    if (available.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    grid.innerHTML = available.map(p => {
      const qty = stockMap[p.id] || 0;
      const icon = catIcons[p.categoryId] || 'fa-box';
      const inBill = bill.find(b => b.productId === p.id);
      const billQty = inBill ? inBill.qty : 0;
      return '<div class="pos-item-card ' + (billQty > 0 ? 'in-bill' : '') + '" onclick="POS.addToBill(\'' + p.id + '\')">' +
        '<div class="pos-item-icon"><i class="fas ' + icon + '"></i></div>' +
        '<div class="pos-item-name">' + _esc(p.name) + '</div>' +
        '<div class="pos-item-price">\u20B9' + p.price.toFixed(2) + '</div>' +
        '<div class="pos-item-stock">' + qty + ' in stock</div>' +
        (billQty > 0 ? '<div class="pos-item-badge">' + billQty + '</div>' : '') + '</div>';
    }).join('');
  }

  function addToBill(productId) {
    const locId = document.getElementById('pos-location').value;
    const product = Store.getProductById(productId);
    if (!product) return;
    const stockRec = Store.getStockRecord(productId, locId);
    const available = stockRec ? stockRec.quantity : 0;
    const existing = bill.find(b => b.productId === productId);
    const currentQty = existing ? existing.qty : 0;
    if (currentQty >= available) { App.showToast('No more stock available', 'warning'); return; }

    if (existing) {
      existing.qty++;
    } else {
      bill.push({ productId, name: product.name, sku: product.sku, price: product.price, costPrice: product.costPrice || 0, gstRate: product.gstRate || 0, qty: 1, batchId: null });
    }
    _renderBill();
    renderProducts();
  }

  // Per-line lot override (defaults to earliest-expiry / FEFO when left blank).
  function setLot(productId, batchId) {
    const item = bill.find(b => b.productId === productId);
    if (item) item.batchId = batchId || null;
  }

  function updateBillQty(productId, qty) {
    if (qty <= 0) {
      bill = bill.filter(b => b.productId !== productId);
    } else {
      const locId = document.getElementById('pos-location').value;
      const stockRec = Store.getStockRecord(productId, locId);
      const available = stockRec ? stockRec.quantity : 0;
      if (qty > available) { App.showToast('Exceeds available stock', 'warning'); return; }
      const item = bill.find(b => b.productId === productId);
      if (item) item.qty = qty;
    }
    _renderBill();
    renderProducts();
  }

  function removeBillItem(productId) {
    bill = bill.filter(b => b.productId !== productId);
    _renderBill();
    renderProducts();
  }

  function _renderBill() {
    const container = document.getElementById('pos-bill-items');
    const btn = document.getElementById('pos-checkout-btn');

    if (bill.length === 0) {
      container.innerHTML = '<div class="pos-bill-empty"><i class="fas fa-hand-pointer"></i><p>Tap products to add</p></div>';
      document.getElementById('pos-item-count').textContent = '0';
      document.getElementById('pos-subtotal').textContent = '\u20B90.00';
      document.getElementById('pos-gst').textContent = '\u20B90.00';
      document.getElementById('pos-total').textContent = '\u20B90.00';
      btn.disabled = true;
      return;
    }
    btn.disabled = false;

    const locId = document.getElementById('pos-location').value;
    let subtotal = 0, gst = 0, itemCount = 0;
    container.innerHTML = bill.map(b => {
      const lineTotal = b.qty * b.price;
      const lineGst = lineTotal * (b.gstRate / 100);
      subtotal += lineTotal;
      gst += lineGst;
      itemCount += b.qty;
      const lots = locId ? Store.availableLots(b.productId, locId) : [];
      let lotPicker = '';
      if (lots.length > 1) {
        lotPicker = '<div class="pos-bill-lot"><select onchange="POS.setLot(\'' + b.productId + '\',this.value)">' +
          lots.map(l => '<option value="' + l.id + '"' + (b.batchId === l.id ? ' selected' : '') + '>' +
            _esc(l.batchNumber || 'Lot') + ' \u00b7 ' + l.qty + ' left' + (l.expiryDate ? ' \u00b7 exp ' + new Date(l.expiryDate).toLocaleDateString('en-IN') : '') + '</option>').join('') +
          '</select></div>';
      }
      return '<div class="pos-bill-row">' +
        '<div class="pos-bill-row-info"><span class="pos-bill-row-name">' + _esc(b.name) + '</span>' +
        '<span class="pos-bill-row-price">\u20B9' + b.price.toFixed(2) + (b.gstRate > 0 ? ' +' + b.gstRate + '%' : '') + '</span>' + lotPicker + '</div>' +
        '<div class="pos-bill-row-controls">' +
        '<button onclick="POS.updateBillQty(\'' + b.productId + '\',' + (b.qty - 1) + ')"><i class="fas fa-minus"></i></button>' +
        '<span>' + b.qty + '</span>' +
        '<button onclick="POS.updateBillQty(\'' + b.productId + '\',' + (b.qty + 1) + ')"><i class="fas fa-plus"></i></button></div>' +
        '<div class="pos-bill-row-total">\u20B9' + lineTotal.toFixed(2) + '</div>' +
        '<button class="pos-bill-row-remove" onclick="POS.removeBillItem(\'' + b.productId + '\')"><i class="fas fa-xmark"></i></button></div>';
    }).join('');

    document.getElementById('pos-item-count').textContent = itemCount;
    document.getElementById('pos-subtotal').textContent = '\u20B9' + subtotal.toFixed(2);
    document.getElementById('pos-gst').textContent = '\u20B9' + gst.toFixed(2);
    document.getElementById('pos-total').textContent = '\u20B9' + (subtotal + gst).toFixed(2);
  }

  function clearBill() { bill = []; _renderBill(); renderProducts(); }

  function checkout() {
    if (bill.length === 0) return;
    const user = Auth.getUser();
    const locId = document.getElementById('pos-location').value;
    const payment = document.getElementById('pos-payment').value;
    const customerName = document.getElementById('pos-customer-name').value.trim() || 'Walk-in';

    const items = bill.map(b => ({ productId: b.productId, name: b.name, sku: b.sku, price: b.price, costPrice: b.costPrice, gstRate: b.gstRate, qty: b.qty, batchId: b.batchId || null }));
    const sale = Store.createPosSale(Auth.ownerId(), locId, items, payment, customerName);

    _showReceipt(sale);
    bill = [];
    _renderBill();
    renderProducts();
    _renderTodaySummary();
    document.getElementById('pos-customer-name').value = '';
    App.showToast('Sale completed! Stock updated.', 'success');
  }

  function _showReceipt(sale) {
    const user = Auth.getUser();
    const loc = Store.getLocationById(sale.locationId);
    const payIcons = { cash: 'Cash', upi: 'UPI', card: 'Card' };
    const gst = sale.taxAmount || 0;

    let html = '<div class="pos-receipt">' +
      '<div class="pos-receipt-header">' +
      '<strong>' + _esc(user.shopName || user.name) + '</strong>' +
      (user.gstin ? '<span>GSTIN: ' + _esc(user.gstin) + '</span>' : '') +
      '<span>' + (loc ? _esc(loc.name) : '') + '</span>' +
      '<span>' + new Date(sale.createdAt).toLocaleString() + '</span></div>' +
      '<div class="pos-receipt-num">' + sale.receiptNumber + '</div>' +
      '<table class="pos-receipt-table">' +
      '<thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>GST</th><th>Total</th></tr></thead>' +
      '<tbody>' + sale.items.map(i => {
        const lineGst = i.qty * i.price * ((i.gstRate || 0) / 100);
        return '<tr><td>' + _esc(i.name) + '</td><td>' + i.qty + '</td><td>\u20B9' + i.price.toFixed(2) + '</td><td>' + (i.gstRate || 0) + '%</td><td>\u20B9' + (i.qty * i.price + lineGst).toFixed(2) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-secondary)"><span>Subtotal</span><span>\u20B9' + sale.subtotal.toFixed(2) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-secondary)"><span>GST</span><span>\u20B9' + gst.toFixed(2) + '</span></div>' +
      '<div class="pos-receipt-total"><span>Total</span><strong>\u20B9' + (sale.total || sale.subtotal + gst).toFixed(2) + '</strong></div>' +
      '<div class="pos-receipt-meta">' +
      '<span>Payment: ' + (payIcons[sale.paymentMethod] || sale.paymentMethod) + '</span>' +
      '<span>Customer: ' + _esc(sale.customerName) + '</span></div></div>';

    document.getElementById('pos-receipt-body').innerHTML = html;
    document.getElementById('pos-receipt-modal').classList.remove('hidden');
  }

  function _printReceipt() {
    const content = document.getElementById('pos-receipt-body').innerHTML;
    const w = window.open('', '_blank', 'width=400,height=700');
    w.document.write('<html><head><title>Receipt</title><style>' +
      'body{font-family:monospace;font-size:12px;padding:10px;max-width:350px;margin:0 auto}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0}' +
      'th,td{text-align:left;padding:2px 4px;border-bottom:1px dashed #ccc}th{font-size:11px}' +
      '.pos-receipt-header{text-align:center;margin-bottom:8px}' +
      '.pos-receipt-header strong{font-size:14px;display:block}' +
      '.pos-receipt-header span{display:block;font-size:11px;color:#666}' +
      '.pos-receipt-num{text-align:center;font-weight:bold;font-size:13px;margin:6px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0}' +
      '.pos-receipt-total{display:flex;justify-content:space-between;font-size:14px;font-weight:bold;border-top:2px solid #000;margin-top:6px;padding-top:6px}' +
      '.pos-receipt-meta{margin-top:8px;font-size:11px;color:#666}.pos-receipt-meta span{display:block}' +
      '</style></head><body>' + content + '<script>window.print();window.close();<\/script></body></html>');
    w.document.close();
  }

  function _renderTodaySummary() {
    const user = Auth.getUser();
    const todaySales = Store.getPosSalesToday(Auth.ownerId());
    const container = document.getElementById('pos-today-summary');
    if (todaySales.length === 0) { container.innerHTML = '<div class="pos-summary-empty">No sales today yet</div>'; return; }
    const totalRevenue = todaySales.reduce((s, sale) => s + (sale.total || sale.subtotal), 0);
    const totalCost = todaySales.reduce((s, sale) => s + sale.items.reduce((is, i) => is + i.qty * (i.costPrice || 0), 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalItems = todaySales.reduce((s, sale) => s + sale.items.reduce((is, i) => is + i.qty, 0), 0);

    container.innerHTML = '<div class="pos-summary-title"><i class="fas fa-chart-line"></i> Today\'s Summary</div>' +
      '<div class="pos-summary-grid">' +
      '<div class="pos-summary-stat"><span class="pos-stat-value">' + todaySales.length + '</span><span class="pos-stat-label">Sales</span></div>' +
      '<div class="pos-summary-stat"><span class="pos-stat-value">' + totalItems + '</span><span class="pos-stat-label">Items</span></div>' +
      '<div class="pos-summary-stat"><span class="pos-stat-value">\u20B9' + totalRevenue.toFixed(0) + '</span><span class="pos-stat-label">Revenue</span></div>' +
      '<div class="pos-summary-stat"><span class="pos-stat-value" style="color:var(--success)">\u20B9' + totalProfit.toFixed(0) + '</span><span class="pos-stat-label">Profit</span></div></div>';
  }

  function refresh() { populateFilters(); renderProducts(); _renderBill(); _renderTodaySummary(); }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, refresh, populateFilters, renderProducts, addToBill, updateBillQty, removeBillItem, clearBill, checkout, setLot };
})();
