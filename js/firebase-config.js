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

  /* ----------------------------------------------------------
     Example Firestore helpers (wire these into store.js/auth.js
     when you're ready to sync data to the cloud). All collections
     are expected to be owner-scoped via an `ownerId` field that
     equals the signed-in user's uid (see firestore.rules).
     ---------------------------------------------------------- */

  // Upsert a document:  await Firebase.save('products', product)
  function save(collection, doc) {
    if (!enabled) return Promise.resolve(null);
    const id = doc.id || db.collection(collection).doc().id;
    return db.collection(collection).doc(id).set({ ...doc, id }, { merge: true }).then(() => id);
  }

  // Read all docs owned by a user:  await Firebase.listByOwner('products', uid)
  function listByOwner(collection, ownerId) {
    if (!enabled) return Promise.resolve([]);
    return db.collection(collection).where('ownerId', '==', ownerId).get()
      .then(snap => snap.docs.map(d => d.data()));
  }

  function remove(collection, id) {
    if (!enabled) return Promise.resolve();
    return db.collection(collection).doc(id).delete();
  }

  return { init, isEnabled, getAuth, getDb, save, listByOwner, remove, config: FIREBASE_CONFIG };
})();

if (typeof window !== 'undefined') {
  window.Firebase = Firebase;
  Firebase.init();
}
