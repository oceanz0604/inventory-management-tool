const Auth = (() => {
  const SUPER = (typeof window !== 'undefined' && window.SUPER_ADMIN_EMAIL ? window.SUPER_ADMIN_EMAIL : 'yashtodkar2@gmail.com').toLowerCase();
  let _pendingName = null; // carries the signup display name into ensureSession()

  function _useCloud() { return typeof window !== 'undefined' && window.Firebase && Firebase.isEnabled(); }
  function _roleFor(email) { return email && email.toLowerCase() === SUPER ? 'superadmin' : 'user'; }

  function getInitials(name) {
    return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // Make sure a Firestore profile exists for the signed-in Firebase user.
  async function _ensureProfile(fbUser, nameHint) {
    const uid = fbUser.uid;
    const email = (fbUser.email || '').toLowerCase();
    const role = _roleFor(email);
    const isAdmin = role === 'superadmin';
    let profile = null;
    try { profile = await Firebase.getDoc('users', uid); } catch (e) { profile = null; }

    if (!profile) {
      const fallbackName = isAdmin ? 'admin' : (nameHint || fbUser.displayName || (email.split('@')[0]) || 'My Shop');
      profile = {
        id: uid,
        name: fallbackName,
        email: email,
        shopName: fallbackName,
        role: role,
        createdAt: new Date().toISOString(),
      };
      try { await Firebase.save('users', profile); } catch (e) { /* ignore */ }
      // Give a brand-new normal user a default location to work with.
      if (!isAdmin) {
        try {
          const existing = await Firebase.listByOwner('locations', uid);
          if (!existing || existing.length === 0) {
            await Firebase.save('locations', { id: Store.generateId(), ownerId: uid, name: 'Main Warehouse', address: '', isDefault: true });
          }
        } catch (e) { /* ignore */ }
      }
    } else if (profile.role !== role) {
      // Keep role aligned with the configured super-admin email.
      profile.role = role;
      try { await Firebase.save('users', profile); } catch (e) { /* ignore */ }
    }
    return profile;
  }

  // Build the local session from the currently signed-in Firebase user.
  async function ensureSession() {
    if (!_useCloud()) return null;
    const fb = Firebase.currentUser();
    if (!fb) return null;
    const profile = await _ensureProfile(fb, _pendingName);
    _pendingName = null;
    Store.setCurrentUser(profile);
    return profile;
  }

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
    Store.clearCurrentUser();
    Store.clearCart();
    Store._clearLocalData();
  }

  function isAuthenticated() { return Store.getCurrentUser() !== null; }
  function getUser() { return Store.getCurrentUser(); }
  function isSuperAdmin() { const u = getUser(); return !!u && u.role === 'superadmin'; }

  // God-view: super admin "acts as" another owner. Local only — no re-auth.
  // All of that owner's data is already in the local cache (admin loads everything).
  function switchUser(userId) {
    const u = Store.getUserById(userId);
    if (!u) return { success: false, message: 'User not found.' };
    Store.clearCart();
    Store.setCurrentUser(u);
    return { success: true, user: u };
  }
  function demoLogin(userId) { return switchUser(userId || 'user_a'); }

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

  return { ensureSession, login, signup, logout, demoLogin, switchUser, isAuthenticated, getUser, getInitials, isSuperAdmin };
})();
