// In-memory stand-in for the Firestore REST calls in api/_lib/firestore.js.
// Documents are stored in the same encoded field shape the real client writes,
// so decodeDoc in production code is what the tests read back.
//
// Read counting matches Spark billing closely enough to catch full-collection
// scans: a document read counts as one, and an empty query still counts as one.
// Nothing here talks to inventory-management-oceanz.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "inventory-management-oceanz";
const DOCS_MARK = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function emptyStats() {
  return { reads: 0, writes: 0 };
}

export function installFakeFirestore() {
  const collections = new Map();
  const stats = emptyStats();
  const original = globalThis.fetch;

  function bucket(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  function noteReads(n) {
    stats.reads += Math.max(1, n);
  }

  function docName(collection, id) {
    return `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;
  }

  function parseTarget(url) {
    const u = new URL(url);
    const idx = u.pathname.indexOf(DOCS_MARK);
    if (idx < 0) return null;
    const rest = u.pathname.slice(idx + DOCS_MARK.length);
    if (rest === ":runQuery") return { kind: "query", search: u.searchParams };
    const trimmed = rest.replace(/^\//, "");
    const parts = trimmed.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length === 1) return { kind: "collection", collection: parts[0], search: u.searchParams };
    return { kind: "doc", collection: parts[0], id: parts[1], search: u.searchParams };
  }

  function valuesEqual(stored, queryValue) {
    return JSON.stringify(stored) === JSON.stringify(queryValue);
  }

  async function fakeFetch(url, options = {}) {
    const target = parseTarget(String(url));
    if (!target) {
      return new Response(JSON.stringify({ error: { message: "Unknown Firestore URL", status: "INVALID_ARGUMENT" } }), { status: 400 });
    }
    const method = String(options.method || "GET").toUpperCase();

    if (target.kind === "query") {
      const body = options.body ? JSON.parse(options.body) : {};
      const q = body.structuredQuery || {};
      const collection = q.from && q.from[0] && q.from[0].collectionId;
      const filter = q.where && q.where.fieldFilter;
      const field = filter && filter.field && filter.field.fieldPath;
      const rows = [];
      if (collection && field && filter.op === "EQUAL") {
        for (const doc of bucket(collection).values()) {
          if (valuesEqual(doc.fields && doc.fields[field], filter.value)) rows.push({ document: doc });
        }
      }
      noteReads(rows.length);
      if (!rows.length) rows.push({ readTime: new Date().toISOString() });
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (target.kind === "collection") {
      const docs = [...bucket(target.collection).values()];
      noteReads(docs.length);
      return new Response(JSON.stringify({ documents: docs }), { status: 200 });
    }

    const col = bucket(target.collection);
    if (method === "GET") {
      noteReads(1);
      const doc = col.get(target.id);
      if (!doc) {
        return new Response(JSON.stringify({ error: { message: "Missing document", status: "NOT_FOUND" } }), { status: 404 });
      }
      return new Response(JSON.stringify(doc), { status: 200 });
    }

    if (method === "PATCH") {
      stats.writes += 1;
      const body = options.body ? JSON.parse(options.body) : {};
      const incoming = body.fields || {};
      const mask = target.search.getAll("updateMask.fieldPaths");
      let fields;
      if (mask.length) {
        const prev = col.get(target.id);
        fields = { ...((prev && prev.fields) || {}) };
        for (const key of mask) {
          if (incoming[key] !== undefined) fields[key] = incoming[key];
        }
      } else {
        fields = incoming;
      }
      const doc = { name: docName(target.collection, target.id), fields };
      col.set(target.id, doc);
      return new Response(JSON.stringify(doc), { status: 200 });
    }

    return new Response(JSON.stringify({ error: { message: "Unsupported method", status: "UNIMPLEMENTED" } }), { status: 400 });
  }

  globalThis.fetch = fakeFetch;

  return {
    stats,
    reset() {
      collections.clear();
      stats.reads = 0;
      stats.writes = 0;
    },
    zero() {
      stats.reads = 0;
      stats.writes = 0;
    },
    uninstall() {
      globalThis.fetch = original;
    },
  };
}
