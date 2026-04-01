import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

let _globalKey: string | null = null;

export function setGlobalEncryptionKey(key: string) { _globalKey = key; }

export function decryptTuyaSecret(encrypted: string): string {
  return decrypt(encrypted, _globalKey || 'smart-farm-encryption-key-change-me');
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(secret: string): Buffer {
  return scryptSync(secret, 'smart-farm-salt', 32);
}

export function encrypt(plainText: string, secret: string): string {
  const key = getKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:encrypted (hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedText: string, secret: string): string {
  // 암호화되지 않은 평문인 경우 (마이그레이션 전 데이터) 그대로 반환
  if (!encryptedText.includes(':')) return encryptedText;

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  try {
    const key = getKey(secret);
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // 복호화 실패 시 평문으로 취급 (기존 데이터 호환)
    return encryptedText;
  }
}
