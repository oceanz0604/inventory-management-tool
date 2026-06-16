/* ============================================================
   Credential hashing for company users (owners + workers).
   Company users authenticate against username + password stored
   in Firestore (NOT Firebase Auth — only the super admin uses that).
   Passwords are never stored in plaintext: we keep a per-user random
   salt + SHA-256(salt:password). Verification re-hashes and compares.
   ============================================================ */
const Creds = (() => {
  function _toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function genSalt() {
    const a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return _toHex(a.buffer);
  }

  async function hash(password, salt) {
    const data = new TextEncoder().encode(String(salt) + ':' + String(password));
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return _toHex(digest);
  }

  // Produce { salt, passwordHash } for a new/updated password.
  async function make(password) {
    const salt = genSalt();
    return { salt, passwordHash: await hash(password, salt) };
  }

  async function verify(password, salt, passwordHash) {
    if (!salt || !passwordHash) return false;
    return (await hash(password, salt)) === passwordHash;
  }

  return { genSalt, hash, make, verify };
})();

if (typeof window !== 'undefined') window.Creds = Creds;
