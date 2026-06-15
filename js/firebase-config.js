/* ============================================================
   Firebase backend configuration for झटपट (ZatPat) IMS
   ------------------------------------------------------------
   SETUP (do this once):
   1. Create a project:  https://console.firebase.google.com
   2. Add a "Web app" to the project and copy its config values.
   3. Paste them into FIREBASE_CONFIG below (replace every YOUR_* value).
   4. In the console enable:
        - Authentication  ->  Sign-in method  ->  Email/Password
        - Firestore Database (start in production mode)
   5. Security rules live in firestore.rules at the repo root. The project
      owner deploys them MANUALLY (e.g. paste into the Firebase console).
      Do NOT deploy via the Firebase CLI from this repo/automation.

   NOTE: These web config values are PUBLIC by design — they are shipped to
   the browser and are NOT secrets. Real protection comes from Firestore
   security rules (firestore.rules), not from hiding these values.

   The app also keeps a local (localStorage) fallback if Firebase is
   unreachable, so it never hard-breaks when offline.
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDdHPkc4jfLvz_QhIPpB7r3-3LJwrfo1Q8",
  authDomain: "inventory-management-oceanz.firebaseapp.com",
  projectId: "inventory-management-oceanz",
  storageBucket: "inventory-management-oceanz.firebasestorage.app",
  messagingSenderId: "112471709088",
  appId: "1:112471709088:web:7612735ad1804a235300c5"
};

// The single super-admin account (god view + test-data tooling).
const SUPER_ADMIN_EMAIL = 'yashtodkar2@gmail.com';

const Firebase = (() => {
  let app = null, auth = null, db = null, enabled = false;

  function _isConfigured() {
    const c = FIREBASE_CONFIG;
    return !!c.apiKey && c.apiKey.indexOf('YOUR_') !== 0
        && !!c.projectId && c.projectId.indexOf('YOUR_') !== 0;
  }

  function init() {
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] SDK not loaded (offline or blocked) — using local mode.');
      return false;
    }
    if (!_isConfigured()) {
      console.info('[Firebase] Not configured yet — running in local (localStorage) mode.');
      return false;
    }
    try {
      app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      // Offline persistence keeps the app usable on flaky mobile connections.
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      } catch (e) { /* not supported in this browser — ignore */ }
      enabled = true;
      console.info('[Firebase] Initialized for project:', FIREBASE_CONFIG.projectId);
    } catch (e) {
      console.error('[Firebase] Initialization failed:', e);
      enabled = false;
    }
    return enabled;
  }

  function isEnabled() { return enabled; }
  function getAuth() { return auth; }
  function getDb() { return db; }

  /* ---------------- Auth helpers (email/password) ---------------- */
  function signIn(email, password) { return auth.signInWithEmailAndPassword(email, password); }
  function signUp(email, password) { return auth.createUserWithEmailAndPassword(email, password); }
  function signOut() { return auth.signOut(); }
  function currentUser() { return auth ? auth.currentUser : null; }
  function onAuth(cb) { return auth ? auth.onAuthStateChanged(cb) : (cb(null), function () {}); }

  // Create a worker's Auth account WITHOUT disturbing the owner's session, by
  // using a throwaway secondary Firebase app instance. Returns the new uid.
  async function createWorkerAccount(email, password) {
    if (!enabled) throw new Error('Backend unavailable.');
    const NAME = 'worker-mgmt';
    let sec;
    try { sec = firebase.app(NAME); } catch (e) { sec = firebase.initializeApp(FIREBASE_CONFIG, NAME); }
    try {
      const cred = await sec.auth().createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      try { await sec.auth().signOut(); } catch (e) { /* ignore */ }
      return uid;
    } finally {
      try { await sec.delete(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- Firestore helpers ---------------- */

  // Upsert a single document.  await Firebase.save('products', product)
  function save(collection, doc) {
    if (!enabled || !doc) return Promise.resolve(null);
    const id = doc.id || db.collection(collection).doc().id;
    return db.collection(collection).doc(id).set({ ...doc, id }, { merge: true }).then(() => id);
  }

  // Upsert many documents in batches (Firestore caps a batch at 500 writes).
  function saveMany(collection, docs) {
    if (!enabled || !docs || !docs.length) return Promise.resolve();
    const chunks = [];
    for (let i = 0; i < docs.length; i += 450) chunks.push(docs.slice(i, i + 450));
    return chunks.reduce((p, chunk) => p.then(() => {
      const batch = db.batch();
      chunk.forEach(d => {
        const id = d.id || db.collection(collection).doc().id;
        batch.set(db.collection(collection).doc(id), { ...d, id }, { merge: true });
      });
      return batch.commit();
    }), Promise.resolve());
  }

  function list(collection) {
    if (!enabled) return Promise.resolve([]);
    return db.collection(collection).get().then(snap => snap.docs.map(d => d.data()));
  }

  function listWhere(collection, field, op, value) {
    if (!enabled) return Promise.resolve([]);
    return db.collection(collection).where(field, op, value).get().then(snap => snap.docs.map(d => d.data()));
  }

  function listByOwner(collection, ownerId) { return listWhere(collection, 'ownerId', '==', ownerId); }

  function getDoc(collection, id) {
    if (!enabled) return Promise.resolve(null);
    return db.collection(collection).doc(id).get().then(d => d.exists ? d.data() : null);
  }

  function remove(collection, id) {
    if (!enabled || !id) return Promise.resolve();
    return db.collection(collection).doc(id).delete();
  }

  // Delete many docs by id in batches (used by the admin demo-cleanup tool).
  function removeMany(collection, ids) {
    if (!enabled || !ids || !ids.length) return Promise.resolve(0);
    const chunks = [];
    for (let i = 0; i < ids.length; i += 450) chunks.push(ids.slice(i, i + 450));
    return chunks.reduce((p, chunk) => p.then(() => {
      const batch = db.batch();
      chunk.forEach(id => batch.delete(db.collection(collection).doc(id)));
      return batch.commit();
    }), Promise.resolve()).then(() => ids.length);
  }

  // Public-ish lookup so the code-first login screen can resolve a company
  // before the user authenticates. Company codes are stored lowercase.
  function findCompanyByCode(code) {
    if (!enabled) return Promise.resolve(null);
    return db.collection('companies').where('code', '==', (code || '').trim().toLowerCase())
      .limit(1).get().then(snap => snap.empty ? null : snap.docs[0].data());
  }

  // Create any new Auth account (owner or worker) without touching the caller's
  // session, via a throwaway secondary app. Alias kept for readability.
  function createAuthAccount(email, password) { return createWorkerAccount(email, password); }

  return {
    init, isEnabled, getAuth, getDb, config: FIREBASE_CONFIG,
    signIn, signUp, signOut, currentUser, onAuth, createWorkerAccount, createAuthAccount,
    save, saveMany, list, listWhere, listByOwner, getDoc, remove, removeMany, findCompanyByCode,
  };
})();

if (typeof window !== 'undefined') {
  window.Firebase = Firebase;
  window.SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;
  Firebase.init();
}
