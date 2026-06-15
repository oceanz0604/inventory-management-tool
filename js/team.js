// Worker management — owners (and the super admin acting as one) create and
// remove office / staff / marketing accounts scoped to their company.
const Team = (() => {
  const ROLE_LABEL = { office: 'Office', staff: 'Staff', marketing: 'Marketing' };

  function init() {
    const add = document.getElementById('add-worker-btn');
    if (add) add.addEventListener('click', openModal);
    const addFirst = document.getElementById('add-first-worker-btn');
    if (addFirst) addFirst.addEventListener('click', openModal);
    const form = document.getElementById('worker-form');
    if (form) form.addEventListener('submit', _handleSubmit);
    const search = document.getElementById('team-search');
    if (search) search.addEventListener('input', render);
  }

  function render() {
    const tbody = document.getElementById('team-table-body');
    const empty = document.getElementById('no-team');
    if (!tbody) return;

    const all = Auth.getWorkers();
    let workers = all;
    const search = (document.getElementById('team-search').value || '').toLowerCase().trim();
    if (search) workers = workers.filter(w => (w.name || '').toLowerCase().includes(search) || (w.email || '').toLowerCase().includes(search));

    if (all.length === 0) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    if (workers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1.5rem">No team members match your search</td></tr>';
      return;
    }

    workers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    tbody.innerHTML = workers.map(w => '<tr>' +
      '<td><strong>' + _esc(w.name || '—') + '</strong></td>' +
      '<td>' + _esc(w.email) + '</td>' +
      '<td><span class="role-pill role-' + w.role + '">' + (ROLE_LABEL[w.role] || w.role) + '</span></td>' +
      '<td><div class="action-btns"><button class="btn-icon delete" title="Remove" onclick="Team.confirmDelete(\'' + w.id + '\')"><i class="fas fa-user-minus"></i></button></div></td>' +
      '</tr>').join('');
  }

  function openModal() {
    const form = document.getElementById('worker-form');
    form.reset();
    document.getElementById('worker-modal').classList.remove('hidden');
  }

  async function _handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('worker-name').value.trim();
    const email = document.getElementById('worker-email').value.trim();
    const password = document.getElementById('worker-password').value;
    const role = document.getElementById('worker-role').value;
    const btn = document.getElementById('worker-submit');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Creating…';
    const res = await Auth.createWorker(name, email, password, role);
    btn.disabled = false; btn.textContent = orig;
    if (res.success) {
      document.getElementById('worker-modal').classList.add('hidden');
      App.showToast('Worker created', 'success');
      render();
    } else {
      App.showToast(res.message || 'Could not create worker', 'error');
    }
  }

  function confirmDelete(uid) {
    const w = Store.getUserById(uid);
    if (!w) return;
    document.getElementById('delete-message').textContent = 'Remove ' + (w.name || w.email) + ' from your team? They will lose access to the app.';
    document.getElementById('delete-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-delete-btn');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', async () => {
      await Auth.deleteWorker(uid);
      document.getElementById('delete-modal').classList.add('hidden');
      App.showToast('Worker removed', 'success');
      render();
    });
  }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  return { init, render, openModal, confirmDelete };
})();
