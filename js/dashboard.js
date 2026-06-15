const Dashboard = (() => {
  let chartLocation = null;
  let chartValue = null;

  function init() { refresh(); }

  function refresh() {
    _updateStats();
    _renderCharts();
    _renderLowStockTable();
    _updateNotifications();
  }

  function _updateStats() {
    const user = Auth.getUser();
    const products = Store.getProductsByOwner(Auth.ownerId());
    const stock = Store.getStockByOwner(Auth.ownerId());
    const lowStock = Store.getLowStockItems(Auth.ownerId());
    const salesOrders = Store.getSalesOrders(Auth.ownerId());
    const purchaseOrders = Store.getPurchaseOrders(Auth.ownerId());
    const pendingCount = salesOrders.filter(o => o.status === 'pending').length + purchaseOrders.filter(o => o.status === 'pending').length;
    const totalStock = stock.reduce((s, e) => s + e.quantity, 0);

    document.getElementById('stat-total-products').textContent = products.length;
    document.getElementById('stat-total-stock').textContent = totalStock.toLocaleString();
    document.getElementById('stat-pending-orders').textContent = pendingCount;
    document.getElementById('stat-low-stock').textContent = lowStock.length;
  }

  function _renderCharts() {
    const user = Auth.getUser();
    const locations = Store.getLocationsByOwner(Auth.ownerId());
    const categories = Store.getCategories();
    const stock = Store.getStockByOwner(Auth.ownerId());
    const products = Store.getProductsByOwner(Auth.ownerId());

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? '#334155' : '#f1f5f9';
    const legendColor = isDark ? '#e2e8f0' : undefined;
    const chartOpts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { family: 'Inter', size: 12 }, color: legendColor } } }
    };

    // Stock by location (doughnut)
    const locStockMap = {};
    locations.forEach(l => { locStockMap[l.id] = 0; });
    stock.forEach(s => { if (locStockMap[s.locationId] !== undefined) locStockMap[s.locationId] += s.quantity; });
    const locLabels = locations.map(l => l.name);
    const locData = locations.map(l => locStockMap[l.id]);
    const locColors = ['#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316'];

    if (chartLocation) chartLocation.destroy();
    const ctx1 = document.getElementById('chart-location');
    if (ctx1) {
      chartLocation = new Chart(ctx1.getContext('2d'), {
        type: 'doughnut',
        data: { labels: locLabels, datasets: [{ data: locData, backgroundColor: locColors.slice(0, locations.length), borderWidth: 2, borderColor: isDark ? '#1e293b' : '#fff' }] },
        options: { ...chartOpts, cutout: '60%' }
      });
    }

    // Value by category (grouped bar: cost vs selling)
    const catCostMap = {};
    const catSellMap = {};
    categories.forEach(c => { catCostMap[c.id] = 0; catSellMap[c.id] = 0; });
    stock.forEach(s => {
      const prod = products.find(p => p.id === s.productId);
      if (prod && catSellMap[prod.categoryId] !== undefined) {
        catSellMap[prod.categoryId] += s.quantity * prod.price;
        catCostMap[prod.categoryId] += s.quantity * (prod.costPrice || 0);
      }
    });
    const catLabels = categories.map(c => c.name);
    const catColors = categories.map(c => c.color);
    const sellData = categories.map(c => Math.round((catSellMap[c.id] || 0) * 100) / 100);
    const costData = categories.map(c => Math.round((catCostMap[c.id] || 0) * 100) / 100);

    if (chartValue) chartValue.destroy();
    const ctx2 = document.getElementById('chart-value');
    if (ctx2) {
      chartValue = new Chart(ctx2.getContext('2d'), {
        type: 'bar',
        data: { labels: catLabels, datasets: [
          { label: 'Cost (₹)', data: costData, backgroundColor: catColors.map(c => c + '55'), borderColor: catColors, borderWidth: 1.5, borderRadius: 6 },
          { label: 'Sell Value (₹)', data: sellData, backgroundColor: catColors.map(c => c + '99'), borderColor: catColors, borderWidth: 1.5, borderRadius: 6 },
        ] },
        options: { ...chartOpts, scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString(), font: { family: 'Inter', size: 11 }, color: legendColor }, grid: { color: gridColor } }, x: { ticks: { font: { family: 'Inter', size: 11 }, color: legendColor }, grid: { display: false } } } }
      });
    }
  }

  function _renderLowStockTable() {
    const user = Auth.getUser();
    const lowItems = Store.getLowStockItems(Auth.ownerId());
    const tbody = document.getElementById('low-stock-table-body');
    const empty = document.getElementById('no-low-stock');
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
      return `<tr>
        <td><strong>${_esc(product.name)}</strong></td>
        <td><code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.8rem">${_esc(product.sku)}</code></td>
        <td>${_esc(location.name)}</td>
        <td>${s.quantity}</td>
        <td>${s.minStock}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');
  }

  function _updateNotifications() {
    const user = Auth.getUser();
    const lowItems = Store.getLowStockItems(Auth.ownerId());
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');

    if (lowItems.length === 0) {
      badge.classList.add('hidden');
      list.innerHTML = '<p style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.85rem">No alerts</p>';
      return;
    }
    badge.classList.remove('hidden');
    badge.textContent = lowItems.length;

    list.innerHTML = lowItems.map(s => {
      const product = Store.getProductById(s.productId);
      const location = Store.getLocationById(s.locationId);
      if (!product || !location) return '';
      const msg = s.quantity === 0
        ? `<strong>${_esc(product.name)}</strong> is <strong>out of stock</strong> at ${_esc(location.name)}`
        : `<strong>${_esc(product.name)}</strong> has only <strong>${s.quantity}</strong> left at ${_esc(location.name)} (min: ${s.minStock})`;
      return `<div class="notification-item"><div class="notif-icon"><i class="fas fa-triangle-exclamation"></i></div><div class="notif-text">${msg}</div></div>`;
    }).join('');
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, refresh };
})();
