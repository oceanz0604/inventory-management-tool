// Custom off-platform customers / sellers, scoped to the caller's company.
const Parties = (() => {
  let editingId = null;
  let _onAdded = null; // one-shot callback when a party is created (e.g. from Field Orders)

  function init() {
    const add = document.getElementById('add-party-btn');
    if (add) add.addEventListener('click', () => openModal());
    const addFirst = document.getElementById('add-first-party-btn');
    if (addFirst) addFirst.addEventListener('click', () => openModal());
    const form = document.getElementById('party-form');
    if (form) form.addEventListener('submit', _handleSubmit);
    const search = document.getElementById('parties-search');
    if (search) search.addEventListener('input', render);
    const filter = document.getElementById('parties-type-filter');
    if (filter) filter.addEventListener('change', render);
  }

  function render() {
    const tbody = document.getElementById('parties-table-body');
    const empty = document.getElementById('no-parties');
    if (!tbody) return;

    const total = Store.getParties(Auth.ownerId()).length;
    let parties = Store.getParties(Auth.ownerId());
    const search = (document.getElementById('parties-search').value || '').toLowerCase().trim();
    const typeF = document.getElementById('parties-type-filter').value;
    if (typeF) parties = parties.filter(p => p.type === typeF);
    if (search) parties = parties.filter(p => p.name.toLowerCase().includes(search) || (p.location || '').toLowerCase().includes(search));

    if (total === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    if (parties.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:1.5rem">No parties match your search</td></tr>';
      return;
    }

    parties.sort((a, b) => a.name.localeCompare(b.name));
    tbody.innerHTML = parties.map(p => '<tr>' +
      '<td><strong>' + _esc(p.name) + '</strong>' + (p.gstin ? '<div style="font-size:.72rem;color:var(--text-secondary)">GSTIN: ' + _esc(p.gstin) + '</div>' : '') + '</td>' +
      '<td><span class="role-pill">' + _esc(p.type) + '</span></td>' +
      '<td>' + (p.location ? _esc(p.location) : '<span style="color:var(--text-light)">—</span>') + '</td>' +
      '<td>' + (p.phone ? _esc(p.phone) : '—') + '</td>' +
      '<td><div class="action-btns">' +
      '<button class="btn-icon edit" title="Edit" onclick="Parties.openModal(\'' + p.id + '\')"><i class="fas fa-pen"></i></button>' +
      '<button class="btn-icon delete" title="Delete" onclick="Parties.confirmDelete(\'' + p.id + '\')"><i class="fas fa-trash-can"></i></button>' +
      '</div></td></tr>').join('');
  }

  function openModal(id, opts) {
    opts = opts || {};
    editingId = id || null;
    _onAdded = opts.onAdded || null;
    const form = document.getElementById('party-form');
    form.reset();
    document.getElementById('party-id').value = editingId || '';
    document.getElementById('party-modal-title').textContent = editingId ? 'Edit Party' : 'Add Party';
    if (!editingId && opts.defaultType) document.getElementById('party-type').value = opts.defaultType;
    if (editingId) {
      const p = Store.getPartyById(editingId);
      if (!p) return;
      document.getElementById('party-name').value = p.name;
      document.getElementById('party-type').value = p.type;
      document.getElementById('party-location').value = p.location || '';
      document.getElementById('party-phone').value = p.phone || '';
      document.getElementById('party-gstin').value = p.gstin || '';
    }
    document.getElementById('party-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('party-name').value.trim();
    const type = document.getElementById('party-type').value;
    const location = document.getElementById('party-location').value.trim();
    const phone = document.getElementById('party-phone').value.trim();
    const gstin = document.getElementById('party-gstin').value.trim();
    if (!name) return;

    let created = null;
    if (editingId) {
      Store.updateParty(editingId, { name, type, location, phone, gstin });
      App.showToast('Party updated', 'success');
    } else {
      created = Store.addParty({ ownerId: Auth.ownerId(), name, type, location, phone, gstin });
      App.showToast('Party added', 'success');
    }
    document.getElementById('party-modal').classList.add('hidden');
    editingId = null;
    render();
    if (created && _onAdded) { const cb = _onAdded; _onAdded = null; cb(created); }
  }

  function confirmDelete(id) {
    const p = Store.getPartyById(id);
    if (!p) return;
    document.getElementById('delete-message').textContent = 'Delete "' + p.name + '"? Their past orders and Khata entries are kept.';
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', () => {
      Store.deleteParty(id);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Party deleted', 'success');
      render();
    });
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  return { init, render, openModal, confirmDelete };
})();
