import { genId, getDoc, setDoc, listByOwner, listCollection, queryEquals } from "./firestore.js";

const CATALOG_TTL_MS = 45 * 1000;
const _catalogCache = new Map();

function _catalogKey(ownerId, locationId) {
  return String(ownerId || "") + "|" + String(locationId || "");
}

function dropCatalog(ownerId) {
  const prefix = String(ownerId || "") + "|";
  for (const key of _catalogCache.keys()) {
    if (key.startsWith(prefix)) _catalogCache.delete(key);
  }
}

function lotSort(a, b) {
  const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
  const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
  if (ax !== bx) return ax - bx;
  return new Date(a.purchaseDate || a.createdAt || 0) - new Date(b.purchaseDate || b.createdAt || 0);
}

function stockKey(productId, locationId) {
  return productId + "|" + locationId;
}

function liveLots(batches, productId, locationId) {
  return batches
    .filter((b) => b && b.productId === productId && b.locationId === locationId && (Number(b.qty) || 0) > 0)
    .sort(lotSort);
}

// Reserve quantity on the in-memory batch list. Returns null when short and
// leaves the list unchanged in that case.
function reserveLots(batches, productId, locationId, qty) {
  const lots = liveLots(batches, productId, locationId);
  let need = Number(qty) || 0;
  const picks = [];
  for (const lot of lots) {
    if (need <= 0) break;
    const have = Number(lot.qty) || 0;
    const take = Math.min(have, need);
    if (take <= 0) continue;
    lot.qty = have - take;
    picks.push({
      batchId: lot.id,
      qty: take,
      unitCost: Number(lot.unitCost) || 0,
      productId,
      locationId,
    });
    need -= take;
  }
  if (need > 0.0001) {
    for (const pk of picks) {
      const lot = batches.find((b) => b && b.id === pk.batchId);
      if (lot) lot.qty = (Number(lot.qty) || 0) + pk.qty;
    }
    return null;
  }
  return picks;
}

async function writeReserved(batches, picks) {
  const dirty = new Set((picks || []).map((pk) => pk.batchId));
  for (const batch of batches) {
    if (batch && dirty.has(batch.id)) await setDoc("batches", batch.id, batch);
  }
}

async function writeStockTotals(batches, stockRows, touched, ownerId) {
  const stockByKey = {};
  for (const row of stockRows || []) {
    if (row) stockByKey[stockKey(row.productId, row.locationId)] = row;
  }
  const seen = new Set();
  for (const t of touched || []) {
    const key = stockKey(t.productId, t.locationId);
    if (seen.has(key)) continue;
    seen.add(key);
    const qty = batches
      .filter((b) => b && b.productId === t.productId && b.locationId === t.locationId)
      .reduce((sum, b) => sum + Math.max(0, Number(b.qty) || 0), 0);
    const rec = stockByKey[key];
    const id = (rec && rec.id) || genId("stk_");
    await setDoc("stock", id, {
      id,
      ownerId,
      productId: t.productId,
      locationId: t.locationId,
      quantity: qty,
      minStock: rec && rec.minStock != null ? rec.minStock : 0,
    });
  }
}

async function companyTracksIngredients(ownerId) {
  const company = await getDoc("companies", ownerId);
  if (!company || company.trackIngredientStock == null) return true;
  return company.trackIngredientStock !== false;
}

function latestUnitCost(productId, batches, fallback) {
  const mine = (batches || [])
    .filter((b) => b && b.productId === productId)
    .sort((a, b) => new Date(b.createdAt || b.purchaseDate || 0) - new Date(a.createdAt || a.purchaseDate || 0));
  if (mine.length) return Number(mine[0].unitCost) || 0;
  return Number(fallback) || 0;
}

function recipeLineQty(ing) {
  const q = Number(ing && ing.qty) || 0;
  const waste = Math.max(0, Number(ing && ing.wastagePct) || 0);
  return q * (1 + waste / 100);
}

function theoreticalMakingCost(product, ownerId, qty, batches, productsById) {
  const recipe = product.recipe || { outputQty: 1, ingredients: [] };
  const scale = (Number(qty) || 0) / Math.max(1, Number(recipe.outputQty) || 1);
  let cost = 0;
  for (const ing of recipe.ingredients || []) {
    const ip = productsById[ing.productId];
    const rate = latestUnitCost(ing.productId, batches, ip ? ip.costPrice : 0);
    cost += rate * recipeLineQty(ing) * scale;
  }
  return cost;
}

