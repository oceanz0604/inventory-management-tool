// Walks the real Zentory shell (index.html) against the in-memory Firebase stub.
(function () {
  const results = [];
  window.open = function () {
    return { document: { write: function () {}, close: function () {} }, close: function () {} };
  };

  function finish() {
    const el = document.getElementById('zentory-test-result');
    if (el) el.textContent = JSON.stringify({ done: true, results: results });
  }

  window.addEventListener('error', function (e) {
    results.push({ name: 'page error', pass: false, detail: String(e.message || e.error) });
  });

  function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
  function $(id) { return document.getElementById(id); }
  function text(id) { const el = typeof id === 'string' ? $(id) : id; return el ? el.textContent : ''; }
  function hidden(id) { const el = typeof id === 'string' ? $(id) : id; return !el || el.classList.contains('hidden'); }
  function lastToast() {
    const nodes = document.querySelectorAll('#toast-container .toast span');
    return nodes.length ? nodes[nodes.length - 1].textContent : '';
  }
  function setVal(id, value) {
    const el = typeof id === 'string' ? $(id) : id;
    if (!el) throw new Error('missing field ' + id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function byText(sel, needle) {
    return Array.from(document.querySelectorAll(sel)).find(function (el) {
      return el.textContent.indexOf(needle) >= 0;
    });
  }
  function pickCombo(id, query) {
    const sel = $(id);
    if (!sel._ssBtn) SearchableSelect.enhance(sel);
    sel._ssBtn.click();
    const input = sel._ssPanel.querySelector('input');
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const opt = sel._ssPanel.querySelector('.ss-opt:not(.dis)');
    if (!opt) throw new Error('no match for ' + query + ' in ' + id);
    opt.click();
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, label) {
    const start = Date.now();
    let last = '';
    while (Date.now() - start < 5000) {
      try { if (fn()) return; } catch (err) { last = err.message; }
      await sleep(25);
    }
    throw new Error((label || 'timed out') + (last ? ' (' + last + ')' : ''));
  }
  async function scenario(name, fn) {
    try {
      document.querySelectorAll('.modal').forEach(function (m) { m.classList.add('hidden'); });
      const ob = $('onboarding-overlay');
      if (ob) ob.classList.add('hidden');
      if (typeof SearchableSelect !== 'undefined') SearchableSelect.closeAll();
      await fn();
      results.push({ name: name, pass: true });
    } catch (err) {
      results.push({ name: name, pass: false, detail: err && err.stack ? err.stack : String(err) });
    }
  }
  function viewOn(name) { return !hidden('view-' + name); }
  function rowText(sel) { return text(document.querySelector(sel)); }

  async function seed() {
    const cred = await Creds.make('secret1');
    function user(extra) {
      return Object.assign({
        salt: cred.salt, passwordHash: cred.passwordHash, companyId: 'co_test',
        onboarding: { completed: true },
      }, extra);
    }
    __fakeDb.put('companies', { id: 'co_test', code: 'testcafe', name: 'Test Cafe', status: 'active' });
    __fakeDb.put('companies', { id: 'co_other', code: 'othershop', name: 'Other Shop', status: 'active' });
    __fakeDb.put('companies', { id: 'co_third', code: 'thirdshop', name: 'Third Shop', status: 'active' });
    __fakeDb.put('users', user({ id: 'user_owner', name: 'Asha Owner', username: 'asha', role: 'owner', shopName: 'Test Cafe' }));
    __fakeDb.put('users', user({ id: 'user_staff', name: 'Sam Staff', username: 'sam', role: 'staff' }));
    __fakeDb.put('users', user({ id: 'user_mkt', name: 'Mia Market', username: 'mia', role: 'marketing' }));
    __fakeDb.put('users', { id: 'co_other', name: 'Other Shop', username: 'other', role: 'owner', companyId: 'co_other', shopName: 'Other Shop' });
    __fakeDb.put('categories', { id: 'cat_drinks', name: 'Drinks', color: '#f59e0b' });
    __fakeDb.put('categories', { id: 'cat_snacks', name: 'Snacks', color: '#10b981' });
    __fakeDb.put('locations', { id: 'loc_main', ownerId: 'co_test', name: 'Cafe Counter', address: '12 Marine Drive', isDefault: true });
    __fakeDb.put('locations', { id: 'loc_store', ownerId: 'co_test', name: 'Dry Store', address: 'Lane 2', isDefault: false });
    __fakeDb.put('locations', { id: 'loc_other', ownerId: 'co_other', name: 'Other Counter', isDefault: true });
    __fakeDb.put('locations', { id: 'loc_third', ownerId: 'co_third', name: 'Third Counter', isDefault: true });
    __fakeDb.put('products', { id: 'tea', ownerId: 'co_test', name: 'Masala Tea', sku: 'TEA', type: 'simple', categoryId: 'cat_drinks', unit: 'cup', price: 100, costPrice: 40, gstRate: 18, isPublished: true, description: 'Hot tea' });
    __fakeDb.put('products', { id: 'cookie', ownerId: 'co_test', name: 'Cookie', sku: 'CK', type: 'simple', categoryId: 'cat_snacks', unit: 'pcs', price: 30, costPrice: 10, gstRate: 0, isPublished: false });
    __fakeDb.put('products', { id: 'beans', ownerId: 'co_test', name: 'Beans', sku: 'BNS', type: 'raw', categoryId: 'cat_drinks', unit: 'g', price: 0, costPrice: 2, gstRate: 0, isPublished: false });
    __fakeDb.put('products', { id: 'latte', ownerId: 'co_test', name: 'Latte', sku: 'LAT', type: 'complex', categoryId: 'cat_drinks', unit: 'cup', price: 120, costPrice: 20, gstRate: 5, isPublished: true, fulfillment: 'mto', recipe: { outputQty: 1, ingredients: [{ productId: 'beans', qty: 10 }] } });
    __fakeDb.put('products', { id: 'biscuit', ownerId: 'co_test', name: 'Biscuit', sku: 'BIS', type: 'simple', categoryId: 'cat_snacks', unit: 'pcs', price: 20, costPrice: 8, gstRate: 0, isPublished: false });
    __fakeDb.put('products', { id: 'sugar', ownerId: 'co_other', name: 'Sugar', sku: 'SUG', type: 'simple', categoryId: 'cat_snacks', unit: 'kg', price: 50, costPrice: 30, gstRate: 0, isPublished: true, description: 'Wholesale sugar' });
    __fakeDb.put('products', { id: 'honey', ownerId: 'co_third', name: 'Honey', sku: 'HNY', type: 'simple', categoryId: 'cat_snacks', unit: 'kg', price: 80, costPrice: 40, gstRate: 0, isPublished: true, description: 'Wild honey' });
    __fakeDb.put('batches', { id: 'bat_tea', ownerId: 'co_test', productId: 'tea', locationId: 'loc_main', qty: 10, unitCost: 40, batchNumber: 'TEA-1', expiryDate: '2026-12-01', createdAt: '2026-01-01T00:00:00.000Z' });
    __fakeDb.put('batches', { id: 'bat_tea2', ownerId: 'co_test', productId: 'tea', locationId: 'loc_main', qty: 4, unitCost: 45, batchNumber: 'TEA-2', expiryDate: '2027-06-01', createdAt: '2026-06-01T00:00:00.000Z' });
    __fakeDb.put('batches', { id: 'bat_cookie', ownerId: 'co_test', productId: 'cookie', locationId: 'loc_main', qty: 1, unitCost: 10, batchNumber: 'CK-1', createdAt: '2026-02-01T00:00:00.000Z' });
    __fakeDb.put('batches', { id: 'bat_beans', ownerId: 'co_test', productId: 'beans', locationId: 'loc_main', qty: 100, unitCost: 2, batchNumber: 'BNS-1', createdAt: '2026-03-01T00:00:00.000Z' });
    __fakeDb.put('batches', { id: 'bat_bis', ownerId: 'co_test', productId: 'biscuit', locationId: 'loc_main', qty: 5, unitCost: 8, batchNumber: 'BIS-1', createdAt: '2026-03-01T00:00:00.000Z' });
    __fakeDb.put('batches', { id: 'bat_sugar', ownerId: 'co_other', productId: 'sugar', locationId: 'loc_other', qty: 20, unitCost: 30, batchNumber: 'SUG-1', createdAt: '2026-03-01T00:00:00.000Z' });
    __fakeDb.put('stock', { id: 'stk_tea', ownerId: 'co_test', productId: 'tea', locationId: 'loc_main', quantity: 14, minStock: 2 });
    __fakeDb.put('stock', { id: 'stk_cookie', ownerId: 'co_test', productId: 'cookie', locationId: 'loc_main', quantity: 1, minStock: 5 });
    __fakeDb.put('stock', { id: 'stk_beans', ownerId: 'co_test', productId: 'beans', locationId: 'loc_main', quantity: 100, minStock: 0 });
    __fakeDb.put('stock', { id: 'stk_bis', ownerId: 'co_test', productId: 'biscuit', locationId: 'loc_main', quantity: 5, minStock: 0 });
    __fakeDb.put('stock', { id: 'stk_sugar', ownerId: 'co_other', productId: 'sugar', locationId: 'loc_other', quantity: 20, minStock: 0 });
    __fakeDb.put('stock', { id: 'stk_honey', ownerId: 'co_third', productId: 'honey', locationId: 'loc_third', quantity: 8, minStock: 0 });
    __fakeDb.put('parties', { id: 'party_farm', ownerId: 'co_test', name: 'Farm Co', type: 'seller', location: 'Pune', phone: '9999900001' });
    __fakeDb.put('parties', { id: 'party_ram', ownerId: 'co_test', name: 'Ramesh', type: 'customer', location: 'Dadar', phone: '9999900002' });
    __fakeDb.put('khata', { id: 'kh1', ownerId: 'co_test', partyId: 'party_ram', partyName: 'Ramesh', type: 'credit', amount: 80, description: 'Opening', entryNumber: 'KH-101', createdAt: '2026-10-01T00:00:00.000Z' });
    const now = new Date().toISOString();
    __fakeDb.put('pos_sales', { id: 'sale_old', ownerId: 'co_test', receiptNumber: 'RCT-9001', locationId: 'loc_main', items: [{ productId: 'tea', name: 'Masala Tea', qty: 1, price: 100, costPrice: 40, gstRate: 18 }], subtotal: 100, taxAmount: 18, total: 118, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: now });
    __fakeDb.put('orders', { id: 'ord_field_new', orderNumber: 'ORD-2001', kind: 'field_sale', sellerId: 'co_test', buyerId: null, customerPartyId: 'party_ram', items: [{ productId: 'tea', name: 'Masala Tea', qty: 1, unitPrice: 50 }], status: 'pending', total: 50, amountPaid: 0, paymentStatus: 'unpaid', createdAt: now, updatedAt: now });
    __fakeDb.put('orders', { id: 'ord_po', orderNumber: 'ORD-2002', kind: 'manual_purchase', buyerId: 'co_test', sellerId: null, sellerPartyId: 'party_farm', fulfillmentLocationId: 'loc_main', items: [{ productId: 'beans', name: 'Beans', qty: 5, unitPrice: 2 }], status: 'pending', total: 10, amountPaid: 0, paymentStatus: 'unpaid', createdAt: now, updatedAt: now });
    __fakeDb.put('orders', { id: 'ord_sale', orderNumber: 'ORD-2003', buyerId: 'co_other', sellerId: 'co_test', items: [{ productId: 'biscuit', name: 'Biscuit', sku: 'BIS', qty: 1, unitPrice: 20 }], status: 'pending', total: 20, createdAt: now, updatedAt: now });
    __fakeDb.put('orders', { id: 'ord_buy', orderNumber: 'ORD-2004', buyerId: 'co_test', sellerId: 'co_other', items: [{ productId: 'sugar', name: 'Sugar', sku: 'SUG', qty: 1, unitPrice: 50 }], status: 'pending', total: 50, createdAt: now, updatedAt: now });
  }

  async function loginAs(username) {
    if (!$('auth-screen') || hidden('auth-screen')) {
      $('logout-btn').click();
      await waitFor(function () { return !hidden('auth-screen'); }, 'auth screen');
    }
    setVal('company-code', 'testcafe');
    $('company-form').requestSubmit();
    await waitFor(function () { return !hidden('login-form'); }, 'login form');
    setVal('login-username', username);
    setVal('login-password', 'secret1');
    $('login-form').requestSubmit();
    await waitFor(function () { return hidden('app') === false; }, 'app shell for ' + username);
    await waitFor(function () {
      if (username === 'asha') return text('stat-total-products') !== '0' && text('stat-total-products') !== '';
      return Store.getProductsByOwner('co_test').length > 0;
    }, 'synced catalog for ' + username);
  }

  document.addEventListener('DOMContentLoaded', function () {
    run().catch(function (err) {
      results.push({ name: 'runner', pass: false, detail: String(err && err.stack || err) });
    }).then(finish);
  });

  async function run() {
    await seed();

    await scenario('Company code rejects an unknown cafe', async function () {
      assert(!hidden('auth-screen'), 'auth screen hidden');
      setVal('company-code', 'nope');
      $('company-form').requestSubmit();
      await waitFor(function () { return !hidden('auth-error') && text('auth-error').indexOf('No company found') >= 0; }, 'company error');
    });

    await scenario('A known company can be changed, and a wrong password stays on sign-in', async function () {
      setVal('company-code', 'testcafe');
      $('company-form').requestSubmit();
      await waitFor(function () { return !hidden('login-form'); }, 'login form');
      assert(text('login-heading').indexOf('Test Cafe') >= 0, text('login-heading'));
      $('change-company-link').click();
      assert(!hidden('company-form'), 'company form hidden');
      setVal('company-code', 'testcafe');
      $('company-form').requestSubmit();
      await waitFor(function () { return !hidden('login-form'); }, 'login form again');
      setVal('login-username', 'asha');
      setVal('login-password', 'wrong-pass');
      $('login-form').requestSubmit();
      await waitFor(function () { return !hidden('auth-error') && text('auth-error').indexOf('Invalid') >= 0; }, 'bad password');
      assert(hidden('app') !== false, 'app opened on a bad password');
    });

    await scenario('Login with a company code, username, and password opens the dashboard', async function () {
      await loginAs('asha');
      assert(viewOn('dashboard'), 'dashboard not shown');
      assert(text('page-title') === 'Dashboard', text('page-title'));
      assert(text('user-name').indexOf('Asha') >= 0, text('user-name'));
      assert(hidden('onboarding-overlay'), 'onboarding covered the app');
    });

    await scenario('Sidebar, theme, refresh, and notification bell', async function () {
      $('sidebar-toggle').click();
      assert($('sidebar').classList.contains('open'), 'sidebar did not open');
      $('sidebar-overlay').click();
      assert(!$('sidebar').classList.contains('open'), 'overlay did not close the sidebar');
      const before = document.documentElement.getAttribute('data-theme');
      $('theme-toggle').click();
      assert(document.documentElement.getAttribute('data-theme') !== before, 'theme did not change');
      $('theme-toggle').click();
      $('sync-refresh').click();
      await waitFor(function () { return lastToast() === 'Data refreshed'; }, 'refresh toast');
      $('notification-bell').click();
      assert(!hidden('notification-dropdown'), 'notification panel stayed closed');
      assert(!$('notification-badge').classList.contains('hidden'), 'low-stock badge hidden');
      assert(text('notification-list').indexOf('Cookie') >= 0, text('notification-list'));
      $('dismiss-all-notifications').click();
      assert(hidden('notification-dropdown'), 'dismiss left the panel open');
    });

    await scenario('Every sidebar destination opens its page', async function () {
      const titles = {
        dashboard: 'Dashboard', locations: 'Locations', products: 'Products',
        inventory: 'Inventory', pos: 'POS Counter', orders: 'Orders', purchase: 'Purchase',
        categories: 'Categories', shop: 'Shop', reports: 'Reports', khata: 'Khata / Credit',
        'field-order': 'Field Orders', parties: 'Customers / Sellers', team: 'Team', settings: 'Settings',
      };
      const items = Array.from(document.querySelectorAll('.sidebar .nav-item[data-view]'));
      assert(items.length === Object.keys(titles).length, 'nav count ' + items.length);
      for (let i = 0; i < items.length; i++) {
        const view = items[i].dataset.view;
        items[i].click();
        await waitFor(function () { return viewOn(view); }, view);
        assert(text('page-title') === titles[view], text('page-title') + ' for ' + view);
      }
      document.querySelectorAll('.nav-group-toggle').forEach(function (toggle) {
        toggle.click();
        assert(toggle.getAttribute('aria-expanded') === 'false', 'group stayed open');
        toggle.click();
        assert(toggle.getAttribute('aria-expanded') === 'true', 'group stayed closed');
      });
    });

    await scenario('Nav groups, bottom bar, and the More sheet', async function () {
      const toggle = document.querySelector('.nav-group-toggle');
      toggle.click();
      assert(toggle.getAttribute('aria-expanded') === 'false', 'group did not collapse');
      toggle.click();
      assert(toggle.getAttribute('aria-expanded') === 'true', 'group did not expand');
      document.querySelector('#bottom-nav .bnav-item[data-view="products"]').click();
      assert(viewOn('products'), 'bottom nav did not open products');
      $('bnav-more').click();
      assert(!hidden('more-sheet'), 'more sheet stayed closed');
      document.querySelector('#more-sheet .more-sheet-item[data-view="khata"]').click();
      assert(viewOn('khata'), 'more sheet did not open khata');
      $('bnav-more').click();
      $('more-customize-nav').click();
      assert(!hidden('bottomnav-modal'), 'customize modal stayed closed');
      const boxes = document.querySelectorAll('#bottomnav-options input');
      boxes.forEach(function (b) { b.checked = false; });
      boxes[0].checked = true;
      $('bottomnav-save').click();
      await waitFor(function () { return lastToast() === 'Bottom bar updated'; }, 'bottom bar toast');
      assert(hidden('bottomnav-modal'), 'modal stayed open');
    });

    await scenario('Dashboard stats, quick action, and low stock', async function () {
      App.goTo('dashboard');
      assert(text('dash-greeting').indexOf('Asha') >= 0, text('dash-greeting'));
      assert(text('stat-total-products') !== '0', 'product count');
      assert(text('stat-low-stock') !== '0', 'low stock count');
      assert(text('low-stock-table-body').indexOf('Cookie') >= 0, text('low-stock-table-body'));
      assert(text('dash-date').length > 3, 'date');
      assert($('dash-top-products'), 'top products');
      assert($('dash-activity'), 'activity');
      document.querySelector('#dash-stats [data-go="products"]').click();
      assert(viewOn('products'), 'product stat card');
      App.goTo('dashboard');
      document.querySelector('#dash-stats [data-go="orders"]').click();
      assert(viewOn('orders'), 'orders stat card');
      App.goTo('dashboard');
      document.querySelector('#dash-quick [data-go="pos"]').click();
      assert(viewOn('pos'), 'quick action did not open POS');
      App.goTo('dashboard');
      $('dash-restock-btn').click();
      assert(viewOn('inventory'), 'restock button did not open inventory');
    });

    await scenario('Locations search, add, edit, and delete', async function () {
      App.goTo('locations');
      assert(text('locations-grid').indexOf('Cafe Counter') >= 0, 'missing counter');
      setVal('location-search', 'dry');
      assert(text('locations-grid').indexOf('Dry Store') >= 0, 'search missed Dry Store');
      assert(text('locations-grid').indexOf('Cafe Counter') < 0, 'search still showed the counter');
      setVal('location-search', 'zzzz-none');
      assert(text('locations-grid').indexOf('No locations match') >= 0, text('locations-grid'));
      setVal('location-search', '');
      $('add-location-btn').click();
      assert(!hidden('location-modal'), 'add location modal closed');
      setVal('location-name', 'Window Seat');
      setVal('location-address', 'By the window');
      $('location-default').checked = false;
      $('location-form').requestSubmit();
      await waitFor(function () { return text('locations-grid').indexOf('Window Seat') >= 0; }, 'new location');
      byText('#locations-grid .location-card', 'Window Seat').querySelector('.btn-icon.edit').click();
      assert($('location-modal-title').textContent.indexOf('Edit') >= 0, $('location-modal-title').textContent);
      setVal('location-name', 'Window Seat East');
      $('location-form').requestSubmit();
      await waitFor(function () { return text('locations-grid').indexOf('Window Seat East') >= 0; }, 'renamed location');
      assert(text('locations-grid').indexOf('Cafe Counter') >= 0, 'edit renamed the counter');
      byText('#locations-grid .location-card', 'Window Seat East').querySelector('.btn-icon.delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return text('locations-grid').indexOf('Window Seat East') < 0; }, 'deleted location');
      assert(text('locations-grid').indexOf('Cafe Counter') >= 0, 'counter deleted');
      assert(text('locations-grid').indexOf('Dry Store') >= 0, 'store deleted');
    });

    await scenario('Categories search, add, edit, and delete', async function () {
      App.goTo('categories');
      setVal('category-search', 'snack');
      assert(text('categories-grid').indexOf('Snacks') >= 0, 'search missed snacks');
      assert(text('categories-grid').indexOf('Drinks') < 0, 'search still showed drinks');
      setVal('category-search', 'zzzz-none');
      assert(text('categories-grid').indexOf('No categories match') >= 0, text('categories-grid'));
      setVal('category-search', '');
      $('add-category-btn').click();
      setVal('category-name', 'Bakery');
      $('category-color').value = '#ec4899';
      $('category-color').dispatchEvent(new Event('input'));
      $('category-form').requestSubmit();
      await waitFor(function () { return text('categories-grid').indexOf('Bakery') >= 0; }, 'bakery');
      const cards = document.querySelectorAll('#categories-grid .category-card');
      cards[cards.length - 1].querySelector('.btn-icon.edit').click();
      setVal('category-name', 'Bakery Fresh');
      $('category-form').requestSubmit();
      await waitFor(function () { return text('categories-grid').indexOf('Bakery Fresh') >= 0; }, 'renamed category');
      const again = document.querySelectorAll('#categories-grid .category-card');
      again[again.length - 1].querySelector('.btn-icon.delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return text('categories-grid').indexOf('Bakery Fresh') < 0; }, 'deleted category');
    });

    await scenario('Product search, filters, sort, add, detail save, and publish', async function () {
      App.goTo('products');
      setVal('product-search', 'masala');
      assert(text('products-table-body').indexOf('Masala Tea') >= 0, 'search missed tea');
      assert(text('products-table-body').indexOf('Cookie') < 0, 'search still showed cookie');
      setVal('product-search', '');
      setVal('product-filter-type', 'raw');
      assert(text('products-table-body').indexOf('Beans') >= 0, 'type filter');
      assert(text('products-table-body').indexOf('Masala Tea') < 0, 'type filter leaked tea');
      setVal('product-filter-type', '');
      setVal('product-filter-category', 'cat_snacks');
      assert(text('products-table-body').indexOf('Cookie') >= 0, 'category filter');
      setVal('product-filter-category', '');
      setVal('product-filter-unit', 'cup');
      assert(text('products-table-body').indexOf('Latte') >= 0, 'unit filter');
      setVal('product-filter-unit', '');
      setVal('product-filter-published', '1');
      assert(text('products-table-body').indexOf('Cookie') < 0, 'published filter showed cookie');
      setVal('product-filter-published', '0');
      assert(text('products-table-body').indexOf('Cookie') >= 0, 'unpublished filter');
      assert(text('products-table-body').indexOf('Masala Tea') < 0, 'unpublished filter leaked tea');
      setVal('product-filter-published', '');
      setVal('product-search', 'zzzz-none');
      assert(text('products-table-body').indexOf('No products match') >= 0, text('products-table-body'));
      setVal('product-search', '');
      pickCombo('product-filter-category', 'Snack');
      assert($('product-filter-category').value === 'cat_snacks', $('product-filter-category').value);
      assert(text('products-table-body').indexOf('Cookie') >= 0, 'combobox category');
      assert(text('products-table-body').indexOf('Masala Tea') < 0, 'combobox leaked tea');
      setVal('product-filter-category', '');
      const nameHeader = document.querySelector('#view-products thead th');
      nameHeader.click();
      const first = document.querySelector('#products-table-body tr td').textContent;
      nameHeader.click();
      const flipped = document.querySelector('#products-table-body tr td').textContent;
      assert(first !== flipped, 'sort did not change the first row');
      $('add-product-btn').click();
      assert(!hidden('product-modal'), 'product modal');
      setVal('product-name', 'Cold Coffee');
      setVal('product-sku', 'COLD');
      setVal('product-price', '90');
      setVal('product-mrp', '80');
      $('product-form').requestSubmit();
      await waitFor(function () { return lastToast() === 'Selling price cannot exceed MRP'; }, 'mrp guard');
      setVal('product-mrp', '120');
      $('product-form').requestSubmit();
      await waitFor(function () { return text('products-table-body').indexOf('Cold Coffee') >= 0; }, 'added product');
      const coffeeRow = Array.from(document.querySelectorAll('#products-table-body tr')).find(function (r) { return r.textContent.indexOf('Cold Coffee') >= 0; });
      coffeeRow.querySelector('.btn-icon.edit').click();
      assert(viewOn('product-detail'), 'detail');
      assert(text('pd-hero').indexOf('Cold Coffee') >= 0, text('pd-hero'));
      $('pd-edit').click();
      assert($('pd-form-card').classList.contains('pd-highlight'), 'edit did not highlight the form');
      setVal('pd-price', '200');
      $('product-detail-form').requestSubmit();
      await waitFor(function () { return lastToast() === 'Selling price cannot exceed MRP'; }, 'detail mrp');
      setVal('pd-price', '95');
      setVal('pd-wholesale', '70');
      setVal('pd-hsn', '2101');
      $('product-detail-form').requestSubmit();
      await waitFor(function () { return lastToast() === 'Product saved'; }, 'detail save ' + lastToast());
      const saved = Store.getProductsByOwner('co_test').find(function (p) { return p.name === 'Cold Coffee'; });
      assert(saved && saved.price === 95 && saved.hsnCode === '2101', JSON.stringify(saved && { price: saved.price, hsn: saved.hsnCode }));
      $('pd-back').click();
      assert(viewOn('products'), 'back from detail');
      const published = Array.from(document.querySelectorAll('#products-table-body tr')).find(function (r) { return r.textContent.indexOf('Cold Coffee') >= 0; });
      const toggle = published.querySelector('input[type="checkbox"]');
      toggle.click();
      await waitFor(function () { return lastToast() === 'Product unpublished'; }, 'unpublish');
      published.querySelector('.btn-icon.edit').click();
      assert(viewOn('product-detail'), 'detail again');
      $('pd-delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return !Store.getProductsByOwner('co_test').some(function (p) { return p.name === 'Cold Coffee'; }); }, 'detail delete');
    });

    await scenario('Produce a make-to-order item from its recipe', async function () {
      App.goTo('products');
      const before = Store.getBatchQty('beans', 'loc_main');
      const latteOpen = Array.from(document.querySelectorAll('#products-table-body tr')).find(function (r) { return r.textContent.indexOf('Latte') >= 0; });
      latteOpen.querySelector('.btn-icon.edit').click();
      assert(viewOn('product-detail'), 'latte detail before produce');
      $('pd-produce').click();
      assert(!hidden('produce-modal'), 'produce modal');
      setVal('produce-product', 'latte');
      setVal('produce-location', 'loc_main');
      setVal('produce-qty', '1');
      $('produce-form').requestSubmit();
      await waitFor(function () { return lastToast().indexOf('Produced') >= 0; }, 'produce toast ' + lastToast());
      assert(Store.getBatchQty('beans', 'loc_main') === before - 10, 'beans ' + Store.getBatchQty('beans', 'loc_main'));
      const latte = Array.from(document.querySelectorAll('#products-table-body tr')).find(function (r) { return r.textContent.indexOf('Latte') >= 0; });
      latte.querySelector('.btn-icon.edit').click();
      assert(viewOn('product-detail'), 'latte detail');
      assert(text('pd-bom-body').indexOf('Beans') >= 0, text('pd-bom-body'));
      $('pd-produce').click();
      assert(!hidden('produce-modal'), 'detail produce');
      document.querySelector('#produce-modal .modal-close').click();
      assert(hidden('produce-modal'), 'produce stayed open');
    });

    await scenario('Catalog search adds a sector item', async function () {
      App.goTo('products');
      $('catalog-btn').click();
      assert(!hidden('catalog-modal'), 'catalog modal');
      const pill = document.querySelector('#catalog-sectors .catalog-pill');
      pill.click();
      setVal('catalog-search', 'zzzz-no-such');
      assert(text('catalog-items').indexOf('No items match') >= 0, text('catalog-items'));
      setVal('catalog-search', '');
      const box = document.querySelector('#catalog-items input[type="checkbox"]:not(:disabled)');
      assert(box, 'no catalog checkbox');
      box.click();
      $('catalog-add-btn').click();
      await waitFor(function () { return lastToast().indexOf('Added') >= 0; }, 'catalog toast ' + lastToast());
      assert(hidden('catalog-modal'), 'catalog stayed open');
    });

    await scenario('CSV import creates a product', async function () {
      App.goTo('products');
      $('import-btn').click();
      assert(!hidden('import-modal'), 'import modal');
      $('import-template-btn').click();
      const file = new File(['Name,SKU,Type,Selling Price\nBrownie,BRW,simple,80\n'], 'items.csv', { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      $('import-file').files = dt.files;
      $('import-file').dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function () { return !hidden('import-step-map'); }, 'map step');
      $('import-map-back').click();
      assert(!hidden('import-step-upload'), 'back from map');
      $('import-map-next').click();
      await waitFor(function () { return !hidden('import-step-preview'); }, 'preview step');
      $('import-preview-back').click();
      assert(!hidden('import-step-map'), 'back from preview');
      $('import-map-next').click();
      await waitFor(function () { return !hidden('import-step-preview'); }, 'preview again');
      $('import-commit-btn').click();
      await waitFor(function () { return Store.getProductsByOwner('co_test').some(function (p) { return p.name === 'Brownie'; }); }, 'brownie');
    });

    await scenario('Delete a product from the list', async function () {
      App.goTo('products');
      const row = Array.from(document.querySelectorAll('#products-table-body tr')).find(function (r) { return r.textContent.indexOf('Brownie') >= 0; });
      row.querySelector('.btn-icon.delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return !Store.getProductsByOwner('co_test').some(function (p) { return p.name === 'Brownie'; }); }, 'brownie gone');
    });

    await scenario('Inventory search, filters, batch, reorder level, and export', async function () {
      App.goTo('inventory');
      setVal('inventory-search', 'cookie');
      assert(text('inventory-table-body').indexOf('Cookie') >= 0, 'inventory search');
      assert(text('inventory-table-body').indexOf('Masala Tea') < 0, 'inventory search leaked tea');
      setVal('inventory-search', 'zzzz-none');
      assert(text('inventory-table-body').indexOf('No stock matches') >= 0, text('inventory-table-body'));
      setVal('inventory-search', '');
      setVal('filter-stock', 'low');
      assert(text('inventory-table-body').indexOf('Cookie') >= 0, 'low filter');
      setVal('filter-stock', '');
      setVal('filter-location', 'loc_store');
      assert(text('inventory-table-body').indexOf('No stock matches') >= 0, text('inventory-table-body'));
      setVal('filter-location', '');
      $('add-stock-btn').click();
      assert(!hidden('stock-modal'), 'stock modal');
      setVal('stock-product', 'biscuit');
      setVal('stock-location', 'loc_main');
      setVal('stock-quantity', '3');
      setVal('stock-cost', '9');
      setVal('stock-batch', 'BIS-NEW');
      $('stock-form').requestSubmit();
      await waitFor(function () { return lastToast() === 'Batch added. Stock & cost updated.'; }, 'batch toast ' + lastToast());
      assert(Store.getBatchesByProduct('biscuit', 'loc_main').some(function (b) { return b.batchNumber === 'BIS-NEW'; }), 'batch missing');
      const teaRow = Array.from(document.querySelectorAll('#inventory-table-body tr')).find(function (r) { return r.textContent.indexOf('Masala Tea') >= 0; });
      teaRow.querySelector('button').click();
      await waitFor(function () { return text('inventory-table-body').indexOf('TEA-1') >= 0; }, 'lots expanded');
      byText('#inventory-table-body tr', 'TEA-1').querySelector('.btn-icon.edit').click();
      assert($('stock-modal-title').textContent === 'Edit Batch', $('stock-modal-title').textContent);
      document.querySelector('#stock-modal .modal-close').click();
      assert(hidden('stock-modal'), 'batch edit stayed open');
      const cookieRow = Array.from(document.querySelectorAll('#inventory-table-body tr')).find(function (r) { return r.textContent.indexOf('Cookie') >= 0 && r.textContent.indexOf('Low') >= 0; });
      cookieRow.querySelector('.btn-icon.edit').click();
      assert($('stock-modal-title').textContent === 'Set Reorder Level', $('stock-modal-title').textContent);
      setVal('stock-min', '9');
      $('stock-form').requestSubmit();
      await waitFor(function () { return lastToast() === 'Reorder level updated'; }, 'reorder ' + lastToast());
      const bisRow = Array.from(document.querySelectorAll('#inventory-table-body tr')).find(function (r) { return r.textContent.indexOf('Biscuit') >= 0 && r.querySelector('button'); });
      bisRow.querySelector('button').click();
      await waitFor(function () { return text('inventory-table-body').indexOf('BIS-NEW') >= 0; }, 'biscuit lots');
      const lotRow = Array.from(document.querySelectorAll('#inventory-table-body tr')).find(function (r) {
        return r.cells && r.cells[0] && r.cells[0].textContent.indexOf('BIS-NEW') >= 0;
      });
      assert(lotRow, 'BIS-NEW row');
      lotRow.querySelector('.btn-icon.delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return lastToast() === 'Lot deleted'; }, 'lot delete ' + lastToast());
      assert(!Store.getBatchesByProduct('biscuit', 'loc_main').some(function (b) { return b.batchNumber === 'BIS-NEW' && b.qty > 0; }), 'lot remained');
      $('export-btn').click();
      assert(!hidden('export-menu'), 'export menu');
      document.querySelector('.export-option[data-format="csv"]').click();
      await waitFor(function () { return lastToast() === 'CSV exported'; }, 'csv');
      $('export-btn').click();
      document.querySelector('.export-option[data-format="pdf"]').click();
      await waitFor(function () { return lastToast() === 'PDF exported'; }, 'pdf');
    });

    await scenario('Purchase search, clear, supplier, and record', async function () {
      App.goTo('purchase');
      $('po-back-orders').click();
      assert(viewOn('orders'), 'back to orders');
      App.goTo('purchase');
      setVal('po-search', 'bean');
      assert(text('po-product-grid').indexOf('Beans') >= 0, 'purchase search');
      assert(text('po-product-grid').indexOf('Masala Tea') < 0, 'purchase search showed tea');
      assert(text('po-product-grid').indexOf('Latte') < 0, 'purchase search showed a recipe item');
      setVal('po-search', '');
      pickCombo('po-cat-filter', 'Drink');
      assert(text('po-product-grid').indexOf('Beans') >= 0, 'purchase category');
      assert(text('po-product-grid').indexOf('Cookie') < 0, 'purchase category leaked cookie');
      setVal('po-cat-filter', '');
      function beansCard() {
        return Array.from(document.querySelectorAll('#po-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Beans') >= 0; });
      }
      beansCard().click();
      assert(text('po-item-count') === '1', text('po-item-count'));
      setVal(document.querySelector('.po-qty'), '3');
      assert(text('po-total').indexOf('6.00') >= 0, text('po-total'));
      document.querySelector('#po-bill-items .pos-bill-row-remove').click();
      assert(text('po-item-count') === '0', 'remove line');
      beansCard().click();
      $('po-clear').click();
      assert(text('po-item-count') === '0', 'clear failed');
      $('po-submit').click();
      assert(lastToast() === 'Select a supplier', lastToast());
      $('po-add-seller').click();
      assert(!hidden('party-modal'), 'supplier modal');
      setVal('party-name', 'Valley Farm');
      $('party-form').requestSubmit();
      await waitFor(function () { return $('po-seller').value; }, 'supplier selected');
      beansCard().click();
      setVal('po-paid', '2');
      const before = Store.getBatchQty('beans', 'loc_main');
      $('po-submit').click();
      await waitFor(function () { return lastToast().indexOf('Purchase recorded') >= 0; }, lastToast());
      assert(Store.getBatchQty('beans', 'loc_main') === before + 1, 'purchase stock');
      assert(viewOn('orders'), 'did not return to orders');
    });

    await scenario('Orders tabs, approve, ship, deliver, field sale, and receive', async function () {
      App.goTo('orders');
      assert(text('orders-table-body').indexOf('ORD-2003') >= 0, 'sales order missing');
      const orderHeader = document.querySelector('#view-orders thead th');
      const orderFirst = document.querySelector('#orders-table-body tr td').textContent;
      orderHeader.click();
      orderHeader.click();
      assert(document.querySelector('#orders-table-body tr td').textContent !== orderFirst, 'orders sort');
      document.querySelector('#order-tabs .tab[data-tab="purchase"]').click();
      assert(text('order-party-header') === 'Supplier', text('order-party-header'));
      assert(text('orders-table-body').indexOf('ORD-2002') >= 0, 'purchase order missing');
      assert(!hidden('orders-actions'), 'new purchase action hidden');
      const recv = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Receive'; });
      const before = Store.getBatchQty('beans', 'loc_main');
      recv.click();
      await waitFor(function () { return lastToast().indexOf('Purchase received') >= 0; }, lastToast());
      assert(Store.getBatchQty('beans', 'loc_main') === before + 5, 'receive qty');
      document.querySelector('#order-tabs .tab[data-tab="sales"]').click();
      const view = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.querySelector('.fa-eye'); });
      view.click();
      assert(!hidden('order-detail-modal'), 'detail modal');
      document.querySelector('#order-detail-footer .modal-close').click();
      assert(hidden('order-detail-modal'), 'detail stayed open');
      const approve = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Approve'; });
      approve.click();
      await waitFor(function () { return lastToast() === 'Order approved'; }, lastToast());
      const ship = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Ship'; });
      ship.click();
      const deliver = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Deliver'; });
      const bisBefore = Store.getBatchQty('biscuit', 'loc_main');
      deliver.click();
      await waitFor(function () { return lastToast().indexOf('Order delivered') >= 0; }, lastToast());
      assert(Store.getBatchQty('biscuit', 'loc_main') === bisBefore - 1, 'deliver stock');
      const invoice = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.querySelector('.fa-file-invoice-dollar'); });
      invoice.click();
      assert(!hidden('invoice-modal'), 'invoice modal');
      assert(text('invoice-body').indexOf('ORD-2003') >= 0, text('invoice-body'));
      assert(text('invoice-body').indexOf('Biscuit') >= 0, 'invoice line');
      $('print-invoice-btn').click();
      document.querySelector('#invoice-modal .modal-close').click();
      assert(hidden('invoice-modal'), 'invoice stayed open');
      const accept = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Accept'; });
      accept.click();
      await waitFor(function () { return lastToast() === 'Order accepted'; }, lastToast());
      const openDeliver = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Deliver'; });
      openDeliver.click();
      assert(!hidden('fulfill-modal'), 'fulfill modal');
      setVal('fulfill-amount', '20');
      const teaBefore = Store.getBatchQty('tea', 'loc_main');
      $('fulfill-confirm').click();
      await waitFor(function () { return lastToast().indexOf('delivered') >= 0; }, lastToast());
      assert(Store.getBatchQty('tea', 'loc_main') === teaBefore - 1, 'field stock');
      const paid = Array.from(document.querySelectorAll('#orders-table-body button')).find(function (b) { return b.textContent.trim() === 'Mark Paid'; });
      assert(paid, 'mark paid missing');
      paid.click();
      await waitFor(function () { return lastToast() === 'Marked as paid'; }, lastToast());
      document.querySelector('#order-tabs .tab[data-tab="purchase"]').click();
      $('new-manual-purchase-btn').click();
      assert(viewOn('purchase'), 'new purchase button');
    });

    await scenario('POS search, filters, bill controls, and checkout', async function () {
      App.goTo('pos');
      assert($('pos-checkout-btn').disabled === false, 'checkout disabled');
      $('pos-checkout-btn').click();
      assert(lastToast() === 'Add a product to the bill first', lastToast());
      setVal('pos-search', 'masala');
      assert(text('pos-product-grid').indexOf('Masala Tea') >= 0, 'pos search');
      assert(text('pos-product-grid').indexOf('Cookie') < 0, 'pos search leaked cookie');
      setVal('pos-search', 'zzzz-none');
      assert(text('pos-product-grid').indexOf('Masala Tea') < 0, 'pos search kept tea');
      setVal('pos-search', '');
      pickCombo('pos-cat-filter', 'Drink');
      assert($('pos-cat-filter').value === 'cat_drinks', $('pos-cat-filter').value);
      assert(text('pos-product-grid').indexOf('Cookie') < 0, 'category filter');
      setVal('pos-cat-filter', '');
      setVal('pos-location', 'loc_store');
      assert(text('pos-product-grid').indexOf('Masala Tea') < 0, 'other location still showed tea');
      setVal('pos-location', 'loc_main');
      const teaCard = Array.from(document.querySelectorAll('#pos-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Masala Tea') >= 0; });
      teaCard.click();
      teaCard.click();
      const cookieCard = Array.from(document.querySelectorAll('#pos-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Cookie') >= 0; });
      cookieCard.click();
      assert(text('pos-item-count') === '3', text('pos-item-count'));
      byText('#pos-bill-items .pos-bill-row', 'Cookie').querySelector('.pos-bill-row-remove').click();
      assert(text('pos-item-count') === '2', 'remove line');
      const lot = document.querySelector('#pos-bill-items select');
      assert(lot, 'lot picker missing');
      setVal(lot, 'bat_tea2');
      assert(text('pos-total').indexOf('236') >= 0, text('pos-total'));
      document.querySelector('#pos-bill-items .fa-minus').closest('button').click();
      assert(text('pos-item-count') === '1', 'minus');
      assert(text('pos-gst').indexOf('18') >= 0, text('pos-gst'));
      assert(text('pos-total').indexOf('118') >= 0, text('pos-total'));
      setVal('pos-customer-name', 'Neha');
      setVal('pos-payment', 'upi');
      const before = Store.getBatchQty('tea', 'loc_main');
      const lateBefore = (Store.getBatchById('bat_tea2') || {}).qty;
      $('pos-checkout-btn').click();
      await waitFor(function () { return !hidden('pos-receipt-modal'); }, 'receipt');
      assert(text('pos-receipt-body').indexOf('Neha') >= 0, 'customer on receipt');
      assert(text('pos-receipt-body').indexOf('UPI') >= 0, 'payment on receipt');
      assert(Store.getBatchQty('tea', 'loc_main') === before - 1, 'pos stock');
      assert((Store.getBatchById('bat_tea2') || {}).qty === lateBefore - 1, 'chosen lot');
      assert(text('pos-today-summary').indexOf('Sales') >= 0, text('pos-today-summary'));
      $('pos-print-receipt').click();
      $('pos-receipt-modal').querySelector('.modal-close').click();
      const teaAgain = Array.from(document.querySelectorAll('#pos-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Masala Tea') >= 0; });
      teaAgain.click();
      $('pos-clear-bill').click();
      assert(text('pos-item-count') === '0', 'clear bill');
    });

    await scenario('Shop search, cart quantity, and place order', async function () {
      App.goTo('shop');
      await waitFor(function () { return text('shop-grid').indexOf('Sugar') >= 0; }, 'shop grid');
      setVal('shop-search', 'sugar');
      assert(text('shop-grid').indexOf('Sugar') >= 0, 'shop search');
      setVal('shop-search', 'tea');
      assert(!hidden('no-shop-products'), 'own tea should stay out of the shop');
      setVal('shop-search', '');
      setVal('shop-seller-filter', 'co_other');
      assert(text('shop-grid').indexOf('Other Shop') >= 0, 'seller filter');
      setVal('shop-category-filter', 'cat_snacks');
      assert(text('shop-grid').indexOf('Sugar') >= 0, 'shop category');
      setVal('shop-category-filter', '');
      setVal('shop-seller-filter', '');
      byText('#shop-grid .shop-product-card', 'Sugar').querySelector('.btn-add-cart').click();
      await waitFor(function () { return lastToast() === 'Added to cart'; }, lastToast());
      assert($('cart-badge-nav').textContent === '1', $('cart-badge-nav').textContent);
      byText('#shop-grid .shop-product-card', 'Honey').querySelector('.btn-add-cart').click();
      await waitFor(function () { return lastToast().indexOf('another shop') >= 0; }, lastToast());
      assert($('cart-badge-nav').textContent === '1', 'second seller entered the cart');
      $('open-cart-btn').click();
      assert(!hidden('cart-drawer'), 'cart drawer');
      assert(text('cart-body').indexOf('Other Shop') >= 0, text('cart-body'));
      assert(text('cart-body').indexOf('Ordering from') >= 0, 'seller line');
      document.querySelector('#cart-body .fa-plus').closest('button').click();
      assert(text('cart-total-value').indexOf('100') >= 0, text('cart-total-value'));
      document.querySelector('#cart-body .fa-minus').closest('button').click();
      assert(text('cart-total-value').indexOf('50') >= 0, text('cart-total-value'));
      document.querySelector('#cart-body .fa-plus').closest('button').click();
      $('clear-cart-btn').click();
      assert(text('cart-body').indexOf('empty') >= 0, 'cart not cleared');
      $('close-cart-btn').click();
      assert(hidden('cart-drawer'), 'cart stayed open');
      byText('#shop-grid .shop-product-card', 'Sugar').querySelector('.btn-add-cart').click();
      $('open-cart-btn').click();
      $('cart-overlay').click();
      assert(hidden('cart-drawer'), 'overlay left the cart open');
      $('open-cart-btn').click();
      $('place-order-btn').click();
      await waitFor(function () { return lastToast() === 'Order placed successfully!'; }, lastToast());
      assert(Store.getOrders().some(function (o) { return o.sellerId === 'co_other' && o.buyerId === 'co_test' && o.status === 'pending'; }), 'shop order');
    });

    await scenario('Field order customer, line edit, and place', async function () {
      App.goTo('field-order');
      $('fo-submit').click();
      assert(lastToast() === 'Select a customer first', lastToast());
      $('fo-add-customer').click();
      setVal('party-name', 'Walkup Guest');
      $('party-form').requestSubmit();
      await waitFor(function () { return $('fo-customer').value; }, 'customer selected');
      setVal('fo-product', 'tea');
      await waitFor(function () { return text('fo-items-body').indexOf('Masala Tea') >= 0; }, 'line');
      setVal(document.querySelector('.fo-qty'), '3');
      assert(text('fo-total').indexOf('300') >= 0, text('fo-total'));
      document.querySelector('#fo-items-body .btn-icon.delete').click();
      assert(text('fo-items-body') === '', 'line not removed');
      $('fo-submit').click();
      assert(lastToast() === 'Add at least one product', lastToast());
      setVal('fo-product', 'tea');
      await waitFor(function () { return text('fo-items-body').indexOf('Masala Tea') >= 0; }, 'line again');
      $('fo-submit').click();
      await waitFor(function () { return lastToast() === 'Field order placed'; }, lastToast());
      assert(text('fo-history-body').indexOf('Walkup Guest') >= 0, text('fo-history-body'));
      App.goTo('orders');
      document.querySelector('#order-tabs .tab[data-tab="sales"]').click();
      const guest = byText('#orders-table-body tr', 'Walkup Guest');
      assert(guest, 'guest order missing');
      Array.from(guest.querySelectorAll('button')).find(function (b) { return b.textContent.trim() === 'Cancel'; }).click();
      await waitFor(function () { return lastToast() === 'Order cancelled'; }, lastToast());
      assert(byText('#orders-table-body tr', 'Walkup Guest').textContent.indexOf('Cancelled') >= 0, 'cancel status');
    });

    await scenario('Khata search, new entry, and ledger', async function () {
      App.goTo('khata');
      setVal('khata-search', 'ramesh');
      assert(text('khata-parties').indexOf('Ramesh') >= 0, 'khata search');
      setVal('khata-search', 'zzz');
      assert(text('khata-parties').indexOf('Ramesh') < 0, 'khata search still showed Ramesh');
      setVal('khata-search', '');
      $('add-khata-btn').click();
      assert(!hidden('khata-modal'), 'khata modal');
      assert(text('khata-summary').indexOf('₹') >= 0, text('khata-summary'));
      setVal('khata-party', 'Walk-in Khata');
      setVal('khata-type', 'debit');
      setVal('khata-amount', '30');
      setVal('khata-desc', 'Cash received');
      $('khata-form').requestSubmit();
      await waitFor(function () { return lastToast() === 'Khata entry added'; }, lastToast());
      assert(Store.getKhataBalance('co_test', 'walk-in_khata') === -30, String(Store.getKhataBalance('co_test', 'walk-in_khata')));
      assert(Store.getKhataBalance('co_test', 'party_ram') === 110, 'Ramesh ' + Store.getKhataBalance('co_test', 'party_ram'));
      byText('#khata-parties .khata-party-card', 'Walk-in Khata').click();
      assert(!hidden('khata-ledger-card'), 'ledger');
      assert(text('khata-ledger-body').indexOf('Cash received') >= 0, text('khata-ledger-body'));
      $('khata-ledger-close').click();
      assert(hidden('khata-ledger-card'), 'ledger stayed open');
    });

    await scenario('Parties search, type filter, edit, and delete', async function () {
      App.goTo('parties');
      setVal('parties-search', 'farm');
      assert(text('parties-table-body').indexOf('Farm') >= 0, 'party search');
      setVal('parties-search', '');
      setVal('parties-type-filter', 'customer');
      assert(text('parties-table-body').indexOf('Ramesh') >= 0, 'type filter');
      assert(text('parties-table-body').indexOf('Farm Co') < 0, 'type filter leaked a seller');
      setVal('parties-type-filter', '');
      $('add-party-btn').click();
      setVal('party-name', 'Temp Buyer');
      setVal('party-type', 'customer');
      setVal('party-location', 'Andheri');
      setVal('party-phone', '7777700000');
      $('party-form').requestSubmit();
      await waitFor(function () { return text('parties-table-body').indexOf('Temp Buyer') >= 0; }, 'party added');
      const row = Array.from(document.querySelectorAll('#parties-table-body tr')).find(function (r) { return r.textContent.indexOf('Temp Buyer') >= 0; });
      row.querySelector('.btn-icon.edit').click();
      setVal('party-phone', '8888800000');
      $('party-form').requestSubmit();
      await waitFor(function () { return text('parties-table-body').indexOf('8888800000') >= 0; }, 'party edited');
      const again = Array.from(document.querySelectorAll('#parties-table-body tr')).find(function (r) { return r.textContent.indexOf('Temp Buyer') >= 0; });
      again.querySelector('.btn-icon.delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return text('parties-table-body').indexOf('Temp Buyer') < 0; }, 'party deleted');
    });

    await scenario('Team search, worker create, ingredient switch, and remove', async function () {
      App.goTo('team');
      $('add-worker-btn').click();
      assert(!hidden('worker-modal'), 'worker modal');
      setVal('worker-name', 'Short Pass');
      setVal('worker-username', 'short');
      setVal('worker-password', 'ab');
      setVal('worker-role', 'office');
      $('worker-form').requestSubmit();
      await sleep(30);
      assert(!hidden('worker-modal'), 'short password closed the form');
      assert(text('team-table-body').indexOf('Short Pass') < 0, 'short password created a worker');
      $('worker-password').removeAttribute('minlength');
      $('worker-form').requestSubmit();
      await waitFor(function () { return lastToast().indexOf('at least 4') >= 0; }, lastToast());
      setVal('worker-name', 'Riya Office');
      setVal('worker-username', 'riya');
      setVal('worker-password', 'abcd');
      setVal('worker-role', 'office');
      $('worker-form').requestSubmit();
      await waitFor(function () { return text('team-table-body').indexOf('Riya') >= 0; }, 'worker ' + lastToast());
      setVal('team-search', 'riya');
      assert(text('team-table-body').indexOf('Riya') >= 0, 'team search');
      setVal('team-search', 'nomatch');
      assert(text('team-table-body').indexOf('No team members match') >= 0, text('team-table-body'));
      setVal('team-search', '');
      const track = $('track-ingredient-stock');
      track.checked = false;
      track.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function () { return lastToast().indexOf('no longer depend') >= 0; }, lastToast());
      assert(Store.tracksIngredientStock('co_test') === false, 'flag not saved');
      track.checked = true;
      track.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function () { return Store.tracksIngredientStock('co_test') === true; }, 'flag restored');
      byText('#team-table-body tr', 'Riya').querySelector('.btn-icon.delete').click();
      $('confirm-delete-btn').click();
      await waitFor(function () { return text('team-table-body').indexOf('Riya') < 0; }, 'worker removed');
    });

    await scenario('Reports range updates the summary', async function () {
      App.goTo('reports');
      await waitFor(function () { return text('report-stats').indexOf('Revenue') >= 0; }, 'reports');
      const ranges = ['7', '30', '90', '365'];
      for (let i = 0; i < ranges.length; i++) {
        setVal('report-range', ranges[i]);
        await waitFor(function () { return text('report-stats').indexOf('Revenue') >= 0 && text('report-stats').indexOf('Profit') >= 0; }, 'range ' + ranges[i]);
      }
      assert(document.querySelector('#view-reports #chart-report-revenue'), 'revenue chart');
      assert(document.querySelector('#view-dashboard #chart-revenue'), 'dashboard chart id collided with reports');
      assert($('chart-top-products'), 'top products chart');
      assert($('chart-stock-val'), 'stock chart');
      assert($('chart-pnl'), 'pnl chart');
    });

    await scenario('Cafe day: buy milk into the dry store, move it, sell a recipe, then sell the produced cup', async function () {
      function toasts() { return document.querySelectorAll('#toast-container .toast span').length; }
      async function waitToast(part) {
        const before = toasts();
        return waitFor(function () { return toasts() > before && lastToast().indexOf(part) >= 0; }, lastToast());
      }
      async function buyMilk(qty, cost, expiry, paid) {
        App.goTo('purchase');
        if (text('po-item-count') !== '0') $('po-clear').click();
        setVal('po-search', '');
        setVal('po-cat-filter', '');
        setVal('po-location', 'loc_store');
        setVal('po-search', 'milk');
        const card = Array.from(document.querySelectorAll('#po-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Milk') >= 0; });
        assert(card, 'milk was not on the purchase grid');
        card.click();
        setVal(document.querySelector('.po-qty'), String(qty));
        setVal(document.querySelector('.po-cost'), String(cost));
        setVal(document.querySelector('.po-expiry'), expiry);
        if (!$('po-seller').value) {
          const opt = Array.from($('po-seller').options).find(function (o) { return o.textContent.indexOf('Valley') >= 0; });
          assert(opt, 'supplier missing');
          setVal('po-seller', opt.value);
        }
        setVal('po-paid', String(paid));
        const before = toasts();
        $('po-submit').click();
        await waitFor(function () { return toasts() > before && lastToast().indexOf('Purchase recorded') >= 0; }, lastToast());
      }

      App.goTo('products');
      $('add-product-btn').click();
      assert(!hidden('product-modal'), 'product modal');
      setVal('product-type', 'raw');
      setVal('product-name', 'Milk');
      setVal('product-sku', 'MILK');
      setVal('product-unit', 'ml');
      const added = toasts();
      $('product-form').requestSubmit();
      await waitFor(function () { return toasts() > added && lastToast() === 'Product added'; }, lastToast());
      const milk = Store.getProductsByOwner('co_test').find(function (p) { return p.name === 'Milk'; });
      assert(milk, 'milk was not saved');

      function isoDays(n) {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      }
      await buyMilk(80, 0.1, isoDays(15), 8);
      assert(Store.getBatchQty(milk.id, 'loc_store') === 80, 'first milk lot ' + Store.getBatchQty(milk.id, 'loc_store'));
      await buyMilk(120, 0.2, isoDays(40), 24);
      assert(Store.getBatchQty(milk.id, 'loc_store') === 200, 'both milk lots ' + Store.getBatchQty(milk.id, 'loc_store'));
      const early = Store.getBatchesByProduct(milk.id, 'loc_store').filter(function (b) { return b.qty > 0; }).sort(function (a, b) {
        return new Date(a.expiryDate) - new Date(b.expiryDate);
      })[0];
      const later = Store.getBatchesByProduct(milk.id, 'loc_store').filter(function (b) { return b.id !== early.id && b.qty > 0; })[0];
      assert(early && later, 'expected two milk lots');

      App.goTo('inventory');
      setVal('inventory-search', 'milk');
      setVal('filter-location', 'loc_store');
      const milkRow = Array.from(document.querySelectorAll('#inventory-table-body tr')).find(function (r) {
        return r.textContent.indexOf('Milk') >= 0 && r.querySelector('button');
      });
      assert(milkRow, 'milk row missing');
      milkRow.querySelector('button').click();
      await waitFor(function () { return text('inventory-table-body').indexOf(early.batchNumber) >= 0; }, 'milk lots');
      function lotRow(num) {
        return Array.from(document.querySelectorAll('#inventory-table-body tr')).find(function (r) {
          return r.cells && r.cells[0] && r.cells[0].textContent.indexOf(num) >= 0;
        });
      }
      lotRow(early.batchNumber).querySelector('button[title="Move lot"]').click();
      assert(!hidden('move-modal'), 'move modal');
      assert($('move-hint').textContent.indexOf('Dry Store') >= 0, $('move-hint').textContent);
      setVal('move-location', 'loc_main');
      const moved = toasts();
      $('move-form').requestSubmit();
      await waitFor(function () { return toasts() > moved && lastToast() === 'Lot moved'; }, lastToast());
      assert(Store.getBatchById(early.id).locationId === 'loc_main', 'early lot stayed in the store');
      assert(Store.getBatchQty(milk.id, 'loc_main') === 80, 'counter milk ' + Store.getBatchQty(milk.id, 'loc_main'));
      lotRow(later.batchNumber).querySelector('button[title="Move lot"]').click();
      setVal('move-qty', '50');
      setVal('move-location', 'loc_main');
      const movedPart = toasts();
      $('move-form').requestSubmit();
      await waitFor(function () { return toasts() > movedPart && lastToast() === 'Lot moved'; }, 'partial move ' + lastToast());
      assert(Store.getBatchQty(milk.id, 'loc_store') === 70, 'store remainder ' + Store.getBatchQty(milk.id, 'loc_store'));
      assert(Store.getBatchQty(milk.id, 'loc_main') === 130, 'counter after partial ' + Store.getBatchQty(milk.id, 'loc_main'));
      assert(Store.getBatchesByProduct(milk.id, 'loc_main').some(function (b) { return b.unitCost === 0.2 && b.expiryDate === later.expiryDate && b.qty === 50; }), 'moved lot lost cost or expiry');
      lotRow(later.batchNumber).querySelector('button[title="Edit lot"]').click();
      assert($('stock-modal-title').textContent === 'Edit Batch', $('stock-modal-title').textContent);
      setVal('stock-quantity', '60');
      const edited = toasts();
      $('stock-form').requestSubmit();
      await waitFor(function () { return toasts() > edited && lastToast() === 'Batch updated'; }, lastToast());
      assert(Store.getBatchQty(milk.id, 'loc_store') === 60, 'edited store qty ' + Store.getBatchQty(milk.id, 'loc_store'));

      App.goTo('products');
      $('add-product-btn').click();
      setVal('product-type', 'complex');
      setVal('product-name', 'Cutting Chai');
      setVal('product-sku', 'CHAI');
      setVal('product-unit', 'pcs');
      setVal('product-price', '40');
      setVal('product-gst', '5');
      const firstIng = document.querySelector('#product-ingredients .ingredient-row');
      assert(firstIng, 'recipe row missing');
      setVal(firstIng.querySelector('.ing-product'), 'beans');
      setVal(firstIng.querySelector('.ing-qty'), '8');
      setVal(firstIng.querySelector('.ing-wastage'), '0');
      $('product-add-ingredient').click();
      const rows = document.querySelectorAll('#product-ingredients .ingredient-row');
      assert(rows.length === 2, 'second ingredient missing');
      setVal(rows[1].querySelector('.ing-product'), milk.id);
      setVal(rows[1].querySelector('.ing-qty'), '50');
      setVal(rows[1].querySelector('.ing-wastage'), '10');
      const expectedCost = Store.calcMakingCost({
        recipe: { outputQty: 1, ingredients: [
          { productId: 'beans', qty: 8, wastagePct: 0 },
          { productId: milk.id, qty: 50, wastagePct: 10 },
        ] },
      });
      assert($('product-makingcost').value === '\u20B9' + expectedCost.toFixed(2), $('product-makingcost').value + ' vs ' + expectedCost);
      const saved = toasts();
      $('product-form').requestSubmit();
      await waitFor(function () { return toasts() > saved && lastToast() === 'Product added'; }, lastToast());
      const chai = Store.getProductsByOwner('co_test').find(function (p) { return p.name === 'Cutting Chai'; });
      assert(chai && chai.recipe.ingredients[1].wastagePct === 10, 'wastage was not saved');
      byText('#products-table-body tr', 'Cutting Chai').querySelector('.btn-icon.edit').click();
      assert(viewOn('product-detail'), 'chai detail');
      assert(text('pd-bom-body').indexOf('55') >= 0 && text('pd-bom-body').indexOf('10% waste') >= 0, text('pd-bom-body'));

      const beansBefore = Store.getBatchQty('beans', 'loc_main');
      const earlyBefore = Store.getBatchById(early.id).qty;
      App.goTo('pos');
      if (text('pos-item-count') !== '0') $('pos-clear-bill').click();
      setVal('pos-location', 'loc_main');
      setVal('pos-search', 'chai');
      const chaiCard = Array.from(document.querySelectorAll('#pos-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Cutting Chai') >= 0; });
      assert(chaiCard, 'chai card missing');
      assert(chaiCard.textContent.indexOf('can make') >= 0, chaiCard.textContent);
      chaiCard.click();
      assert(text('pos-item-count') === '1', text('pos-item-count'));
      const sold = toasts();
      $('pos-checkout-btn').click();
      await waitFor(function () { return toasts() > sold && lastToast().indexOf('Sale completed') >= 0; }, lastToast());
      assert(Store.getBatchQty('beans', 'loc_main') === beansBefore - 8, 'beans after chai ' + Store.getBatchQty('beans', 'loc_main'));
      assert(Store.getBatchById(early.id).qty === earlyBefore - 55, 'FEFO milk ' + Store.getBatchById(early.id).qty);
      const lateOnCounter = Store.getBatchesByProduct(milk.id, 'loc_main').find(function (b) { return b.expiryDate === later.expiryDate; });
      assert(lateOnCounter.qty === 50, 'later milk was used first');

      App.goTo('products');
      byText('#products-table-body tr', 'Cutting Chai').querySelector('.btn-icon.edit').click();
      $('pd-produce').click();
      setVal('produce-product', chai.id);
      setVal('produce-location', 'loc_main');
      setVal('produce-qty', '1');
      const milkBeforeProduce = Store.getBatchQty(milk.id, 'loc_main');
      const beansBeforeProduce = Store.getBatchQty('beans', 'loc_main');
      const produced = toasts();
      $('produce-form').requestSubmit();
      await waitFor(function () { return toasts() > produced && lastToast().indexOf('Produced') >= 0; }, lastToast());
      assert(Store.getBatchQty(milk.id, 'loc_main') === milkBeforeProduce - 55, 'produce milk ' + Store.getBatchQty(milk.id, 'loc_main'));
      assert(Store.getBatchQty('beans', 'loc_main') === beansBeforeProduce - 8, 'produce beans');
      const finished = Store.getBatchesByProduct(chai.id, 'loc_main').find(function (b) { return b.qty > 0 && b.batchNumber.indexOf('PROD-') === 0; });
      assert(finished && finished.qty === 1, 'finished cup missing');

      App.goTo('pos');
      setVal('pos-location', 'loc_main');
      setVal('pos-search', 'chai');
      const readyCard = Array.from(document.querySelectorAll('#pos-product-grid .pos-item-card')).find(function (c) { return c.textContent.indexOf('Cutting Chai') >= 0; });
      assert(readyCard && readyCard.textContent.indexOf('1 ready') >= 0, readyCard ? readyCard.textContent : 'no card');
      readyCard.click();
      POS.updateBillQty(chai.id, 5);
      assert(lastToast().indexOf('Exceeds') >= 0, lastToast());
      assert(text('pos-item-count') === '1', 'oversell changed the bill');
      const milkHeld = Store.getBatchQty(milk.id, 'loc_main');
      const beansHeld = Store.getBatchQty('beans', 'loc_main');
      const soldReady = toasts();
      $('pos-checkout-btn').click();
      await waitFor(function () { return toasts() > soldReady && lastToast().indexOf('Sale completed') >= 0; }, lastToast());
      assert(Store.getBatchById(finished.id).qty === 0, 'finished cup was not sold');
      assert(Store.getBatchQty(milk.id, 'loc_main') === milkHeld, 'selling the cup consumed milk again');
      assert(Store.getBatchQty('beans', 'loc_main') === beansHeld, 'selling the cup consumed beans again');
      POS.addToBill(chai.id);
      assert(lastToast().indexOf('Not enough') >= 0, lastToast());
      assert(Store.getBatchQty(milk.id, 'loc_main') === milkHeld, 'refused sale moved milk');

      App.goTo('reports');
      await waitFor(function () { return text('expiry-table-body').indexOf('Milk') >= 0; }, text('expiry-table-body'));
    });

    await scenario('Staff can use POS and is kept out of the other pages', async function () {
      await loginAs('sam');
      assert(viewOn('pos'), 'staff did not land on POS');
      assert(document.querySelector('.sidebar .nav-item[data-view="products"]').style.display === 'none', 'products nav visible');
      App.goTo('inventory');
      assert(viewOn('pos'), 'staff reached inventory');
      assert(text('page-title') === 'POS Counter', text('page-title'));
    });

    await scenario('Marketing lands on field orders', async function () {
      await loginAs('mia');
      assert(viewOn('field-order'), 'marketing did not land on field orders');
      assert(document.querySelector('.sidebar .nav-item[data-view="pos"]').style.display === 'none', 'pos nav visible to marketing');
      App.goTo('dashboard');
      assert(viewOn('field-order'), 'marketing reached the dashboard');
    });

    await scenario('Logout returns to the company code screen', async function () {
      $('logout-btn').click();
      await waitFor(function () { return !hidden('auth-screen') && !hidden('company-form'); }, 'logged out');
      assert(Store.getCurrentUser() == null, 'session remained');
    });
  }
})();
