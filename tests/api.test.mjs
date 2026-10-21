import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { installFakeFirestore } from "./fake-firestore.mjs";
import { getDoc, setDoc } from "../api/_lib/firestore.js";
import health from "../api/health.js";
import productsHandler from "../api/products.js";
import salesHandler from "../api/sales.js";
import voidHandler from "../api/sales/void.js";

const KEY = "oz_zentory_7f3a9c2e1b8d4e6a90f2c5d8e1a4b7c3";
const fake = installFakeFirestore();
let seq = 0;

function nextOwner() {
  seq += 1;
  return { ownerId: `own_${seq}`, locationId: `loc_${seq}` };
}

function mockReq({ method = "GET", url = "/", headers = {}, body } = {}) {
  const normalized = {};
  for (const [k, v] of Object.entries(headers)) normalized[k.toLowerCase()] = v;
  const listeners = {};
  let emitted = false;
  const req = {
    method,
    url,
    headers: normalized,
    on(ev, fn) {
      listeners[ev] = fn;
      if (!emitted && listeners.data && listeners.end) {
        emitted = true;
        const raw = body == null ? "" : (typeof body === "string" ? body : JSON.stringify(body));
        if (raw) listeners.data(Buffer.from(raw));
        listeners.end();
      }
      return req;
    },
  };
  return req;
}

