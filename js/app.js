const App = (() => {
  let currentView = 'dashboard';

  function init() {
    _initTheme();
    if (Auth.isAuthenticated()) {
      _showApp();
    } else {
      _showAuth();
    }
    _bindAuthEvents();
    _bindNavEvents();
    _bindModalClose();
    _bindNotifications();
    _bindSidebarToggle();
    _bindCategoryEvents();
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
  }

  // ========== Auth ==========
  function _showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }

  function _showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    _refreshUserUI();
    Store.seedDemoData();
    Locations.init();
    Products.init();
    Inventory.init();
    Orders.init();
    Shop.init();
    POS.init();
    Dashboard.init();
    Export.init();
    _navigate('dashboard');
    Shop.refreshBadges();
  }

  function _refreshUserUI() {
    const user = Auth.getUser();
    document.getElementById('user-name').textContent = user.name || user.shopName || 'User';
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-avatar').textContent = Auth.getInitials(user.name || user.shopName || 'U');
  }

  function _bindAuthEvents() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const result = Auth.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
      if (result.success) _showApp(); else _showAuthError(result.message);
    });

    document.getElementById('signup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const result = Auth.signup(
        document.getElementById('signup-name').value,
        document.getElementById('signup-email').value,
        document.getElementById('signup-password').value
      );
      if (result.success) _showApp(); else _showAuthError(result.message);
    });

    document.querySelectorAll('[data-demo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = Auth.demoLogin(btn.dataset.demo);
        if (result.success) _showApp(); else _showAuthError(result.message);
      });
    });

    document.getElementById('show-signup').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('signup-form').classList.remove('hidden');
      _hideAuthError();
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('signup-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      _hideAuthError();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      _showAuth();
      document.getElementById('login-form').reset();
      document.getElementById('signup-form').reset();
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('signup-form').classList.add('hidden');
    });

    document.getElementById('switch-user-btn').addEventListener('click', _openSwitchUserModal);
  }

  function _showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function _hideAuthError() { document.getElementById('auth-error').classList.add('hidden'); }

  // ========== Switch User Modal ==========
  function _openSwitchUserModal() {
    const current = Auth.getUser();
    const allUsers = Store.getUsers();
    if (allUsers.length <= 1) { showToast('No other demo users available', 'warning'); return; }

    const icons = { user_a: 'fa-microchip', user_b: 'fa-leaf', user_c: 'fa-heart-pulse', user_d: 'fa-hammer', user_e: 'fa-utensils' };
    const list = document.getElementById('switch-user-list');
    list.innerHTML = allUsers.map(u => {
      const isCurrent = u.id === current.id;
      const initials = Auth.getInitials(u.name || u.shopName || 'U');
      const icon = icons[u.id] || 'fa-store';
      return `<div class="switch-user-item ${isCurrent ? 'current' : ''}" data-uid="${u.id}">
        <div class="su-avatar">${initials}</div>
        <div class="su-info"><strong><i class="fas ${icon}" style="margin-right:.375rem;font-size:.75rem;opacity:.7"></i>${_esc(u.name || u.shopName)}</strong><span>${_esc(u.email)}</span></div>
        ${isCurrent ? '<span class="su-current-tag">Current</span>' : ''}
      </div>`;
    }).join('');

    list.querySelectorAll('.switch-user-item:not(.current)').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.uid;
        Auth.switchUser(uid);
        document.getElementById('switch-user-modal').classList.add('hidden');
        _refreshUserUI();
        _navigate('dashboard');
        const u = Store.getUserById(uid);
        showToast(`Switched to ${u.name || u.shopName}`, 'success');
        Shop.refreshBadges();
      });
    });

    document.getElementById('switch-user-modal').classList.remove('hidden');
  }

  // ========== Navigation ==========
  function _bindNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        _navigate(item.dataset.view);
        document.getElementById('sidebar').classList.remove('open');
      });
    });
  }

  function _navigate(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (nav) nav.classList.add('active');

    const titles = { dashboard: 'Dashboard', locations: 'Locations', products: 'Products', inventory: 'Inventory', pos: 'POS Counter', orders: 'Orders', categories: 'Categories', shop: 'Shop' };
    document.getElementById('page-title').textContent = titles[view] || view;

    if (view === 'dashboard') Dashboard.refresh();
    if (view === 'locations') Locations.render();
    if (view === 'products') { Products.populateFilters(); Products.render(); }
    if (view === 'inventory') { Inventory.refreshFilters(); Inventory.render(); }
    if (view === 'pos') POS.refresh();
    if (view === 'orders') Orders.render();
    if (view === 'categories') _renderCategories();
    if (view === 'shop') { Shop.populateFilters(); Shop.renderProducts(); }
  }

  // ========== Sidebar Toggle ==========
  function _bindSidebarToggle() {
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
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
      const prods = Store.getProductsByOwner(user.id).filter(p => p.categoryId === cat.id);
      return `<div class="category-card">
        <div class="color-swatch" style="background:${cat.color}"></div>
        <div class="category-info"><h4>${_esc(cat.name)}</h4><span>${prods.length} product${prods.length !== 1 ? 's' : ''}</span></div>
        <div class="category-actions">
          <button class="btn-icon edit" title="Edit" onclick="App.editCategory('${cat.id}')"><i class="fas fa-pen"></i></button>
          <button class="btn-icon delete" title="Delete" onclick="App.deleteCategory('${cat.id}')"><i class="fas fa-trash-can"></i></button>
        </div>
      </div>`;
    }).join('');
  }

  function editCategory(catId) { _openCategoryModal(catId); }

  function deleteCategory(catId) {
    const cat = Store.getCategoryById(catId);
    if (!cat) return;
    document.getElementById('delete-message').textContent = `Delete category "${cat.name}"?`;
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
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, showToast, editCategory, deleteCategory };
})();

document.addEventListener('DOMContentLoaded', App.init);
