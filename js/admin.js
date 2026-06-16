/* ============================================================
   Admin Console for झटपट (ZatPat) IMS  —  super-admin only.
   Lives at a separate endpoint (admin.html). Uses Firebase Auth
   (the single super-admin account) and talks to Firestore directly.
   ============================================================ */
const Admin = (() => {
  const SUPER = (typeof window !== 'undefined' && window.SUPER_ADMIN_EMAIL ? window.SUPER_ADMIN_EMAIL : '').toLowerCase();
  const WORKER_ROLES = ['office', 'staff', 'marketing'];

  function $(id) { return document.getElementById(id); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _genId() { return 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function init() {
    if (!window.Firebase || !Firebase.isEnabled()) {
      _showLogin();
      _err('admin-error', 'Backend unavailable. Check your connection and reload.');
      return;
    }
    $('admin-login-form').addEventListener('submit', _onLogin);
    $('admin-logout').addEventListener('click', _onLogout);
    $('admin-add').addEventListener('click', _openAdd);
    $('add-customer-form').addEventListener('submit', _onAddCustomer);
    document.querySelectorAll('#add-customer-modal [data-close-modal]').forEach(el => el.addEventListener('click', _closeAdd));

    Firebase.onAuth((fb) => {
      if (fb) _afterAuth(fb);
      else _showLogin();
    });
  }

  async function _onLogin(e) {
    e.preventDefault();
    _hide('admin-error');
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await Firebase.signIn($('admin-email').value.trim(), $('admin-password').value);
    } catch (err) {
      _err('admin-error', _friendly(err));
    } finally { btn.disabled = false; btn.textContent = orig; }
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
    _loadStats();
  }

  async function _onLogout() {
    try { await Firebase.signOut(); } catch (e) { /* ignore */ }
    _showLogin();
    $('admin-login-form').reset();
  }

  /* ---------------- Dashboard ---------------- */
  async function _loadStats() {
    let companies = [], users = [], products = [], orders = [];
    try {
      [companies, users, products, orders] = await Promise.all([
        Firebase.list('companies'), Firebase.list('users'), Firebase.list('products'), Firebase.list('orders'),
      ]);
    } catch (e) { _toast('Could not load data: ' + (e && e.message), 'error'); }

    const owners = users.filter(u => u.role === 'owner' || u.role === 'user');
    const workers = users.filter(u => WORKER_ROLES.indexOf(u.role) >= 0);

    $('admin-stats').innerHTML = [
      ['Customers', companies.length, 'fa-building'],
      ['Owners', owners.length, 'fa-user-tie'],
      ['Team members', workers.length, 'fa-users'],
      ['Products', products.length, 'fa-box'],
      ['Orders', orders.length, 'fa-receipt'],
    ].map(([l, n, i]) => `<div class="admin-stat"><i class="fas ${i} i"></i><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

    const usersById = {}; users.forEach(u => { usersById[u.id] = u; });
    const tbody = $('admin-companies');
    if (!companies.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No customers yet. Click “Add customer” to onboard your first company.</td></tr>';
      return;
    }
    companies.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    tbody.innerHTML = companies.map(c => {
      const owner = usersById[c.ownerId] || {};
      const team = users.filter(u => u.companyId === c.id && WORKER_ROLES.indexOf(u.role) >= 0).length;
      const prods = products.filter(p => p.ownerId === c.id).length;
      const created = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—';
      const login = owner.username ? '@' + _esc(owner.username) : '<span style="color:var(--text-light)">—</span>';
      return `<tr>
        <td data-label="Company"><strong>${_esc(c.name)}</strong></td>
        <td data-label="Code"><span class="code-chip">${_esc(c.code)}</span></td>
        <td data-label="Owner login">${login}</td>
        <td data-label="Team">${team}</td>
        <td data-label="Products">${prods}</td>
        <td data-label="Created">${_esc(created)}</td>
      </tr>`;
    }).join('');
  }

  /* ---------------- Add customer ---------------- */
  function _openAdd() { _hide('add-customer-error'); $('add-customer-form').reset(); $('add-customer-modal').classList.remove('hidden'); }
  function _closeAdd() { $('add-customer-modal').classList.add('hidden'); }

  async function _onAddCustomer(e) {
    e.preventDefault();
    _hide('add-customer-error');
    const name = $('cust-company').value.trim();
    const code = $('cust-code').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const ownerName = $('cust-owner').value.trim();
    const username = $('cust-username').value.trim().toLowerCase();
    const password = $('cust-password').value;

    if (!code) { _err('add-customer-error', 'Company code must contain letters or numbers.'); return; }
    if (!username) { _err('add-customer-error', 'Owner username is required.'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const existing = await Firebase.findCompanyByCode(code);
      if (existing) { _err('add-customer-error', 'That company code is already taken.'); return; }

      // company id == owner id == companyId (consistent with the rest of the app).
      const cid = _genId();
      const cred = await Creds.make(password);
      const ownerProfile = {
        id: cid, name: ownerName, username: username, shopName: name,
        role: 'owner', companyId: cid, salt: cred.salt, passwordHash: cred.passwordHash,
        createdAt: new Date().toISOString(),
      };
      await Firebase.save('users', ownerProfile);
      await Firebase.save('companies', { id: cid, ownerId: cid, name: name, code: code, createdAt: new Date().toISOString() });
      await Firebase.save('locations', { id: 'loc_' + cid + Date.now().toString(36), ownerId: cid, name: 'Main Warehouse', address: '', isDefault: true });

      _closeAdd();
      _toast('Customer "' + name + '" created (code: ' + code + ', login: @' + username + ')', 'success');
      _loadStats();
    } catch (err) {
      _err('add-customer-error', _friendly(err));
    } finally { btn.disabled = false; btn.textContent = orig; }
  }

  /* ---------------- UI helpers ---------------- */
  function _showLogin() { $('admin-login').classList.remove('hidden'); $('admin-app').classList.add('hidden'); }
  function _showDashboard() { $('admin-login').classList.add('hidden'); $('admin-app').classList.remove('hidden'); }
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
    return (e && e.message) || 'Something went wrong.';
  }

  return { init };
})();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Admin.init);
  else Admin.init();
}
