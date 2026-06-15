const Shop = (() => {
  function init() {
    document.getElementById('shop-search').addEventListener('input', renderProducts);
    document.getElementById('shop-seller-filter').addEventListener('change', renderProducts);
    document.getElementById('shop-category-filter').addEventListener('change', renderProducts);
    document.getElementById('open-cart-btn').addEventListener('click', openCart);
    document.getElementById('close-cart-btn').addEventListener('click', closeCart);
    document.getElementById('cart-overlay').addEventListener('click', closeCart);
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
  }

  function populateFilters() {
    const user = Auth.getUser();
    const allUsers = Store.getUsers().filter(u => u.id !== Auth.ownerId());
    const cats = Store.getCategories();

    document.getElementById('shop-seller-filter').innerHTML = '<option value="">All Shops</option>' + allUsers.map(u => `<option value="${u.id}">${u.name || u.shopName}</option>`).join('');
    document.getElementById('shop-category-filter').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function renderProducts() {
    const user = Auth.getUser();
    const search = document.getElementById('shop-search').value.toLowerCase().trim();
    const sellerFilter = document.getElementById('shop-seller-filter').value;
    const catFilter = document.getElementById('shop-category-filter').value;

    const otherUsers = Store.getUsers().filter(u => u.id !== Auth.ownerId());
    let products = [];
    otherUsers.forEach(u => {
      Store.getPublishedProducts(u.id).forEach(p => {
        products.push({ ...p, shopName: u.name || u.shopName });
      });
    });

    if (search) products = products.filter(p => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search));
    if (sellerFilter) products = products.filter(p => p.ownerId === sellerFilter);
    if (catFilter) products = products.filter(p => p.categoryId === catFilter);

    const grid = document.getElementById('shop-grid');
    const empty = document.getElementById('no-shop-products');

    if (products.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const catIcons = { cat_elec: 'fa-microchip', cat_furn: 'fa-couch', cat_supp: 'fa-paperclip', cat_clth: 'fa-shirt', cat_food: 'fa-mug-hot', cat_health: 'fa-heart-pulse', cat_tools: 'fa-wrench' };

    grid.innerHTML = products.map(p => {
      const icon = catIcons[p.categoryId] || 'fa-box';
      const totalStock = Store.getTotalStockForProduct(p.id);
      const inStock = totalStock > 0;
      return `<div class="shop-product-card">
        <div class="product-thumb"><i class="fas ${icon}"></i></div>
        <div class="product-body">
          <div class="product-shop">${_esc(p.shopName)}</div>
          <h4>${_esc(p.name)}</h4>
          <div class="product-desc">${_esc(p.description || '')}</div>
          <div class="product-footer">
            <span class="product-price">₹${p.price.toFixed(2)}</span>
            ${inStock
              ? `<button class="btn btn-primary btn-sm btn-add-cart" onclick="Shop.addToCart('${p.ownerId}','${p.id}')"><i class="fas fa-cart-plus"></i> Add</button>`
              : '<span class="badge badge-danger">Out of Stock</span>'}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function addToCart(sellerId, productId) {
    const result = Store.addToCart(sellerId, productId, 1);
    if (!result.success) {
      App.showToast(result.message, 'warning');
      return;
    }
    App.showToast('Added to cart', 'success');
    _updateCartBadges();
  }

  function _updateCartBadges() {
    const count = Store.getCartItemCount();
    document.getElementById('cart-count').textContent = count;
    const navBadge = document.getElementById('cart-badge-nav');
    if (count > 0) { navBadge.textContent = count; navBadge.classList.remove('hidden'); }
    else { navBadge.classList.add('hidden'); }
  }

  function openCart() {
    renderCart();
    document.getElementById('cart-drawer').classList.remove('hidden');
    document.getElementById('cart-overlay').classList.remove('hidden');
  }

  function closeCart() {
    document.getElementById('cart-drawer').classList.add('hidden');
    document.getElementById('cart-overlay').classList.add('hidden');
  }

  function renderCart() {
    const cart = Store.getCart();
    const body = document.getElementById('cart-body');
    const footer = document.getElementById('cart-footer');
    const emptyEl = document.getElementById('cart-empty');

    if (!cart.items || cart.items.length === 0) {
      body.innerHTML = '<div class="empty-state" id="cart-empty"><i class="fas fa-cart-shopping"></i><p>Your cart is empty</p></div>';
      footer.classList.add('hidden');
      _updateCartBadges();
      return;
    }

    footer.classList.remove('hidden');
    const seller = cart.sellerId ? Store.getUserById(cart.sellerId) : null;
    let total = 0;

    body.innerHTML = (seller ? `<p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:.75rem">Ordering from: <strong>${_esc(seller.name || seller.shopName)}</strong></p>` : '') +
      cart.items.map(ci => {
        const product = Store.getProductById(ci.productId);
        if (!product) return '';
        const lineTotal = ci.qty * product.price;
        total += lineTotal;
        return `<div class="cart-item">
          <div class="cart-item-info"><h4>${_esc(product.name)}</h4><div class="cart-item-price">₹${product.price.toFixed(2)} each</div></div>
          <div class="cart-item-qty">
            <button onclick="Shop.updateQty('${ci.productId}',${ci.qty - 1})"><i class="fas fa-minus"></i></button>
            <span>${ci.qty}</span>
            <button onclick="Shop.updateQty('${ci.productId}',${ci.qty + 1})"><i class="fas fa-plus"></i></button>
          </div>
          <div class="cart-item-total">₹${lineTotal.toFixed(2)}</div>
        </div>`;
      }).join('');

    document.getElementById('cart-total-value').textContent = '₹' + total.toFixed(2);
    _updateCartBadges();
  }

  function updateQty(productId, qty) {
    Store.updateCartItemQty(productId, qty);
    renderCart();
  }

  function clearCart() {
    Store.clearCart();
    renderCart();
    _updateCartBadges();
    App.showToast('Cart cleared', 'success');
  }

  function placeOrder() {
    const cart = Store.getCart();
    if (!cart.items || cart.items.length === 0) return;
    const user = Auth.getUser();

    const orderItems = cart.items.map(ci => {
      const product = Store.getProductById(ci.productId);
      return { productId: ci.productId, name: product.name, sku: product.sku, qty: ci.qty, unitPrice: product.price };
    });

    Store.createOrder(Auth.ownerId(), cart.sellerId, orderItems);
    Store.clearCart();
    renderCart();
    _updateCartBadges();
    closeCart();
    App.showToast('Order placed successfully!', 'success');
    Orders.render();
    Dashboard.refresh();
  }

  function refreshBadges() { _updateCartBadges(); }

  function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { init, renderProducts, addToCart, openCart, closeCart, renderCart, updateQty, clearCart, placeOrder, populateFilters, refreshBadges };
})();
