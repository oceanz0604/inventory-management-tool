/* ============================================================
   Admin Console for झटपट (ZatPat) IMS  —  super-admin only.
   Separate endpoint (admin.html). Uses Firebase Auth (the single
   super-admin account) and talks to Firestore directly: full CRUD
   over customer companies + cross-tenant analytics.
   ============================================================ */
const Admin = (() => {
  const SUPER = (typeof window !== 'undefined' && window.SUPER_ADMIN_EMAIL ? window.SUPER_ADMIN_EMAIL : '').toLowerCase();
  const WORKER_ROLES = ['office', 'staff', 'marketing'];
  const OWNER_ROLES = ['owner', 'user'];
  const TITLES = { overview: 'Overview', customers: 'Customers', guides: 'User Guides' };

  // Cross-tenant snapshot, loaded once per refresh and reused by every view.
  let DATA = { companies: [], users: [], products: [], orders: [], pos: [], batches: [] };
  const charts = {};
  let deleteTarget = null;

  function $(id) { return document.getElementById(id); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _genId() { return 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function _inr(n) { return '\u20B9' + Math.round(n || 0).toLocaleString('en-IN'); }

  /* ---------------- Boot ---------------- */
  function init() {
    _applyTheme();
    if (!window.Firebase || !Firebase.isEnabled()) {
      _showLogin();
      _err('admin-error', 'Backend unavailable. Check your connection and reload.');
      return;
    }
    $('admin-login-form').addEventListener('submit', _onLogin);
    $('admin-logout').addEventListener('click', _onLogout);
    $('admin-theme').addEventListener('click', _toggleTheme);
    $('admin-refresh').addEventListener('click', () => _loadAll(true));
    $('admin-add').addEventListener('click', _openAdd);
    $('customer-form').addEventListener('submit', _onSubmitCustomer);

    // section navigation (sidebar + bottom nav)
    document.querySelectorAll('#admin-sidebar .nav-item[data-view], #admin-bottom-nav .bnav-item[data-view]')
      .forEach(el => el.addEventListener('click', () => _navigate(el.dataset.view)));

    // generic modal close
    document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => _closeModal(el.dataset.close)));

    // delete confirm gating
    $('delete-confirm').addEventListener('input', _checkDelete);
    $('delete-confirm-btn').addEventListener('click', _confirmDelete);

    // search
    $('cust-search').addEventListener('input', _renderCompanies);

    // delegated actions on the companies table
    $('admin-companies').addEventListener('click', _onTableClick);

    Firebase.onAuth((fb) => { if (fb) _afterAuth(fb); else _showLogin(); });
  }

  /* ---------------- Theme ---------------- */
  function _applyTheme() {
    const dark = localStorage.getItem('ims_theme') === 'dark';
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    _syncThemeIcon();
  }
  function _toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('ims_theme', 'light'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('ims_theme', 'dark'); }
    _syncThemeIcon();
    if ($('admin-app') && !$('admin-app').classList.contains('hidden')) _renderCharts();
  }
  function _syncThemeIcon() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const i = $('admin-theme').querySelector('i');
    if (i) i.className = dark ? 'fas fa-sun' : 'fas fa-moon';
  }

  /* ---------------- Auth ---------------- */
  async function _onLogin(e) {
    e.preventDefault();
    _hide('admin-error');
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Signing in…';
    try { await Firebase.signIn($('admin-email').value.trim(), $('admin-password').value); }
    catch (err) { _err('admin-error', _friendly(err)); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }

  async function _afterAuth(fb) {
    const email = (fb.email || '').toLowerCase();
    if (email !== SUPER) {
      await Firebase.signOut();
      _showLogin();
      _err('admin-error', 'This account is not an administrator.');
      return;
    }
    $('admin-who').textContent = email;
    _showDashboard();
    _navigate('overview');
    _loadAll();
  }

  async function _onLogout() {
    try { await Firebase.signOut(); } catch (e) { /* ignore */ }
    _showLogin();
    $('admin-login-form').reset();
  }

  /* ---------------- Navigation ---------------- */
  function _navigate(view) {
    if (!TITLES[view]) view = 'overview';
    document.querySelectorAll('#admin-app .view').forEach(s => s.classList.add('hidden'));
    const sec = $('av-' + view); if (sec) sec.classList.remove('hidden');
    $('admin-title').textContent = TITLES[view];
    document.querySelectorAll('#admin-sidebar .nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    document.querySelectorAll('#admin-bottom-nav .bnav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  }

  /* ---------------- Data load ---------------- */
  async function _loadAll(manual) {
    try {
      const [companies, users, products, orders, pos, batches] = await Promise.all([
        Firebase.list('companies'), Firebase.list('users'), Firebase.list('products'),
        Firebase.list('orders'), Firebase.list('pos_sales'), Firebase.list('batches'),
      ]);
      DATA = { companies, users, products, orders, pos, batches };
    } catch (e) { _toast('Could not load data: ' + (e && e.message), 'error'); return; }
    _renderStats();
    _renderCharts();
    _renderCompanies();
    if (manual) _toast('Refreshed', 'success');
  }

  // Aggregate a per-company picture used by tables, details and charts.
  function _companyInfo(c) {
    const owner = DATA.users.find(u => u.id === c.ownerId) || DATA.users.find(u => u.companyId === c.id && OWNER_ROLES.indexOf(u.role) >= 0) || {};
    const team = DATA.users.filter(u => u.companyId === c.id && WORKER_ROLES.indexOf(u.role) >= 0);
    const products = DATA.products.filter(p => p.ownerId === c.id);
    const orders = DATA.orders.filter(o => o.sellerId === c.id || o.buyerId === c.id);
    const pos = DATA.pos.filter(s => s.ownerId === c.id);
    const stockValue = DATA.batches.filter(b => b.ownerId === c.id).reduce((s, b) => s + Math.max(0, b.qty || 0) * (b.unitCost || 0), 0);
    const revenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.total || 0), 0) + pos.reduce((s, o) => s + (o.total || 0), 0);
    return { owner, team, products, orders, pos, stockValue, revenue };
  }

  /* ---------------- Overview: stats ---------------- */
  function _renderStats() {
    const owners = DATA.users.filter(u => OWNER_ROLES.indexOf(u.role) >= 0).length;
    const workers = DATA.users.filter(u => WORKER_ROLES.indexOf(u.role) >= 0).length;
    const revenue = DATA.orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.total || 0), 0)
      + DATA.pos.reduce((s, o) => s + (o.total || 0), 0);
    const stockValue = DATA.batches.reduce((s, b) => s + Math.max(0, b.qty || 0) * (b.unitCost || 0), 0);

    const cards = [
      ['Customers', DATA.companies.length, 'fa-building', 'amber'],
      ['Owners', owners, 'fa-user-tie', 'blue'],
      ['Team members', workers, 'fa-users', 'purple'],
      ['Products', DATA.products.length, 'fa-box', 'cyan'],
      ['Orders', DATA.orders.length, 'fa-receipt', 'green'],
      ['Platform revenue', _inr(revenue), 'fa-indian-rupee-sign', 'amber'],
      ['Stock value', _inr(stockValue), 'fa-sack-dollar', 'green'],
      ['POS sales', DATA.pos.length, 'fa-cash-register', 'blue'],
    ];
    $('admin-stats').innerHTML = cards.map(([l, n, i, cls]) =>
      '<div class="stat-card"><div class="stat-icon ' + cls + '"><i class="fas ' + i + '"></i></div>' +
      '<div class="stat-info"><span class="stat-value">' + n + '</span><span class="stat-label">' + l + '</span></div></div>'
    ).join('');
  }

  /* ---------------- Overview: charts ---------------- */
  function _renderCharts() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const grid = isDark ? 'rgba(255,255,255,.06)' : 'rgba(17,20,28,.06)';
    const tick = isDark ? '#9aa0ac' : '#5b626f';
    const accent = isDark ? '#fbbf24' : '#f59e0b';
    const palette = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#0891b2', '#ec4899', '#f97316'];
    const ringBorder = isDark ? '#16181e' : '#fff';
    const legend = { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { family: 'Inter', size: 12 }, color: tick } };

    // New customers, last 6 months
    const months = [], counts = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.getFullYear() + '-' + d.getMonth();
      months.push(d.toLocaleDateString('en-IN', { month: 'short' }));
      counts.push(DATA.companies.filter(c => { const cd = new Date(c.createdAt || 0); return cd.getFullYear() + '-' + cd.getMonth() === key; }).length);
    }
    _chart('growth', 'ac-growth', {
      type: 'bar',
      data: { labels: months, datasets: [{ label: 'New customers', data: counts, backgroundColor: accent, borderRadius: 7, maxBarThickness: 42 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0, color: tick, font: { family: 'Inter', size: 11 } }, grid: { color: grid } }, x: { ticks: { color: tick, font: { family: 'Inter', size: 11 } }, grid: { display: false } } } }
    });

    // Orders by status
    const statuses = ['pending', 'approved', 'shipped', 'delivered', 'cancelled'];
    const statusCounts = statuses.map(s => DATA.orders.filter(o => o.status === s).length);
    _chart('orders', 'ac-orders', {
      type: 'doughnut',
      data: { labels: statuses.map(s => s[0].toUpperCase() + s.slice(1)), datasets: [{ data: statusCounts, backgroundColor: ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444'], borderWidth: 2, borderColor: ringBorder }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend } }
    });

    // Products by type
    const types = ['raw', 'simple', 'complex'];
    const typeCounts = types.map(t => DATA.products.filter(p => (p.type || 'simple') === t).length);
    _chart('types', 'ac-types', {
      type: 'doughnut',
      data: { labels: ['Raw materials', 'Simple products', 'Complex products'], datasets: [{ data: typeCounts, backgroundColor: ['#0891b2', '#3b82f6', '#f59e0b'], borderWidth: 2, borderColor: ringBorder }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend } }
    });

    // Top customers by product count
    const top = DATA.companies
      .map(c => ({ name: c.name, n: DATA.products.filter(p => p.ownerId === c.id).length }))
      .sort((a, b) => b.n - a.n).slice(0, 6).reverse();
    _chart('top', 'ac-top', {
      type: 'bar',
      data: { labels: top.map(t => t.name), datasets: [{ label: 'Products', data: top.map(t => t.n), backgroundColor: top.map((_, i) => palette[i % palette.length]), borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0, color: tick, font: { family: 'Inter', size: 11 } }, grid: { color: grid } }, y: { ticks: { color: tick, font: { family: 'Inter', size: 11 } }, grid: { display: false } } } }
    });
  }
  function _chart(key, canvasId, cfg) {
    const ctx = $(canvasId); if (!ctx || typeof Chart === 'undefined') return;
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(ctx.getContext('2d'), cfg);
  }

  /* ---------------- Customers table ---------------- */
  function _renderCompanies() {
    const tbody = $('admin-companies');
    const q = ($('cust-search').value || '').trim().toLowerCase();
    let companies = DATA.companies.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (q) companies = companies.filter(c => (c.name || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q));

    if (!companies.length) {
      tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="9">' +
        (DATA.companies.length ? 'No companies match your search.' : 'No customers yet. Click “Add customer” to onboard your first company.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = companies.map(c => {
      const info = _companyInfo(c);
      const created = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      const login = info.owner.username ? '@' + _esc(info.owner.username) : '<span style="color:var(--text-light)">—</span>';
      const suspended = c.status === 'suspended';
      const status = suspended ? '<span class="badge badge-danger">Suspended</span>' : '<span class="badge badge-success">Active</span>';
      return '<tr>' +
        '<td data-label="Company"><strong>' + _esc(c.name) + '</strong></td>' +
        '<td data-label="Code"><span class="code-chip">' + _esc(c.code) + '</span></td>' +
        '<td data-label="Owner">' + login + '</td>' +
        '<td data-label="Team">' + info.team.length + '</td>' +
        '<td data-label="Products">' + info.products.length + '</td>' +
        '<td data-label="Orders">' + info.orders.length + '</td>' +
        '<td data-label="Status">' + status + '</td>' +
        '<td data-label="Created">' + _esc(created) + '</td>' +
        '<td data-label="Actions" style="text-align:right;"><div class="action-btns" style="justify-content:flex-end;">' +
          '<button class="btn-icon" data-act="view" data-id="' + c.id + '" title="View"><i class="fas fa-eye"></i></button>' +
          '<button class="btn-icon edit" data-act="edit" data-id="' + c.id + '" title="Edit"><i class="fas fa-pen"></i></button>' +
          '<button class="btn-icon delete" data-act="delete" data-id="' + c.id + '" title="Delete"><i class="fas fa-trash-can"></i></button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  function _onTableClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const c = DATA.companies.find(x => x.id === btn.dataset.id); if (!c) return;
    if (btn.dataset.act === 'view') _openDetails(c);
    else if (btn.dataset.act === 'edit') _openEdit(c);
    else if (btn.dataset.act === 'delete') _openDelete(c);
  }

  /* ---------------- Add / Edit customer ---------------- */
  function _openAdd() {
    $('customer-form').reset();
    $('cust-id').value = '';
    $('customer-modal-title').textContent = 'Add new customer';
    $('customer-submit').textContent = 'Create customer';
    $('cust-code').disabled = false;
    $('cust-password').required = true;
    $('cust-password-label').textContent = 'Owner password';
    $('cust-password-hint').textContent = 'Owner signs in with the company code + username + this password.';
    $('cust-status-group').style.display = 'none';
    _hide('customer-error');
    _openModal('customer-modal');
    setTimeout(() => $('cust-company').focus(), 50);
  }

  function _openEdit(c) {
    const info = _companyInfo(c);
    $('customer-form').reset();
    $('cust-id').value = c.id;
    $('customer-modal-title').textContent = 'Edit ' + c.name;
    $('customer-submit').textContent = 'Save changes';
    $('cust-company').value = c.name || '';
    $('cust-code').value = c.code || '';
    $('cust-code').disabled = false;
    $('cust-owner').value = info.owner.name || '';
    $('cust-username').value = info.owner.username || '';
    $('cust-password').required = false;
    $('cust-password').value = '';
    $('cust-password-label').textContent = 'Reset owner password';
    $('cust-password-hint').textContent = 'Leave blank to keep the current password.';
    $('cust-status-group').style.display = '';
    $('cust-status').value = c.status === 'suspended' ? 'suspended' : 'active';
    _hide('customer-error');
    _openModal('customer-modal');
  }

  async function _onSubmitCustomer(e) {
    e.preventDefault();
    _hide('customer-error');
    const id = $('cust-id').value;
    const isEdit = !!id;
    const name = $('cust-company').value.trim();
    const code = $('cust-code').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const ownerName = $('cust-owner').value.trim();
    const username = $('cust-username').value.trim().toLowerCase();
    const password = $('cust-password').value;
    const status = $('cust-status').value;

    if (!name) { _err('customer-error', 'Company name is required.'); return; }
    if (!code) { _err('customer-error', 'Company code must contain letters or numbers.'); return; }
    if (!username) { _err('customer-error', 'Owner username is required.'); return; }
    if (!isEdit && (!password || password.length < 4)) { _err('customer-error', 'Password must be at least 4 characters.'); return; }
    if (password && password.length < 4) { _err('customer-error', 'Password must be at least 4 characters.'); return; }

    const btn = $('customer-submit');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      // Code uniqueness (ignore self when editing).
      const clash = DATA.companies.find(c => (c.code || '').toLowerCase() === code && c.id !== id);
      if (clash) { _err('customer-error', 'That company code is already taken.'); return; }

      if (!isEdit) {
        const cid = _genId();
        const cred = await Creds.make(password);
        await Firebase.save('users', {
          id: cid, name: ownerName, username, shopName: name, role: 'owner', companyId: cid,
          salt: cred.salt, passwordHash: cred.passwordHash, createdAt: new Date().toISOString(),
        });
        await Firebase.save('companies', { id: cid, ownerId: cid, name, code, status: 'active', createdAt: new Date().toISOString() });
        _toast('Customer "' + name + '" created (code: ' + code + ', login: @' + username + ')', 'success');
      } else {
        const c = DATA.companies.find(x => x.id === id) || {};
        const info = _companyInfo(c);
        // username uniqueness within the company (ignore the owner themselves)
        const unameClash = DATA.users.find(u => u.companyId === id && (u.username || '').toLowerCase() === username && u.id !== info.owner.id);
        if (unameClash) { _err('customer-error', 'That username is taken inside this company.'); return; }

        await Firebase.save('companies', { id, name, code, status });
        const ownerPatch = { id: info.owner.id || id, companyId: id, role: info.owner.role || 'owner', name: ownerName, username, shopName: name };
        if (password) { const cred = await Creds.make(password); ownerPatch.salt = cred.salt; ownerPatch.passwordHash = cred.passwordHash; }
        await Firebase.save('users', ownerPatch);
        _toast('Saved changes to "' + name + '"' + (password ? ' (password reset)' : ''), 'success');
      }
      _closeModal('customer-modal');
      await _loadAll();
    } catch (err) {
      _err('customer-error', _friendly(err));
    } finally { btn.disabled = false; btn.textContent = orig; }
  }

  /* ---------------- Details ---------------- */
  function _openDetails(c) {
    const info = _companyInfo(c);
    $('details-title').textContent = c.name;
    const roleBadge = { office: 'badge-info', staff: 'badge-purple', marketing: 'badge-warning' };
    const teamRows = info.team.length ? info.team.map(w =>
      '<tr><td><strong>' + _esc(w.name || w.username) + '</strong></td>' +
      '<td>@' + _esc(w.username) + '</td>' +
      '<td><span class="badge ' + (roleBadge[w.role] || 'badge-gray') + '">' + _esc(w.role) + '</span></td>' +
      '<td style="text-align:right;"><button class="btn-icon delete" data-rmworker="' + w.id + '" title="Remove"><i class="fas fa-user-minus"></i></button></td></tr>'
    ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:1.25rem;">No team members.</td></tr>';

    $('details-body').innerHTML =
      '<div class="detail-grid">' +
        _mini('Company code', '<span class="code-chip">' + _esc(c.code) + '</span>') +
        _mini('Status', c.status === 'suspended' ? '<span class="badge badge-danger">Suspended</span>' : '<span class="badge badge-success">Active</span>') +
        _mini('Owner login', info.owner.username ? '@' + _esc(info.owner.username) : '—') +
        _mini('Created', c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—') +
      '</div>' +
      '<div class="detail-grid">' +
        _mini('Team', info.team.length) +
        _mini('Products', info.products.length) +
        _mini('Orders', info.orders.length) +
        _mini('Revenue', _inr(info.revenue)) +
      '</div>' +
      '<h3 style="font-size:.95rem;margin:.5rem 0 .6rem;">Team members</h3>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Login</th><th>Role</th><th></th></tr></thead><tbody id="details-team">' + teamRows + '</tbody></table></div>' +
      '<div class="modal-footer">' +
        '<button type="button" class="btn btn-secondary" data-act-detail="edit" data-id="' + c.id + '"><i class="fas fa-pen"></i> Edit</button>' +
        '<button type="button" class="btn btn-danger" data-act-detail="delete" data-id="' + c.id + '"><i class="fas fa-trash-can"></i> Delete</button>' +
      '</div>';

    $('details-team').addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rmworker]'); if (!rm) return;
      if (!confirm('Remove this team member? They will no longer be able to log in.')) return;
      try { await Firebase.remove('users', rm.dataset.rmworker); _toast('Team member removed', 'success'); _closeModal('details-modal'); await _loadAll(); }
      catch (err) { _toast(_friendly(err), 'error'); }
    });
    $('details-body').querySelectorAll('[data-act-detail]').forEach(b => b.addEventListener('click', () => {
      const co = DATA.companies.find(x => x.id === b.dataset.id);
      _closeModal('details-modal');
      if (b.dataset.actDetail === 'edit') _openEdit(co); else _openDelete(co);
    }));
    _openModal('details-modal');
  }
  function _mini(label, val) { return '<div class="card mini-stat"><span class="n">' + val + '</span><span class="l">' + label + '</span></div>'; }

  /* ---------------- Delete (cascade) ---------------- */
  function _openDelete(c) {
    deleteTarget = c;
    $('delete-name').textContent = c.name;
    $('delete-code-hint').textContent = c.code;
    $('delete-confirm').value = '';
    $('delete-confirm-btn').disabled = true;
    _openModal('delete-modal');
  }
  function _checkDelete() {
    const ok = deleteTarget && ($('delete-confirm').value || '').trim().toLowerCase() === (deleteTarget.code || '').toLowerCase();
    $('delete-confirm-btn').disabled = !ok;
  }
  async function _confirmDelete() {
    if (!deleteTarget) return;
    const c = deleteTarget;
    const btn = $('delete-confirm-btn');
    const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Deleting…';
    try {
      // Collections scoped by ownerId (the company id).
      const byOwner = ['products', 'locations', 'stock', 'batches', 'parties', 'khata', 'pos_sales', 'recipes'];
      for (const coll of byOwner) {
        const docs = await Firebase.listByOwner(coll, c.id).catch(() => []);
        if (docs.length) await Firebase.removeMany(coll, docs.map(d => d.id));
      }
      // Orders reference the company as seller or buyer.
      const orders = await Firebase.list('orders').catch(() => []);
      const orderIds = orders.filter(o => o.sellerId === c.id || o.buyerId === c.id).map(o => o.id);
      if (orderIds.length) await Firebase.removeMany('orders', orderIds);
      // Users that belong to the company.
      const userIds = DATA.users.filter(u => u.companyId === c.id || u.id === c.id).map(u => u.id);
      if (userIds.length) await Firebase.removeMany('users', userIds);
      // Finally the company itself.
      await Firebase.remove('companies', c.id);

      _toast('Deleted "' + c.name + '" and all its data.', 'success');
      deleteTarget = null;
      _closeModal('delete-modal');
      await _loadAll();
    } catch (err) {
      _toast(_friendly(err), 'error');
    } finally { btn.disabled = false; btn.innerHTML = orig; }
  }

  /* ---------------- UI helpers ---------------- */
  function _showLogin() { $('admin-login').classList.remove('hidden'); $('admin-app').classList.add('hidden'); }
  function _showDashboard() { $('admin-login').classList.add('hidden'); $('admin-app').classList.remove('hidden'); }
  function _openModal(id) { $(id).classList.remove('hidden'); }
  function _closeModal(id) { $(id).classList.add('hidden'); }
  function _err(id, msg) { const el = $(id); el.textContent = msg; el.classList.remove('hidden'); }
  function _hide(id) { $(id).classList.add('hidden'); }

  function _toast(msg, type) {
    const c = $('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info') + '"></i><span>' + _esc(msg) + '</span>';
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 300); }, 3500);
  }

  function _friendly(e) {
    const c = (e && e.code) || '';
    if (/wrong-password|user-not-found|invalid-credential|invalid-login/.test(c)) return 'Invalid email or password.';
    if (/email-already-in-use/.test(c)) return 'An account with this email already exists.';
    if (/weak-password/.test(c)) return 'Password should be at least 6 characters.';
    if (/invalid-email/.test(c)) return 'Please enter a valid email address.';
    if (/too-many-requests/.test(c)) return 'Too many attempts. Please try again later.';
    if (/network-request-failed/.test(c)) return 'Network error. Check your connection.';
    if (/permission-denied|insufficient/.test(c)) return 'Permission denied. Check that the Firestore rules are deployed.';
    return (e && e.message) || 'Something went wrong.';
  }

  return { init };
})();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Admin.init);
  else Admin.init();
}
