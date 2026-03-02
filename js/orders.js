const Orders = (() => {
  let activeTab = 'sales';

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
  }

  function render() {
    const user = Auth.getUser();
    const orders = activeTab === 'sales' ? Store.getSalesOrders(user.id) : Store.getPurchaseOrders(user.id);
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
      const party = activeTab === 'sales' ? Store.getUserById(o.buyerId) : Store.getUserById(o.sellerId);
      const partyName = party ? party.name || party.shopName : 'Unknown';
      const itemCount = o.items.reduce((s, i) => s + i.qty, 0);
      const date = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      let actionBtns = `<button class="btn btn-sm btn-secondary" onclick="Orders.viewDetail('${o.id}')"><i class="fas fa-eye"></i></button>`;
      if (activeTab === 'sales') {
        if (o.status === 'pending') actionBtns += ` <button class="btn btn-sm btn-success" onclick="Orders.approve('${o.id}')">Approve</button>`;
        if (o.status === 'approved') actionBtns += ` <button class="btn btn-sm btn-warning" onclick="Orders.ship('${o.id}')">Ship</button>`;
        if (o.status === 'shipped') actionBtns += ` <button class="btn btn-sm btn-primary" onclick="Orders.deliver('${o.id}')">Deliver</button>`;
        if (o.status === 'pending' || o.status === 'approved') actionBtns += ` <button class="btn btn-sm btn-danger" onclick="Orders.cancel('${o.id}')">Cancel</button>`;
      }

      return `<tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${date}</td>
        <td>${_esc(partyName)}</td>
        <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
        <td><strong>₹${o.total.toFixed(2)}</strong></td>
        <td><span class="order-status ${o.status}">${_capitalize(o.status)}</span></td>
        <td><div class="action-btns">${actionBtns}</div></td>
      </tr>`;
    }).join('');
  }

  function viewDetail(orderId) {
    const order = Store.getOrderById(orderId);
    if (!order) return;
    const user = Auth.getUser();
    const isSeller = order.sellerId === user.id;
    const buyer = Store.getUserById(order.buyerId);
    const seller = Store.getUserById(order.sellerId);
    const loc = order.fulfillmentLocationId ? Store.getLocationById(order.fulfillmentLocationId) : null;

    const statuses = ['pending', 'approved', 'shipped', 'delivered'];
    const currentIdx = statuses.indexOf(order.status);
    const isCancelled = order.status === 'cancelled';

    const timeline = isCancelled
      ? '<div style="text-align:center;padding:.5rem"><span class="order-status cancelled">Cancelled</span></div>'
      : `<div class="order-timeline">${statuses.map((s, i) => {
          let cls = '';
          if (i < currentIdx) cls = 'done';
          else if (i === currentIdx) cls = 'active';
          return `<div class="timeline-step ${cls}">
            <div class="step-dot"><i class="fas fa-${i < currentIdx ? 'check' : i === 0 ? 'clock' : i === 1 ? 'thumbs-up' : i === 2 ? 'truck' : 'circle-check'}"></i></div>
            <span class="step-label">${s}</span>
          </div>`;
        }).join('')}</div>`;

    document.getElementById('order-detail-title').textContent = order.orderNumber;
    document.getElementById('order-detail-body').innerHTML = `
      <div class="order-detail-grid">
        <div class="detail-item"><div class="detail-label">Buyer</div><strong>${_esc(buyer ? buyer.name : 'Unknown')}</strong></div>
        <div class="detail-item"><div class="detail-label">Seller</div><strong>${_esc(seller ? seller.name : 'Unknown')}</strong></div>
        <div class="detail-item"><div class="detail-label">Date</div>${new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div class="detail-item"><div class="detail-label">Fulfillment Location</div>${loc ? _esc(loc.name) : '<em style="color:var(--text-light)">Not assigned</em>'}</div>
      </div>
      ${timeline}
      <table class="data-table order-items-table"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
      <tbody>${order.items.map(i => `<tr><td>${_esc(i.name)}</td><td>${_esc(i.sku || '-')}</td><td>${i.qty}</td><td>₹${i.unitPrice.toFixed(2)}</td><td><strong>₹${(i.qty * i.unitPrice).toFixed(2)}</strong></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600">Total</td><td><strong>₹${order.total.toFixed(2)}</strong></td></tr></tfoot></table>`;

    let footerHtml = '<button class="btn btn-secondary modal-close">Close</button>';
    if (isSeller && order.status === 'pending') footerHtml = `<button class="btn btn-danger" onclick="Orders.cancel('${order.id}');document.getElementById('order-detail-modal').classList.add('hidden')">Cancel</button><button class="btn btn-success" onclick="Orders.approve('${order.id}');document.getElementById('order-detail-modal').classList.add('hidden')">Approve</button>` + footerHtml;
    if (isSeller && order.status === 'approved') footerHtml = `<button class="btn btn-warning" onclick="Orders.ship('${order.id}');document.getElementById('order-detail-modal').classList.add('hidden')">Mark Shipped</button>` + footerHtml;
    if (isSeller && order.status === 'shipped') footerHtml = `<button class="btn btn-primary" onclick="Orders.deliver('${order.id}');document.getElementById('order-detail-modal').classList.add('hidden')">Mark Delivered</button>` + footerHtml;
    document.getElementById('order-detail-footer').innerHTML = footerHtml;

    document.querySelectorAll('#order-detail-footer .modal-close').forEach(b => {
      b.addEventListener('click', () => document.getElementById('order-detail-modal').classList.add('hidden'));
    });

    document.getElementById('order-detail-modal').classList.remove('hidden');
  }

  function approve(orderId) {
    const user = Auth.getUser();
    const defaultLoc = Store.getDefaultLocation(user.id);
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
      const defaultLoc = Store.getDefaultLocation(user.id);
      if (defaultLoc) Store.updateOrderStatus(orderId, 'delivered', defaultLoc.id);
      else { App.showToast('No fulfillment location set', 'error'); return; }
    } else {
      Store.updateOrderStatus(orderId, 'delivered');
    }
    App.showToast('Order delivered! Inventory updated.', 'success');
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

  function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, render, viewDetail, approve, ship, deliver, cancel };
})();
