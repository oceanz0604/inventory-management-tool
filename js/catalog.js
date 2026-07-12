/* ============================================================
   Zentory — "Add from Catalog"
   Lets a shop bulk-add common products (per sector) instead of
   typing each one. Pre-fills unit, GST %, HSN code and category;
   the shop sets prices later when adding stock.
   Reuses Store.addProduct / addCategory (which sync to Firestore).
   ============================================================ */
const Catalog = (() => {
  let currentSector = null;
  const selected = new Map(); // key "sectorId::name" -> { item, sectorId }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function _key(sectorId, name) { return sectorId + '::' + name; }

  function init() {
    const btn = document.getElementById('catalog-btn');
    if (btn) btn.addEventListener('click', open);
    document.getElementById('catalog-search').addEventListener('input', _renderItems);
    document.getElementById('catalog-select-all').addEventListener('change', _toggleSelectAllVisible);
    document.getElementById('catalog-add-btn').addEventListener('click', _addSelected);
  }

  function open() {
    selected.clear();
    currentSector = CATALOG.sectors[0].id;
    document.getElementById('catalog-search').value = '';
    _renderSectors();
    _renderItems();
    _syncFooter();
    document.getElementById('catalog-modal').classList.remove('hidden');
  }

  function _renderSectors() {
    const wrap = document.getElementById('catalog-sectors');
    wrap.innerHTML = CATALOG.sectors.map(s =>
      '<button type="button" class="catalog-pill ' + (s.id === currentSector ? 'active' : '') + '" data-sector="' + s.id + '">' +
      '<i class="fas ' + s.icon + '"></i> ' + _esc(s.name) + '</button>'
    ).join('');
    wrap.querySelectorAll('.catalog-pill').forEach(p => p.addEventListener('click', () => {
      currentSector = p.dataset.sector;
      _renderSectors();
      _renderItems();
    }));
  }

  function _sectorById(id) { return CATALOG.sectors.find(s => s.id === id); }

  function _existingNames() {
    return new Set(Store.getProductsByOwner(Auth.ownerId()).map(p => (p.name || '').toLowerCase().trim()));
  }

  function _renderItems() {
    const sector = _sectorById(currentSector);
    const search = document.getElementById('catalog-search').value.toLowerCase().trim();
    const existing = _existingNames();
    const list = document.getElementById('catalog-items');

    const items = sector.items.filter(it => !search ||
      it.name.toLowerCase().includes(search) || (it.category || '').toLowerCase().includes(search) || (it.hsnCode || '').includes(search));

    if (items.length === 0) { list.innerHTML = '<div class="catalog-empty">No items match your search</div>'; }
    else {
      list.innerHTML = items.map(it => {
        const key = _key(sector.id, it.name);
        const already = existing.has(it.name.toLowerCase().trim());
        const checked = selected.has(key) ? 'checked' : '';
        return '<label class="catalog-item' + (already ? ' added' : '') + '">' +
          '<input type="checkbox" data-key="' + _esc(key) + '" ' + checked + (already ? ' disabled' : '') + '>' +
          '<div class="catalog-item-main"><span class="catalog-item-name">' + _esc(it.name) +
          (already ? ' <span class="catalog-added-tag">Added</span>' : '') + '</span>' +
          '<span class="catalog-item-meta">' + _esc(it.category) + ' \u00b7 ' + _esc(it.unit) + ' \u00b7 GST ' + it.gstRate + '% \u00b7 HSN ' + _esc(it.hsnCode) + '</span></div>' +
          '</label>';
      }).join('');

      list.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = cb.dataset.key;
          if (cb.checked) {
            const name = key.slice((sector.id + '::').length);
            selected.set(key, { item: sector.items.find(i => i.name === name), sectorId: sector.id });
          } else {
            selected.delete(key);
          }
          _syncFooter();
        });
      });
    }
    _syncSelectAll();
  }

  function _visibleCheckboxes() {
    return Array.from(document.querySelectorAll('#catalog-items input[type="checkbox"]:not(:disabled)'));
  }

  function _toggleSelectAllVisible(e) {
    const sector = _sectorById(currentSector);
    _visibleCheckboxes().forEach(cb => {
      cb.checked = e.target.checked;
      const key = cb.dataset.key;
      if (e.target.checked) {
        const name = key.slice((sector.id + '::').length);
        selected.set(key, { item: sector.items.find(i => i.name === name), sectorId: sector.id });
      } else {
        selected.delete(key);
      }
    });
    _syncFooter();
  }

  function _syncSelectAll() {
    const boxes = _visibleCheckboxes();
    const all = boxes.length > 0 && boxes.every(cb => cb.checked);
    const cb = document.getElementById('catalog-select-all');
    cb.checked = all;
    cb.indeterminate = !all && boxes.some(b => b.checked);
  }

  function _syncFooter() {
    const n = selected.size;
    document.getElementById('catalog-selected-count').textContent = n + ' selected';
    document.getElementById('catalog-add-btn').disabled = n === 0;
    _syncSelectAll();
  }

  // Resolve a category by name for the current owner, creating it if new.
  function _resolveCategory(name, cacheMap) {
    const key = name.toLowerCase().trim();
    if (cacheMap.has(key)) return cacheMap.get(key);
    const cat = Store.addCategory({ id: Store.generateId(), name, color: CATALOG.colorFor(name) });
    cacheMap.set(key, cat.id);
    return cat.id;
  }

  function _genSku(sectorId, name, used) {
    const prefix = sectorId.slice(0, 3).toUpperCase();
    const slug = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'ITEM';
    let sku;
    do { sku = prefix + '-' + slug + '-' + Math.floor(1000 + Math.random() * 9000); } while (used.has(sku));
    used.add(sku);
    return sku;
  }

  function _addSelected() {
    if (selected.size === 0) return;
    const owner = Auth.ownerId();

    const catCache = new Map();
    Store.getCategories().forEach(c => catCache.set((c.name || '').toLowerCase().trim(), c.id));
    const existingNames = _existingNames();
    const usedSkus = new Set(Store.getProductsByOwner(owner).map(p => (p.sku || '').toUpperCase()));

    let added = 0, skipped = 0;
    selected.forEach(({ item, sectorId }) => {
      if (existingNames.has(item.name.toLowerCase().trim())) { skipped++; return; }
      const categoryId = _resolveCategory(item.category, catCache);
      Store.addProduct({
        id: Store.generateId(),
        ownerId: owner,
        type: 'simple',
        name: item.name,
        sku: _genSku(sectorId, item.name, usedSkus),
        categoryId,
        unit: item.unit,
        price: 0, mrp: 0, wholesalePrice: 0,
        costPrice: 0,
        gstRate: item.gstRate,
        hsnCode: item.hsnCode,
        description: '',
        isPublished: false,
        recipe: null,
        createdAt: new Date().toISOString(),
      });
      existingNames.add(item.name.toLowerCase().trim());
      added++;
    });

    document.getElementById('catalog-modal').classList.add('hidden');
    let msg = 'Added ' + added + ' product' + (added !== 1 ? 's' : '');
    if (skipped > 0) msg += ' (' + skipped + ' already existed)';
    App.showToast(msg, added > 0 ? 'success' : 'warning');

    Products.populateFilters();
    Products.render();
    Inventory.refreshFilters();
    Dashboard.refresh();
  }

  return { init, open };
})();
