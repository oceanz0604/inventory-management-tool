const App = (() => {
  let currentView = 'dashboard';

  let _bootedUid = null;

  function init() {
    _initTheme();
    _bindAuthEvents();
    _bindNavEvents();
    _bindModalClose();
    _bindNotifications();
    _bindSidebarToggle();
    _bindCategoryEvents();
    _bindBottomNav();
    _preventZoomGestures();
    _boot();
  }

  // iOS Safari ignores user-scalable=no, so block pinch gestures and the
  // double-tap-to-zoom that survives touch-action in some cases.
  function _preventZoomGestures() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
      document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  // Company users have no Firebase Auth — the session is the persisted local
  // profile (set by Auth.login). Restore it on load / reload.
  function _boot() {
    if (!(window.Firebase && Firebase.isEnabled())) {
      _showAuth();
      _showAuthError('Backend unavailable. Please check your connection and reload.');
      return;
    }
    if (Auth.ensureSession()) _enterApp();
    else _showAuth();
  }

  async function _enterApp() {
    const profile = Auth.ensureSession();
    if (!profile) { _showAuth(); return; }

    // The super admin belongs in the separate admin console, not the client app.
    if (profile.role === 'superadmin') { window.location.replace('admin.html'); return; }

    Auth.clearChosenCompany();
    if (_bootedUid === profile.id) return; // already inside for this user
    _bootedUid = profile.id;
    // Render immediately from the local cache so returning users never see the
    // login screen flash; refresh the data from Firestore in the background.
    _showApp();
    try { await Store.sync(profile); } catch (e) { /* offline: cached data stays */ }
    Store.setCurrentUser(profile); // re-affirm session
    _navigate(currentView);        // re-render the current view with synced data
    Shop.refreshBadges();
  }

  // ========== Theme ==========
  function _initTheme() {
    const saved = localStorage.getItem('ims_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    document.getElementById('theme-toggle').addEventListener('click', _toggleTheme);
  }

  function _toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('ims_theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('ims_theme', 'dark');
    }
    if (currentView === 'dashboard') Dashboard.refresh();
    if (currentView === 'reports') Reports.refresh();
  }

  // ========== Auth ==========
  function _hideBootSplash() {
    const s = document.getElementById('boot-splash');
    if (s) s.classList.add('hidden');
  }

  function _showAuth() {
    _hideBootSplash();
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    _showCompanyStage();
  }

  function _showApp() {
    _hideBootSplash();
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    _refreshUserUI();
    _applyRoleGating();
    Locations.init();
    Products.init();
    Inventory.init();
    Orders.init();
    Shop.init();
    POS.init();
    KhataModule.init();
    Reports.init();
    Dashboard.init();
    Export.init();
    Parties.init();
    Team.init();
    FieldOrders.init();
    Onboarding.init();
    _navigate(_defaultView());
    Shop.refreshBadges();
    Onboarding.maybeStart();
  }

  // Landing view depends on role: staff -> POS, marketing -> field orders.
  function _defaultView() {
    const role = Auth.getRole();
    if (role === 'staff') return 'pos';
    if (role === 'marketing') return 'field-order';
    return 'dashboard';
  }

  function _refreshUserUI() {
    const user = Auth.getUser();
    if (!user) return;
    document.getElementById('user-name').textContent = user.name || user.shopName || 'User';
    document.getElementById('user-email').textContent = user.username ? ('@' + user.username) : (user.email || '');
    document.getElementById('user-avatar').textContent = Auth.getInitials(user.name || user.shopName || 'U');
  }

  // Views each role may reach. Owner/super-admin get everything.
  const ROLE_VIEWS = {
    owner: ['dashboard', 'locations', 'products', 'inventory', 'pos', 'orders', 'categories', 'reports', 'khata', 'shop', 'field-order', 'parties', 'team'],
    office: ['dashboard', 'locations', 'products', 'inventory', 'orders', 'categories', 'reports', 'khata', 'shop', 'field-order', 'parties'],
    staff: ['pos'],
    marketing: ['field-order'],
  };

  function _allowedViews() {
    const role = Auth.getRole();
    if (role === 'superadmin' || role === 'owner' || role === 'user') return ROLE_VIEWS.owner;
    return ROLE_VIEWS[role] || ROLE_VIEWS.owner;
  }

  // Gate nav + test-data tooling (god-view switch-user is super-admin only).
  function _applyRoleGating() {
    const admin = Auth.isSuperAdmin();
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = admin ? '' : 'none'; });
    const switchBtn = document.getElementById('switch-user-btn');
    if (switchBtn) switchBtn.style.display = admin ? '' : 'none';
    const moreSwitch = document.getElementById('more-switch-user');
    if (moreSwitch) moreSwitch.style.display = admin ? '' : 'none';
    document.body.classList.toggle('is-superadmin', admin);

    // Show only the sidebar entries this role is allowed to use.
    const allowed = _allowedViews();
    document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(el => {
      el.style.display = allowed.indexOf(el.dataset.view) >= 0 ? '' : 'none';
    });

    // Only owners can reconfigure the company's bottom bar.
    const customize = document.getElementById('more-customize-nav');
    if (customize) customize.style.display = Auth.isOwnerLevel() ? '' : 'none';

    // The mobile bottom bar + More sheet are rendered from the allowed views.
    _renderBottomNav();
  }

  function _bindAuthEvents() {
    // Stage 1 — resolve the company code, then reveal the credentials form.
    document.getElementById('company-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      _hideAuthError();
      const btn = e.target.querySelector('button[type="submit"]');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
      const result = await Auth.selectCompany(document.getElementById('company-code').value);
      if (btn) { btn.disabled = false; btn.textContent = orig; }
      if (!result.success) { _showAuthError(result.message); return; }
      _showLoginStage(result.company.name);
    });

    document.getElementById('change-company-link').addEventListener('click', () => {
      Auth.clearChosenCompany();
      _hideAuthError();
      _showCompanyStage();
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      _hideAuthError();
      const btn = e.target.querySelector('button[type="submit"]');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
      const result = await Auth.login(document.getElementById('login-username').value, document.getElementById('login-password').value);
      if (btn) { btn.disabled = false; btn.textContent = orig; }
      if (!result.success) { _showAuthError(result.message); return; }
      _enterApp();
    });

    document.getElementById('logout-btn').addEventListener('click', _doLogout);
    document.getElementById('switch-user-btn').addEventListener('click', _openSwitchUserModal);
  }

  function _showCompanyStage() {
    document.getElementById('company-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('company-form').reset();
  }

  function _showLoginStage(companyName) {
    document.getElementById('company-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    const heading = document.getElementById('login-heading');
    const subtitle = document.getElementById('login-subtitle');
    if (companyName) { heading.textContent = 'Sign in to ' + companyName; subtitle.textContent = 'Use your team credentials'; }
    else { heading.textContent = 'Welcome back'; subtitle.textContent = 'Sign in to your account'; }
    const email = document.getElementById('login-email');
    if (email) setTimeout(() => email.focus(), 50);
  }

  async function _doLogout() {
    _bootedUid = null;
    await Auth.logout();
    _showAuth();
    _closeMoreSheet();
    document.getElementById('login-form').reset();
    document.getElementById('company-form').reset();
  }

  function _showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function _hideAuthError() { document.getElementById('auth-error').classList.add('hidden'); }

  // ========== Switch User Modal ==========
  function _openSwitchUserModal() {
    _closeMoreSheet();
    if (!Auth.isSuperAdmin()) return; // god-view tooling is super-admin only
    const current = Auth.getUser();
    const allUsers = Store.getUsers();
    if (allUsers.length <= 1) { showToast('No other accounts available', 'warning'); return; }

    const icons = { user_a: 'fa-microchip', user_b: 'fa-leaf', user_c: 'fa-heart-pulse', user_d: 'fa-hammer', user_e: 'fa-utensils' };
    const list = document.getElementById('switch-user-list');
    list.innerHTML = allUsers.map(u => {
      const isCurrent = u.id === current.id;
      const initials = Auth.getInitials(u.name || u.shopName || 'U');
      const icon = icons[u.id] || 'fa-store';
      return '<div class="switch-user-item ' + (isCurrent ? 'current' : '') + '" data-uid="' + u.id + '">' +
        '<div class="su-avatar">' + initials + '</div>' +
        '<div class="su-info"><strong><i class="fas ' + icon + '" style="margin-right:.375rem;font-size:.75rem;opacity:.7"></i>' + _esc(u.name || u.shopName) + '</strong><span>' + _esc(u.username ? '@' + u.username : (u.email || '')) + '</span></div>' +
        (isCurrent ? '<span class="su-current-tag">Current</span>' : '') + '</div>';
    }).join('');

    list.querySelectorAll('.switch-user-item:not(.current)').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.uid;
        Auth.switchUser(uid);
        document.getElementById('switch-user-modal').classList.add('hidden');
        _refreshUserUI();
        _navigate('dashboard');
        const u = Store.getUserById(uid);
        showToast('Switched to ' + (u.name || u.shopName), 'success');
        Shop.refreshBadges();
      });
    });

    document.getElementById('switch-user-modal').classList.remove('hidden');
  }

  // ========== Navigation ==========
  function _bindNavEvents() {
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        _navigate(item.dataset.view);
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
      });
    });
  }

  const titles = {
    dashboard: 'Dashboard', locations: 'Locations', products: 'Products',
    inventory: 'Inventory', pos: 'POS Counter', orders: 'Orders',
    categories: 'Categories', shop: 'Shop',
    reports: 'Reports', khata: 'Khata / Credit',
    'field-order': 'Field Orders', parties: 'Customers / Sellers', team: 'Team'
  };

  function _navigate(view) {
    // Keep workers inside the views their role allows.
    if (_allowedViews().indexOf(view) < 0) view = _defaultView();
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.remove('hidden');

    document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector('.sidebar .nav-item[data-view="' + view + '"]');
    if (nav) nav.classList.add('active');

    document.getElementById('page-title').textContent = titles[view] || view;

    _syncBottomNav(view);

    if (view === 'dashboard') Dashboard.refresh();
    if (view === 'locations') Locations.render();
    if (view === 'products') { Products.populateFilters(); Products.render(); }
    if (view === 'inventory') { Inventory.refreshFilters(); Inventory.render(); }
    if (view === 'pos') POS.refresh();
    if (view === 'orders') Orders.render();
    if (view === 'categories') _renderCategories();
    if (view === 'shop') { Shop.populateFilters(); Shop.renderProducts(); }
    if (view === 'reports') Reports.refresh();
    if (view === 'khata') KhataModule.refresh();
    if (view === 'field-order') FieldOrders.render();
    if (view === 'parties') Parties.render();
    if (view === 'team') Team.render();
  }

  // ========== Bottom Nav (Mobile) ==========
  // Icon + short label for every navigable view.
  const NAV_META = {
    dashboard: { icon: 'fa-chart-pie', label: 'Home' },
    products: { icon: 'fa-box', label: 'Products' },
    inventory: { icon: 'fa-warehouse', label: 'Stock' },
    locations: { icon: 'fa-location-dot', label: 'Locations' },
    pos: { icon: 'fa-cash-register', label: 'POS' },
    orders: { icon: 'fa-file-invoice', label: 'Orders' },
    categories: { icon: 'fa-tags', label: 'Categories' },
    reports: { icon: 'fa-chart-bar', label: 'Reports' },
    khata: { icon: 'fa-book', label: 'Khata' },
    shop: { icon: 'fa-cart-shopping', label: 'Shop' },
    'field-order': { icon: 'fa-route', label: 'Field' },
    parties: { icon: 'fa-address-book', label: 'Customers' },
    team: { icon: 'fa-users-gear', label: 'Team' },
  };
  // Sensible bottom-bar defaults per role (owner can override + persist).
  const BOTTOM_DEFAULTS = {
    owner: ['dashboard', 'products', 'orders', 'pos'],
    office: ['dashboard', 'orders', 'field-order', 'parties'],
    staff: ['pos'],
    marketing: ['field-order'],
  };

  // Resolve which views fill the bottom bar (max 4), honoring the owner's saved
  // config when present and always filtering to the current role's allowed views.
  function _bottomNavViews() {
    const allowed = _allowedViews();
    let cfg = null;
    const company = Store.getCompanyById(Auth.ownerId());
    if (company && Array.isArray(company.bottomNav) && company.bottomNav.length) cfg = company.bottomNav;
    if (!cfg) cfg = BOTTOM_DEFAULTS[Auth.getRole()] || BOTTOM_DEFAULTS.owner;
    const seen = {}; const out = [];
    cfg.forEach(v => { if (allowed.indexOf(v) >= 0 && !seen[v]) { seen[v] = 1; out.push(v); } });
    if (!out.length) allowed.slice(0, 4).forEach(v => out.push(v));
    return out.slice(0, 4);
  }

  function _navButton(cls, v) {
    const m = NAV_META[v] || { icon: 'fa-circle', label: v };
    return '<button class="' + cls + '" data-view="' + v + '"><i class="fas ' + m.icon + '"></i><span>' + m.label + '</span></button>';
  }

  function _renderBottomNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const primary = _bottomNavViews();
    nav.innerHTML = primary.map(v => _navButton('bnav-item', v)).join('') +
      '<button class="bnav-item" id="bnav-more"><i class="fas fa-ellipsis"></i><span>More</span></button>';
    nav.querySelectorAll('.bnav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => { _closeMoreSheet(); _navigate(btn.dataset.view); });
    });
    document.getElementById('bnav-more').addEventListener('click', _toggleMoreSheet);
    _renderMoreSheet(primary);
    _syncBottomNav(currentView);
  }

  // The More sheet holds every allowed view that isn't already on the bottom bar.
  function _renderMoreSheet(primary) {
    const grid = document.querySelector('#more-sheet .more-sheet-grid');
    if (!grid) return;
    const rest = _allowedViews().filter(v => primary.indexOf(v) < 0);
    grid.innerHTML = rest.map(v => _navButton('more-sheet-item', v)).join('');
    grid.querySelectorAll('.more-sheet-item').forEach(btn => {
      btn.addEventListener('click', () => { _closeMoreSheet(); _navigate(btn.dataset.view); });
    });
  }

  function _bindBottomNav() {
    document.getElementById('more-sheet-overlay').addEventListener('click', _closeMoreSheet);
    const moreSwitch = document.getElementById('more-switch-user');
    if (moreSwitch) moreSwitch.addEventListener('click', _openSwitchUserModal);
    const moreLogout = document.getElementById('more-logout');
    if (moreLogout) moreLogout.addEventListener('click', _doLogout);
    const customize = document.getElementById('more-customize-nav');
    if (customize) customize.addEventListener('click', _openBottomNavModal);
    const save = document.getElementById('bottomnav-save');
    if (save) save.addEventListener('click', _saveBottomNav);
  }

  // Owner-only modal to choose up to 4 bottom-bar shortcuts.
  function _openBottomNavModal() {
    _closeMoreSheet();
    if (!Auth.isOwnerLevel()) return;
    const allowed = _allowedViews().filter(v => v !== 'categories');
    const current = _bottomNavViews();
    const box = document.getElementById('bottomnav-options');
    box.innerHTML = allowed.map(v => {
      const m = NAV_META[v] || { icon: 'fa-circle', label: v };
      const checked = current.indexOf(v) >= 0 ? 'checked' : '';
      return '<label class="bottomnav-opt"><input type="checkbox" value="' + v + '" ' + checked + '>' +
        '<i class="fas ' + m.icon + '"></i><span>' + (titles[v] || m.label) + '</span></label>';
    }).join('');
    box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = box.querySelectorAll('input:checked');
        if (checked.length > 4) { cb.checked = false; showToast('Pick at most 4 shortcuts', 'warning'); }
      });
    });
    document.getElementById('bottomnav-modal').classList.remove('hidden');
  }

  async function _saveBottomNav() {
    const box = document.getElementById('bottomnav-options');
    const chosen = Array.from(box.querySelectorAll('input:checked')).map(cb => cb.value).slice(0, 4);
    if (!chosen.length) { showToast('Pick at least one shortcut', 'warning'); return; }
    document.getElementById('bottomnav-modal').classList.add('hidden');
    try { await Auth.setCompanyConfig({ bottomNav: chosen }); } catch (e) { /* local copy already updated */ }
    _renderBottomNav();
    showToast('Bottom bar updated', 'success');
  }

  function _toggleMoreSheet() {
    const sheet = document.getElementById('more-sheet');
    const overlay = document.getElementById('more-sheet-overlay');
    const isOpen = !sheet.classList.contains('hidden');
    if (isOpen) {
      sheet.classList.add('hidden');
      overlay.classList.add('hidden');
    } else {
      sheet.classList.remove('hidden');
      overlay.classList.remove('hidden');
    }
  }

  function _closeMoreSheet() {
    document.getElementById('more-sheet').classList.add('hidden');
    document.getElementById('more-sheet-overlay').classList.add('hidden');
  }

  function _syncBottomNav(view) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    nav.querySelectorAll('.bnav-item').forEach(btn => btn.classList.remove('active'));
    const match = nav.querySelector('.bnav-item[data-view="' + view + '"]');
    if (match) match.classList.add('active');
    else { const more = document.getElementById('bnav-more'); if (more) more.classList.add('active'); }
  }

  // ========== Sidebar Toggle ==========
  function _bindSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('hidden', !sidebar.classList.contains('open'));
      overlay.setAttribute('aria-hidden', sidebar.classList.contains('open') ? 'false' : 'true');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    });
  }

  // ========== Modal Close ==========
  function _bindModalClose() {
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.addEventListener('click', () => {
        const modal = el.closest('.modal');
        if (modal) modal.classList.add('hidden');
      });
    });
  }

  // ========== Notifications ==========
  function _bindNotifications() {
    const bell = document.getElementById('notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    bell.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); });
    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    dropdown.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('dismiss-all-notifications').addEventListener('click', () => dropdown.classList.add('hidden'));
  }

  // ========== Categories ==========
  let editingCategoryId = null;

  function _bindCategoryEvents() {
    document.getElementById('add-category-btn').addEventListener('click', () => _openCategoryModal());
    const firstBtn = document.getElementById('add-first-category-btn');
    if (firstBtn) firstBtn.addEventListener('click', () => _openCategoryModal());
    document.getElementById('category-form').addEventListener('submit', _handleCategorySubmit);
    document.getElementById('category-color').addEventListener('input', (e) => {
      document.getElementById('color-preview').style.background = e.target.value;
    });
    document.getElementById('category-search').addEventListener('input', _renderCategories);
  }

  function _openCategoryModal(catId) {
    editingCategoryId = catId || null;
    const form = document.getElementById('category-form');
    const title = document.getElementById('category-modal-title');
    form.reset();
    if (editingCategoryId) {
      const cat = Store.getCategoryById(editingCategoryId);
      if (!cat) return;
      title.textContent = 'Edit Category';
      document.getElementById('category-name').value = cat.name;
      document.getElementById('category-color').value = cat.color;
      document.getElementById('color-preview').style.background = cat.color;
    } else {
      title.textContent = 'Add Category';
      document.getElementById('category-color').value = '#6366f1';
      document.getElementById('color-preview').style.background = '#6366f1';
    }
    document.getElementById('category-modal').classList.remove('hidden');
  }

  function _handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('category-name').value.trim();
    const color = document.getElementById('category-color').value;
    if (editingCategoryId) {
      Store.updateCategory(editingCategoryId, { name, color });
      showToast('Category updated', 'success');
    } else {
      Store.addCategory({ id: Store.generateId(), name, color });
      showToast('Category created', 'success');
    }
    document.getElementById('category-modal').classList.add('hidden');
    editingCategoryId = null;
    _renderCategories();
    Products.populateFilters();
    Dashboard.refresh();
  }

  function _renderCategories() {
    const search = document.getElementById('category-search').value.toLowerCase().trim();
    let cats = Store.getCategories();
    if (search) cats = cats.filter(c => c.name.toLowerCase().includes(search));

    const grid = document.getElementById('categories-grid');
    const empty = document.getElementById('no-categories');

    if (Store.getCategories().length === 0) {
      grid.innerHTML = ''; empty.classList.remove('hidden'); return;
    }
    empty.classList.add('hidden');
    if (cats.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;text-align:center">No categories match your search</p>'; return;
    }

    const user = Auth.getUser();
    grid.innerHTML = cats.map(cat => {
      const prods = Store.getProductsByOwner(Auth.ownerId()).filter(p => p.categoryId === cat.id);
      return '<div class="category-card">' +
        '<div class="color-swatch" style="background:' + cat.color + '"></div>' +
        '<div class="category-info"><h4>' + _esc(cat.name) + '</h4><span>' + prods.length + ' product' + (prods.length !== 1 ? 's' : '') + '</span></div>' +
        '<div class="category-actions">' +
        '<button class="btn-icon edit" title="Edit" onclick="App.editCategory(\'' + cat.id + '\')"><i class="fas fa-pen"></i></button>' +
        '<button class="btn-icon delete" title="Delete" onclick="App.deleteCategory(\'' + cat.id + '\')"><i class="fas fa-trash-can"></i></button></div></div>';
    }).join('');
  }

  function editCategory(catId) { _openCategoryModal(catId); }

  function deleteCategory(catId) {
    const cat = Store.getCategoryById(catId);
    if (!cat) return;
    document.getElementById('delete-message').textContent = 'Delete category "' + cat.name + '"?';
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      Store.deleteCategory(catId);
      document.getElementById('delete-modal').classList.add('hidden');
      showToast('Category deleted', 'success');
      _renderCategories();
      Products.populateFilters();
      Products.render();
      Dashboard.refresh();
    });
  }

  // ========== Toast ==========
  function showToast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<i class="fas ' + (icons[type] || icons.success) + '"></i><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, showToast, editCategory, deleteCategory, goTo: _navigate };
})();

document.addEventListener('DOMContentLoaded', App.init);
