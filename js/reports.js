const Reports = (() => {
  let charts = {};

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  let activePane = 'overview';

  function init() {
    document.getElementById('report-range').addEventListener('change', render);
    const tabs = document.getElementById('report-tabs');
    if (tabs) tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-report]');
      if (!btn) return;
      _showPane(btn.dataset.report);
    });
  }

  function _showPane(name) {
    activePane = name || 'overview';
    document.querySelectorAll('#report-tabs [data-report]').forEach(t => t.classList.toggle('active', t.dataset.report === activePane));
    document.querySelectorAll('[data-report-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.reportPane !== activePane));
    Object.keys(charts).forEach(k => { try { if (charts[k] && charts[k].resize) charts[k].resize(); } catch (e) { /* hidden canvas */ } });
  }

  function refresh() { render(); }

  function _isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  function _gridColor() { return _isDark() ? 'rgba(148,163,184,.15)' : 'rgba(0,0,0,.06)'; }
  function _textColor() { return _isDark() ? '#94a3b8' : '#64748b'; }

  function _destroyCharts() {
    Object.values(charts).forEach(c => { if (c) c.destroy(); });
    charts = {};
  }

  async function render() {
    const user = Auth.getUser();
    const days = parseInt(document.getElementById('report-range').value) || 30;
    const startDate = new Date(Date.now() - days * 86400000);
    if (Store.ensurePosSales) {
      try { await Store.ensurePosSales(Auth.ownerId(), days); } catch (e) { /* chart the sales already cached */ }
    }

    _destroyCharts();
    _renderStats(user, startDate);
    _renderRevenueChart(user, startDate, days);
    _renderTopProducts(user, startDate);
    _renderStockValuation(user);
    _renderPnL(user, startDate);
    _renderExpiringStock(user);
    _renderSlowMovers(user, startDate);
    _renderPurchases(user, startDate);
    _renderGst(user, startDate);
    _showPane(activePane);
  }

  function _renderStats(user, startDate) {
    const data = Store.getRevenueData(Auth.ownerId(), startDate.toISOString());
    const container = document.getElementById('report-stats');
    container.innerHTML =
      '<div class="stat-card"><div class="stat-icon green"><i class="fas fa-indian-rupee-sign"></i></div><div class="stat-info"><span class="stat-value">₹' + data.totalRevenue.toFixed(0) + '</span><span class="stat-label">Revenue</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-coins"></i></div><div class="stat-info"><span class="stat-value">₹' + data.totalCost.toFixed(0) + '</span><span class="stat-label">Cost</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon purple"><i class="fas fa-chart-line"></i></div><div class="stat-info"><span class="stat-value">₹' + data.totalProfit.toFixed(0) + '</span><span class="stat-label">Profit</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon red"><i class="fas fa-percent"></i></div><div class="stat-info"><span class="stat-value">' + (data.totalRevenue > 0 ? (data.totalProfit / data.totalRevenue * 100).toFixed(1) : '0') + '%</span><span class="stat-label">Margin</span></div></div>';
  }

  function _renderRevenueChart(user, startDate, days) {
    const sales = Store.getPosSales(Auth.ownerId()).filter(s => new Date(s.createdAt) >= startDate);
    const orders = Store.getSalesOrders(Auth.ownerId()).filter(o => o.status === 'delivered' && new Date(o.updatedAt) >= startDate);
    const buckets = {};
    const fmt = days <= 30 ? 'day' : 'week';

    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      const key = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      buckets[key] = { revenue: 0, cost: 0 };
    }

    sales.forEach(s => {
      const key = new Date(s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (buckets[key]) {
        buckets[key].revenue += s.subtotal || 0;
        s.items.forEach(i => { buckets[key].cost += (i.costPrice || 0) * i.qty; });
      }
    });

    orders.forEach(o => {
      const key = new Date(o.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (buckets[key]) {
        buckets[key].revenue += o.total || 0;
        o.items.forEach(i => { const p = Store.getProductById(i.productId); buckets[key].cost += (p ? p.costPrice || 0 : 0) * i.qty; });
      }
    });

    const labels = Object.keys(buckets);
    const revenueData = labels.map(k => buckets[k].revenue);
    const profitData = labels.map(k => buckets[k].revenue - buckets[k].cost);
    const step = Math.max(1, Math.floor(labels.length / 10));
    const displayLabels = labels.map((l, i) => i % step === 0 ? l : '');

    const ctx = document.getElementById('chart-report-revenue');
    charts.revenue = new Chart(ctx, {
      type: 'line',
      data: {
        labels: displayLabels,
        datasets: [
          { label: 'Revenue', data: revenueData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.1)', fill: true, tension: .3 },
          { label: 'Profit', data: profitData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', fill: true, tension: .3 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: _gridColor() }, ticks: { color: _textColor() } }, x: { grid: { display: false }, ticks: { color: _textColor(), maxRotation: 0 } } }, plugins: { legend: { labels: { color: _textColor() } } } }
    });
  }

  function _renderTopProducts(user, startDate) {
    const sales = Store.getPosSales(Auth.ownerId()).filter(s => new Date(s.createdAt) >= startDate);
    const productRevenue = {};
    sales.forEach(s => s.items.forEach(i => {
      productRevenue[i.name] = (productRevenue[i.name] || 0) + i.price * i.qty;
    }));
    const delivered = Store.getSalesOrders(Auth.ownerId()).filter(o => o.status === 'delivered' && new Date(o.updatedAt) >= startDate);
    delivered.forEach(o => o.items.forEach(i => {
      productRevenue[i.name] = (productRevenue[i.name] || 0) + i.unitPrice * i.qty;
    }));

    const sorted = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(s => s[0]);
    const data = sorted.map(s => s[1]);

    const ctx = document.getElementById('chart-top-products');
    charts.topProducts = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Revenue (₹)', data, backgroundColor: '#818cf8', borderRadius: 4 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, grid: { color: _gridColor() }, ticks: { color: _textColor() } }, y: { grid: { display: false }, ticks: { color: _textColor() } } }, plugins: { legend: { display: false } } }
    });
  }

  function _renderStockValuation(user) {
    const prods = Store.getProductsByOwner(Auth.ownerId());
    const catValues = {};
    prods.forEach(p => {
      const cat = Store.getCategoryById(p.categoryId);
      const catName = cat ? cat.name : 'Uncategorized';
      catValues[catName] = (catValues[catName] || 0) + Store.getProductStockValue(p.id);
    });

    const labels = Object.keys(catValues);
    const data = Object.values(catValues);
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#f97316'];

    const ctx = document.getElementById('chart-stock-val');
    charts.stockVal = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderColor: _isDark() ? '#1e293b' : '#fff', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: _textColor(), padding: 12 } } } }
    });
  }

  function _renderPnL(user, startDate) {
    const data = Store.getRevenueData(Auth.ownerId(), startDate.toISOString());
    const ctx = document.getElementById('chart-pnl');
    charts.pnl = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['POS Sales', 'B2B Orders', 'Total'],
        datasets: [
          { label: 'Revenue', data: [data.posRevenue, data.orderRevenue, data.totalRevenue], backgroundColor: '#6366f1', borderRadius: 4 },
          { label: 'Cost', data: [data.posCost, data.orderCost, data.totalCost], backgroundColor: '#f87171', borderRadius: 4 },
          { label: 'Profit', data: [data.posRevenue - data.posCost, data.orderRevenue - data.orderCost, data.totalProfit], backgroundColor: '#4ade80', borderRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: _gridColor() }, ticks: { color: _textColor() } }, x: { grid: { display: false }, ticks: { color: _textColor() } } }, plugins: { legend: { labels: { color: _textColor() } } } }
    });
  }

  function _renderExpiringStock(user) {
    const warn = (typeof Settings !== 'undefined') ? Settings.expiryDays() : 90;
    const expiring = Store.getExpiringStock(Auth.ownerId(), warn);
    const tbody = document.getElementById('expiry-table-body');
    const empty = document.getElementById('no-expiry');

    if (expiring.length === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    tbody.innerHTML = expiring.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).map(s => {
      const prod = Store.getProductById(s.productId);
      const loc = Store.getLocationById(s.locationId);
      const daysLeft = Math.ceil((new Date(s.expiryDate) - new Date()) / 86400000);
      const color = daysLeft <= 0 ? 'var(--danger)' : daysLeft <= 30 ? 'var(--warning)' : 'var(--text)';
      const badge = daysLeft <= 0 ? '<span class="badge badge-danger">Expired</span>' : daysLeft <= 30 ? '<span class="badge badge-warning">' + daysLeft + 'd</span>' : '<span class="badge badge-info">' + daysLeft + 'd</span>';
      return '<tr><td>' + (prod ? _esc(prod.name) : '?') + '</td><td>' + (loc ? _esc(loc.name) : '?') + '</td><td><code style="font-size:.75rem">' + _esc(s.batchNumber || '—') + '</code></td><td>' + s.qty + '</td><td>' + new Date(s.expiryDate).toLocaleDateString('en-IN') + '</td><td style="color:' + color + ';font-weight:600">' + badge + '</td></tr>';
    }).join('');
  }

  function _renderSlowMovers(user, startDate) {
    const sales = Store.getPosSales(Auth.ownerId()).filter(s => new Date(s.createdAt) >= startDate);
    const orders = Store.getSalesOrders(Auth.ownerId()).filter(o => o.status === 'delivered' && new Date(o.updatedAt) >= startDate);
    const soldIds = new Set();
    sales.forEach(s => s.items.forEach(i => soldIds.add(i.productId)));
    orders.forEach(o => o.items.forEach(i => soldIds.add(i.productId)));

    const prods = Store.getProductsByOwner(Auth.ownerId());
    const slow = prods.filter(p => !soldIds.has(p.id) && Store.getTotalStockForProduct(p.id) > 0);
    const tbody = document.getElementById('slow-mover-body');
    const empty = document.getElementById('no-slow-movers');

    if (slow.length === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    tbody.innerHTML = slow.map(p => {
      const stock = Store.getTotalStockForProduct(p.id);
      return '<tr><td><strong>' + _esc(p.name) + '</strong></td><td><code style="font-size:.75rem">' + _esc(p.sku) + '</code></td><td>' + stock + '</td><td>₹' + (stock * (p.costPrice || 0)).toFixed(2) + '</td></tr>';
    }).join('');
  }

  function _renderPurchases(user, startDate) {
    const tbody = document.getElementById('report-purchases-body');
    const totalEl = document.getElementById('report-purchases-total');
    if (!tbody) return;
    const rows = [];
    Store.getPurchaseOrders(Auth.ownerId()).forEach(o => {
      if (new Date(o.createdAt) < startDate) return;
      rows.push({ when: o.createdAt, what: o.orderNumber || 'Purchase', who: (o.sellerPartyId && (Store.getPartyById(o.sellerPartyId) || {}).name) || 'Supplier', total: o.total || 0 });
    });
    Store.getBatches(Auth.ownerId()).forEach(b => {
      if (!Store.isManualStockEntry(b)) return;
      const when = b.createdAt || b.purchaseDate;
      if (new Date(when) < startDate) return;
      const prod = Store.getProductById(b.productId);
      const qty = b.origQty != null ? b.origQty : b.qty;
      rows.push({ when: when, what: (prod ? prod.name : 'Batch') + (b.batchNumber ? ' · ' + b.batchNumber : ''), who: 'Stock entry', total: (Number(qty) || 0) * (Number(b.unitCost) || 0) });
    });
    rows.sort((a, b) => new Date(b.when) - new Date(a.when));
    const sum = rows.reduce((s, r) => s + r.total, 0);
    if (totalEl) totalEl.textContent = '\u20B9' + sum.toFixed(0);
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1.2rem">No purchases in this period</td></tr>'; return; }
    tbody.innerHTML = rows.slice(0, 40).map(r => '<tr><td>' + new Date(r.when).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + '</td><td>' + _esc(r.what) + '</td><td>' + _esc(r.who) + '</td><td><strong>\u20B9' + r.total.toFixed(2) + '</strong></td></tr>').join('');
  }

  function _renderGst(user, startDate) {
    const box = document.getElementById('report-gst');
    if (!box) return;
    let posBase = 0, posGst = 0, b2bBase = 0, b2bGst = 0;
    Store.getPosSales(Auth.ownerId()).forEach(s => {
      if (new Date(s.createdAt) < startDate) return;
      (s.items || []).forEach(i => {
        const line = (Number(i.qty) || 0) * (Number(i.price) || 0);
        posBase += line;
        posGst += line * ((Number(i.gstRate) || 0) / 100);
      });
    });
    Store.getSalesOrders(Auth.ownerId()).forEach(o => {
      if (o.status !== 'delivered') return;
      if (new Date(o.updatedAt || o.createdAt) < startDate) return;
      (o.items || []).forEach(i => {
        const prod = Store.getProductById(i.productId);
        const line = (Number(i.qty) || 0) * (Number(i.unitPrice) || 0);
        b2bBase += line;
        b2bGst += line * (((prod && prod.gstRate) || 0) / 100);
      });
    });
    const gst = posGst + b2bGst;
    box.innerHTML =
      '<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-receipt"></i></div><div class="stat-info"><span class="stat-value">\u20B9' + (posBase + b2bBase).toFixed(0) + '</span><span class="stat-label">Taxable sales</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon purple"><i class="fas fa-percent"></i></div><div class="stat-info"><span class="stat-value">\u20B9' + gst.toFixed(0) + '</span><span class="stat-label">GST collected</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon green"><i class="fas fa-cash-register"></i></div><div class="stat-info"><span class="stat-value">\u20B9' + posGst.toFixed(0) + '</span><span class="stat-label">POS GST</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon red"><i class="fas fa-store"></i></div><div class="stat-info"><span class="stat-value">\u20B9' + b2bGst.toFixed(0) + '</span><span class="stat-label">B2B GST</span></div></div>' +
      '<p class="form-hint">CGST and SGST are each half of GST collected (\u20B9' + (gst / 2).toFixed(2) + '). This is a working summary from recorded sales, for the period selected above.</p>';
  }

  return { init, render, refresh };
})();
