const Auth = (() => {
  function _hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }

  function signup(name, email, password) {
    if (Store.findUserByEmail(email)) {
      return { success: false, message: 'An account with this email already exists.' };
    }
    const user = {
      id: Store.generateId(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: _hashPassword(password),
      shopName: name.trim(),
      createdAt: new Date().toISOString(),
    };
    Store.addUser(user);

    const defaultLoc = {
      id: Store.generateId(),
      ownerId: user.id,
      name: 'Main Warehouse',
      address: '',
      isDefault: true,
    };
    Store.addLocation(defaultLoc);

    const { password: _, ...safeUser } = user;
    Store.setCurrentUser(safeUser);
    Store.seedDemoData();
    return { success: true, user: safeUser };
  }

  function login(email, password) {
    const user = Store.findUserByEmail(email);
    if (!user || user.password !== _hashPassword(password)) {
      return { success: false, message: 'Invalid email or password.' };
    }
    const { password: _, ...safeUser } = user;
    Store.setCurrentUser(safeUser);
    return { success: true, user: safeUser };
  }

  function demoLogin(userId) {
    Store.seedDemoData();
    const targetId = userId || 'user_a';
    const user = Store.getUserById(targetId);
    if (!user) return { success: false, message: 'Demo user not found.' };
    const { password: _, ...safeUser } = user;
    Store.setCurrentUser(safeUser);
    return { success: true, user: safeUser };
  }

  function switchUser(userId) {
    const user = Store.getUserById(userId);
    if (!user) return { success: false, message: 'User not found.' };
    Store.clearCart();
    const { password: _, ...safeUser } = user;
    Store.setCurrentUser(safeUser);
    return { success: true, user: safeUser };
  }

  function logout() {
    Store.clearCurrentUser();
    Store.clearCart();
  }

  function isAuthenticated() {
    return Store.getCurrentUser() !== null;
  }

  function getUser() {
    return Store.getCurrentUser();
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  return { signup, login, demoLogin, switchUser, logout, isAuthenticated, getUser, getInitials };
})();
