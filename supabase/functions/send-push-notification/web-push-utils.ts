/**
 * Web Push Utilities for Supabase Edge Functions
 * Handles VAPID authentication and payload encryption for Web Push Protocol
 */

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface VapidDetails {
  publicKey: string;
  privateKey: string;
  subject: string;
}

interface SendResult {
  success: boolean;
  status?: number;
  error?: string;
}

// Base64URL encoding/decoding utilities
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Create VAPID JWT token
async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string
): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const headerB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert signature from DER to raw format
  const signatureB64 = uint8ArrayToBase64Url(new Uint8Array(signature));

  return `${unsignedToken}.${signatureB64}`;
}

// HKDF key derivation
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ]);

  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', salt, info, hash: 'SHA-256' },
    key,
    length * 8
  );

  return new Uint8Array(bits);
}

// Encrypt payload using Web Push encryption
async function encryptPayload(
  payload: string,
  clientPublicKeyBase64: string,
  authSecretBase64: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  // Decode client keys
  const clientPublicKey = base64UrlToUint8Array(clientPublicKeyBase64);
  const authSecret = base64UrlToUint8Array(authSecretBase64);

  // Generate server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export server public key
  const serverPublicKeyRaw = await crypto.subtle.exportKey(
    'raw',
    serverKeyPair.publicKey
  );
  const serverPublicKey = new Uint8Array(serverPublicKeyRaw);

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Perform ECDH key agreement
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    serverKeyPair.privateKey,
    256
  );

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive keys using HKDF
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const prk = await hkdf(authSecret, new Uint8Array(sharedSecret), authInfo, 32);

  const keyInfo = concatUint8Arrays(
    new TextEncoder().encode('Content-Encoding: aes128gcm\0P-256\0'),
    new Uint8Array([0, 65]),
    clientPublicKey,
    new Uint8Array([0, 65]),
    serverPublicKey
  );

  const ikm = await hkdf(salt, prk, keyInfo, 32);
  const contentEncryptionKey = ikm.slice(0, 16);

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // Import encryption key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey,
    'AES-GCM',
    false,
    ['encrypt']
  );

  // Pad and encrypt payload
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = concatUint8Arrays(payloadBytes, new Uint8Array([2]));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  );

  // Build aes128gcm header
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, paddedPayload.length + 16, false);

  const header = concatUint8Arrays(
    salt,
    recordSize,
    new Uint8Array([serverPublicKey.length]),
    serverPublicKey
  );

  const ciphertext = concatUint8Arrays(header, new Uint8Array(encrypted));

  return { ciphertext, salt, serverPublicKey };
}

// Send Web Push notification
export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapidDetails: VapidDetails
): Promise<SendResult> {
  try {
    // Get audience (origin) from endpoint
    const url = new URL(subscription.endpoint);
    const audience = url.origin;

    // Create VAPID JWT
    const jwt = await createVapidJwt(
      audience,
      vapidDetails.subject,
      vapidDetails.privateKey
    );

    // Encrypt payload
    const { ciphertext } = await encryptPayload(
      payload,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    // Build authorization header
    const publicKeyBytes = base64UrlToUint8Array(vapidDetails.publicKey);
    const publicKeyB64 = uint8ArrayToBase64Url(publicKeyBytes);
    const authorization = `vapid t=${jwt}, k=${publicKeyB64}`;

    // Send request
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400', // 24 hours
        'Urgency': 'normal',
      },
      body: ciphertext,
    });

    if (response.ok || response.status === 201) {
      return { success: true, status: response.status };
    }

    const errorText = await response.text().catch(() => '');
    return {
      success: false,
      status: response.status,
      error: errorText || response.statusText,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
