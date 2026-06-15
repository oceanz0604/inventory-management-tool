const KhataModule = (() => {
  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function init() {
    document.getElementById('add-khata-btn').addEventListener('click', () => openModal());
    const firstBtn = document.getElementById('add-first-khata-btn');
    if (firstBtn) firstBtn.addEventListener('click', () => openModal());
    document.getElementById('khata-form').addEventListener('submit', _handleSubmit);
    document.getElementById('khata-search').addEventListener('input', render);
    document.getElementById('khata-ledger-close').addEventListener('click', () => {
      document.getElementById('khata-ledger-card').classList.add('hidden');
    });
  }

  function refresh() { render(); }

  function render() {
    const user = Auth.getUser();
    const parties = Store.getKhataParties(Auth.ownerId());
    const search = document.getElementById('khata-search').value.toLowerCase().trim();
    const filtered = search ? parties.filter(p => p.partyName.toLowerCase().includes(search)) : parties;
    const container = document.getElementById('khata-parties');
    const empty = document.getElementById('no-khata');
    const summary = document.getElementById('khata-summary');

    if (parties.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      summary.innerHTML = '';
      return;
    }
    empty.classList.add('hidden');

    let totalOwed = 0, totalOwing = 0;
    parties.forEach(p => { if (p.total > 0) totalOwed += p.total; else totalOwing += Math.abs(p.total); });

    summary.innerHTML =
      '<div class="stat-card"><div class="stat-icon green"><i class="fas fa-arrow-down"></i></div><div class="stat-info"><span class="stat-value" style="color:var(--success)">₹' + totalOwed.toFixed(0) + '</span><span class="stat-label">They Owe You</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon red"><i class="fas fa-arrow-up"></i></div><div class="stat-info"><span class="stat-value" style="color:var(--danger)">₹' + totalOwing.toFixed(0) + '</span><span class="stat-label">You Owe Them</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-scale-balanced"></i></div><div class="stat-info"><span class="stat-value">₹' + (totalOwed - totalOwing).toFixed(0) + '</span><span class="stat-label">Net Balance</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon purple"><i class="fas fa-users"></i></div><div class="stat-info"><span class="stat-value">' + parties.length + '</span><span class="stat-label">Parties</span></div></div>';

    container.innerHTML = filtered.map(p => {
      const initials = p.partyName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const balClass = p.total > 0 ? 'positive' : p.total < 0 ? 'negative' : '';
      const sign = p.total > 0 ? '+' : '';
      return '<div class="khata-party-card" onclick="KhataModule.showLedger(\'' + p.partyId + '\')">' +
        '<div class="khata-party-avatar">' + initials + '</div>' +
        '<div class="khata-party-info"><h4>' + _esc(p.partyName) + '</h4><span>Click to view ledger</span></div>' +
        '<div class="khata-balance ' + balClass + '">' + sign + '₹' + Math.abs(p.total).toFixed(2) + '</div></div>';
    }).join('');
  }

  function showLedger(partyId) {
    const user = Auth.getUser();
    const entries = Store.getKhataByParty(Auth.ownerId(), partyId);
    if (entries.length === 0) return;
    const card = document.getElementById('khata-ledger-card');
    document.getElementById('khata-ledger-title').textContent = 'Ledger: ' + entries[0].partyName;
    card.classList.remove('hidden');

    let running = 0;
    const tbody = document.getElementById('khata-ledger-body');
    tbody.innerHTML = entries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(e => {
      running += e.type === 'credit' ? e.amount : -e.amount;
      const date = new Date(e.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
      return '<tr>' +
        '<td>' + date + '</td>' +
        '<td><code style="font-size:.75rem">' + _esc(e.entryNumber) + '</code></td>' +
        '<td>' + _esc(e.description || '—') + '</td>' +
        '<td style="color:var(--success);font-weight:600">' + (e.type === 'credit' ? '₹' + e.amount.toFixed(2) : '') + '</td>' +
        '<td style="color:var(--danger);font-weight:600">' + (e.type === 'debit' ? '₹' + e.amount.toFixed(2) : '') + '</td>' +
        '<td style="font-weight:700;color:' + (running > 0 ? 'var(--success)' : running < 0 ? 'var(--danger)' : 'var(--text)') + '">₹' + running.toFixed(2) + '</td></tr>';
    }).join('');

    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function openModal() {
    const form = document.getElementById('khata-form');
    form.reset();
    const user = Auth.getUser();
    const allUsers = Store.getUsers().filter(u => u.id !== Auth.ownerId());
    const parties = Store.getKhataParties(Auth.ownerId());

    const datalist = document.getElementById('khata-party-list');
    datalist.innerHTML = parties.map(p => '<option value="' + _esc(p.partyName) + '">').join('') +
      allUsers.map(u => '<option value="' + _esc(u.name || u.shopName) + '">').join('');

    const sel = document.getElementById('khata-party-id');
    sel.innerHTML = '<option value="">-- None --</option>' + allUsers.map(u => '<option value="' + u.id + '">' + _esc(u.name || u.shopName) + '</option>').join('');

    document.getElementById('khata-modal').classList.remove('hidden');
  }

  function _handleSubmit(e) {
    e.preventDefault();
    const user = Auth.getUser();
    const partyName = document.getElementById('khata-party').value.trim();
    const partyIdSel = document.getElementById('khata-party-id').value;
    const type = document.getElementById('khata-type').value;
    const amount = parseFloat(document.getElementById('khata-amount').value) || 0;
    const description = document.getElementById('khata-desc').value.trim();

    if (!partyName || amount <= 0) { App.showToast('Fill all required fields', 'warning'); return; }

    const partyId = partyIdSel || partyName.toLowerCase().replace(/\s+/g, '_');

    Store.addKhataEntry({ ownerId: Auth.ownerId(), partyId, partyName, type, amount, description });
    App.showToast('Khata entry added', 'success');
    document.getElementById('khata-modal').classList.add('hidden');
    render();
  }

  return { init, render, refresh, openModal, showLedger };
})();
