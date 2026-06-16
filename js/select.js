// SearchableSelect — upgrades a native <select> into a filterable combobox while
// keeping the underlying <select> as the source of truth (so existing `change`
// listeners and form reads keep working). Opening the panel always reads the
// live <option> list, so selects whose options are rebuilt still show fresh data.
const SearchableSelect = (() => {
  function _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  function enhance(sel) {
    if (!sel || sel.multiple) return;
    if (sel._ssWrap) { refresh(sel); return; }

    const wrap = document.createElement('div');
    wrap.className = 'ss-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('ss-native');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ss-control';

    const panel = document.createElement('div');
    panel.className = 'ss-panel hidden';
    panel.innerHTML = '<div class="ss-search"><i class="fas fa-search"></i>' +
      '<input type="text" placeholder="Search..." autocomplete="off"></div>' +
      '<div class="ss-options"></div>';

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    sel._ssWrap = wrap; sel._ssBtn = btn; sel._ssPanel = panel;

    const input = panel.querySelector('input');
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); _toggle(sel); });
    input.addEventListener('input', () => _renderOptions(sel, input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { _close(sel); btn.focus(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = panel.querySelector('.ss-opt:not(.dis)');
        if (first) first.click();
      }
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) _close(sel); });
    sel.addEventListener('change', () => _syncLabel(sel));
    refresh(sel);
  }

  function refresh(sel) {
    if (!sel || !sel._ssWrap) return;
    _syncLabel(sel);
    if (!sel._ssPanel.classList.contains('hidden')) _renderOptions(sel, sel._ssPanel.querySelector('input').value || '');
  }

  function _syncLabel(sel) {
    const opt = sel.options[sel.selectedIndex];
    const label = opt ? opt.textContent : '';
    const isPlaceholder = !sel.value;
    sel._ssBtn.innerHTML = '<span class="ss-label' + (isPlaceholder ? ' ss-placeholder' : '') + '">' +
      _esc(label || 'Select') + '</span><i class="fas fa-chevron-down ss-caret"></i>';
    sel._ssBtn.classList.toggle('ss-disabled', sel.disabled);
    sel._ssBtn.disabled = sel.disabled;
  }

  function _renderOptions(sel, q) {
    q = (q || '').toLowerCase().trim();
    const box = sel._ssPanel.querySelector('.ss-options');
    const opts = Array.from(sel.options);
    const matches = opts.filter(o => o.textContent.toLowerCase().includes(q));
    box.innerHTML = matches.length
      ? matches.map(o => '<div class="ss-opt' + (o.value === sel.value ? ' sel' : '') + (o.disabled ? ' dis' : '') +
          '" data-v="' + _esc(o.value).replace(/"/g, '&quot;') + '">' + _esc(o.textContent) + '</div>').join('')
      : '<div class="ss-empty">No matches</div>';
    box.querySelectorAll('.ss-opt:not(.dis)').forEach(d => d.addEventListener('click', () => {
      sel.value = d.dataset.v;
      _syncLabel(sel);
      _close(sel);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  }

  function _toggle(sel) { sel._ssPanel.classList.contains('hidden') ? _open(sel) : _close(sel); }
  function _open(sel) {
    if (sel.disabled) return;
    _closeAll();
    sel._ssPanel.classList.remove('hidden');
    const i = sel._ssPanel.querySelector('input');
    i.value = '';
    _renderOptions(sel, '');
    setTimeout(() => i.focus(), 0);
  }
  function _close(sel) { sel._ssPanel.classList.add('hidden'); }
  function _closeAll() { document.querySelectorAll('.ss-panel').forEach(p => p.classList.add('hidden')); }

  // Enhance / refresh every native combobox within a root element.
  function enhanceAll(root) {
    (root || document).querySelectorAll('select.select-input').forEach(enhance);
  }

  return { enhance, enhanceAll, refresh };
})();
