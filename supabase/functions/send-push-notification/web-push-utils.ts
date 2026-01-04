/**
 * Web Push utilities for Deno
 * Implements VAPID authentication and payload encryption for Web Push
 */

import { encode as base64UrlEncode } from "https://deno.land/std@0.168.0/encoding/base64url.ts";
import { decode as base64UrlDecode } from "https://deno.land/std@0.168.0/encoding/base64url.ts";

/**
 * Create VAPID authorization headers for Web Push
 */
export async function createVapidAuthHeader(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string
): Promise<Record<string, string>> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // Create JWT header
  const header = {
    typ: 'JWT',
    alg: 'ES256'
  };

  // Create JWT payload (claims)
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Sign the token using the private key
  const signature = await signWithP256(unsignedToken, publicKey, privateKey);
  const jwt = `${unsignedToken}.${signature}`;

  return {
    'Authorization': `vapid t=${jwt}, k=${publicKey}`,
  };
}

/**
 * Sign data using P-256 ECDSA
 * We need both public and private key to create a proper JWK for import
 */
async function signWithP256(data: string, publicKeyBase64: string, privateKeyBase64: string): Promise<string> {
  // Decode the keys
  const publicKeyBytes = base64UrlDecode(publicKeyBase64);
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);

  // The public key is 65 bytes (uncompressed format: 0x04 || x || y)
  // Extract x and y coordinates (skip the 0x04 prefix)
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  // Create JWK from the key components
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: base64UrlEncode(privateKeyBytes),
    ext: true,
  };

  // Import the private key
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );

  // Sign the data
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256'
    },
    key,
    encoder.encode(data)
  );

  // Convert DER signature to fixed 64-byte format (r || s) for JWT
  const signature = new Uint8Array(signatureBuffer);
  const fixedSignature = derToRaw(signature);

  // Return base64url encoded signature
  return base64UrlEncode(fixedSignature);
}

/**
 * Convert DER-encoded ECDSA signature to raw format (r || s)
 * Web Crypto returns DER, but JWT requires raw 64-byte format
 */
function derToRaw(derSignature: Uint8Array): Uint8Array {
  // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  const raw = new Uint8Array(64);

  // Check if it's already raw format (64 bytes)
  if (derSignature.length === 64) {
    return derSignature;
  }

  // Parse DER format
  let offset = 0;

  // Skip sequence tag (0x30) and length
  if (derSignature[offset] !== 0x30) {
    throw new Error('Invalid DER signature: expected sequence tag');
  }
  offset++;
  // Skip length byte (could be 1 or 2 bytes)
  if (derSignature[offset] & 0x80) {
    offset += (derSignature[offset] & 0x7f) + 1;
  } else {
    offset++;
  }

  // Parse r value
  if (derSignature[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected integer tag for r');
  }
  offset++;
  const rLength = derSignature[offset];
  offset++;

  // r might have leading zero for positive number representation
  let rStart = offset;
  let rCopyLength = rLength;
  if (rLength === 33 && derSignature[rStart] === 0x00) {
    rStart++;
    rCopyLength = 32;
  }
  // Copy r to the right position (pad with zeros if needed)
  const rOffset = 32 - rCopyLength;
  raw.set(derSignature.slice(rStart, rStart + rCopyLength), rOffset);
  offset += rLength;

  // Parse s value
  if (derSignature[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected integer tag for s');
  }
  offset++;
  const sLength = derSignature[offset];
  offset++;

  // s might have leading zero for positive number representation
  let sStart = offset;
  let sCopyLength = sLength;
  if (sLength === 33 && derSignature[sStart] === 0x00) {
    sStart++;
    sCopyLength = 32;
  }
  // Copy s to the right position (pad with zeros if needed)
  const sOffset = 32 + (32 - sCopyLength);
  raw.set(derSignature.slice(sStart, sStart + sCopyLength), sOffset);

  return raw;
}

/**
 * Encrypt payload for Web Push using aes128gcm
 */
export async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<Uint8Array> {
  // Decode the client's public key and auth secret
  const clientPublicKey = base64UrlDecode(p256dhKey);
  const clientAuth = base64UrlDecode(authSecret);

  // Generate a random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Generate an ephemeral key pair for ECDH
  const localKeyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits']
  );

  // Import the client's public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    false,
    []
  );

  // Derive the shared secret using ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: clientKey
    },
    localKeyPair.privateKey,
    256
  );

  // Export the local public key
  const localPublicKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
  const localPublicKey = new Uint8Array(localPublicKeyRaw);

  // Derive the encryption key using HKDF
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveBits']
  );

  // Create the info for HKDF per RFC 8291
  const encoder = new TextEncoder();

  // Build the info for IKM derivation: "WebPush: info\0" + client_public_key + server_public_key
  const webPushInfo = encoder.encode('WebPush: info\0');
  const ikm_info = new Uint8Array(webPushInfo.length + clientPublicKey.length + localPublicKey.length);
  ikm_info.set(webPushInfo, 0);
  ikm_info.set(clientPublicKey, webPushInfo.length);
  ikm_info.set(localPublicKey, webPushInfo.length + clientPublicKey.length);

  // Derive IKM (Input Keying Material) using auth secret as salt
  const ikmBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: clientAuth,
      info: ikm_info
    },
    sharedSecretKey,
    256
  );

  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikmBits,
    'HKDF',
    false,
    ['deriveBits']
  );

  // Derive the content encryption key (CEK) using salt
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
  const cekBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: cekInfo
    },
    ikmKey,
    128
  );

  // Derive the nonce using salt
  const nonceInfo = encoder.encode('Content-Encoding: nonce\0');
  const nonceBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: nonceInfo
    },
    ikmKey,
    96 // 12 bytes
  );

  // Import the CEK for AES-GCM
  const cekKey = await crypto.subtle.importKey(
    'raw',
    cekBits,
    'AES-GCM',
    false,
    ['encrypt']
  );

  // Add padding delimiter to payload
  const payloadBytes = encoder.encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Padding delimiter

  // Encrypt the payload
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonceBits,
      tagLength: 128
    },
    cekKey,
    paddedPayload
  );

  // Build the aes128gcm header
  // salt (16) + rs (4) + idlen (1) + keyid (65)
  const recordSize = 4096;
  const header = new Uint8Array(86);
  header.set(salt, 0); // salt
  header[16] = (recordSize >> 24) & 0xff; // rs (big-endian)
  header[17] = (recordSize >> 16) & 0xff;
  header[18] = (recordSize >> 8) & 0xff;
  header[19] = recordSize & 0xff;
  header[20] = 65; // idlen (length of public key)
  header.set(localPublicKey, 21); // keyid (local public key)

  // Combine header and ciphertext
  const result = new Uint8Array(header.length + ciphertext.byteLength);
  result.set(header);
  result.set(new Uint8Array(ciphertext), header.length);

  return result;
}
