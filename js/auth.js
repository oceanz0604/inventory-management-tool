const Auth = (() => {
  const SUPER = (typeof window !== 'undefined' && window.SUPER_ADMIN_EMAIL ? window.SUPER_ADMIN_EMAIL : 'yashtodkar2@gmail.com').toLowerCase();
  let _pendingName = null; // carries the signup display name into ensureSession()

  function _useCloud() { return typeof window !== 'undefined' && window.Firebase && Firebase.isEnabled(); }
  // Roles: superadmin | owner (the client) | office | staff | marketing.
  // Legacy profiles created before roles existed use 'user' — treated as owner.
  const OWNER_LEVEL = ['owner', 'user'];
  const WORKER_ROLES = ['office', 'staff', 'marketing'];

  function getInitials(name) {
    return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // Make sure a Firestore profile exists for the signed-in Firebase user.
  // Worker profiles are pre-created by their owner, so a missing profile here
  // means a brand-new owner (or the super admin) is signing in.
  async function _ensureProfile(fbUser, nameHint) {
    const uid = fbUser.uid;
    const email = (fbUser.email || '').toLowerCase();
    const isAdmin = email === SUPER;
    let profile = null;
    try { profile = await Firebase.getDoc('users', uid); } catch (e) { profile = null; }

    if (!profile) {
      const fallbackName = isAdmin ? 'admin' : (nameHint || fbUser.displayName || (email.split('@')[0]) || 'My Shop');
      profile = {
        id: uid,
        name: fallbackName,
        email: email,
        shopName: fallbackName,
        role: isAdmin ? 'superadmin' : 'owner',
        companyId: uid, // an owner's company is itself
        createdAt: new Date().toISOString(),
      };
      try { await Firebase.save('users', profile); } catch (e) { /* ignore */ }
      // Give a brand-new owner a default location to work with.
      if (!isAdmin) {
        try {
          const existing = await Firebase.listByOwner('locations', uid);
          if (!existing || existing.length === 0) {
            await Firebase.save('locations', { id: Store.generateId(), ownerId: uid, name: 'Main Warehouse', address: '', isDefault: true });
          }
        } catch (e) { /* ignore */ }
      }
    } else {
      // Backfill companyId for legacy profiles; never downgrade a worker's role.
      let changed = false;
      if (!profile.companyId) { profile.companyId = profile.id; changed = true; }
      if (isAdmin && profile.role !== 'superadmin') { profile.role = 'superadmin'; changed = true; }
      if (changed) { try { await Firebase.save('users', profile); } catch (e) { /* ignore */ } }
    }
    return profile;
  }

  // Build the local session from the currently signed-in Firebase user.
  async function ensureSession() {
    if (!_useCloud()) return null;
    const fb = Firebase.currentUser();
    if (!fb) return null;
    let profile = await _ensureProfile(fb, _pendingName);
    _pendingName = null;
    try { profile = await _ensureCompany(profile); } catch (e) { /* ignore */ }
    Store.setCurrentUser(profile);
    return profile;
  }

  /* ---------------- Company (tenant) ---------------- */
  function _slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'company'; }

  async function _genUniqueCode(base) {
    const root = _slug(base);
    for (let i = 0; i < 6; i++) {
      const code = root + Math.floor(100 + Math.random() * 900);
      try { const ex = await Firebase.findCompanyByCode(code); if (!ex) return code; } catch (e) { return code; }
    }
    return root + String(Date.now()).slice(-5);
  }

  // Every owner-level account maps to exactly one company doc (id == companyId).
  // Auto-provision one (with a shareable code) for new and legacy owners alike.
  async function _ensureCompany(profile) {
    if (!_useCloud() || !profile) return profile;
    if (profile.role === 'superadmin' || WORKER_ROLES.indexOf(profile.role) >= 0) return profile;
    const cid = profile.companyId || profile.id;
    let company = null;
    try { company = await Firebase.getDoc('companies', cid); } catch (e) { company = null; }
    if (!company) {
      const code = await _genUniqueCode(profile.shopName || profile.name || profile.email);
      company = { id: cid, ownerId: cid, name: profile.shopName || profile.name || 'My Company', code: code, createdAt: new Date().toISOString() };
      try { await Firebase.save('companies', company); } catch (e) { /* ignore */ }
    }
    if (profile.companyCode !== company.code) {
      profile.companyCode = company.code;
      try { await Firebase.save('users', profile); } catch (e) { /* ignore */ }
    }
    return profile;
  }

  // Step 1 of the code-first login: resolve a company by its code.
  async function selectCompany(code) {
    const c = (code || '').trim().toLowerCase();
    if (!c) return { success: false, message: 'Enter your company code.' };
    if (!_useCloud()) return { success: false, message: 'Backend unavailable.' };
    let company = null;
    try { company = await Firebase.findCompanyByCode(c); } catch (e) { company = null; }
    if (!company) return { success: false, message: 'No company found for that code.' };
    try { localStorage.setItem('ims_chosen_company', JSON.stringify({ id: company.id, code: company.code, name: company.name })); } catch (e) { /* ignore */ }
    return { success: true, company };
  }

  function getChosenCompany() { try { return JSON.parse(localStorage.getItem('ims_chosen_company') || 'null'); } catch (e) { return null; } }
  function getChosenCompanyId() { const c = getChosenCompany(); return c && c.id; }
  function clearChosenCompany() { try { localStorage.removeItem('ims_chosen_company'); } catch (e) { /* ignore */ } }

  async function login(email, password) {
    if (!_useCloud()) return { success: false, message: 'Backend unavailable. Check your connection and try again.' };
    try {
      await Firebase.signIn((email || '').trim(), password);
      return { success: true };
    } catch (e) { return { success: false, message: _friendly(e) }; }
  }

  async function signup(name, email, password) {
    if (!_useCloud()) return { success: false, message: 'Backend unavailable. Check your connection and try again.' };
    try {
      _pendingName = (name || '').trim();
      await Firebase.signUp((email || '').trim(), password);
      return { success: true };
    } catch (e) { _pendingName = null; return { success: false, message: _friendly(e) }; }
  }

  async function logout() {
    try { if (_useCloud()) await Firebase.signOut(); } catch (e) { /* ignore */ }
    clearChosenCompany();
    Store.clearCurrentUser();
    Store.clearCart();
    Store._clearLocalData();
  }

  function isAuthenticated() { return Store.getCurrentUser() !== null; }
  function getUser() { return Store.getCurrentUser(); }
  function getRole() { const u = getUser(); return u ? (u.role || 'owner') : null; }
  function isSuperAdmin() { return getRole() === 'superadmin'; }
  function isOwnerLevel() { return OWNER_LEVEL.indexOf(getRole()) >= 0; }
  function isWorker() { return WORKER_ROLES.indexOf(getRole()) >= 0; }
  // The effective data-owner id: a worker scopes to their company; everyone
  // else scopes to themselves.
  function ownerId() { const u = getUser(); return u ? (u.companyId || u.id) : null; }
  // Owners + super admin can administer the company (workers, etc.).
  function canManageTeam() { return isOwnerLevel() || isSuperAdmin(); }

  /* ---------------- Worker management (owner only) ---------------- */
  async function createWorker(name, email, password, role) {
    if (!_useCloud()) return { success: false, message: 'Backend unavailable.' };
    if (!canManageTeam()) return { success: false, message: 'Not allowed.' };
    if (WORKER_ROLES.indexOf(role) < 0) return { success: false, message: 'Invalid role.' };
    const companyId = ownerId();
    try {
      const uid = await Firebase.createWorkerAccount((email || '').trim(), password);
      const profile = {
        id: uid, name: (name || '').trim(), email: (email || '').trim().toLowerCase(),
        shopName: (name || '').trim(), role: role, companyId: companyId, createdAt: new Date().toISOString(),
      };
      await Firebase.save('users', profile);
      Store.upsertUserLocal(profile);
      return { success: true, user: profile };
    } catch (e) { return { success: false, message: _friendly(e) }; }
  }

  // Removes the worker's profile (revokes app access). The Auth account itself
  // can be deleted from the Firebase Console if needed.
  async function deleteWorker(uid) {
    if (!canManageTeam()) return { success: false, message: 'Not allowed.' };
    try { await Firebase.remove('users', uid); } catch (e) { /* ignore */ }
    Store.removeUserLocal(uid);
    return { success: true };
  }

  // Workers belonging to the current company.
  function getWorkers() {
    const cid = ownerId();
    return Store.getUsers().filter(u => u.companyId === cid && WORKER_ROLES.indexOf(u.role) >= 0);
  }

  /* ---------------- Profile / onboarding ---------------- */
  // Merge fields into the current profile and persist (local + cloud).
  async function updateProfile(patch) {
    const u = getUser();
    if (!u) return null;
    Object.assign(u, patch);
    Store.setCurrentUser(u);
    Store.upsertUserLocal(u);
    if (_useCloud()) { try { await Firebase.save('users', u); } catch (e) { /* ignore */ } }
    return u;
  }

  function getOnboarding() { const u = getUser(); return (u && u.onboarding) || {}; }
  function setOnboarding(patch) {
    return updateProfile({ onboarding: Object.assign({}, getOnboarding(), patch) });
  }

  // God-view: super admin "acts as" another owner. Local only — no re-auth.
  // All of that owner's data is already in the local cache (admin loads everything).
  function switchUser(userId) {
    const u = Store.getUserById(userId);
    if (!u) return { success: false, message: 'User not found.' };
    Store.clearCart();
    Store.setCurrentUser(u);
    return { success: true, user: u };
  }

  function _friendly(e) {
    const c = (e && e.code) || '';
    if (/wrong-password|user-not-found|invalid-credential|invalid-login/.test(c)) return 'Invalid email or password.';
    if (/email-already-in-use/.test(c)) return 'An account with this email already exists.';
    if (/weak-password/.test(c)) return 'Password should be at least 6 characters.';
    if (/invalid-email/.test(c)) return 'Please enter a valid email address.';
    if (/too-many-requests/.test(c)) return 'Too many attempts. Please try again later.';
    if (/network-request-failed/.test(c)) return 'Network error. Check your connection.';
    return (e && e.message) || 'Authentication failed.';
  }

  return {
    ensureSession, login, signup, logout, switchUser,
    isAuthenticated, getUser, getInitials, getRole, ownerId,
    isSuperAdmin, isOwnerLevel, isWorker, canManageTeam,
    createWorker, deleteWorker, getWorkers,
    updateProfile, getOnboarding, setOnboarding,
    selectCompany, getChosenCompany, getChosenCompanyId, clearChosenCompany,
  };
})();
