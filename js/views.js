// List / cards switch shared by pages that show a collection.
const Views = (() => {
  function _stored(page) {
    try { return localStorage.getItem('zentory_view_' + page); } catch (e) { return null; }
  }

  function _narrow() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width:768px)').matches;
  }

  function mode(page, fallback) {
    const stored = _stored(page);
    if (stored === 'list' || stored === 'cards') return stored;
    // Older builds saved a board layout. That view is gone.
    if (stored === 'board') return 'cards';
    if (_narrow() && fallback !== 'cards') return 'cards';
    return fallback || 'list';
  }

  function setMode(page, value) {
    try { localStorage.setItem('zentory_view_' + page, value); } catch (e) { /* private mode */ }
  }

  function mount(host, page, onChange, fallback) {
    if (!host || host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    host.innerHTML = _buttons(page, fallback);
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view-mode]');
      if (!btn) return;
      setMode(page, btn.dataset.viewMode);
      host.innerHTML = _buttons(page, fallback);
      onChange();
    });
  }

  function _buttons(page, fallback) {
    const cur = mode(page, fallback);
    const items = [
      ['list', 'fa-list', 'List'],
      ['cards', 'fa-grip', 'Cards'],
    ];
    return '<div class="view-switch" role="group" aria-label="Layout">' + items.map(item =>
      '<button type="button" class="view-switch-btn' + (cur === item[0] ? ' active' : '') + '" data-view-mode="' + item[0] + '" title="' + item[2] + '" aria-pressed="' + (cur === item[0] ? 'true' : 'false') + '"><i class="fas ' + item[1] + '" aria-hidden="true"></i><span>' + item[2] + '</span></button>'
    ).join('') + '</div>';
  }

  // Read the table already rendered for `page` and mirror it as cards.
  // The table stays in the DOM so the list view and existing actions keep working.
  function sync(page, table, alt, fallback) {
    if (!table || !alt) return mode(page, fallback);
    const m = mode(page, fallback);
    const wrap = table.closest('.table-wrap') || table;
    const showList = m === 'list';
    wrap.classList.toggle('hidden', !showList);
    alt.classList.toggle('hidden', showList);
    if (showList) { alt.innerHTML = ''; return m; }

    const headers = table.tHead ? Array.from(table.tHead.rows[0].cells).map(th => (th.textContent || '').replace(/\s+/g, ' ').trim()) : [];
    const rows = Array.from((table.tBodies[0] && table.tBodies[0].rows) || []).filter(r => !r.classList.contains('lots-subrow') && r.cells.length > 1);
    if (!rows.length) { alt.innerHTML = ''; return m; }

    alt.innerHTML = _cards(rows, headers);
    return m;
  }

  function _titleCell(row) {
    const named = Array.from(row.cells).find(c => (c.textContent || '').trim() && !c.querySelector('.action-btns'));
    return named || row.cells[0];
  }

  function _cards(rows, headers) {
    return '<div class="entity-grid">' + rows.map(row => {
      const title = _titleCell(row);
      const actions = row.querySelector('.action-btns');
      const meta = Array.from(row.cells).filter(c => c !== title && !c.querySelector('.action-btns') && (c.textContent || '').trim()).slice(0, 4).map(c => {
        const idx = c.cellIndex;
        const label = headers[idx] || '';
        return '<div class="entity-meta"><span>' + _esc(label) + '</span><div>' + c.innerHTML + '</div></div>';
      }).join('');
      return '<article class="entity-card"><h4>' + title.innerHTML + '</h4><div class="entity-meta-grid">' + meta + '</div>' +
        (actions ? '<div class="entity-actions">' + actions.innerHTML + '</div>' : '') + '</article>';
    }).join('') + '</div>';
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function applyLayout(host, page, fallback) {
    if (!host) return mode(page, fallback);
    const m = mode(page, fallback);
    host.dataset.layout = m;
    return m;
  }

  function syncFrom(page, tbodyId, altId, fallback) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return mode(page, fallback);
    return sync(page, tbody.closest('table'), document.getElementById(altId), fallback);
  }

  return { mode, setMode, mount, sync, applyLayout, syncFrom };
})();
