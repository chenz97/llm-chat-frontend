import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptSettingsPayload,
  encryptSettingsPayload,
  isEncryptedSettingsEnvelope,
} from './settingsCrypto.ts';

const passphrase = 'correct horse battery staple';
const payload = {
  version: 1,
  apiConfigs: [{ id: 'a', name: 'OpenAI', apiKey: 'sk-secret-value' }],
};

test('encryptSettingsPayload produces an envelope without plaintext secrets', async () => {
  const envelope = await encryptSettingsPayload(payload, passphrase);

  assert.ok(isEncryptedSettingsEnvelope(envelope));
  assert.equal(JSON.stringify(envelope).includes('sk-secret-value'), false);
  assert.equal(JSON.stringify(envelope).includes('OpenAI'), false);
});

test('encryption round-trips with the correct passphrase and uses fresh salt/iv', async () => {
  const first = await encryptSettingsPayload(payload, passphrase);
  const second = await encryptSettingsPayload(payload, passphrase);

  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.deepEqual(await decryptSettingsPayload(first, passphrase), payload);
});

test('decryptSettingsPayload rejects a wrong passphrase', async () => {
  const envelope = await encryptSettingsPayload(payload, passphrase);
  await assert.rejects(
    decryptSettingsPayload(envelope, 'wrong passphrase!!'),
    /Failed to decrypt settings/
  );
});

test('decryptSettingsPayload rejects tampered ciphertext', async () => {
  const envelope = await encryptSettingsPayload(payload, passphrase);
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 0xff;
  await assert.rejects(
    decryptSettingsPayload({ ...envelope, ciphertext: bytes.toString('base64') }, passphrase),
    /Failed to decrypt settings/
  );
});

test('decryptSettingsPayload refuses plaintext settings', async () => {
  await assert.rejects(
    decryptSettingsPayload(payload, passphrase),
    /Refusing to import unencrypted data/
  );
});

test('encryptSettingsPayload rejects short passphrases', async () => {
  await assert.rejects(encryptSettingsPayload(payload, 'short'), /at least 12 characters/);
});
