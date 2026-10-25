// Company settings. The ingredient toggle keeps its original id so existing
// screens and checks can find it.
const Settings = (() => {
  function init() {
    const track = document.getElementById('track-ingredient-stock');
    if (track) track.addEventListener('change', () => _save({ trackIngredientStock: track.checked }, track.checked
      ? 'Raw material quantities are tracked again'
      : 'Make-to-order sales no longer depend on raw material quantities'));

    const alerts = document.getElementById('settings-low-stock');
    if (alerts) alerts.addEventListener('change', () => _save({ lowStockAlerts: alerts.checked }, alerts.checked
      ? 'Low-stock alerts are on'
      : 'Low-stock alerts are off'));

    const publish = document.getElementById('settings-publish-default');
    if (publish) publish.addEventListener('change', () => _save({ publishByDefault: publish.checked }, publish.checked
      ? 'New products publish to the shop by default'
      : 'New products stay unpublished until you turn them on'));

    const expiry = document.getElementById('settings-expiry-days');
    if (expiry) expiry.addEventListener('change', () => {
      const days = Math.max(1, parseInt(expiry.value, 10) || 90);
      expiry.value = days;
      _save({ expiryWarnDays: days }, 'Expiry warning set to ' + days + ' days');
    });

    const pay = document.getElementById('settings-pos-payment');
    if (pay) pay.addEventListener('change', () => {
      _save({ posPayment: pay.value }, 'POS payment default saved');
      const posPay = document.getElementById('pos-payment');
      if (posPay) posPay.value = pay.value;
    });
  }

  function render() {
    const cfg = (Auth.getCompanyConfig && Auth.getCompanyConfig()) || {};
    const track = document.getElementById('track-ingredient-stock');
    if (track) track.checked = Store.tracksIngredientStock(Auth.ownerId());
    const alerts = document.getElementById('settings-low-stock');
    if (alerts) alerts.checked = cfg.lowStockAlerts !== false;
    const publish = document.getElementById('settings-publish-default');
    if (publish) publish.checked = cfg.publishByDefault !== false;
    const expiry = document.getElementById('settings-expiry-days');
    if (expiry) expiry.value = cfg.expiryWarnDays || 90;
    const pay = document.getElementById('settings-pos-payment');
    if (pay) pay.value = cfg.posPayment || 'cash';
  }

  function expiryDays() {
    const cfg = Auth.getCompanyConfig && Auth.getCompanyConfig();
    const n = cfg && cfg.expiryWarnDays;
    return n > 0 ? n : 90;
  }

  function alertsOn() {
    const cfg = Auth.getCompanyConfig && Auth.getCompanyConfig();
    return !cfg || cfg.lowStockAlerts !== false;
  }

  async function _save(patch, message) {
    try { await Auth.setCompanyConfig(patch); } catch (e) { /* local copy is already saved */ }
    App.showToast(message, 'success');
    if (typeof Dashboard !== 'undefined') Dashboard.refresh();
    if (typeof Reports !== 'undefined') Reports.refresh();
    if (typeof Inventory !== 'undefined') Inventory.render();
  }

  return { init, render, expiryDays, alertsOn };
})();
