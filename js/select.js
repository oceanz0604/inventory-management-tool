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

  let _ignoreScrollUntil = 0;
  function _toggle(sel) { sel._ssPanel.classList.contains('hidden') ? _open(sel) : _close(sel); }
  function _place(sel) {
    const panel = sel._ssPanel;
    const rect = sel._ssBtn.getBoundingClientRect();
    const width = Math.max(rect.width, 180);
    const below = window.innerHeight - rect.bottom;
    panel.style.position = 'fixed';
    panel.style.zIndex = '250';
    panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
    panel.style.width = width + 'px';
    panel.style.right = 'auto';
    if (below < 200 && rect.top > below) {
      panel.style.top = 'auto';
      panel.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
      panel.style.maxHeight = Math.max(120, rect.top - 12) + 'px';
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = (rect.bottom + 4) + 'px';
      panel.style.maxHeight = Math.max(120, below - 12) + 'px';
    }
  }
  function _open(sel) {
    if (sel.disabled) return;
    _closeAll();
    _place(sel);
    _ignoreScrollUntil = Date.now() + 400;
    sel._ssPanel.classList.remove('hidden');
    const i = sel._ssPanel.querySelector('input');
    i.value = '';
    _renderOptions(sel, '');
    setTimeout(() => i.focus(), 0);
  }
  function _close(sel) { if (sel && sel._ssPanel) sel._ssPanel.classList.add('hidden'); }
  function _closeAll() { document.querySelectorAll('.ss-panel').forEach(p => p.classList.add('hidden')); }
  window.addEventListener('scroll', (e) => {
    if (Date.now() < _ignoreScrollUntil) return;
    if (e.target && e.target.closest && e.target.closest('.ss-panel')) return;
    _closeAll();
  }, true);

  // Enhance / refresh every native combobox within a root element.
  function enhanceAll(root) {
    (root || document).querySelectorAll('select.select-input').forEach(enhance);
  }

  return { enhance, enhanceAll, refresh, closeAll: _closeAll };
})();
