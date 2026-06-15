const Orders = (() => {
  let activeTab = 'sales';
  let mpItems = []; // manual-purchase line items being built

  function init() {
    document.querySelectorAll('#order-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        document.querySelectorAll('#order-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('order-party-header').textContent = activeTab === 'sales' ? 'Customer' : 'Supplier';
        render();
      });
    });
    document.getElementById('print-invoice-btn').addEventListener('click', _printInvoice);

    // Field-sale delivery (payment) modal
    const fulfillConfirm = document.getElementById('fulfill-confirm');
    if (fulfillConfirm) fulfillConfirm.addEventListener('click', _confirmDeliver);

    // Manual purchase
    const newMp = document.getElementById('new-manual-purchase-btn');
    if (newMp) newMp.addEventListener('click', openManualPurchase);
    const mpAddItem = document.getElementById('mp-add-item');
    if (mpAddItem) mpAddItem.addEventListener('click', _mpAddItem);
    const mpSubmit = document.getElementById('mp-submit');
    if (mpSubmit) mpSubmit.addEventListener('click', _mpSubmit);
    const mpAddSeller = document.getElementById('mp-add-seller');
    if (mpAddSeller) mpAddSeller.addEventListener('click', () => { if (window.Parties) Parties.openModal(); });
    const mpProduct = document.getElementById('mp-product');
    if (mpProduct) mpProduct.addEventListener('change', (e) => {
      const p = Store.getProductById(e.target.value);
      if (p) document.getElementById('mp-cost').value = p.costPrice || 0;
    });
  }

  function render() {
    const orders = activeTab === 'sales' ? Store.getSalesOrders(Auth.ownerId()) : Store.getPurchaseOrders(Auth.ownerId());
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const mpBtn = document.getElementById('orders-actions');
    if (mpBtn) mpBtn.classList.toggle('hidden', activeTab !== 'purchase');

    const tbody = document.getElementById('orders-table-body');
    const empty = document.getElementById('no-orders');

    if (orders.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      tbody.closest('.card').querySelector('table').classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.closest('.card').querySelector('table').classList.remove('hidden');

    tbody.innerHTML = orders.map(o => {
      const partyName = _orderPartyName(o);
      const itemCount = o.items.reduce((s, i) => s + i.qty, 0);
      const date = new Date(o.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

      let actionBtns = '<button class="btn btn-sm btn-secondary" onclick="Orders.viewDetail(\'' + o.id + '\')"><i class="fas fa-eye"></i></button>';
      if (o.kind === 'field_sale') {
        if (o.status === 'pending') actionBtns += ' <button class="btn btn-sm btn-success" onclick="Orders.acceptFieldSale(\'' + o.id + '\')">Accept</button>' +
          ' <button class="btn btn-sm btn-danger" onclick="Orders.cancelCustom(\'' + o.id + '\')">Cancel</button>';
        else if (o.status === 'accepted') actionBtns += ' <button class="btn btn-sm btn-primary" onclick="Orders.openDeliver(\'' + o.id + '\')">Deliver</button>' +
          ' <button class="btn btn-sm btn-danger" onclick="Orders.cancelCustom(\'' + o.id + '\')">Cancel</button>';
        else if (o.status === 'open') actionBtns += ' <button class="btn btn-sm btn-success" onclick="Orders.settle(\'' + o.id + '\')">Mark Paid</button>';
      } else if (o.kind === 'manual_purchase') {
        if (o.status === 'open') actionBtns += ' <button class="btn btn-sm btn-success" onclick="Orders.settle(\'' + o.id + '\')">Mark Paid</button>';
      } else {
        if (activeTab === 'sales') {
          if (o.status === 'pending') actionBtns += ' <button class="btn btn-sm btn-success" onclick="Orders.approve(\'' + o.id + '\')">Approve</button>';
          if (o.status === 'approved') actionBtns += ' <button class="btn btn-sm btn-warning" onclick="Orders.ship(\'' + o.id + '\')">Ship</button>';
          if (o.status === 'shipped') actionBtns += ' <button class="btn btn-sm btn-primary" onclick="Orders.deliver(\'' + o.id + '\')">Deliver</button>';
          if (o.status === 'pending' || o.status === 'approved') actionBtns += ' <button class="btn btn-sm btn-danger" onclick="Orders.cancel(\'' + o.id + '\')">Cancel</button>';
        }
        if (o.status === 'delivered') actionBtns += ' <button class="btn btn-sm btn-secondary" onclick="Orders.showInvoice(\'' + o.id + '\')" title="Invoice"><i class="fas fa-file-invoice-dollar"></i></button>';
      }

      return '<tr>' +
        '<td><strong>' + o.orderNumber + '</strong>' + _kindTag(o) + '</td>' +
        '<td>' + date + '</td>' +
        '<td>' + _esc(partyName) + '</td>' +
        '<td>' + itemCount + ' item' + (itemCount !== 1 ? 's' : '') + '</td>' +
        '<td><strong>\u20B9' + o.total.toFixed(2) + '</strong></td>' +
        '<td><span class="order-status ' + o.status + '">' + _capitalize(o.status) + '</span></td>' +
        '<td><div class="action-btns">' + actionBtns + '</div></td></tr>';
    }).join('');
  }

  function _orderPartyName(o) {
    if (o.kind === 'field_sale') { const c = Store.getPartyById(o.customerPartyId); return c ? c.name : 'Customer'; }
    if (o.kind === 'manual_purchase') { const s = Store.getPartyById(o.sellerPartyId); return s ? s.name : 'Seller'; }
    const u = activeTab === 'sales' ? Store.getUserById(o.buyerId) : Store.getUserById(o.sellerId);
    return u ? (u.name || u.shopName) : 'Unknown';
  }

  function _kindTag(o) {
    if (o.kind === 'field_sale') return ' <span class="role-pill role-marketing" style="font-size:.62rem">Field</span>';
    if (o.kind === 'manual_purchase') return ' <span class="role-pill" style="font-size:.62rem">Manual</span>';
    return '';
  }

  function viewDetail(orderId) {
    const order = Store.getOrderById(orderId);
    if (!order) return;
    if (order.kind === 'field_sale' || order.kind === 'manual_purchase') { _viewCustomDetail(order); return; }
    const isSeller = order.sellerId === Auth.ownerId();
    const buyer = Store.getUserById(order.buyerId);
    const seller = Store.getUserById(order.sellerId);
    const loc = order.fulfillmentLocationId ? Store.getLocationById(order.fulfillmentLocationId) : null;

    const statuses = ['pending', 'approved', 'shipped', 'delivered'];
    const currentIdx = statuses.indexOf(order.status);
    const isCancelled = order.status === 'cancelled';

    const timeline = isCancelled
      ? '<div style="text-align:center;padding:.5rem"><span class="order-status cancelled">Cancelled</span></div>'
      : '<div class="order-timeline">' + statuses.map((s, i) => {
          let cls = '';
          if (i < currentIdx) cls = 'done';
          else if (i === currentIdx) cls = 'active';
          return '<div class="timeline-step ' + cls + '">' +
            '<div class="step-dot"><i class="fas fa-' + (i < currentIdx ? 'check' : i === 0 ? 'clock' : i === 1 ? 'thumbs-up' : i === 2 ? 'truck' : 'circle-check') + '"></i></div>' +
            '<span class="step-label">' + s + '</span></div>';
        }).join('') + '</div>';

    let subtotal = 0, gstTotal = 0;
    const itemRows = order.items.map(i => {
      const prod = Store.getProductById(i.productId);
      const gstRate = prod ? (prod.gstRate || 0) : 0;
      const lineTotal = i.qty * i.unitPrice;
      const lineGst = lineTotal * (gstRate / 100);
      subtotal += lineTotal;
      gstTotal += lineGst;
      return '<tr><td>' + _esc(i.name) + '</td><td>' + _esc(i.sku || '-') + '</td><td>' + i.qty + '</td><td>\u20B9' + i.unitPrice.toFixed(2) + '</td><td>' + gstRate + '%</td><td><strong>\u20B9' + (lineTotal + lineGst).toFixed(2) + '</strong></td></tr>';
    }).join('');

    document.getElementById('order-detail-title').textContent = order.orderNumber;
    document.getElementById('order-detail-body').innerHTML =
      '<div class="order-detail-grid">' +
      '<div class="detail-item"><div class="detail-label">Buyer</div><strong>' + _esc(buyer ? buyer.name : 'Unknown') + '</strong>' + (buyer && buyer.gstin ? '<div style="font-size:.75rem;color:var(--text-secondary)">GSTIN: ' + _esc(buyer.gstin) + '</div>' : '') + '</div>' +
      '<div class="detail-item"><div class="detail-label">Seller</div><strong>' + _esc(seller ? seller.name : 'Unknown') + '</strong>' + (seller && seller.gstin ? '<div style="font-size:.75rem;color:var(--text-secondary)">GSTIN: ' + _esc(seller.gstin) + '</div>' : '') + '</div>' +
      '<div class="detail-item"><div class="detail-label">Date</div>' + new Date(order.createdAt).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' +
      '<div class="detail-item"><div class="detail-label">Fulfillment</div>' + (loc ? _esc(loc.name) : '<em style="color:var(--text-light)">Not assigned</em>') + '</div></div>' +
      timeline +
      '<table class="data-table order-items-table"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>GST</th><th>Total</th></tr></thead>' +
      '<tbody>' + itemRows + '</tbody>' +
      '<tfoot><tr><td colspan="5" style="text-align:right">Subtotal</td><td>\u20B9' + subtotal.toFixed(2) + '</td></tr>' +
      '<tr><td colspan="5" style="text-align:right">GST</td><td>\u20B9' + gstTotal.toFixed(2) + '</td></tr>' +
      '<tr><td colspan="5" style="text-align:right;font-weight:700">Grand Total</td><td><strong>\u20B9' + (subtotal + gstTotal).toFixed(2) + '</strong></td></tr></tfoot></table>';

    let footerHtml = '<button class="btn btn-secondary modal-close">Close</button>';
    if (isSeller && order.status === 'pending') footerHtml = '<button class="btn btn-danger" onclick="Orders.cancel(\'' + order.id + '\');document.getElementById(\'order-detail-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-success" onclick="Orders.approve(\'' + order.id + '\');document.getElementById(\'order-detail-modal\').classList.add(\'hidden\')">Approve</button>' + footerHtml;
    if (isSeller && order.status === 'approved') footerHtml = '<button class="btn btn-warning" onclick="Orders.ship(\'' + order.id + '\');document.getElementById(\'order-detail-modal\').classList.add(\'hidden\')">Mark Shipped</button>' + footerHtml;
    if (isSeller && order.status === 'shipped') footerHtml = '<button class="btn btn-primary" onclick="Orders.deliver(\'' + order.id + '\');document.getElementById(\'order-detail-modal\').classList.add(\'hidden\')">Mark Delivered</button>' + footerHtml;
    if (order.status === 'delivered') footerHtml = '<button class="btn btn-secondary" onclick="Orders.showInvoice(\'' + order.id + '\')"><i class="fas fa-file-invoice-dollar"></i> Invoice</button>' + footerHtml;
    document.getElementById('order-detail-footer').innerHTML = footerHtml;

    document.querySelectorAll('#order-detail-footer .modal-close').forEach(b => {
      b.addEventListener('click', () => document.getElementById('order-detail-modal').classList.add('hidden'));
    });
    document.getElementById('order-detail-modal').classList.remove('hidden');
  }

  function showInvoice(orderId) {
    const order = Store.getOrderById(orderId);
    if (!order) return;
    const seller = Store.getUserById(order.sellerId);
    const buyer = Store.getUserById(order.buyerId);
    const date = new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let subtotal = 0, totalGst = 0;
    const rows = order.items.map(i => {
      const prod = Store.getProductById(i.productId);
      const gstRate = prod ? (prod.gstRate || 0) : 0;
      const hsnCode = prod ? (prod.hsnCode || '') : '';
      const line = i.qty * i.unitPrice;
      const gst = line * (gstRate / 100);
      subtotal += line;
      totalGst += gst;
      return '<tr><td>' + _esc(i.name) + '</td><td>' + _esc(hsnCode || '-') + '</td><td>' + i.qty + '</td><td>\u20B9' + i.unitPrice.toFixed(2) + '</td><td>' + gstRate + '%</td><td>\u20B9' + gst.toFixed(2) + '</td><td>\u20B9' + (line + gst).toFixed(2) + '</td></tr>';
    }).join('');

    const cgst = totalGst / 2;
    const sgst = totalGst / 2;

    document.getElementById('invoice-body').innerHTML =
      '<div class="invoice-preview">' +
      '<div class="invoice-header"><div><div class="inv-title">TAX INVOICE</div><div style="font-size:.8rem;color:var(--text-secondary)">' + order.orderNumber + '</div></div>' +
      '<div class="inv-meta">Date: ' + date + '</div></div>' +
      '<div class="invoice-parties">' +
      '<div><div class="inv-party-label">From (Seller)</div><strong>' + _esc(seller ? seller.shopName || seller.name : '—') + '</strong>' + (seller && seller.gstin ? '<div>GSTIN: ' + _esc(seller.gstin) + '</div>' : '') + '</div>' +
      '<div><div class="inv-party-label">To (Buyer)</div><strong>' + _esc(buyer ? buyer.shopName || buyer.name : '—') + '</strong>' + (buyer && buyer.gstin ? '<div>GSTIN: ' + _esc(buyer.gstin) + '</div>' : '') + '</div></div>' +
      '<table class="invoice-table"><thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST%</th><th>GST Amt</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="invoice-totals">' +
      '<div class="inv-line"><span>Subtotal</span><span>\u20B9' + subtotal.toFixed(2) + '</span></div>' +
      '<div class="inv-line"><span>CGST</span><span>\u20B9' + cgst.toFixed(2) + '</span></div>' +
      '<div class="inv-line"><span>SGST</span><span>\u20B9' + sgst.toFixed(2) + '</span></div>' +
      '<div class="inv-line total"><span>Grand Total</span><span>\u20B9' + (subtotal + totalGst).toFixed(2) + '</span></div></div></div>';

    document.getElementById('order-detail-modal').classList.add('hidden');
    document.getElementById('invoice-modal').classList.remove('hidden');
  }

  function _printInvoice() {
    const content = document.getElementById('invoice-body').innerHTML;
    const w = window.open('', '_blank', 'width=800,height=900');
    w.document.write('<html><head><title>Invoice</title><style>' +
      'body{font-family:Arial,sans-serif;font-size:13px;padding:20px;max-width:750px;margin:0 auto}' +
      '.invoice-header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #000}' +
      '.inv-title{font-size:18px;font-weight:bold}' +
      '.invoice-parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}' +
      '.inv-party-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;margin-bottom:4px;font-weight:bold}' +
      '.invoice-table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
      '.invoice-table th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;border-bottom:1px solid #ccc}' +
      '.invoice-table td{padding:6px 8px;border-bottom:1px solid #eee}' +
      '.invoice-totals{margin-left:auto;width:250px}' +
      '.inv-line{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}' +
      '.inv-line.total{border-top:2px solid #000;font-weight:bold;font-size:15px;padding-top:6px;margin-top:4px}' +
      '</style></head><body>' + content + '<script>window.print();window.close();<\/script></body></html>');
    w.document.close();
  }

  function approve(orderId) {
    const user = Auth.getUser();
    const defaultLoc = Store.getDefaultLocation(Auth.ownerId());
    Store.updateOrderStatus(orderId, 'approved', defaultLoc ? defaultLoc.id : null);
    App.showToast('Order approved', 'success');
    render();
    Dashboard.refresh();
  }

  function ship(orderId) {
    Store.updateOrderStatus(orderId, 'shipped');
    App.showToast('Order marked as shipped', 'success');
    render();
  }

  function deliver(orderId) {
    const order = Store.getOrderById(orderId);
    if (!order.fulfillmentLocationId) {
      const user = Auth.getUser();
      const defaultLoc = Store.getDefaultLocation(Auth.ownerId());
      if (defaultLoc) Store.updateOrderStatus(orderId, 'delivered', defaultLoc.id);
      else { App.showToast('No fulfillment location set', 'error'); return; }
    } else {
      Store.updateOrderStatus(orderId, 'delivered');
    }

    const updated = Store.getOrderById(orderId);
    const seller = Store.getUserById(updated.sellerId);
    const buyer = Store.getUserById(updated.buyerId);
    if (seller && buyer) {
      Store.addKhataEntry({
        ownerId: updated.sellerId,
        partyId: updated.buyerId,
        partyName: buyer.name || buyer.shopName,
        type: 'credit',
        amount: updated.total,
        description: updated.orderNumber + ' delivered, payment pending',
        orderId: updated.id,
      });
    }

    App.showToast('Order delivered! Inventory & Khata updated.', 'success');
    render();
    Inventory.render();
    Dashboard.refresh();
  }

  function cancel(orderId) {
    Store.updateOrderStatus(orderId, 'cancelled');
    App.showToast('Order cancelled', 'success');
    render();
    Dashboard.refresh();
  }

  // ---- Custom order detail (field sale / manual purchase) ----
  function _viewCustomDetail(order) {
    const isField = order.kind === 'field_sale';
    const party = isField ? Store.getPartyById(order.customerPartyId) : Store.getPartyById(order.sellerPartyId);
    const loc = order.fulfillmentLocationId ? Store.getLocationById(order.fulfillmentLocationId) : null;
    let subtotal = 0;
    const itemRows = order.items.map(i => {
      const lt = i.qty * i.unitPrice; subtotal += lt;
      return '<tr><td>' + _esc(i.name) + '</td><td>' + _esc(i.sku || '-') + '</td><td>' + i.qty + '</td><td>\u20B9' + i.unitPrice.toFixed(2) + '</td><td><strong>\u20B9' + lt.toFixed(2) + '</strong></td></tr>';
    }).join('');

    document.getElementById('order-detail-title').textContent = order.orderNumber;
    document.getElementById('order-detail-body').innerHTML =
      '<div class="order-detail-grid">' +
      '<div class="detail-item"><div class="detail-label">' + (isField ? 'Customer' : 'Seller') + '</div><strong>' + _esc(party ? party.name : '—') + '</strong>' + (party && party.location ? '<div style="font-size:.75rem;color:var(--text-secondary)">' + _esc(party.location) + '</div>' : '') + '</div>' +
      '<div class="detail-item"><div class="detail-label">Type</div>' + (isField ? 'Field Sale' : 'Manual Purchase') + '</div>' +
      '<div class="detail-item"><div class="detail-label">Date</div>' + new Date(order.createdAt).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' +
      '<div class="detail-item"><div class="detail-label">Status</div><span class="order-status ' + order.status + '">' + _capitalize(order.status) + '</span></div>' +
      '<div class="detail-item"><div class="detail-label">Location</div>' + (loc ? _esc(loc.name) : '<em style="color:var(--text-light)">Not assigned</em>') + '</div>' +
      '<div class="detail-item"><div class="detail-label">Payment</div>' + _capitalize(order.paymentStatus || 'unpaid') + ' (\u20B9' + (order.amountPaid || 0).toFixed(2) + ' / \u20B9' + order.total.toFixed(2) + ')</div>' +
      '</div>' +
      '<table class="data-table order-items-table"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>' + itemRows + '</tbody>' +
      '<tfoot><tr><td colspan="4" style="text-align:right;font-weight:700">Total</td><td><strong>\u20B9' + subtotal.toFixed(2) + '</strong></td></tr></tfoot></table>';

    document.getElementById('order-detail-footer').innerHTML = '<button class="btn btn-secondary modal-close">Close</button>';
    document.querySelectorAll('#order-detail-footer .modal-close').forEach(b =>
      b.addEventListener('click', () => document.getElementById('order-detail-modal').classList.add('hidden')));
    document.getElementById('order-detail-modal').classList.remove('hidden');
  }

  // ---- Field-sale workflow (office / owner) ----
  function acceptFieldSale(orderId) { Store.acceptOrder(orderId); App.showToast('Order accepted', 'success'); render(); }
  function cancelCustom(orderId) { Store.cancelOrder(orderId); App.showToast('Order cancelled', 'success'); render(); Dashboard.refresh(); }
  function settle(orderId) { Store.settleOrder(orderId); App.showToast('Marked as paid', 'success'); render(); }

  function openDeliver(orderId) {
    const order = Store.getOrderById(orderId);
    if (!order) return;
    document.getElementById('fulfill-order-id').value = orderId;
    document.getElementById('fulfill-title').textContent = 'Deliver ' + order.orderNumber;
    document.getElementById('fulfill-summary').textContent = 'Order total \u20B9' + order.total.toFixed(2) + '. Enter the amount received now; any balance is recorded in Khata.';
    const locSel = document.getElementById('fulfill-location');
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    locSel.innerHTML = locs.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('');
    document.getElementById('fulfill-amount').value = order.total.toFixed(2);
    document.getElementById('fulfill-modal').classList.remove('hidden');
  }

  function _confirmDeliver() {
    const orderId = document.getElementById('fulfill-order-id').value;
    const amount = parseFloat(document.getElementById('fulfill-amount').value) || 0;
    const locId = document.getElementById('fulfill-location').value;
    const res = Store.fulfillFieldSale(orderId, amount, locId);
    document.getElementById('fulfill-modal').classList.add('hidden');
    if (res.success) {
      App.showToast('Order delivered. Stock & Khata updated.', 'success');
      render();
      if (window.Inventory) Inventory.render();
      Dashboard.refresh();
    } else {
      App.showToast(res.message || 'Could not deliver order', 'error');
    }
  }

  // ---- Manual purchase (off-platform seller) ----
  function openManualPurchase() {
    mpItems = [];
    const sellerSel = document.getElementById('mp-seller');
    const sellers = Store.getPartiesByType(Auth.ownerId(), 'seller');
    sellerSel.innerHTML = '<option value="">-- Select seller --</option>' + sellers.map(s => '<option value="' + s.id + '">' + _esc(s.name) + '</option>').join('');
    const locSel = document.getElementById('mp-location');
    const locs = Store.getLocationsByOwner(Auth.ownerId());
    locSel.innerHTML = locs.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('');
    const prodSel = document.getElementById('mp-product');
    const prods = Store.getProductsByOwner(Auth.ownerId());
    prodSel.innerHTML = '<option value="">-- Select --</option>' + prods.map(p => '<option value="' + p.id + '">' + _esc(p.name) + '</option>').join('');
    document.getElementById('mp-cost').value = 0;
    document.getElementById('mp-qty').value = 1;
    document.getElementById('mp-paid').value = 0;
    _renderMpItems();
    document.getElementById('manual-purchase-modal').classList.remove('hidden');
  }

  function _mpAddItem() {
    const id = document.getElementById('mp-product').value;
    if (!id) { App.showToast('Select a product', 'warning'); return; }
    const p = Store.getProductById(id);
    if (!p) return;
    const cost = parseFloat(document.getElementById('mp-cost').value) || 0;
    const qty = Math.max(1, parseInt(document.getElementById('mp-qty').value, 10) || 1);
    mpItems.push({ productId: id, name: p.name, sku: p.sku || '', qty, unitPrice: cost });
    document.getElementById('mp-qty').value = 1;
    _renderMpItems();
  }

  function _renderMpItems() {
    const tbody = document.getElementById('mp-items-body');
    tbody.innerHTML = mpItems.map((i, idx) => '<tr>' +
      '<td>' + _esc(i.name) + '</td><td>\u20B9' + i.unitPrice.toFixed(2) + '</td><td>' + i.qty + '</td>' +
      '<td>\u20B9' + (i.unitPrice * i.qty).toFixed(2) + '</td>' +
      '<td><button class="btn-icon delete" data-del="' + idx + '"><i class="fas fa-xmark"></i></button></td></tr>').join('');
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => {
      mpItems.splice(+e.currentTarget.dataset.del, 1);
      _renderMpItems();
    }));
    const total = mpItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    document.getElementById('mp-total').textContent = '\u20B9' + total.toFixed(2);
  }

  function _mpSubmit() {
    const sellerId = document.getElementById('mp-seller').value;
    const locId = document.getElementById('mp-location').value;
    if (!sellerId) { App.showToast('Select a seller', 'warning'); return; }
    if (!locId) { App.showToast('Select a location', 'warning'); return; }
    if (mpItems.length === 0) { App.showToast('Add at least one product', 'warning'); return; }
    const paid = parseFloat(document.getElementById('mp-paid').value) || 0;
    const order = Store.createManualPurchase(Auth.ownerId(), sellerId, mpItems.map(i => ({ ...i })), locId);
    Store.receiveManualPurchase(order.id, paid, locId);
    document.getElementById('manual-purchase-modal').classList.add('hidden');
    App.showToast('Purchase recorded. Stock & Khata updated.', 'success');
    activeTab = 'purchase';
    render();
    if (window.Inventory) Inventory.render();
    Dashboard.refresh();
  }

  function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return {
    init, render, viewDetail, approve, ship, deliver, cancel, showInvoice,
    acceptFieldSale, cancelCustom, settle, openDeliver, openManualPurchase,
  };
})();