function mockRes() {
  return {
    statusCode: 0,
    _headers: {},
    body: undefined,
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    end(payload) {
      this.raw = payload;
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
}

async function call(handler, opts) {
  const res = mockRes();
  await handler(mockReq(opts), res);
  return res;
}

function authHeaders(extra = {}) {
  return { "x-zentory-key": KEY, ...extra };
}

async function seedSimple({ ownerId, locationId, qty = 5, price = 100, gstRate = 0, expiryDate = null, unitCost = 40, categoryName = null }) {
  const productId = `prd_${ownerId}`;
  const batchId = `bat_${ownerId}`;
  await setDoc("products", productId, {
    id: productId, ownerId, name: "Masala Chai", type: "simple", sku: "CHAI",
    price, costPrice: unitCost, gstRate, unit: "cup", categoryId: categoryName ? `cat_${ownerId}` : "",
    available: true,
  });
  if (categoryName) {
    await setDoc("categories", `cat_${ownerId}`, { id: `cat_${ownerId}`, name: categoryName });
  }
  await setDoc("batches", batchId, {
    id: batchId, ownerId, productId, locationId, qty, unitCost,
    expiryDate, createdAt: "2026-01-01T00:00:00.000Z", purchaseDate: "2026-01-01T00:00:00.000Z",
  });
  await setDoc("stock", `stk_${ownerId}`, {
    id: `stk_${ownerId}`, ownerId, productId, locationId, quantity: qty, minStock: 0,
  });
  return { productId, batchId };
}

describe("Zentory HTTP API", { concurrency: false }, () => {
  before(() => {
    delete process.env.ZENTORY_DEFAULT_OWNER_ID;
    delete process.env.ZENTORY_DEFAULT_LOCATION_ID;
  });

  beforeEach(() => {
    fake.reset();
  });

  test("GET /api/health is public", async () => {
    const res = await call(health, { method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, "zentory-api");
  });

  test("OPTIONS is a CORS preflight with no API key", async () => {
    const res = await call(salesHandler, { method: "OPTIONS", url: "/api/sales", headers: { origin: "http://localhost:3000" } });
    assert.equal(res.statusCode, 204);
    assert.equal(res._headers["access-control-allow-origin"], "http://localhost:3000");
  });

  test("products and sales reject a missing or wrong key", async () => {
    const missing = await call(productsHandler, { method: "GET", url: "/api/products?ownerId=x" });
    assert.equal(missing.statusCode, 401);
    const wrong = await call(salesHandler, {
      method: "POST", url: "/api/sales",
      headers: { authorization: "Bearer nope" },
      body: {},
    });
    assert.equal(wrong.statusCode, 401);
  });

  test("X-Zentory-Key and Authorization Bearer both authorize", async () => {
    const { ownerId, locationId } = nextOwner();
    await seedSimple({ ownerId, locationId });
    fake.zero();
    const byHeader = await call(productsHandler, {
      method: "GET",
      url: `/api/products?ownerId=${ownerId}&locationId=${locationId}`,
      headers: authHeaders(),
    });
    assert.equal(byHeader.statusCode, 200);
    assert.equal(byHeader.body.count, 1);
    const byBearer = await call(productsHandler, {
      method: "GET",
      url: `/api/products?ownerId=${ownerId}&locationId=${locationId}`,
      headers: { authorization: `Bearer ${KEY}` },
    });
    assert.equal(byBearer.statusCode, 200);
    assert.equal(byBearer._headers["cache-control"], "private, max-age=30");
  });

  test("GET /api/sales is not a sales route", async () => {
    const res = await call(salesHandler, { method: "GET", url: "/api/sales", headers: authHeaders() });
    assert.equal(res.statusCode, 405);
  });

  test("a sale requires owner, location, items, and externalId", async () => {
    const { ownerId, locationId } = nextOwner();
    const cases = [
      { locationId, items: [{ productId: "p", qty: 1 }], externalId: "e1" },
      { ownerId, items: [{ productId: "p", qty: 1 }], externalId: "e1" },
      { ownerId, locationId, items: [], externalId: "e1" },
      { ownerId, locationId, items: [{ productId: "p", qty: 1 }] },
    ];
    for (const body of cases) {
      const res = await call(salesHandler, { method: "POST", url: "/api/sales", headers: authHeaders(), body });
      assert.equal(res.statusCode, 400, JSON.stringify(body));
    }
  });

  test("qty of zero and an unknown product are rejected before any write", async () => {
    const { ownerId, locationId } = nextOwner();
    const { productId, batchId } = await seedSimple({ ownerId, locationId, qty: 4 });
    fake.zero();
    const zero = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "z1", items: [{ productId, qty: 0 }] },
    });
    assert.equal(zero.statusCode, 400);
    const unknown = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "z2", items: [{ productId: "missing", qty: 1 }] },
    });
    assert.equal(unknown.statusCode, 400);
    assert.equal(fake.stats.writes, 0);
    assert.equal((await getDoc("batches", batchId)).qty, 4);
  });

  test("invalid JSON currently returns 500", async () => {
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(), body: "{",
    });
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /Invalid JSON/);
  });

  test("a simple sale takes the earliest-expiry lot, adds GST, and ignores another company's batches", async () => {
    const { ownerId, locationId } = nextOwner();
    const productId = `prd_${ownerId}`;
    await setDoc("products", productId, {
      id: productId, ownerId, name: "Filter Coffee", type: "simple", sku: "COF",
      price: 100, costPrice: 30, gstRate: 18, unit: "cup", available: true,
    });
    await setDoc("batches", "early", {
      id: "early", ownerId, productId, locationId, qty: 3, unitCost: 20,
      expiryDate: "2026-11-01", createdAt: "2026-08-01T00:00:00.000Z",
    });
    await setDoc("batches", "late", {
      id: "late", ownerId, productId, locationId, qty: 5, unitCost: 50,
      expiryDate: "2027-06-01", createdAt: "2026-01-01T00:00:00.000Z",
    });
    const other = `other_${ownerId}`;
    for (let i = 0; i < 50; i++) {
      await setDoc("batches", `noise_${i}`, {
        id: `noise_${i}`, ownerId: other, productId: `op_${i}`, locationId: "elsewhere",
        qty: 9, unitCost: 1, createdAt: "2026-01-01T00:00:00.000Z",
      });
    }
    fake.zero();
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: {
        ownerId, locationId, externalId: "cafe-100", paymentMethod: "wallet",
        items: [{ productId, qty: 4 }],
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.idempotent, false);
    assert.equal(res.body.total, 472);
    assert.equal(res.body.sale.paymentMethod, "cash");
    assert.equal(res.body.sale.taxAmount, 72);
    // empty externalId lookup (1) + 1 product + 2 own batches + empty stock (1) + company (1) = 6.
    // The 50 foreign batches must not be part of that read.
    assert.equal(fake.stats.reads, 6);
    assert.equal(fake.stats.writes, 4);
    assert.equal((await getDoc("batches", "early")).qty, 0);
    assert.equal((await getDoc("batches", "late")).qty, 4);
    assert.equal((await getDoc("batches", "noise_0")).qty, 9);
  });

  test("repeating externalId is idempotent and does not move quantity", async () => {
    const { ownerId, locationId } = nextOwner();
    const { productId, batchId } = await seedSimple({ ownerId, locationId, qty: 8, price: 50 });
    const body = { ownerId, locationId, externalId: "ext-same", items: [{ productId, qty: 2 }] };
    const first = await call(salesHandler, { method: "POST", url: "/api/sales", headers: authHeaders(), body });
    assert.equal(first.statusCode, 201);
    const qtyAfter = (await getDoc("batches", batchId)).qty;
    assert.equal(qtyAfter, 6);
    fake.zero();
    const second = await call(salesHandler, { method: "POST", url: "/api/sales", headers: authHeaders(), body });
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.idempotent, true);
    assert.equal(second.body.saleId, first.body.saleId);
    assert.equal(fake.stats.reads, 1);
    assert.equal(fake.stats.writes, 0);
    assert.equal((await getDoc("batches", batchId)).qty, qtyAfter);
  });

  test("overselling across two lines returns 409 and leaves quantity unchanged", async () => {
    const { ownerId, locationId } = nextOwner();
    const { productId, batchId } = await seedSimple({ ownerId, locationId, qty: 6 });
    fake.zero();
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: {
        ownerId, locationId, externalId: "over-1",
        items: [{ productId, qty: 5 }, { productId, qty: 5 }],
      },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(fake.stats.writes, 0);
    assert.equal((await getDoc("batches", batchId)).qty, 6);
  });

  test("tracked make-to-order is blocked when ingredients are short", async () => {
    const { ownerId, locationId } = nextOwner();
    const beans = `beans_${ownerId}`;
    const cup = `cup_${ownerId}`;
    await setDoc("products", beans, {
      id: beans, ownerId, name: "Beans", type: "raw", price: 0, costPrice: 2, unit: "g", available: true,
    });
    await setDoc("products", cup, {
      id: cup, ownerId, name: "Espresso", type: "complex", price: 80, gstRate: 5, unit: "cup", available: true,
      recipe: { outputQty: 1, ingredients: [{ productId: beans, qty: 18 }] },
    });
    await setDoc("batches", `b_${beans}`, {
      id: `b_${beans}`, ownerId, productId: beans, locationId, qty: 0, unitCost: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc("companies", ownerId, { id: ownerId, name: "Cafe", trackIngredientStock: true });
    fake.zero();
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "mto-short", items: [{ productId: cup, qty: 1 }] },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(fake.stats.writes, 0);
    assert.equal((await getDoc("batches", `b_${beans}`)).qty, 0);
  });

  test("untracked make-to-order sells, keeps ingredient quantity, and costs the latest batch", async () => {
    const { ownerId, locationId } = nextOwner();
    const beans = `beans_${ownerId}`;
    const cup = `cup_${ownerId}`;
    await setDoc("products", beans, {
      id: beans, ownerId, name: "Beans", type: "raw", price: 0, costPrice: 1, unit: "g", available: true,
    });
    await setDoc("products", cup, {
      id: cup, ownerId, name: "Espresso", type: "complex", price: 80, gstRate: 0, unit: "cup", available: true,
      recipe: { outputQty: 1, ingredients: [{ productId: beans, qty: 10 }] },
    });
    await setDoc("batches", "old", {
      id: "old", ownerId, productId: beans, locationId, qty: 4, unitCost: 1,
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    await setDoc("batches", "newer-empty", {
      id: "newer-empty", ownerId, productId: beans, locationId, qty: 0, unitCost: 2.5,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    await setDoc("companies", ownerId, { id: ownerId, name: "Cafe", trackIngredientStock: false });
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "mto-open", items: [{ productId: cup, qty: 2 }] },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.sale.items[0].costPrice, 25);
    assert.equal((await getDoc("batches", "old")).qty, 4);
    assert.equal((await getDoc("batches", "newer-empty")).qty, 0);
    assert.deepEqual(res.body.sale.consumedLots, []);
  });

  test("void restores lot quantity and a second void is a no-op", async () => {
    const { ownerId, locationId } = nextOwner();
    const { productId, batchId } = await seedSimple({ ownerId, locationId, qty: 5 });
    const externalId = "void-me";
    const created = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId, items: [{ productId, qty: 2 }] },
    });
    assert.equal(created.statusCode, 201);
    assert.equal((await getDoc("batches", batchId)).qty, 3);
    const voided = await call(voidHandler, {
      method: "POST", url: "/api/sales/void", headers: authHeaders(),
      body: { ownerId, externalId },
    });
    assert.equal(voided.statusCode, 200);
    assert.equal(voided.body.alreadyVoided, false);
    assert.equal((await getDoc("batches", batchId)).qty, 5);
    const stockDocs = await getDoc("stock", `stk_${ownerId}`);
    assert.equal(stockDocs.quantity, 5);
    const again = await call(voidHandler, {
      method: "POST", url: "/api/sales/void", headers: authHeaders(),
      body: { ownerId, externalId },
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.body.alreadyVoided, true);
    assert.equal((await getDoc("batches", batchId)).qty, 5);
  });

  test("void of an unknown externalId is 404", async () => {
    const { ownerId } = nextOwner();
    const res = await call(voidHandler, {
      method: "POST", url: "/api/sales/void", headers: authHeaders(),
      body: { ownerId, externalId: "missing-sale" },
    });
    assert.equal(res.statusCode, 404);
  });

  test("make-to-order wastage is consumed and the catalog stock uses it", async () => {
    const { ownerId, locationId } = nextOwner();
    const milk = `milk_${ownerId}`;
    const cup = `cup_${ownerId}`;
    await setDoc("products", milk, {
      id: milk, ownerId, name: "Milk", type: "raw", price: 0, costPrice: 0.1, unit: "ml", available: true,
    });
    await setDoc("products", cup, {
      id: cup, ownerId, name: "Chai", type: "complex", price: 40, gstRate: 0, unit: "cup", available: true,
      recipe: { outputQty: 1, ingredients: [{ productId: milk, qty: 50, wastagePct: 10 }] },
    });
    await setDoc("batches", `b_${milk}`, {
      id: `b_${milk}`, ownerId, productId: milk, locationId, qty: 100, unitCost: 0.1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc("stock", `stk_${milk}`, {
      id: `stk_${milk}`, ownerId, productId: milk, locationId, quantity: 100, minStock: 0,
    });
    await setDoc("companies", ownerId, { id: ownerId, name: "Cafe", trackIngredientStock: true });
    const catalog = await call(productsHandler, {
      method: "GET",
      url: `/api/products?ownerId=${ownerId}&locationId=${locationId}`,
      headers: authHeaders(),
    });
    const row = catalog.body.products.find((p) => p.id === cup);
    assert.equal(row.stock, 1);
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "waste-1", items: [{ productId: cup, qty: 1 }] },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.sale.items[0].costPrice, 5.5);
    assert.equal((await getDoc("batches", `b_${milk}`)).qty, 45);
  });

  test("a finished batch is sold before ingredients", async () => {
    const { ownerId, locationId } = nextOwner();
    const beans = `beans_${ownerId}`;
    const cup = `cup_${ownerId}`;
    const finishedId = `fin_${ownerId}`;
    await setDoc("products", beans, {
      id: beans, ownerId, name: "Beans", type: "raw", price: 0, costPrice: 2, unit: "g", available: true,
    });
    await setDoc("products", cup, {
      id: cup, ownerId, name: "Espresso", type: "complex", price: 80, gstRate: 0, unit: "cup", available: true,
      recipe: { outputQty: 1, ingredients: [{ productId: beans, qty: 10 }] },
    });
    await setDoc("batches", `b_${beans}`, {
      id: `b_${beans}`, ownerId, productId: beans, locationId, qty: 40, unitCost: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc("batches", finishedId, {
      id: finishedId, ownerId, productId: cup, locationId, qty: 1, unitCost: 15,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    await setDoc("companies", ownerId, { id: ownerId, name: "Cafe", trackIngredientStock: true });
    const first = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "ready-1", items: [{ productId: cup, qty: 1 }] },
    });
    assert.equal(first.statusCode, 201);
    assert.equal(first.body.sale.items[0].costPrice, 15);
    assert.equal((await getDoc("batches", finishedId)).qty, 0);
    assert.equal((await getDoc("batches", `b_${beans}`)).qty, 40);
    const second = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "ready-2", items: [{ productId: cup, qty: 1 }] },
    });
    assert.equal(second.statusCode, 201);
    assert.equal(second.body.sale.items[0].costPrice, 20);
    assert.equal((await getDoc("batches", `b_${beans}`)).qty, 30);
  });

  test("a short remainder after a finished cup rolls back and writes nothing", async () => {
    const { ownerId, locationId } = nextOwner();
    const beans = `beans_${ownerId}`;
    const cup = `cup_${ownerId}`;
    const finishedId = `fin_${ownerId}`;
    await setDoc("products", beans, {
      id: beans, ownerId, name: "Beans", type: "raw", price: 0, costPrice: 2, unit: "g", available: true,
    });
    await setDoc("products", cup, {
      id: cup, ownerId, name: "Espresso", type: "complex", price: 80, unit: "cup", available: true,
      recipe: { outputQty: 1, ingredients: [{ productId: beans, qty: 10 }] },
    });
    await setDoc("batches", `b_${beans}`, {
      id: `b_${beans}`, ownerId, productId: beans, locationId, qty: 0, unitCost: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc("batches", finishedId, {
      id: finishedId, ownerId, productId: cup, locationId, qty: 1, unitCost: 15,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    await setDoc("companies", ownerId, { id: ownerId, name: "Cafe", trackIngredientStock: true });
    fake.zero();
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: { ownerId, locationId, externalId: "ready-short", items: [{ productId: cup, qty: 2 }] },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(fake.stats.writes, 0);
    assert.equal((await getDoc("batches", finishedId)).qty, 1);
    assert.equal((await getDoc("batches", `b_${beans}`)).qty, 0);
  });

  test("a raw line and a recipe that share an ingredient are refused together", async () => {
    const { ownerId, locationId } = nextOwner();
    const beans = `beans_${ownerId}`;
    const cup = `cup_${ownerId}`;
    await setDoc("products", beans, {
      id: beans, ownerId, name: "Beans", type: "simple", price: 2, costPrice: 2, unit: "g", available: true,
    });
    await setDoc("products", cup, {
      id: cup, ownerId, name: "Espresso", type: "complex", price: 80, unit: "cup", available: true,
      recipe: { outputQty: 1, ingredients: [{ productId: beans, qty: 8 }] },
    });
    await setDoc("batches", `b_${beans}`, {
      id: `b_${beans}`, ownerId, productId: beans, locationId, qty: 10, unitCost: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await setDoc("companies", ownerId, { id: ownerId, name: "Cafe", trackIngredientStock: true });
    fake.zero();
    const res = await call(salesHandler, {
      method: "POST", url: "/api/sales", headers: authHeaders(),
      body: {
        ownerId, locationId, externalId: "share-1",
        items: [{ productId: beans, qty: 8 }, { productId: cup, qty: 1 }],
      },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(fake.stats.writes, 0);
    assert.equal((await getDoc("batches", `b_${beans}`)).qty, 10);
  });

  test("the product catalog is cached for the second read", async () => {
    const { ownerId, locationId } = nextOwner();
    await seedSimple({ ownerId, locationId, categoryName: "Beverages" });
    fake.zero();
    const first = await call(productsHandler, {
      method: "GET",
      url: `/api/products?ownerId=${ownerId}&locationId=${locationId}`,
      headers: authHeaders(),
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.products[0].stock, 5);
    assert.equal(first.body.categories[0].name, "Beverages");
    const reads = fake.stats.reads;
    assert.ok(reads > 0);
    const second = await call(productsHandler, {
      method: "GET",
      url: `/api/products?ownerId=${ownerId}&locationId=${locationId}`,
      headers: authHeaders(),
    });
    assert.equal(second.statusCode, 200);
    assert.equal(fake.stats.reads, reads);
  });
});
