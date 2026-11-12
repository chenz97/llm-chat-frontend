// End-to-end encryption for synced settings. The passphrase never leaves the
// browser; the remote copy only ever contains ciphertext.

export const ENCRYPTED_SETTINGS_FORMAT = 'llm-chat-encrypted-settings';
export const ENCRYPTED_SETTINGS_VERSION = 1;
export const MIN_PASSPHRASE_LENGTH = 12;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedSettingsEnvelope {
  format: typeof ENCRYPTED_SETTINGS_FORMAT;
  version: typeof ENCRYPTED_SETTINGS_VERSION;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveKey = async (
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const assertPassphrase = (passphrase: string) => {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Encryption passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
};

export const encryptSettingsPayload = async (
  payload: unknown,
  passphrase: string
): Promise<EncryptedSettingsEnvelope> => {
  assertPassphrase(passphrase);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    format: ENCRYPTED_SETTINGS_FORMAT,
    version: ENCRYPTED_SETTINGS_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const isEncryptedSettingsEnvelope = (
  value: unknown
): value is EncryptedSettingsEnvelope => (
  isRecord(value)
  && value.format === ENCRYPTED_SETTINGS_FORMAT
  && value.version === ENCRYPTED_SETTINGS_VERSION
  && isRecord(value.kdf)
  && value.kdf.name === 'PBKDF2'
  && value.kdf.hash === 'SHA-256'
  && typeof value.kdf.iterations === 'number'
  && Number.isInteger(value.kdf.iterations)
  && value.kdf.iterations >= 100_000
  && typeof value.kdf.salt === 'string'
  && isRecord(value.cipher)
  && value.cipher.name === 'AES-GCM'
  && typeof value.cipher.iv === 'string'
  && typeof value.ciphertext === 'string'
);

export const decryptSettingsPayload = async (
  envelope: unknown,
  passphrase: string
): Promise<unknown> => {
  if (!isEncryptedSettingsEnvelope(envelope)) {
    throw new Error('Remote settings file is not an encrypted settings envelope. Refusing to import unencrypted data.');
  }
  if (!passphrase) {
    throw new Error('Encryption passphrase is required.');
  }

  let plaintext: ArrayBuffer;
  try {
    const key = await deriveKey(
      passphrase,
      base64ToBytes(envelope.kdf.salt),
      envelope.kdf.iterations
    );
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.cipher.iv) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
  } catch {
    throw new Error('Failed to decrypt settings. The passphrase may be wrong or the file was modified.');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Decrypted settings contain invalid JSON.');
  }
};
