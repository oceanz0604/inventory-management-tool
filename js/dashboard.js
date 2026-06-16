const Dashboard = (() => {
  const charts = {};
  let bound = false;

  // Quick actions offered on the hero — only those the current role can reach
  // (i.e. the matching sidebar nav item exists) are shown.
  const QUICK = [
    { view: 'pos', label: 'New Sale', icon: 'fa-cash-register' },
    { view: 'field-order', label: 'New Order', icon: 'fa-cart-plus' },
    { view: 'orders', label: 'Orders', icon: 'fa-file-invoice-dollar' },
    { view: 'products', label: 'Add Product', icon: 'fa-box' },
    { view: 'inventory', label: 'Add Stock', icon: 'fa-layer-group' },
    { view: 'reports', label: 'Reports', icon: 'fa-chart-line' },
  ];

  function init() { _bindClicks(); refresh(); }

  function _bindClicks() {
    if (bound) return;
    bound = true;
    const view = document.getElementById('view-dashboard');
    if (!view) return;
    view.addEventListener('click', (e) => {
      const el = e.target.closest('[data-go]');
      if (el && typeof App !== 'undefined' && App.goTo) { e.preventDefault(); App.goTo(el.dataset.go); }
    });
  }

  function refresh() {
    _renderHero();
    _renderQuick();
    _updateStats();
    _renderCharts();
    _renderTopProducts();
    _renderActivity();
    _renderLowStockTable();
    _updateNotifications();
  }

  // ---------- helpers ----------
  function _inr(n) { return '\u20B9' + Math.round(n || 0).toLocaleString('en-IN'); }
  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function _hasView(v) { return !!document.querySelector('.sidebar .nav-item[data-view="' + v + '"]'); }
  function _ago(iso) {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  // ---------- hero ----------
  function _renderHero() {
    const user = Auth.getUser() || {};
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const name = (user.name || user.username || '').split(' ')[0];
    const greet = document.getElementById('dash-greeting');
    if (greet) greet.textContent = part + (name ? ', ' + name : '');
    const date = document.getElementById('dash-date');
    if (date) date.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function _renderQuick() {
    const wrap = document.getElementById('dash-quick');
    if (!wrap) return;
    const items = QUICK.filter(q => _hasView(q.view));
    wrap.innerHTML = items.map(q =>
      '<button class="quick-action" data-go="' + q.view + '"><i class="fas ' + q.icon + '"></i><span>' + q.label + '</span></button>'
    ).join('');
  }

  // ---------- stats ----------
  function _updateStats() {
    const owner = Auth.ownerId();
    const products = Store.getProductsByOwner(owner);
    const stock = Store.getStockByOwner(owner);
    const lowStock = Store.getLowStockItems(owner);
    const salesOrders = Store.getSalesOrders(owner);
    const purchaseOrders = Store.getPurchaseOrders(owner);
    const pendingCount = salesOrders.filter(o => o.status === 'pending').length + purchaseOrders.filter(o => o.status === 'pending').length;
    const totalStock = stock.reduce((s, e) => s + e.quantity, 0);
    const stockValue = products.reduce((s, p) => s + (Store.getProductStockValue ? Store.getProductStockValue(p.id) : 0), 0);

    // Sales today = POS sales + sales orders delivered today
    const today = new Date().toDateString();
    const posToday = Store.getPosSalesToday ? Store.getPosSalesToday(owner) : [];
    const ordersToday = salesOrders.filter(o => o.status === 'delivered' && new Date(o.updatedAt || o.createdAt).toDateString() === today);
    const salesToday = posToday.reduce((s, x) => s + (x.total || 0), 0) + ordersToday.reduce((s, x) => s + (x.total || 0), 0);
    const salesCount = posToday.length + ordersToday.length;

    _set('stat-total-products', products.length);
    _set('stat-stock-value', _inr(stockValue));
    _set('stat-sales-today', _inr(salesToday));
    _set('stat-sales-today-sub', salesCount + (salesCount === 1 ? ' sale today' : ' sales today'));
    _set('stat-pending-orders', pendingCount);
    _set('stat-total-stock', totalStock.toLocaleString('en-IN'));
    _set('stat-low-stock', lowStock.length);
  }
  function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  // ---------- charts ----------
  function _renderCharts() {
    const owner = Auth.ownerId();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const grid = isDark ? 'rgba(255,255,255,.06)' : 'rgba(17,20,28,.06)';
    const tick = isDark ? '#9aa0ac' : '#5b626f';
    const accent = isDark ? '#fbbf24' : '#f59e0b';

    // Revenue, last 7 days (POS + delivered sales orders)
    _renderRevenue(owner, { grid, tick, accent });
    _renderLocation(owner, { isDark, tick });
  }

  function _renderRevenue(owner, c) {
    const labels = [], data = [];
    const posSales = Store.getPosSales(owner);
    const delivered = Store.getSalesOrders(owner).filter(o => o.status === 'delivered');
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = d.toDateString();
      labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
      let sum = 0;
      posSales.forEach(s => { if (new Date(s.createdAt).toDateString() === key) sum += s.total || 0; });
      delivered.forEach(o => { if (new Date(o.updatedAt || o.createdAt).toDateString() === key) sum += o.total || 0; });
      data.push(Math.round(sum));
    }
    const total = data.reduce((s, v) => s + v, 0);
    const tag = document.getElementById('rev-7d-total'); if (tag) tag.textContent = _inr(total);

    const ctx = document.getElementById('chart-revenue');
    if (!ctx) return;
    if (charts.revenue) charts.revenue.destroy();
    const g = ctx.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, 'rgba(245,158,11,.32)');
    grad.addColorStop(1, 'rgba(245,158,11,0)');
    charts.revenue = new Chart(g, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Revenue', data, borderColor: c.accent, backgroundColor: grad, fill: true, tension: .38, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: c.accent, pointHoverRadius: 5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => '\u20B9' + it.parsed.y.toLocaleString('en-IN') } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => '\u20B9' + v.toLocaleString('en-IN'), font: { family: 'Inter', size: 11 }, color: c.tick }, grid: { color: c.grid } },
          x: { ticks: { font: { family: 'Inter', size: 11 }, color: c.tick }, grid: { display: false } }
        }
      }
    });
  }

  function _renderLocation(owner, c) {
    const locations = Store.getLocationsByOwner(owner);
    const stock = Store.getStockByOwner(owner);
    const map = {}; locations.forEach(l => { map[l.id] = 0; });
    stock.forEach(s => { if (map[s.locationId] !== undefined) map[s.locationId] += s.quantity; });
    const palette = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#0891b2', '#ec4899', '#f97316'];

    const ctx = document.getElementById('chart-location');
    if (!ctx) return;
    if (charts.location) charts.location.destroy();
    charts.location = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: { labels: locations.map(l => l.name), datasets: [{ data: locations.map(l => map[l.id]), backgroundColor: palette.slice(0, locations.length), borderWidth: 2, borderColor: c.isDark ? '#16181e' : '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { family: 'Inter', size: 12 }, color: c.tick } } }
      }
    });
  }

  // ---------- top products ----------
  function _renderTopProducts() {
    const owner = Auth.ownerId();
    const box = document.getElementById('dash-top-products');
    if (!box) return;
    const products = Store.getProductsByOwner(owner)
      .map(p => ({ p, value: Store.getProductStockValue ? Store.getProductStockValue(p.id) : 0 }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    if (!products.length) {
      box.innerHTML = '<div class="dash-empty"><i class="fas fa-box-open"></i><p>No stock value yet. Add purchase batches to see your top products.</p></div>';
      return;
    }
    const max = products[0].value || 1;
    box.innerHTML = products.map(({ p, value }) => {
      const pct = Math.max(6, Math.round((value / max) * 100));
      return '<div class="top-prod" data-go="inventory">' +
        '<div class="top-prod-head"><span class="top-prod-name">' + _esc(p.name) + '</span><span class="top-prod-val">' + _inr(value) + '</span></div>' +
        '<div class="top-prod-track"><div class="top-prod-fill" style="width:' + pct + '%"></div></div>' +
        '</div>';
    }).join('');
  }

  // ---------- recent activity ----------
  function _renderActivity() {
    const owner = Auth.ownerId();
    const box = document.getElementById('dash-activity');
    if (!box) return;
    const events = [];
    Store.getPosSales(owner).forEach(s => events.push({
      when: s.createdAt, icon: 'fa-cash-register', cls: 'green',
      title: 'POS sale ' + (s.receiptNumber || ''), sub: s.customerName || 'Walk-in', amount: s.total
    }));
    Store.getSalesOrders(owner).forEach(o => events.push({
      when: o.updatedAt || o.createdAt, icon: 'fa-file-invoice-dollar', cls: o.status === 'delivered' ? 'green' : (o.status === 'cancelled' ? 'red' : 'amber'),
      title: 'Order ' + (o.orderNumber || ''), sub: o.status, amount: o.total
    }));
    Store.getPurchaseOrders(owner).forEach(o => events.push({
      when: o.updatedAt || o.createdAt, icon: 'fa-truck', cls: 'blue',
      title: 'Purchase ' + (o.orderNumber || ''), sub: o.status, amount: o.total
    }));
    events.sort((a, b) => new Date(b.when) - new Date(a.when));
    const top = events.slice(0, 7);
    if (!top.length) {
      box.innerHTML = '<div class="dash-empty"><i class="fas fa-clock-rotate-left"></i><p>No recent activity yet.</p></div>';
      return;
    }
    box.innerHTML = top.map(e =>
      '<div class="activity-item">' +
      '<div class="activity-icon ' + e.cls + '"><i class="fas ' + e.icon + '"></i></div>' +
      '<div class="activity-text"><span class="activity-title">' + _esc(e.title) + '</span><span class="activity-sub">' + _esc(e.sub) + ' \u00b7 ' + _ago(e.when) + '</span></div>' +
      '<span class="activity-amount">' + _inr(e.amount) + '</span>' +
      '</div>'
    ).join('');
  }

  // ---------- low stock ----------
  function _renderLowStockTable() {
    const lowItems = Store.getLowStockItems(Auth.ownerId());
    const tbody = document.getElementById('low-stock-table-body');
    const empty = document.getElementById('no-low-stock');
    if (!tbody) return;
    const table = tbody.closest('table');

    if (lowItems.length === 0) {
      table.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    table.classList.remove('hidden');
    empty.classList.add('hidden');

    tbody.innerHTML = lowItems.map(s => {
      const product = Store.getProductById(s.productId);
      const location = Store.getLocationById(s.locationId);
      if (!product || !location) return '';
      const badge = s.quantity === 0 ? '<span class="badge badge-danger">Out of Stock</span>' : '<span class="badge badge-warning">Low Stock</span>';
      return '<tr>' +
        '<td><strong>' + _esc(product.name) + '</strong></td>' +
        '<td><code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.8rem">' + _esc(product.sku) + '</code></td>' +
        '<td>' + _esc(location.name) + '</td>' +
        '<td>' + s.quantity + '</td>' +
        '<td>' + s.minStock + '</td>' +
        '<td>' + badge + '</td>' +
        '</tr>';
    }).join('');
  }

  function _updateNotifications() {
    const lowItems = Store.getLowStockItems(Auth.ownerId());
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');
    if (!list) return;

    if (lowItems.length === 0) {
      if (badge) badge.classList.add('hidden');
      list.innerHTML = '<p style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.85rem">No alerts</p>';
      return;
    }
    if (badge) { badge.classList.remove('hidden'); badge.textContent = lowItems.length; }

    list.innerHTML = lowItems.map(s => {
      const product = Store.getProductById(s.productId);
      const location = Store.getLocationById(s.locationId);
      if (!product || !location) return '';
      const msg = s.quantity === 0
        ? '<strong>' + _esc(product.name) + '</strong> is <strong>out of stock</strong> at ' + _esc(location.name)
        : '<strong>' + _esc(product.name) + '</strong> has only <strong>' + s.quantity + '</strong> left at ' + _esc(location.name) + ' (min: ' + s.minStock + ')';
      return '<div class="notification-item"><div class="notif-icon"><i class="fas fa-triangle-exclamation"></i></div><div class="notif-text">' + msg + '</div></div>';
    }).join('');
  }

  return { init, refresh };
})();
