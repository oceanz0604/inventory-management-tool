import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadStore(handlers = {}) {
  const storage = new Map();
  const localStorage = {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(String(k), String(v)); },
    removeItem(k) { storage.delete(k); },
    key(i) { return [...storage.keys()][i] ?? null; },
    get length() { return storage.size; },
  };
  const calls = [];
  const Firebase = {
    isEnabled() { return true; },
    async list(c) { calls.push({ op: "list", c }); return handlers.list ? handlers.list(c) : []; },
    async listWhere(c, f, op, v) {
      calls.push({ op: "listWhere", c, f, cmp: op, v });
      return handlers.listWhere ? handlers.listWhere(c, f, v) : [];
    },
    async listByOwner(c, id) {
      calls.push({ op: "listByOwner", c, id });
      return handlers.listByOwner ? handlers.listByOwner(c, id) : [];
    },
    async listRecent(c, f, v, since) {
      calls.push({ op: "listRecent", c, f, v, since });
      return handlers.listRecent ? handlers.listRecent(c, f, v, since) : [];
    },
    async getDoc(c, id) {
      calls.push({ op: "getDoc", c, id });
      return handlers.getDoc ? handlers.getDoc(c, id) : null;
    },
    async save() { return null; },
    async remove() { return null; },
  };
  const context = {
    console, Date, Math, JSON, parseInt, parseFloat, Number, String, Object, Array,
    Error, isNaN, Infinity, NaN, localStorage, Firebase,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(new URL("../js/store.js", import.meta.url), "utf8")
    + "\nglobalThis.__Store = Store;\n";
  vm.runInContext(source, context, { filename: "store.js" });
  return { Store: context.__Store, localStorage, calls };
}

function company(Store, owner, extra = {}) {
  Store.addCompany({ id: owner, name: "Test Cafe", ...extra });
  const loc = Store.addLocation({ id: `loc_${owner}`, ownerId: owner, name: "Counter", isDefault: true });
  return loc;
}

