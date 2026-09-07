// TableSort — click any data-table header (except .no-sort) to sort rows.
const TableSort = (() => {
  const state = new WeakMap();

  function enhance(table) {
    if (!table || !table.tHead) return;
    table.querySelectorAll('thead th').forEach((th, idx) => {
      if (th._tsBound) return;
      const label = (th.textContent || '').trim().toLowerCase();
      if (th.classList.contains('no-sort') || label === 'actions' || th.querySelector('input,button,select')) {
        th.classList.add('no-sort');
        return;
      }
      th._tsBound = true;
      th.classList.add('sortable');
      if (!th.querySelector('.fa-sort')) {
        th.insertAdjacentHTML('beforeend', ' <i class="fas fa-sort"></i>');
      }
      th.addEventListener('click', () => sort(table, idx, th));
    });
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll('table.data-table').forEach(enhance);
  }

  function _cellVal(row, idx) {
    const cell = row.cells[idx];
    if (!cell) return { n: null, s: '' };
    let text = (cell.textContent || '').replace(/\u20B9/g, '').trim();
    const raw = text.replace(/,/g, '');
    const num = parseFloat(raw.replace(/%/g, ''));
    if (raw !== '' && !isNaN(num) && /^[-+]?\d*\.?\d+%?$/.test(raw)) return { n: num, s: text.toLowerCase() };
    const d = Date.parse(text);
    if (!isNaN(d) && /[/-]/.test(text) && text.length >= 6) return { n: d, s: text.toLowerCase() };
    return { n: null, s: text.toLowerCase() };
  }

  function sort(table, idx, th, keepDir) {
    const tbody = table.tBodies[0];
    if (!tbody) return;
    const prev = state.get(table) || { col: -1, dir: 'asc' };
    let dir = prev.dir;
    if (!keepDir) dir = (prev.col === idx && prev.dir === 'asc') ? 'desc' : 'asc';
    else if (prev.col !== idx) dir = 'asc';
    state.set(table, { col: idx, dir: dir });
    const rows = Array.from(tbody.rows);
    rows.sort((a, b) => {
      const va = _cellVal(a, idx), vb = _cellVal(b, idx);
      let cmp = 0;
      if (va.n != null && vb.n != null) cmp = va.n - vb.n;
      else cmp = va.s.localeCompare(vb.s, undefined, { numeric: true, sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
    rows.forEach(r => tbody.appendChild(r));
    table.querySelectorAll('thead th').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
    if (th) th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  }

  function restore(table) {
    const st = state.get(table);
    if (!st || st.col < 0) return;
    const th = table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells[st.col] : null;
    sort(table, st.col, th, true);
  }

  function refresh(root) {
    enhanceAll(root);
    (root || document).querySelectorAll('table.data-table').forEach(restore);
  }

  return { enhance, enhanceAll, refresh };
})();
