const BOM = (() => {
  let editingId = null;

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function init() {
    document.getElementById('add-recipe-btn').addEventListener('click', () => openModal());
    const firstBtn = document.getElementById('add-first-recipe-btn');
    if (firstBtn) firstBtn.addEventListener('click', () => openModal());
    document.getElementById('recipe-form').addEventListener('submit', _handleSubmit);
    document.getElementById('add-ingredient-btn').addEventListener('click', _addIngredientRow);
    document.getElementById('recipe-search').addEventListener('input', render);
    document.getElementById('produce-btn').addEventListener('click', openProduce);
    document.getElementById('produce-form').addEventListener('submit', _handleProduce);
  }

  function refresh() { render(); }

  function render() {
    const user = Auth.getUser();
    const recipes = Store.getRecipes(user.id);
    const search = document.getElementById('recipe-search').value.toLowerCase().trim();
    const filtered = search ? recipes.filter(r => r.name.toLowerCase().includes(search)) : recipes;
    const grid = document.getElementById('recipes-grid');
    const empty = document.getElementById('no-recipes');

    if (recipes.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    grid.innerHTML = filtered.map(r => {
      const outProd = Store.getProductById(r.outputProductId);
      const cost = Store.calcRecipeCost(r);
      const sellPrice = outProd ? outProd.price : 0;
      const margin = sellPrice > 0 ? ((sellPrice - cost) / sellPrice * 100) : 0;
      const marginColor = margin >= 30 ? 'var(--success)' : margin >= 15 ? 'var(--warning)' : 'var(--danger)';

      const ingNames = r.ingredients.map(i => {
        const p = Store.getProductById(i.productId);
        return '<li>' + (p ? _esc(p.name) : '?') + ' x' + i.qty + '</li>';
      }).join('');

      return '<div class="recipe-card">' +
        '<div class="recipe-card-header"><h4>' + _esc(r.name) + '</h4>' +
        '<div class="action-btns">' +
        '<button class="btn-icon edit" title="Edit" onclick="BOM.openModal(\'' + r.id + '\')"><i class="fas fa-pen"></i></button>' +
        '<button class="btn-icon delete" title="Delete" onclick="BOM.confirmDelete(\'' + r.id + '\')"><i class="fas fa-trash-can"></i></button>' +
        '</div></div>' +
        '<div class="recipe-card-output">Produces <strong>' + r.outputQty + 'x ' + (outProd ? _esc(outProd.name) : '—') + '</strong></div>' +
        '<div class="recipe-card-ingredients"><div class="ing-label">Ingredients</div><ul>' + ingNames + '</ul></div>' +
        '<div class="recipe-card-footer">' +
        '<div class="recipe-cost">Cost/unit: <strong>₹' + cost.toFixed(2) + '</strong></div>' +
        '<span style="font-weight:600;color:' + marginColor + '">' + margin.toFixed(1) + '% margin</span>' +
        '</div></div>';
    }).join('');
  }

  function openModal(recipeId) {
    editingId = recipeId || null;
    const form = document.getElementById('recipe-form');
    const title = document.getElementById('recipe-modal-title');
    form.reset();
    document.getElementById('recipe-ingredients').innerHTML = '';

    const user = Auth.getUser();
    const prods = Store.getProductsByOwner(user.id);
    const optHtml = '<option value="">Select product</option>' + prods.map(p => '<option value="' + p.id + '">' + _esc(p.name) + ' (' + p.sku + ')</option>').join('');
    document.getElementById('recipe-output').innerHTML = optHtml;

    if (editingId) {
      const r = Store.getRecipeById(editingId);
      if (!r) return;
      title.textContent = 'Edit Recipe';
      document.getElementById('recipe-name').value = r.name;
      document.getElementById('recipe-output').value = r.outputProductId;
      document.getElementById('recipe-output-qty').value = r.outputQty;
      r.ingredients.forEach(ing => _addIngredientRow(null, ing.productId, ing.qty));
    } else {
      title.textContent = 'Add Recipe';
      _addIngredientRow();
    }
    _calcLiveCost();
    document.getElementById('recipe-modal').classList.remove('hidden');
  }

  function _addIngredientRow(e, productId, qty) {
    const user = Auth.getUser();
    const prods = Store.getProductsByOwner(user.id);
    const container = document.getElementById('recipe-ingredients');
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML =
      '<select class="select-input ing-product">' +
      '<option value="">Select ingredient</option>' +
      prods.map(p => '<option value="' + p.id + '"' + (productId === p.id ? ' selected' : '') + '>' + _esc(p.name) + '</option>').join('') +
      '</select>' +
      '<input type="number" class="ing-qty" step="0.01" min="0.01" value="' + (qty || 1) + '" placeholder="Qty">' +
      '<button type="button" class="btn-icon delete" title="Remove"><i class="fas fa-xmark"></i></button>';
    row.querySelector('.btn-icon').addEventListener('click', () => { row.remove(); _calcLiveCost(); });
    row.querySelector('.ing-product').addEventListener('change', _calcLiveCost);
    row.querySelector('.ing-qty').addEventListener('input', _calcLiveCost);
    container.appendChild(row);
  }

  function _calcLiveCost() {
    const rows = document.querySelectorAll('#recipe-ingredients .ingredient-row');
    let total = 0;
    rows.forEach(row => {
      const pid = row.querySelector('.ing-product').value;
      const qty = parseFloat(row.querySelector('.ing-qty').value) || 0;
      const prod = pid ? Store.getProductById(pid) : null;
      if (prod) total += (prod.costPrice || 0) * qty;
    });
    const outQty = parseInt(document.getElementById('recipe-output-qty').value) || 1;
    document.getElementById('recipe-cost-preview').value = '₹' + (total / outQty).toFixed(2);
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const user = Auth.getUser();
    const name = document.getElementById('recipe-name').value.trim();
    const outputProductId = document.getElementById('recipe-output').value;
    const outputQty = parseInt(document.getElementById('recipe-output-qty').value) || 1;

    const rows = document.querySelectorAll('#recipe-ingredients .ingredient-row');
    const ingredients = [];
    rows.forEach(row => {
      const pid = row.querySelector('.ing-product').value;
      const qty = parseFloat(row.querySelector('.ing-qty').value) || 0;
      if (pid && qty > 0) ingredients.push({ productId: pid, qty });
    });

    if (!name || !outputProductId || ingredients.length === 0) {
      App.showToast('Fill in all required fields and add at least one ingredient', 'warning');
      return;
    }

    if (editingId) {
      Store.updateRecipe(editingId, { name, outputProductId, outputQty, ingredients });
      App.showToast('Recipe updated', 'success');
    } else {
      Store.addRecipe({ id: Store.generateId(), ownerId: user.id, name, outputProductId, outputQty, ingredients, createdAt: new Date().toISOString() });
      App.showToast('Recipe created', 'success');
    }
    document.getElementById('recipe-modal').classList.add('hidden');
    editingId = null;
    render();
  }

  function confirmDelete(id) {
    const r = Store.getRecipeById(id);
    if (!r) return;
    document.getElementById('delete-message').textContent = 'Delete recipe "' + r.name + '"?';
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      Store.deleteRecipe(id);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Recipe deleted', 'success');
      render();
    });
  }

  function openProduce(recipeId) {
    const user = Auth.getUser();
    const recipes = Store.getRecipes(user.id);
    const locs = Store.getLocationsByOwner(user.id);
    const rSel = document.getElementById('produce-recipe');
    rSel.innerHTML = '<option value="">Select recipe</option>' + recipes.map(r => '<option value="' + r.id + '"' + (recipeId === r.id ? ' selected' : '') + '>' + _esc(r.name) + '</option>').join('');
    const lSel = document.getElementById('produce-location');
    lSel.innerHTML = '<option value="">Select location</option>' + locs.map(l => '<option value="' + l.id + '"' + (l.isDefault ? ' selected' : '') + '>' + _esc(l.name) + '</option>').join('');
    document.getElementById('produce-qty').value = 1;
    document.getElementById('produce-modal').classList.remove('hidden');
  }

  function _handleProduce(e) {
    e.preventDefault();
    const recipeId = document.getElementById('produce-recipe').value;
    const locationId = document.getElementById('produce-location').value;
    const qty = parseInt(document.getElementById('produce-qty').value) || 1;
    if (!recipeId || !locationId) { App.showToast('Select recipe and location', 'warning'); return; }
    const result = Store.produceRecipe(recipeId, locationId, qty);
    if (result.success) {
      App.showToast('Production complete! Stock updated.', 'success');
      document.getElementById('produce-modal').classList.add('hidden');
      render();
    } else {
      App.showToast(result.message, 'error');
    }
  }

  return { init, render, refresh, openModal, confirmDelete, openProduce };
})();