function consumeSaleQty(product, locationId, ownerId, qty, ctx) {
  const recipe = product.recipe;
  const mto = (product.type || "simple") === "complex" && recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length;
  if (mto && ctx && ctx.trackIngredients === false) {
    const costTotal = theoreticalMakingCost(product, ownerId, qty, ctx.batches, ctx.productsById);
    return { picks: [], costTotal };
  }
  if (mto) {
    const scale = qty / Math.max(1, Number(recipe.outputQty) || 1);
    const picks = [];
    for (const ing of recipe.ingredients) {
      const need = (Number(ing.qty) || 0) * scale;
      if (need <= 0) continue;
      const lotPicks = reserveLots(ctx.batches, ing.productId, locationId, need);
      if (!lotPicks) {
        throw Object.assign(
          new Error(`Insufficient stock for ${product.name} (need ${need} of an ingredient)`),
          { status: 409 }
        );
      }
      picks.push(...lotPicks);
    }
    const costTotal = picks.reduce((sum, pk) => sum + pk.qty * pk.unitCost, 0);
    return { picks, costTotal };
  }
  const picks = reserveLots(ctx.batches, product.id, locationId, qty);
  if (!picks) {
    throw Object.assign(new Error(`Insufficient stock for ${product.name} (need ${qty})`), { status: 409 });
  }
  const costTotal = picks.reduce((sum, pk) => sum + pk.qty * pk.unitCost, 0);
  return { picks, costTotal };
}

async function restoreLots(consumedLots, ownerId) {
  const stock = await listByOwner("stock", ownerId);
  const stockByKey = {};
  for (const row of stock) {
    if (row) stockByKey[stockKey(row.productId, row.locationId)] = row;
  }
  const deltas = {};
  for (const pk of consumedLots || []) {
    const batch = await getDoc("batches", pk.batchId);
    if (!batch) continue;
    const add = Number(pk.qty) || 0;
    await setDoc("batches", batch.id, { ...batch, qty: (Number(batch.qty) || 0) + add });
    const key = stockKey(batch.productId, batch.locationId);
    deltas[key] = deltas[key] || { productId: batch.productId, locationId: batch.locationId, delta: 0 };
    deltas[key].delta += add;
  }
  for (const d of Object.values(deltas)) {
    const rec = stockByKey[stockKey(d.productId, d.locationId)];
    const id = (rec && rec.id) || genId("stk_");
    const quantity = Math.max(0, (rec && Number(rec.quantity) || 0) + d.delta);
    await setDoc("stock", id, {
      id,
      ownerId,
      productId: d.productId,
      locationId: d.locationId,
      quantity,
      minStock: rec && rec.minStock != null ? rec.minStock : 0,
    });
  }
}

function nextReceipt() {
  return `RCT-${Date.now().toString(36).toUpperCase()}`;
}

export function slugifyCategory(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "uncategorized";
}

async function findSaleByExternalId(ownerId, externalId) {
  const rows = await queryEquals("pos_sales", "externalId", externalId);
  return rows.find((s) => s && s.ownerId === ownerId) || null;
}

