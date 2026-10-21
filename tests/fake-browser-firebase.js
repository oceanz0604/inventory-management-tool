// In-memory Firebase compat stand-in. The real firebase-config.js talks to this
// object, so the UI suite never opens a socket to inventory-management-oceanz.
(function () {
  const cols = new Map();

  function bucket(name) {
    if (!cols.has(name)) cols.set(name, new Map());
    return cols.get(name);
  }

  function put(collection, doc, merge) {
    if (!doc) return null;
    const id = doc.id || ('id_' + Math.random().toString(36).slice(2, 10));
    const prev = bucket(collection).get(id) || {};
    const next = merge ? Object.assign({}, prev, doc, { id: id }) : Object.assign({}, doc, { id: id });
    bucket(collection).set(id, next);
    return id;
  }

  function matches(doc, filters) {
    return filters.every(function (f) {
      const left = doc[f.field];
      if (f.op === '==') return left === f.value;
      if (f.op === '>=') return left != null && String(left) >= String(f.value);
      return false;
    });
  }

  function query(collection, filters) {
    const out = [];
    bucket(collection).forEach(function (doc) {
      if (matches(doc, filters)) out.push(Object.assign({}, doc));
    });
    return out;
  }

  function docRef(collection, id) {
    return {
      id: id,
      _col: collection,
      set: function (data, opts) {
        put(collection, Object.assign({ id: id }, data), opts && opts.merge);
        return Promise.resolve();
      },
      get: function () {
        const data = bucket(collection).get(id);
        return Promise.resolve({ exists: !!data, data: function () { return data ? Object.assign({}, data) : null; } });
      },
      delete: function () {
        bucket(collection).delete(id);
        return Promise.resolve();
      },
    };
  }

  function collectionRef(name) {
    return {
      doc: function (id) { return docRef(name, id || ('id_' + Math.random().toString(36).slice(2, 10))); },
      where: function (field, op, value) {
        const filters = [{ field: field, op: op, value: value }];
        const q = {
          _limit: 0,
          where: function (f, o, v) { filters.push({ field: f, op: o, value: v }); return q; },
          limit: function (n) { q._limit = n; return q; },
          get: function () {
            let docs = query(name, filters);
            if (q._limit) docs = docs.slice(0, q._limit);
            return Promise.resolve({
              empty: docs.length === 0,
              docs: docs.map(function (d) { return { id: d.id, data: function () { return d; } }; }),
            });
          },
        };
        return q;
      },
      get: function () {
        const docs = query(name, []);
        return Promise.resolve({ docs: docs.map(function (d) { return { id: d.id, data: function () { return d; } }; }) });
      },
    };
  }

  const apps = [];
  function makeAuth() {
    return {
      currentUser: null,
      signInWithEmailAndPassword: function () { return Promise.reject(new Error('email login is unused')); },
      createUserWithEmailAndPassword: function () {
        return Promise.resolve({ user: { uid: 'uid_' + Math.random().toString(36).slice(2, 10) } });
      },
      signOut: function () { return Promise.resolve(); },
      onAuthStateChanged: function (cb) { cb(null); return function () {}; },
    };
  }
  function makeApp(name) {
    return {
      name: name || '[DEFAULT]',
      delete: function () { return Promise.resolve(); },
      auth: makeAuth,
      firestore: function () { return db; },
    };
  }

  const db = {
    enablePersistence: function () { return Promise.resolve(); },
    collection: collectionRef,
    batch: function () {
      const ops = [];
      return {
        set: function (ref, data, opts) { ops.push(function () { put(ref._col, Object.assign({ id: ref.id }, data), opts && opts.merge); }); },
        delete: function (ref) { ops.push(function () { bucket(ref._col).delete(ref.id); }); },
        commit: function () { ops.forEach(function (fn) { fn(); }); return Promise.resolve(); },
      };
    },
  };

  window.firebase = {
    apps: apps,
    initializeApp: function (config, name) {
      const app = makeApp(name);
      apps.push(app);
      return app;
    },
    app: function (name) {
      const found = apps.filter(function (a) { return a.name === (name || '[DEFAULT]'); })[0];
      if (!found) throw new Error('app not found');
      return found;
    },
    auth: makeAuth,
    firestore: function () { return db; },
  };

  window.__fakeDb = {
    put: function (collection, doc) { return put(collection, doc, true); },
    all: function (collection) { return query(collection, []); },
  };
})();