describe("store business rules", { concurrency: false }, () => {
  test("POS sale consumes the earliest expiry first", () => {
    const { Store } = loadStore();
    const owner = "co_fefo";
    const loc = company(Store, owner);
    Store.addProduct({ id: "milk", ownerId: owner, name: "Milk", type: "simple", sku: "MLK", price: 40, costPrice: 20, gstRate: 0, unit: "L" });
    Store.addBatch({ id: "late", productId: "milk", locationId: loc.id, qty: 5, unitCost: 20, expiryDate: "2027-06-01" });
    Store.addBatch({ id: "early", productId: "milk", locationId: loc.id, qty: 3, unitCost: 18, expiryDate: "2026-12-01" });
    const result = Store.createPosSale(owner, loc.id, [{ productId: "milk", name: "Milk", price: 40, qty: 4 }], "cash");
    assert.equal(result.success, true);
    assert.equal(Store.getBatchById("early").qty, 0);
    assert.equal(Store.getBatchById("late").qty, 4);
    assert.equal(Store.getStockRecord("milk", loc.id).quantity, 4);
  });

  test("a chosen lot is consumed ahead of the earlier expiry", () => {
    const { Store } = loadStore();
    const owner = "co_pref";
    const loc = company(Store, owner);
    Store.addProduct({ id: "milk", ownerId: owner, name: "Milk", type: "simple", sku: "MLK", price: 40, costPrice: 20, gstRate: 0, unit: "L" });
    Store.addBatch({ id: "early", productId: "milk", locationId: loc.id, qty: 5, unitCost: 18, expiryDate: "2026-12-01", createdAt: "2026-01-01T00:00:00.000Z", purchaseDate: "2026-01-01T00:00:00.000Z" });
    Store.addBatch({ id: "late", productId: "milk", locationId: loc.id, qty: 5, unitCost: 30, expiryDate: "2027-06-01", createdAt: "2026-06-01T00:00:00.000Z", purchaseDate: "2026-06-01T00:00:00.000Z" });
    const result = Store.createPosSale(owner, loc.id, [{ productId: "milk", name: "Milk", price: 40, qty: 2, batchId: "late" }], "cash");
    assert.equal(result.success, true);
    assert.equal(Store.getBatchById("late").qty, 3);
    assert.equal(Store.getBatchById("early").qty, 5);
  });

  test("GST is included in the POS total", () => {
    const { Store } = loadStore();
    const owner = "co_gst";
    const loc = company(Store, owner);
    Store.addProduct({ id: "tea", ownerId: owner, name: "Tea", type: "simple", sku: "TEA", price: 100, costPrice: 40, gstRate: 18, unit: "cup" });
    Store.addBatch({ id: "b1", productId: "tea", locationId: loc.id, qty: 10, unitCost: 40 });
    const result = Store.createPosSale(owner, loc.id, [{ productId: "tea", name: "Tea", price: 100, gstRate: 18, qty: 1 }], "upi");
    assert.equal(result.success, true);
    assert.equal(result.sale.subtotal, 100);
    assert.equal(result.sale.taxAmount, 18);
    assert.equal(result.sale.total, 118);
  });

  test("insufficient stock writes no sale and leaves quantity", () => {
    const { Store } = loadStore();
    const owner = "co_short";
    const loc = company(Store, owner);
    Store.addProduct({ id: "tea", ownerId: owner, name: "Tea", type: "simple", sku: "TEA", price: 10, costPrice: 4, gstRate: 0, unit: "cup" });
    Store.addBatch({ id: "b1", productId: "tea", locationId: loc.id, qty: 2, unitCost: 4 });
    const before = Store.getPosSales(owner).length;
    const result = Store.createPosSale(owner, loc.id, [{ productId: "tea", name: "Tea", price: 10, qty: 5 }], "cash");
    assert.equal(result.success, false);
    assert.match(result.message, /Not enough stock/);
    assert.equal(Store.getBatchById("b1").qty, 2);
    assert.equal(Store.getPosSales(owner).length, before);
  });

  test("an unknown product does not create a sale", () => {
    const { Store } = loadStore();
    const owner = "co_unknown";
    const loc = company(Store, owner);
    const result = Store.createPosSale(owner, loc.id, [{ productId: "missing", name: "Ghost", price: 10, qty: 1 }], "cash");
    assert.equal(result.success, false);
    assert.equal(Store.getPosSales(owner).length, 0);
  });

  test("a partial manual purchase stays open and posts the payable to Khata", () => {
    const { Store } = loadStore();
    const owner = "co_po";
    const loc = company(Store, owner);
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 10, unit: "kg" });
    const seller = Store.addParty({ ownerId: owner, name: "Hill Farm", type: "seller" });
    const order = Store.createManualPurchase(owner, seller.id, [{ productId: "beans", name: "Beans", qty: 10, unitPrice: 10 }], loc.id);
    const received = Store.receiveManualPurchase(order.id, 40, loc.id);
    assert.equal(received.success, true);
    assert.equal(received.order.status, "open");
    assert.equal(received.order.paymentStatus, "partial");
    assert.equal(Store.getBatchQty("beans", loc.id), 10);
    assert.equal(Store.getKhataBalance(owner, seller.id), -60);
  });

  test("a fully paid purchase completes and does not open Khata", () => {
    const { Store } = loadStore();
    const owner = "co_pofull";
    const loc = company(Store, owner);
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 10, unit: "kg" });
    const seller = Store.addParty({ ownerId: owner, name: "Hill Farm", type: "seller" });
    const order = Store.createManualPurchase(owner, seller.id, [{ productId: "beans", name: "Beans", qty: 4, unitPrice: 25 }], loc.id);
    const received = Store.receiveManualPurchase(order.id, 100, loc.id);
    assert.equal(received.order.status, "completed");
    assert.equal(received.order.paymentStatus, "paid");
    assert.equal(Store.getKhataEntries(owner).length, 0);
    assert.equal(Store.getBatchQty("beans", loc.id), 4);
  });

  test("a manual purchase with no location is rejected", () => {
    const { Store } = loadStore();
    const owner = "co_poloc";
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 10, unit: "kg" });
    const seller = Store.addParty({ ownerId: owner, name: "Hill Farm", type: "seller" });
    const order = Store.createManualPurchase(owner, seller.id, [{ productId: "beans", name: "Beans", qty: 1, unitPrice: 10 }], null);
    const received = Store.receiveManualPurchase(order.id, 10, null);
    assert.equal(received.success, false);
    assert.equal(received.message, "No location selected");
  });

  test("a short-paid field sale reduces stock and credits Khata", () => {
    const { Store } = loadStore();
    const owner = "co_field";
    const loc = company(Store, owner);
    Store.addProduct({ id: "tea", ownerId: owner, name: "Tea", type: "simple", sku: "TEA", price: 20, costPrice: 8, gstRate: 0, unit: "cup" });
    Store.addBatch({ id: "b1", productId: "tea", locationId: loc.id, qty: 10, unitCost: 8 });
    const customer = Store.addParty({ ownerId: owner, name: "Ramesh", type: "customer" });
    const order = Store.createFieldSale(owner, customer.id, [{ productId: "tea", name: "Tea", qty: 5, unitPrice: 20 }]);
    const done = Store.fulfillFieldSale(order.id, 40, loc.id);
    assert.equal(done.success, true);
    assert.equal(done.order.status, "open");
    assert.equal(Store.getBatchQty("tea", loc.id), 5);
    assert.equal(Store.getKhataBalance(owner, customer.id), 60);
  });

  test("a field sale that is short on stock consumes nothing", () => {
    const { Store } = loadStore();
    const owner = "co_fieldshort";
    const loc = company(Store, owner);
    Store.addProduct({ id: "tea", ownerId: owner, name: "Tea", type: "simple", sku: "TEA", price: 20, costPrice: 8, unit: "cup" });
    Store.addBatch({ id: "b1", productId: "tea", locationId: loc.id, qty: 2, unitCost: 8 });
    const customer = Store.addParty({ ownerId: owner, name: "Ramesh", type: "customer" });
    const order = Store.createFieldSale(owner, customer.id, [
      { productId: "tea", name: "Tea", qty: 1, unitPrice: 20 },
      { productId: "tea", name: "Tea", qty: 5, unitPrice: 20 },
    ]);
    const done = Store.fulfillFieldSale(order.id, 20, loc.id);
    assert.equal(done.success, false);
    assert.equal(Store.getBatchQty("tea", loc.id), 2);
    assert.equal(Store.getOrderById(order.id).status, "pending");
    assert.equal(Store.getKhataEntries(owner).length, 0);
  });

  test("a field sale does not deduct ingredients when a later line is short", () => {
    const { Store } = loadStore();
    const owner = "co_fieldmto";
    const loc = company(Store, owner);
    Store.addCompany({ id: owner, name: "Cafe", trackIngredientStock: true });
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 2, unit: "g" });
    Store.addProduct({
      id: "cup", ownerId: owner, name: "Espresso", type: "complex", sku: "ESP", price: 80, costPrice: 20, unit: "cup",
      recipe: { outputQty: 1, ingredients: [{ productId: "beans", qty: 10 }] },
    });
    Store.addProduct({ id: "cookie", ownerId: owner, name: "Cookie", type: "simple", sku: "CK", price: 30, costPrice: 10, unit: "pcs" });
    Store.addBatch({ id: "beans-lot", productId: "beans", locationId: loc.id, qty: 10, unitCost: 2 });
    const customer = Store.addParty({ ownerId: owner, name: "Ramesh", type: "customer" });
    const order = Store.createFieldSale(owner, customer.id, [
      { productId: "cup", name: "Espresso", qty: 1, unitPrice: 80 },
      { productId: "cookie", name: "Cookie", qty: 1, unitPrice: 30 },
    ]);
    const done = Store.fulfillFieldSale(order.id, 110, loc.id);
    assert.equal(done.success, false);
    assert.equal(Store.getBatchQty("beans", loc.id), 10);
    assert.equal(Store.getKhataEntries(owner).length, 0);
  });

  test("two make-to-order lines cannot share the same ingredients twice", () => {
    const { Store } = loadStore();
    const owner = "co_shared";
    const loc = company(Store, owner);
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 2, unit: "g" });
    Store.addProduct({
      id: "cup", ownerId: owner, name: "Espresso", type: "complex", sku: "ESP", price: 80, costPrice: 12, unit: "cup",
      recipe: { outputQty: 1, ingredients: [{ productId: "beans", qty: 6 }] },
    });
    Store.addBatch({ id: "beans-lot", productId: "beans", locationId: loc.id, qty: 10, unitCost: 2 });
    const customer = Store.addParty({ ownerId: owner, name: "Ramesh", type: "customer" });
    const order = Store.createFieldSale(owner, customer.id, [
      { productId: "cup", name: "Espresso", qty: 1, unitPrice: 80 },
      { productId: "cup", name: "Espresso", qty: 1, unitPrice: 80 },
    ]);
    const done = Store.fulfillFieldSale(order.id, 160, loc.id);
    assert.equal(done.success, false);
    assert.equal(Store.getBatchQty("beans", loc.id), 10);
  });

  test("settling an open field sale marks it paid", () => {
    const { Store } = loadStore();
    const owner = "co_settle";
    const loc = company(Store, owner);
    Store.addProduct({ id: "tea", ownerId: owner, name: "Tea", type: "simple", sku: "TEA", price: 20, costPrice: 8, unit: "cup" });
    Store.addBatch({ id: "b1", productId: "tea", locationId: loc.id, qty: 5, unitCost: 8 });
    const customer = Store.addParty({ ownerId: owner, name: "Ramesh", type: "customer" });
    const order = Store.createFieldSale(owner, customer.id, [{ productId: "tea", name: "Tea", qty: 1, unitPrice: 50 }]);
    Store.fulfillFieldSale(order.id, 20, loc.id);
    const settled = Store.settleOrder(order.id);
    assert.equal(settled.status, "completed");
    assert.equal(settled.paymentStatus, "paid");
    assert.equal(settled.amountPaid, 50);
  });

  test("untracked make-to-order sells with ingredient quantity unchanged and latest batch cost", () => {
    const { Store } = loadStore();
    const owner = "co_untracked";
    const loc = company(Store, owner);
    Store.addCompany({ id: owner, name: "Cafe", trackIngredientStock: false });
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 1, unit: "g" });
    Store.addProduct({
      id: "cup", ownerId: owner, name: "Espresso", type: "complex", sku: "ESP", price: 90, costPrice: 0, gstRate: 0, unit: "cup",
      recipe: { outputQty: 1, ingredients: [{ productId: "beans", qty: 10 }] },
    });
    Store.addBatch({ id: "old", productId: "beans", locationId: loc.id, qty: 4, unitCost: 1, createdAt: "2025-01-01T00:00:00.000Z", purchaseDate: "2025-01-01T00:00:00.000Z" });
    Store.addBatch({ id: "newer-empty", productId: "beans", locationId: loc.id, qty: 0, unitCost: 9, createdAt: "2026-06-01T00:00:00.000Z", purchaseDate: "2026-06-01T00:00:00.000Z" });
    assert.equal(Store.tracksIngredientStock(owner), false);
    assert.equal(Store.availableSellQty(Store.getProductById("cup"), loc.id), Infinity);
    const result = Store.createPosSale(owner, loc.id, [{ productId: "cup", name: "Espresso", price: 90, qty: 1 }], "cash");
    assert.equal(result.success, true);
    assert.equal(result.sale.items[0].costPrice, 90);
    assert.equal(Store.getBatchById("old").qty, 4);
    assert.equal(Store.getBatchById("newer-empty").qty, 0);
    assert.equal(result.sale.consumedLots.length, 0);
  });

  test("tracked make-to-order is blocked when ingredients are missing", () => {
    const { Store } = loadStore();
    const owner = "co_tracked";
    const loc = company(Store, owner);
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 2, unit: "g" });
    Store.addProduct({
      id: "cup", ownerId: owner, name: "Espresso", type: "complex", sku: "ESP", price: 90, costPrice: 20, unit: "cup",
      recipe: { outputQty: 1, ingredients: [{ productId: "beans", qty: 10 }] },
    });
    Store.addBatch({ id: "empty", productId: "beans", locationId: loc.id, qty: 0, unitCost: 2 });
    assert.equal(Store.tracksIngredientStock(owner), true);
    const result = Store.createPosSale(owner, loc.id, [{ productId: "cup", name: "Espresso", price: 90, qty: 1 }], "cash");
    assert.equal(result.success, false);
    assert.equal(Store.getPosSales(owner).length, 0);
    assert.equal(Store.getBatchById("empty").qty, 0);
  });

  test("tracked make-to-order deducts the ingredient lots", () => {
    const { Store } = loadStore();
    const owner = "co_tracked_ok";
    const loc = company(Store, owner);
    Store.addProduct({ id: "beans", ownerId: owner, name: "Beans", type: "raw", sku: "BNS", price: 0, costPrice: 2, unit: "g" });
    Store.addProduct({
      id: "cup", ownerId: owner, name: "Espresso", type: "complex", sku: "ESP", price: 90, costPrice: 20, unit: "cup",
      recipe: { outputQty: 1, ingredients: [{ productId: "beans", qty: 10 }] },
    });
    Store.addBatch({ id: "lot", productId: "beans", locationId: loc.id, qty: 25, unitCost: 2 });
    const result = Store.createPosSale(owner, loc.id, [{ productId: "cup", name: "Espresso", price: 90, qty: 2 }], "cash");
    assert.equal(result.success, true);
    assert.equal(Store.getBatchQty("beans", loc.id), 5);
    assert.equal(result.sale.items[0].costPrice, 20);
  });

  test("boot sync skips a second pull inside ten minutes and does not load the marketplace", async () => {
    const { Store, calls } = loadStore({
      listByOwner(c, id) {
        if (c === "products") return [{ id: "p1", ownerId: id, name: "Tea", type: "simple" }];
        return [];
      },
      listRecent() { return [{ id: "s1", ownerId: "co1", receiptNumber: "RCT-9", createdAt: new Date().toISOString(), items: [] }]; },
    });
    const user = { id: "u1", companyId: "co1", role: "owner" };
    const first = await Store.sync(user);
    assert.equal(first.skipped, false);
    assert.equal(Store.getProducts().some(p => p.ownerId === "co1"), true);
    const afterFirst = calls.length;
    const second = await Store.sync(user);
    assert.equal(second && second.skipped, true);
    assert.equal(calls.length, afterFirst);
    await Store.sync(user, { force: true });
    assert.ok(calls.length > afterFirst);
    assert.equal(calls.filter(c => c.op === "listWhere" && c.c === "products" && c.f === "isPublished").length, 0);
  });

  test("an empty sales window does not reset the receipt counter", async () => {
    const { Store, localStorage } = loadStore({
      listByOwner(c, id) {
        if (c === "products") return [{ id: "p1", ownerId: id, name: "Tea", type: "simple" }];
        return [];
      },
      listRecent() { return []; },
    });
    localStorage.setItem("ims_pos_seq", "9000");
    await Store.sync({ id: "u1", companyId: "co1", role: "owner" });
    assert.equal(localStorage.getItem("ims_pos_seq"), "9000");
  });

  test("marketplace sync is separate from boot and respects its own stamp", async () => {
    const { Store, calls } = loadStore({
      listWhere(c, f) {
        if (c === "products" && f === "isPublished") return [{ id: "pub1", ownerId: "other", name: "Sugar", type: "simple", isPublished: true }];
        return [];
      },
      list(c) { return c === "companies" ? [{ id: "other", name: "Other Co" }] : []; },
    });
    await Store.syncMarketplace();
    assert.equal(calls.filter(c => c.op === "listWhere" && c.f === "isPublished").length, 1);
    assert.equal(Store.getPublishedProducts("other").length, 1);
    const n = calls.length;
    await Store.syncMarketplace();
    assert.equal(calls.length, n);
  });

  test("reports can extend the POS window, and logout clears sync stamps", async () => {
    const { Store, calls, localStorage } = loadStore({
      listByOwner(c, id) {
        if (c === "products") return [{ id: "p1", ownerId: id, name: "Tea", type: "simple" }];
        return [];
      },
      listRecent() { return []; },
    });
    await Store.sync({ id: "u1", companyId: "co1", role: "owner" });
    const before = calls.filter(c => c.op === "listRecent").length;
    await Store.ensurePosSales("co1", 7);
    assert.equal(calls.filter(c => c.op === "listRecent").length, before);
    await Store.ensurePosSales("co1", 90);
    assert.ok(calls.filter(c => c.op === "listRecent").length > before);
    localStorage.setItem("ims_mkt_at", "1");
    Store._clearLocalData();
    assert.equal(localStorage.getItem("ims_sync_at_co1"), null);
    assert.equal(localStorage.getItem("ims_pos_days_co1"), null);
    assert.equal(localStorage.getItem("ims_mkt_at"), null);
    assert.equal(Store.getProducts().length, 0);
  });

  test("Khata credit increases what the customer owes and debit decreases it", () => {
    const { Store } = loadStore();
    Store.addKhataEntry({ ownerId: "co", partyId: "p", partyName: "Ramesh", type: "credit", amount: 80 });
    Store.addKhataEntry({ ownerId: "co", partyId: "p", partyName: "Ramesh", type: "debit", amount: 30 });
    assert.equal(Store.getKhataBalance("co", "p"), 50);
  });

  test("the cart stays with one seller at a time", () => {
    const { Store } = loadStore();
    assert.equal(Store.addToCart("seller-a", "p1", 1).success, true);
    const mixed = Store.addToCart("seller-b", "p2", 1);
    assert.equal(mixed.success, false);
    assert.equal(Store.getCart().sellerId, "seller-a");
    assert.equal(Store.getCartItemCount(), 1);
  });
});
