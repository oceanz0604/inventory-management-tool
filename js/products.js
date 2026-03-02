const Products = (() => {
  let editingId = null;
  let currentSort = { field: 'name', direction: 'asc' };

  function _updateMarginPreview() {
    const cost = parseFloat(document.getElementById('product-cost-price').value) || 0;
    const sell = parseFloat(document.getElementById('product-price').value) || 0;
    const preview = document.getElementById('product-margin-preview');
    if (sell > 0 && cost > 0) {
      const margin = ((sell - cost) / sell * 100).toFixed(1);
      const profit = (sell - cost).toFixed(2);
      preview.value = `₹${profit}  (${margin}%)`;
    } else {
      preview.value = '-';
    }
  }

  function init() {
    document.getElementById('add-product-btn').addEventListener('click', () => openModal());
    document.getElementById('add-first-product-btn').addEventListener('click', () => openModal());
    document.getElementById('product-form').addEventListener('submit', _handleSubmit);
    document.getElementById('product-search').addEventListener('input', render);
    document.getElementById('product-filter-category').addEventListener('change', render);
    document.getElementById('product-filter-published').addEventListener('change', render);
    document.getElementById('product-cost-price').addEventListener('input', _updateMarginPreview);
    document.getElementById('product-price').addEventListener('input', _updateMarginPreview);

    document.querySelectorAll('#view-products .sortable').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (currentSort.field === f) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        else { currentSort.field = f; currentSort.direction = 'asc'; }
        render();
      });
    });
  }

  function populateFilters() {
    const cats = Store.getCategories();
    const opts = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    document.getElementById('product-filter-category').innerHTML = '<option value="">All Categories</option>' + opts;
    document.getElementById('product-category').innerHTML = '<option value="">Select category</option>' + opts;
  }

  function render() {
    const user = Auth.getUser();
    const search = document.getElementById('product-search').value.toLowerCase().trim();
    const catFilter = document.getElementById('product-filter-category').value;
    const pubFilter = document.getElementById('product-filter-published').value;

    let prods = Store.getProductsByOwner(user.id);
    if (search) prods = prods.filter(p => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search));
    if (catFilter) prods = prods.filter(p => p.categoryId === catFilter);
    if (pubFilter === '1') prods = prods.filter(p => p.isPublished);
    if (pubFilter === '0') prods = prods.filter(p => !p.isPublished);

    prods.sort((a, b) => {
      let va = a[currentSort.field], vb = b[currentSort.field];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return currentSort.direction === 'asc' ? -1 : 1;
      if (va > vb) return currentSort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById('products-table-body');
    const empty = document.getElementById('no-products');
    const allProds = Store.getProductsByOwner(user.id);

    if (allProds.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      tbody.closest('.card').querySelector('table').classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.closest('.card').querySelector('table').classList.remove('hidden');

    if (prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-secondary)">No products match your filters</td></tr>';
      return;
    }

    tbody.innerHTML = prods.map(p => {
      const cat = Store.getCategoryById(p.categoryId);
      const catTag = cat ? `<span class="category-tag"><span class="dot" style="background:${cat.color}"></span>${cat.name}</span>` : '<span style="color:var(--text-light)">-</span>';
      const totalStock = Store.getTotalStockForProduct(p.id);
      const cost = p.costPrice || 0;
      const margin = p.price > 0 ? ((p.price - cost) / p.price * 100) : 0;
      const marginColor = margin >= 30 ? 'var(--success)' : margin >= 15 ? 'var(--warning)' : 'var(--danger)';
      return `<tr>
        <td><strong>${_esc(p.name)}</strong></td>
        <td><code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-size:.8rem">${_esc(p.sku)}</code></td>
        <td>${catTag}</td>
        <td style="color:var(--text-secondary)">₹${cost.toFixed(2)}</td>
        <td>₹${p.price.toFixed(2)}</td>
        <td><span style="font-weight:600;color:${marginColor}">${margin.toFixed(1)}%</span></td>
        <td>${totalStock.toLocaleString()}</td>
        <td><label class="toggle"><input type="checkbox" ${p.isPublished ? 'checked' : ''} onchange="Products.togglePublish('${p.id}',this.checked)"><span class="slider"></span></label></td>
        <td><div class="action-btns">
          <button class="btn-icon edit" title="Edit" onclick="Products.openModal('${p.id}')"><i class="fas fa-pen"></i></button>
          <button class="btn-icon delete" title="Delete" onclick="Products.confirmDelete('${p.id}')"><i class="fas fa-trash-can"></i></button>
        </div></td>
      </tr>`;
    }).join('');
  }

  function openModal(prodId) {
    editingId = prodId || null;
    const form = document.getElementById('product-form');
    const title = document.getElementById('product-modal-title');
    populateFilters();
    form.reset();

    if (editingId) {
      const p = Store.getProductById(editingId);
      if (!p) return;
      title.textContent = 'Edit Product';
      document.getElementById('product-name').value = p.name;
      document.getElementById('product-sku').value = p.sku;
      document.getElementById('product-category').value = p.categoryId || '';
      document.getElementById('product-cost-price').value = p.costPrice || 0;
      document.getElementById('product-price').value = p.price;
      document.getElementById('product-description').value = p.description || '';
      document.getElementById('product-published').checked = p.isPublished;
    } else {
      title.textContent = 'Add Product';
      document.getElementById('product-published').checked = true;
    }
    _updateMarginPreview();
    document.getElementById('product-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const user = Auth.getUser();
    const data = {
      name: document.getElementById('product-name').value.trim(),
      sku: document.getElementById('product-sku').value.trim(),
      categoryId: document.getElementById('product-category').value,
      costPrice: parseFloat(document.getElementById('product-cost-price').value) || 0,
      price: parseFloat(document.getElementById('product-price').value) || 0,
      description: document.getElementById('product-description').value.trim(),
      isPublished: document.getElementById('product-published').checked,
    };

    if (editingId) {
      Store.updateProduct(editingId, data);
      App.showToast('Product updated', 'success');
    } else {
      data.id = Store.generateId();
      data.ownerId = user.id;
      data.createdAt = new Date().toISOString();
      Store.addProduct(data);
      App.showToast('Product added', 'success');
    }

    document.getElementById('product-modal').classList.add('hidden');
    editingId = null;
    render();
    Inventory.refreshFilters();
    Dashboard.refresh();
  }

  function togglePublish(prodId, val) {
    Store.updateProduct(prodId, { isPublished: val });
    App.showToast(val ? 'Product published' : 'Product unpublished', 'success');
  }

  function confirmDelete(prodId) {
    const p = Store.getProductById(prodId);
    if (!p) return;
    document.getElementById('delete-message').textContent = `Delete product "${p.name}"? This will also remove all stock entries for it.`;
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      Store.deleteProduct(prodId);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Product deleted', 'success');
      render();
      Inventory.render();
      Dashboard.refresh();
    });
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, render, openModal, togglePublish, confirmDelete, populateFilters };
})();
