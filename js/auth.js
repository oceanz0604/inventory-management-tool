const Auth = (() => {
  // Roles: superadmin (admin console only) | owner (the client) | office | staff | marketing.
  // Legacy profiles created before roles existed use 'user' — treated as owner.
  const OWNER_LEVEL = ['owner', 'user'];
  const WORKER_ROLES = ['office', 'staff', 'marketing'];

  function _useCloud() { return typeof window !== 'undefined' && window.Firebase && Firebase.isEnabled(); }

  function getInitials(name) {
    return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function _strip(u) { if (!u) return u; const { passwordHash, salt, ...rest } = u; return rest; }

  /* ---------------- Company (tenant) selection ---------------- */
  // Step 1 of login: resolve a company by its code (public lookup).
  async function selectCompany(code) {
    const c = (code || '').trim().toLowerCase();
    if (!c) return { success: false, message: 'Enter your company code.' };
    if (!_useCloud()) return { success: false, message: 'Backend unavailable. Check your connection.' };
    let company = null;
    try { company = await Firebase.findCompanyByCode(c); } catch (e) { company = null; }
    if (!company) return { success: false, message: 'No company found for that code.' };
    if (company.status === 'suspended') return { success: false, message: 'This company account is suspended. Please contact support.' };
    try { localStorage.setItem('ims_chosen_company', JSON.stringify({ id: company.id, code: company.code, name: company.name })); } catch (e) { /* ignore */ }
    return { success: true, company };
  }
  function getChosenCompany() { try { return JSON.parse(localStorage.getItem('ims_chosen_company') || 'null'); } catch (e) { return null; } }
  function getChosenCompanyId() { const c = getChosenCompany(); return c && c.id; }
  function clearChosenCompany() { try { localStorage.removeItem('ims_chosen_company'); } catch (e) { /* ignore */ } }

  /* ---------------- Login (company username + password) ---------------- */
  // Step 2: match the username + password against the chosen company's users.
  async function login(username, password) {
    if (!_useCloud()) return { success: false, message: 'Backend unavailable. Check your connection.' };
    const chosen = getChosenCompany();
    if (!chosen || !chosen.id) return { success: false, message: 'Select your company first.' };
    const uname = (username || '').trim().toLowerCase();
    if (!uname || !password) return { success: false, message: 'Enter your username and password.' };
    let users = [];
    try { users = await Firebase.listWhere('users', 'companyId', '==', chosen.id); } catch (e) { return { success: false, message: 'Could not reach the server. Try again.' }; }
    const u = users.find(x => (x.username || '').toLowerCase() === uname);
    if (!u || !u.passwordHash) return { success: false, message: 'Invalid username or password.' };
    let okpw = false;
    try { okpw = await Creds.verify(password, u.salt, u.passwordHash); } catch (e) { okpw = false; }
    if (!okpw) return { success: false, message: 'Invalid username or password.' };
    const session = _strip(u);
    Store.setCurrentUser(session);
    return { success: true, user: session };
  }

  // Restore the persisted local session (no Firebase Auth for company users).
  function ensureSession() { return Store.getCurrentUser(); }

  function logout() {
    clearChosenCompany();
    Store.clearCurrentUser();
    Store.clearCart();
    Store._clearLocalData();
    return Promise.resolve();
  }

  function isAuthenticated() { return Store.getCurrentUser() !== null; }
  function getUser() { return Store.getCurrentUser(); }
  function getRole() { const u = getUser(); return u ? (u.role || 'owner') : null; }
  function isSuperAdmin() { return getRole() === 'superadmin'; }
  function isOwnerLevel() { return OWNER_LEVEL.indexOf(getRole()) >= 0; }
  function isWorker() { return WORKER_ROLES.indexOf(getRole()) >= 0; }
  // Effective data-owner id: a worker scopes to their company; everyone else to themselves.
  function ownerId() { const u = getUser(); return u ? (u.companyId || u.id) : null; }
  function canManageTeam() { return isOwnerLevel() || isSuperAdmin(); }

  /* ---------------- Worker management (owner only) ---------------- */
  async function createWorker(name, username, password, role) {
    if (!_useCloud()) return { success: false, message: 'Backend unavailable.' };
    if (!canManageTeam()) return { success: false, message: 'Not allowed.' };
    if (WORKER_ROLES.indexOf(role) < 0) return { success: false, message: 'Invalid role.' };
    const uname = (username || '').trim().toLowerCase();
    if (!uname) return { success: false, message: 'Username is required.' };
    if (!password || password.length < 4) return { success: false, message: 'Password must be at least 4 characters.' };
    const companyId = ownerId();
    // Username must be unique within the company.
    if (Store.getUsers().some(u => u.companyId === companyId && (u.username || '').toLowerCase() === uname)) {
      return { success: false, message: 'That username is already taken in your company.' };
    }
    try {
      const cred = await Creds.make(password);
      const profile = {
        id: Store.generateId(), name: (name || '').trim(), username: uname,
        role: role, companyId: companyId, salt: cred.salt, passwordHash: cred.passwordHash,
        createdAt: new Date().toISOString(),
      };
      await Firebase.save('users', profile);
      Store.upsertUserLocal(_strip(profile));
      return { success: true, user: _strip(profile) };
    } catch (e) { return { success: false, message: (e && e.message) || 'Could not create worker.' }; }
  }

  async function deleteWorker(uid) {
    if (!canManageTeam()) return { success: false, message: 'Not allowed.' };
    try { await Firebase.remove('users', uid); } catch (e) { /* ignore */ }
    Store.removeUserLocal(uid);
    return { success: true };
  }

  function getWorkers() {
    const cid = ownerId();
    return Store.getUsers().filter(u => u.companyId === cid && WORKER_ROLES.indexOf(u.role) >= 0);
  }

  /* ---------------- Profile / onboarding ---------------- */
  // Merge fields into the current profile and persist (local + cloud). Never
  // writes secrets back (session has none; merge keeps the stored hash intact).
  async function updateProfile(patch) {
    const u = getUser();
    if (!u) return null;
    Object.assign(u, patch);
    Store.setCurrentUser(u);
    Store.upsertUserLocal(u);
    if (_useCloud()) { try { await Firebase.save('users', _strip(u)); } catch (e) { /* ignore */ } }
    return u;
  }

  function getOnboarding() { const u = getUser(); return (u && u.onboarding) || {}; }
  function setOnboarding(patch) {
    return updateProfile({ onboarding: Object.assign({}, getOnboarding(), patch) });
  }

  // Owner-only: merge settings (e.g. bottomNav) onto the company doc.
  async function setCompanyConfig(patch) {
    const cid = ownerId();
    if (!cid) return null;
    const u = getUser();
    const existing = Store.getCompanyById(cid) || { id: cid, ownerId: cid, name: (u && (u.shopName || u.name)) || 'My Company' };
    const updated = Object.assign({}, existing, patch);
    Store.addCompany(updated); // local upsert + cloud merge
    return updated;
  }
  function getCompanyConfig() { return Store.getCompanyById(ownerId()) || null; }

  // God-view: super admin "acts as" another owner. Local only — no re-auth.
  function switchUser(userId) {
    const u = Store.getUserById(userId);
    if (!u) return { success: false, message: 'User not found.' };
    Store.clearCart();
    Store.setCurrentUser(_strip(u));
    return { success: true, user: _strip(u) };
  }

  return {
    ensureSession, login, logout, switchUser,
    isAuthenticated, getUser, getInitials, getRole, ownerId,
    isSuperAdmin, isOwnerLevel, isWorker, canManageTeam,
    createWorker, deleteWorker, getWorkers,
    updateProfile, getOnboarding, setOnboarding,
    selectCompany, getChosenCompany, getChosenCompanyId, clearChosenCompany,
    setCompanyConfig, getCompanyConfig,
  };
})();
