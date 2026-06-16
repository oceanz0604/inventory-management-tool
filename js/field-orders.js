// Marketing field-sale screen: a marketing worker picks a company customer and
// company-published products, then places an internal sale order that flows to
// the office/owner (visible under Orders > Sales) for accept/deliver/pay.
const FieldOrders = (() => {
  let items = []; // [{ productId, name, sku, qty, unitPrice }]

  function init() {
    const prod = document.getElementById('fo-product');
    if (prod) prod.addEventListener('change', _onAddProduct);
    const submit = document.getElementById('fo-submit');
    if (submit) submit.addEventListener('click', _submit);
    const addCust = document.getElementById('fo-add-customer');
    if (addCust) addCust.addEventListener('click', () => {
      if (typeof Parties === 'undefined') return;
      Parties.openModal(null, {
        defaultType: 'customer',
        onAdded: (p) => {
          _populateCustomers();
          if (p && p.id) document.getElementById('fo-customer').value = p.id;
        },
      });
    });
  }

  function render() {
    items = [];
    _renderItems();
    _populateCustomers();
    _populateProducts();
    _renderHistory();
  }

  function _populateCustomers() {
    const sel = document.getElementById('fo-customer');
    if (!sel) return;
    const prev = sel.value;
    const customers = Store.getPartiesByType(Auth.ownerId(), 'customer');
    sel.innerHTML = '<option value="">-- Select customer --</option>' + customers.map(c =>
      '<option value="' + c.id + '">' + _esc(c.name) + (c.location ? ' · ' + _esc(c.location) : '') + '</option>').join('');
    if (prev) sel.value = prev;
  }

  function _publishedProducts() {
    return Store.getProductsByOwner(Auth.ownerId()).filter(p => p.isPublished);
  }

  function _populateProducts() {
    const sel = document.getElementById('fo-product');
    if (!sel) return;
    const prods = _publishedProducts();
    sel.innerHTML = '<option value="">-- Select product --</option>' + prods.map(p =>
      '<option value="' + p.id + '">' + _esc(p.name) + ' (\u20B9' + (p.price || 0) + ')</option>').join('');
  }

  function _onAddProduct(e) {
    const id = e.target.value;
    if (!id) return;
    const p = Store.getProductById(id);
    if (p) {
      const existing = items.find(i => i.productId === id);
      if (existing) existing.qty += 1;
      else items.push({ productId: id, name: p.name, sku: p.sku || '', qty: 1, unitPrice: p.price || 0 });
      _renderItems();
    }
    e.target.value = '';
  }

  function _renderItems() {
    const tbody = document.getElementById('fo-items-body');
    if (!tbody) return;
    tbody.innerHTML = items.map((i, idx) => '<tr>' +
      '<td>' + _esc(i.name) + '</td>' +
      '<td>\u20B9' + i.unitPrice.toFixed(2) + '</td>' +
      '<td><input type="number" min="1" value="' + i.qty + '" data-idx="' + idx + '" class="fo-qty" style="width:64px"></td>' +
      '<td>\u20B9' + (i.unitPrice * i.qty).toFixed(2) + '</td>' +
      '<td><button class="btn-icon delete" data-del="' + idx + '"><i class="fas fa-xmark"></i></button></td>' +
      '</tr>').join('');

    tbody.querySelectorAll('.fo-qty').forEach(inp => inp.addEventListener('change', (e) => {
      const idx = +e.target.dataset.idx;
      items[idx].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      _renderItems();
    }));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => {
      items.splice(+e.currentTarget.dataset.del, 1);
      _renderItems();
    }));

    const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    document.getElementById('fo-total').textContent = '\u20B9' + total.toFixed(2);
  }

  function _submit() {
    const customerId = document.getElementById('fo-customer').value;
    if (!customerId) { App.showToast('Select a customer first', 'warning'); return; }
    if (items.length === 0) { App.showToast('Add at least one product', 'warning'); return; }
    const me = Auth.getUser();
    Store.createFieldSale(Auth.ownerId(), customerId, items.map(i => ({ ...i })), me ? me.id : null);
    App.showToast('Field order placed', 'success');
    items = [];
    _renderItems();
    document.getElementById('fo-customer').value = '';
    _renderHistory();
  }

  function _renderHistory() {
    const tbody = document.getElementById('fo-history-body');
    const empty = document.getElementById('no-field-orders');
    if (!tbody) return;
    const me = Auth.getUser();
    let orders = Store.getOrders().filter(o => o.kind === 'field_sale' && o.sellerId === Auth.ownerId());
    // A marketing worker only sees the orders they personally placed.
    if (me && Auth.getRole() === 'marketing') orders = orders.filter(o => o.createdBy === me.id);
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (orders.length === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    tbody.innerHTML = orders.map(o => {
      const c = Store.getPartyById(o.customerPartyId);
      return '<tr><td><strong>' + _esc(o.orderNumber) + '</strong></td><td>' + (c ? _esc(c.name) : '—') + '</td>' +
        '<td>\u20B9' + (o.total || 0).toFixed(2) + '</td>' +
        '<td><span class="order-status ' + o.status + '">' + _cap(o.status) + '</span></td></tr>';
    }).join('');
  }

  function _cap(s) { return (s || '').charAt(0).toUpperCase() + (s || '').slice(1); }
  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  return { init, render };
})();
