// ─── RSA: Generate a new key pair ────────────────────────────────────────────
export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  return keyPair;
}

// ─── RSA: Export a key to a base64 string ────────────────────────────────────
export async function exportKey(key, type) {
  const exported = await window.crypto.subtle.exportKey(type, key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// ─── RSA: Import a public key from a base64 string ───────────────────────────
export async function importPublicKey(base64) {
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    "spki",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

// ─── RSA: Import a private key from a base64 string ──────────────────────────
export async function importPrivateKey(base64) {
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

// ─── RSA: Encrypt a message using a public key ───────────────────────────────
export async function encryptMessage(publicKey, message) {
  const encoded = new TextEncoder().encode(message);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    encoded
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// ─── RSA: Decrypt a message using a private key ──────────────────────────────
export async function decryptMessage(privateKey, encryptedBase64) {
  try {
    const binary = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      binary
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "[encrypted message]";
  }
}

// ─── AES: Generate a random AES-GCM key ──────────────────────────────────────
// Called once per group message — a fresh key for every message
export async function generateAESKey() {
  return window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,         // extractable — we need to export it to encrypt with RSA
    ["encrypt", "decrypt"]
  );
}

// ─── AES: Export AES key to base64 ───────────────────────────────────────────
export async function exportAESKey(key) {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// ─── AES: Import AES key from base64 ─────────────────────────────────────────
export async function importAESKey(base64) {
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    "raw",
    binary,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

// ─── AES: Encrypt a message ───────────────────────────────────────────────────
// Returns a base64 string of iv + ciphertext combined
export async function encryptAES(aesKey, message) {
  // IV must be random and unique for each encryption
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );
  // Combine iv (12 bytes) + ciphertext into one array so we can store/send together
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// ─── AES: Decrypt a message ───────────────────────────────────────────────────
// Takes the combined base64 string (iv + ciphertext) produced by encryptAES
export async function decryptAES(aesKey, combinedBase64) {
  try {
    const combined = Uint8Array.from(atob(combinedBase64), c => c.charCodeAt(0));
    // Split back into iv (first 12 bytes) and ciphertext (the rest)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "[encrypted message]";
  }
}

// ─── RSA: Get our own public key from localStorage ───────────────────────────
export async function getOwnPublicKey(userId) {
  const publicKeyStr = localStorage.getItem(`public_key_${userId}`);
  if (!publicKeyStr) return null;
  return importPublicKey(publicKeyStr);
}

// ─── Initialize keys for a user session ──────────────────────────────────────
export async function initializeKeys(userId, uploadPublicKey, fetchOwnPublicKey) {
  const privateKeyStorageKey = `private_key_${userId}`;
  const publicKeyStorageKey = `public_key_${userId}`;

  const existingPrivateKey = localStorage.getItem(privateKeyStorageKey);

  if (existingPrivateKey) {
    const existingPublicKey = localStorage.getItem(publicKeyStorageKey);

    if (!existingPublicKey) {
      // Public key missing locally — fetch from server
      const publicKeyStr = await fetchOwnPublicKey();
      if (publicKeyStr) {
        localStorage.setItem(publicKeyStorageKey, publicKeyStr);
      }
    }

    const privateKey = await importPrivateKey(existingPrivateKey);
    return { privateKey };
  }

  // First time — generate a brand new key pair
  const keyPair = await generateKeyPair();
  const privateKeyStr = await exportKey(keyPair.privateKey, "pkcs8");
  const publicKeyStr = await exportKey(keyPair.publicKey, "spki");

  localStorage.setItem(privateKeyStorageKey, privateKeyStr);
  localStorage.setItem(publicKeyStorageKey, publicKeyStr);

  await uploadPublicKey(publicKeyStr);
  return { privateKey: keyPair.privateKey };
}