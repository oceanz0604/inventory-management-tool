const Locations = (() => {
  let editingId = null;

  function init() {
    document.getElementById('add-location-btn').addEventListener('click', () => openModal());
    document.getElementById('add-first-location-btn').addEventListener('click', () => openModal());
    document.getElementById('location-form').addEventListener('submit', _handleSubmit);
    document.getElementById('location-search').addEventListener('input', render);
  }

  function render() {
    const user = Auth.getUser();
    const search = document.getElementById('location-search').value.toLowerCase().trim();
    let locs = Store.getLocationsByOwner(user.id);
    if (search) locs = locs.filter(l => l.name.toLowerCase().includes(search) || (l.address || '').toLowerCase().includes(search));

    const grid = document.getElementById('locations-grid');
    const empty = document.getElementById('no-locations');

    if (Store.getLocationsByOwner(user.id).length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    if (locs.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-secondary);padding:2rem;text-align:center">No locations match your search</p>';
      return;
    }

    grid.innerHTML = locs.map(loc => {
      const stockEntries = Store.getStockByLocation(loc.id);
      const totalQty = stockEntries.reduce((s, e) => s + e.quantity, 0);
      const productCount = stockEntries.length;
      const defaultBadge = loc.isDefault ? '<span class="default-badge">Default</span>' : '';
      return `
        <div class="location-card">
          <div class="loc-icon"><i class="fas fa-location-dot"></i></div>
          <div class="loc-info">
            <h4>${_esc(loc.name)} ${defaultBadge}</h4>
            <div class="loc-address">${loc.address ? _esc(loc.address) : '<em style="color:var(--text-light)">No address</em>'}</div>
            <div class="loc-stats">
              <span><strong>${productCount}</strong> products</span>
              <span><strong>${totalQty.toLocaleString()}</strong> units</span>
            </div>
          </div>
          <div class="loc-actions">
            <button class="btn-icon edit" title="Edit" onclick="Locations.openModal('${loc.id}')"><i class="fas fa-pen"></i></button>
            <button class="btn-icon delete" title="Delete" onclick="Locations.confirmDelete('${loc.id}')"><i class="fas fa-trash-can"></i></button>
          </div>
        </div>`;
    }).join('');
  }

  function openModal(locId) {
    editingId = locId || null;
    const form = document.getElementById('location-form');
    const title = document.getElementById('location-modal-title');
    form.reset();

    if (editingId) {
      const loc = Store.getLocationById(editingId);
      if (!loc) return;
      title.textContent = 'Edit Location';
      document.getElementById('location-name').value = loc.name;
      document.getElementById('location-address').value = loc.address || '';
      document.getElementById('location-default').checked = loc.isDefault;
    } else {
      title.textContent = 'Add Location';
    }
    document.getElementById('location-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const user = Auth.getUser();
    const name = document.getElementById('location-name').value.trim();
    const address = document.getElementById('location-address').value.trim();
    const isDefault = document.getElementById('location-default').checked;

    if (isDefault) {
      Store.getLocationsByOwner(user.id).forEach(l => {
        if (l.isDefault) Store.updateLocation(l.id, { isDefault: false });
      });
    }

    if (editingId) {
      Store.updateLocation(editingId, { name, address, isDefault });
      App.showToast('Location updated', 'success');
    } else {
      const existingLocs = Store.getLocationsByOwner(user.id);
      Store.addLocation({ id: Store.generateId(), ownerId: user.id, name, address, isDefault: isDefault || existingLocs.length === 0 });
      App.showToast('Location added', 'success');
    }

    document.getElementById('location-modal').classList.add('hidden');
    editingId = null;
    render();
    Inventory.refreshFilters();
  }

  function confirmDelete(locId) {
    const loc = Store.getLocationById(locId);
    if (!loc) return;
    const user = Auth.getUser();
    const locs = Store.getLocationsByOwner(user.id);
    if (locs.length <= 1) { App.showToast('You must have at least one location', 'warning'); return; }

    const stockCount = Store.getStockByLocation(locId).length;
    const warn = stockCount > 0 ? ` This will also remove ${stockCount} stock entries.` : '';
    document.getElementById('delete-message').textContent = `Delete "${loc.name}"?${warn}`;
    document.getElementById('delete-modal').classList.remove('hidden');

    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      if (loc.isDefault) {
        const remaining = Store.getLocationsByOwner(user.id).filter(l => l.id !== locId);
        if (remaining.length > 0) Store.updateLocation(remaining[0].id, { isDefault: true });
      }
      Store.deleteLocation(locId);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Location deleted', 'success');
      render();
      Inventory.refreshFilters();
      Dashboard.refresh();
    });
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, render, openModal, confirmDelete };
})();
