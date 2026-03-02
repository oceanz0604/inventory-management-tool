const Inventory = (() => {
  let currentSort = { field: 'product', direction: 'asc' };
  let editingStock = null;

  function init() {
    document.getElementById('add-stock-btn').addEventListener('click', () => openStockModal());
    document.getElementById('add-first-stock-btn').addEventListener('click', () => openStockModal());
    document.getElementById('stock-form').addEventListener('submit', _handleSubmit);
    document.getElementById('inventory-search').addEventListener('input', render);
    document.getElementById('filter-location').addEventListener('change', render);
    document.getElementById('filter-category').addEventListener('change', render);
    document.getElementById('filter-stock').addEventListener('change', render);

    document.querySelectorAll('#view-inventory .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (currentSort.field === f) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        else { currentSort.field = f; currentSort.direction = 'asc'; }
        render();
      });
    });
  }

  function refreshFilters() {
    const user = Auth.getUser();
    const locs = Store.getLocationsByOwner(user.id);
    const cats = Store.getCategories();
    const prods = Store.getProductsByOwner(user.id);

    document.getElementById('filter-location').innerHTML = '<option value="">All Locations</option>' + locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    document.getElementById('filter-category').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('stock-product').innerHTML = '<option value="">Select product</option>' + prods.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
    document.getElementById('stock-location').innerHTML = '<option value="">Select location</option>' + locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  }

  function _getFilteredStock() {
    const user = Auth.getUser();
    const search = document.getElementById('inventory-search').value.toLowerCase().trim();
    const locFilter = document.getElementById('filter-location').value;
    const catFilter = document.getElementById('filter-category').value;
    const stockFilter = document.getElementById('filter-stock').value;

    let entries = Store.getStockByOwner(user.id);

    entries = entries.map(s => {
      const product = Store.getProductById(s.productId);
      const location = Store.getLocationById(s.locationId);
      return { ...s, product, location };
    }).filter(s => s.product && s.location);

    if (search) entries = entries.filter(s => s.product.name.toLowerCase().includes(search) || s.product.sku.toLowerCase().includes(search));
    if (locFilter) entries = entries.filter(s => s.locationId === locFilter);
    if (catFilter) entries = entries.filter(s => s.product.categoryId === catFilter);
    if (stockFilter === 'low') entries = entries.filter(s => s.quantity > 0 && s.quantity <= s.minStock);
    else if (stockFilter === 'out') entries = entries.filter(s => s.quantity === 0);
    else if (stockFilter === 'ok') entries = entries.filter(s => s.quantity > s.minStock);

    entries.sort((a, b) => {
      let va, vb;
      if (currentSort.field === 'product') { va = a.product.name.toLowerCase(); vb = b.product.name.toLowerCase(); }
      else if (currentSort.field === 'quantity') { va = a.quantity; vb = b.quantity; }
      else { va = a[currentSort.field]; vb = b[currentSort.field]; }
      if (va < vb) return currentSort.direction === 'asc' ? -1 : 1;
      if (va > vb) return currentSort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return entries;
  }

  function render() {
    const entries = _getFilteredStock();
    const user = Auth.getUser();
    const allStock = Store.getStockByOwner(user.id);
    const tbody = document.getElementById('inventory-table-body');
    const empty = document.getElementById('no-inventory');

    if (allStock.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      tbody.closest('.card').querySelector('table').classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.closest('.card').querySelector('table').classList.remove('hidden');

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">No stock entries match your filters</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(s => {
      const cat = Store.getCategoryById(s.product.categoryId);
      const badge = s.quantity === 0 ? '<span class="badge badge-danger">Out of Stock</span>' : s.quantity <= s.minStock ? '<span class="badge badge-warning">Low Stock</span>' : '<span class="badge badge-success">In Stock</span>';
      return `<tr>
        <td><strong>${_esc(s.product.name)}</strong></td>
        <td><code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.8rem">${_esc(s.product.sku)}</code></td>
        <td>${_esc(s.location.name)}</td>
        <td>${s.quantity}</td>
        <td>${s.minStock}</td>
        <td>${badge}</td>
        <td><div class="action-btns">
          <button class="btn-icon edit" title="Edit Stock" onclick="Inventory.openStockModal('${s.productId}','${s.locationId}')"><i class="fas fa-pen"></i></button>
        </div></td>
      </tr>`;
    }).join('');
  }

  function openStockModal(productId, locationId) {
    editingStock = (productId && locationId) ? { productId, locationId } : null;
    const form = document.getElementById('stock-form');
    const title = document.getElementById('stock-modal-title');
    refreshFilters();
    form.reset();

    if (editingStock) {
      const rec = Store.getStockRecord(productId, locationId);
      title.textContent = 'Edit Stock';
      document.getElementById('stock-product').value = productId;
      document.getElementById('stock-location').value = locationId;
      document.getElementById('stock-product').disabled = true;
      document.getElementById('stock-location').disabled = true;
      document.getElementById('stock-quantity').value = rec ? rec.quantity : 0;
      document.getElementById('stock-min').value = rec ? rec.minStock : 5;
    } else {
      title.textContent = 'Add Stock Entry';
      document.getElementById('stock-product').disabled = false;
      document.getElementById('stock-location').disabled = false;
    }
    document.getElementById('stock-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('stock-product').value;
    const locationId = document.getElementById('stock-location').value;
    const quantity = parseInt(document.getElementById('stock-quantity').value) || 0;
    const minStock = parseInt(document.getElementById('stock-min').value) || 0;

    if (!productId || !locationId) { App.showToast('Select product and location', 'warning'); return; }

    Store.setStock(productId, locationId, quantity, minStock);
    App.showToast('Stock updated', 'success');

    document.getElementById('stock-modal').classList.add('hidden');
    document.getElementById('stock-product').disabled = false;
    document.getElementById('stock-location').disabled = false;
    editingStock = null;
    render();
    Dashboard.refresh();
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, render, openStockModal, refreshFilters };
})();