export async function listProducts({ ownerId, locationId }) {
  const cacheKey = _catalogKey(ownerId, locationId);
  const hit = _catalogCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.data;
  const [productDocs, categoryDocs, stock, batches] = await Promise.all([
    listByOwner("products", ownerId),
    listCollection("categories"),
    listByOwner("stock", ownerId),
    listByOwner("batches", ownerId),
  ]);
  const catById = Object.fromEntries(categoryDocs.map((c) => [c.id, c]));
  const stockMap = {};
  stock.filter((s) => !locationId || s.locationId === locationId)
    .forEach((s) => { stockMap[s.productId] = (stockMap[s.productId] || 0) + (Number(s.quantity) || 0); });
  const batchQty = {};
  batches.filter((b) => b && (!locationId || b.locationId === locationId) && (b.qty || 0) > 0)
    .forEach((b) => { batchQty[b.productId] = (batchQty[b.productId] || 0) + (Number(b.qty) || 0); });

  const trackIngredients = await companyTracksIngredients(ownerId);
  const productsById = Object.fromEntries(productDocs.map((p) => [p.id, p]));

  function makeableQty(p) {
    const recipe = p.recipe;
    const mto = (p.type || "simple") === "complex" && recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length;
    if (mto && !trackIngredients) return 9999;
    if (!mto) {
      return stockMap[p.id] ?? 0;
    }
    const out = Math.max(1, Number(recipe.outputQty) || 1);
    let max = Infinity;
    recipe.ingredients.forEach((ing) => {
      const per = Number(ing.qty) || 0;
      if (per <= 0) return;
      const have = batchQty[ing.productId] || 0;
      max = Math.min(max, Math.floor((have / per) * out + 1e-9));
    });
    return max === Infinity ? 0 : Math.max(0, max);
  }

  const productsOut = productDocs
    .filter((p) => {
      const type = p.type || "simple";
      return type === "simple" || type === "complex";
    })
    .filter((p) => p.available !== false)
    .map((p) => {
      const cat = catById[p.categoryId] || {};
      const categoryName = String(cat.name || "").trim() || "Uncategorized";
      const mto = (p.type || "simple") === "complex" && p.recipe && Array.isArray(p.recipe.ingredients) && p.recipe.ingredients.length;
      let costPrice = Number(p.costPrice) || 0;
      if (mto && !trackIngredients) {
        costPrice = Math.round(theoreticalMakingCost(p, ownerId, 1, batches, productsById) * 100) / 100;
      }
      return {
        id: p.id,
        name: p.name,
        sku: p.sku || "",
        price: Number(p.price) || 0,
        costPrice,
        gstRate: Number(p.gstRate) || 0,
        unit: p.unit || "pcs",
        categoryId: p.categoryId || "",
        category: slugifyCategory(categoryName),
        categoryName,
        stock: makeableQty(p),
        ingredientStockTracked: !(mto && !trackIngredients),
        makeToOrder: !!mto,
        cafeExternalId: p.cafeExternalId || null,
        type: p.type || "simple",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const catMap = new Map();
  for (const p of productsOut) {
    const id = p.categoryId || p.category;
    if (!catMap.has(id)) {
      catMap.set(id, {
        id: p.categoryId || p.category,
        name: p.categoryName,
        slug: p.category,
        count: 0,
      });
    }
    catMap.get(id).count += 1;
  }
  const categories = [...catMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const data = { products: productsOut, categories };
  _catalogCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export async function createSale(payload) {
  const ownerId = payload.ownerId || process.env.ZENTORY_DEFAULT_OWNER_ID;
  const locationId = payload.locationId || process.env.ZENTORY_DEFAULT_LOCATION_ID;
  const externalId = String(payload.externalId || "").trim();
  const channel = String(payload.channel || "oceanz_cafe");
  const itemsIn = Array.isArray(payload.items) ? payload.items : [];

  if (!ownerId) throw Object.assign(new Error("ownerId is required"), { status: 400 });
  if (!locationId) throw Object.assign(new Error("locationId is required"), { status: 400 });
  if (!itemsIn.length) throw Object.assign(new Error("items are required"), { status: 400 });
  if (!externalId) throw Object.assign(new Error("externalId is required"), { status: 400 });

  const existing = await findSaleByExternalId(ownerId, externalId);
  if (existing && !existing.voided) return { sale: existing, idempotent: true };

  const [products, batches, stockRows] = await Promise.all([
    listByOwner("products", ownerId),
    listByOwner("batches", ownerId),
    listByOwner("stock", ownerId),
  ]);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const trackIngredients = await companyTracksIngredients(ownerId);
  const saleCtx = { trackIngredients, batches, productsById: byId };
  const lineItems = [];
  const allConsumed = [];

  for (const raw of itemsIn) {
    const productId = raw.productId || raw.id;
    const qty = Number(raw.qty) || 0;
    if (!productId || qty <= 0) throw Object.assign(new Error("Each item needs productId and qty > 0"), { status: 400 });
    const product = byId[productId];
    if (!product) throw Object.assign(new Error(`Unknown productId: ${productId}`), { status: 400 });
    const price = raw.unitPrice != null ? Number(raw.unitPrice) : Number(product.price) || 0;
    const { picks, costTotal } = consumeSaleQty(product, locationId, ownerId, qty, saleCtx);
    allConsumed.push(...picks);
    lineItems.push({
      productId,
      name: product.name,
      sku: product.sku || "",
      price,
      costPrice: costTotal / Math.max(1, qty),
      gstRate: Number(product.gstRate) || 0,
      qty,
      cafeExternalId: product.cafeExternalId || raw.cafeExternalId || null,
    });
  }

  let paymentMethod = String(payload.paymentMethod || "cash").toLowerCase();
  if (!["cash", "upi", "card"].includes(paymentMethod)) paymentMethod = "cash";

  const subtotal = lineItems.reduce((s, i) => s + i.qty * i.price, 0);
  const taxAmount = lineItems.reduce((s, i) => s + i.qty * i.price * ((i.gstRate || 0) / 100), 0);
  const sale = {
    id: genId("sale_"),
    receiptNumber: nextReceipt(),
    ownerId,
    locationId,
    items: lineItems,
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
    paymentMethod,
    customerName: payload.customerName || "Walk-in",
    channel,
    externalId,
    staff: payload.staff || null,
    note: payload.note || "",
    consumedLots: allConsumed,
    voided: false,
    createdAt: new Date().toISOString(),
  };
  await writeReserved(batches, allConsumed);
  await writeStockTotals(batches, stockRows, allConsumed, ownerId);
  await setDoc("pos_sales", sale.id, sale, false);
  dropCatalog(ownerId);
  return { sale, idempotent: false };
}

export async function voidSale({ externalId, ownerId }) {
  const ext = String(externalId || "").trim();
  if (!ext) throw Object.assign(new Error("externalId is required"), { status: 400 });
  const oid = ownerId || process.env.ZENTORY_DEFAULT_OWNER_ID;
  if (!oid) throw Object.assign(new Error("ownerId is required"), { status: 400 });
  const sale = await findSaleByExternalId(oid, ext);
  if (!sale) throw Object.assign(new Error("Sale not found for externalId"), { status: 404 });
  if (sale.voided) return { sale, alreadyVoided: true };
  await restoreLots(sale.consumedLots || [], sale.ownerId);
  const patched = { ...sale, voided: true, voidedAt: new Date().toISOString() };
  await setDoc("pos_sales", sale.id, patched);
  dropCatalog(sale.ownerId);
  return { sale: patched, alreadyVoided: false };
}
