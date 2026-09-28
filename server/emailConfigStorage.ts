import { getDoc, setDoc } from './db.js';
import crypto from 'crypto';

export interface EmailServerSettings {
  id?: string;
  providerName?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapEncryption: 'SSL/TLS' | 'STARTTLS' | 'None';
  imapUsername: string;
  imapPassword?: string;
  imapPasswordConfigured?: boolean;
  imapStatus: 'connected' | 'untested' | 'failed';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpEncryption: 'SSL/TLS' | 'STARTTLS' | 'None';
  smtpUsername: string;
  smtpPassword?: string;
  smtpPasswordConfigured?: boolean;
  smtpStatus: 'connected' | 'untested' | 'failed';
  lastConnectionTest?: string;
  updatedAt?: string;
}

// Derive 32-byte AES-256 Key
const ENCRYPTION_SECRET =
  process.env.ENCRYPTION_SECRET ||
  process.env.SESSION_SECRET ||
  'jw-playbook-enterprise-secure-key-salt-2026';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

/**
 * Encrypt sensitive strings using AES-256-GCM
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext) return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[Crypto] Encryption error:', err);
    return '';
  }
}

/**
 * Decrypt sensitive strings using AES-256-GCM
 */
export function decryptCredential(ciphertext: string): string {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('enc:')) {
    // If plaintext legacy value exists, return it
    return ciphertext;
  }
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 4) return '';
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encData = parts[3];
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto] Decryption error:', err);
    return '';
  }
}

interface StoredEncryptedConfig {
  providerName: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapEncryption: 'SSL/TLS' | 'STARTTLS' | 'None';
  imapUsername: string;
  imapPasswordEnc?: string;
  imapStatus: 'connected' | 'untested' | 'failed';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpEncryption: 'SSL/TLS' | 'STARTTLS' | 'None';
  smtpUsername: string;
  smtpPasswordEnc?: string;
  smtpStatus: 'connected' | 'untested' | 'failed';
  lastConnectionTest?: string;
  updatedAt?: string;
}

let cachedConfig: EmailServerSettings | null = null;

async function loadConfigFromFirestore(): Promise<EmailServerSettings> {
  try {
    const parsed = await getDoc<StoredEncryptedConfig>('settings', 'email_server');
    if (parsed) {
      const defaults: EmailServerSettings = {
        providerName: 'Custom / Bluehost',
        imapHost: process.env.IMAP_HOST || 'mail.playbook.com.ph',
        imapPort: Number(process.env.IMAP_PORT || 993),
        imapSecure: true,
        imapEncryption: 'SSL/TLS',
        imapUsername: process.env.IMAP_USER || 'jw@playbook.com.ph',
        imapPassword: process.env.IMAP_PASSWORD || '',
        imapPasswordConfigured: Boolean(process.env.IMAP_PASSWORD),
        imapStatus: 'untested',
        smtpHost: process.env.SMTP_HOST || 'mail.playbook.com.ph',
        smtpPort: Number(process.env.SMTP_PORT || 465),
        smtpSecure: true,
        smtpEncryption: 'SSL/TLS',
        smtpUsername: process.env.SMTP_USER || 'jw@playbook.com.ph',
        smtpPassword: process.env.SMTP_PASSWORD || '',
        smtpPasswordConfigured: Boolean(process.env.SMTP_PASSWORD),
        smtpStatus: 'untested',
        updatedAt: new Date().toISOString(),
      };

      const config: EmailServerSettings = {
        providerName: parsed.providerName || defaults.providerName,
        imapHost: parsed.imapHost || defaults.imapHost,
        imapPort: parsed.imapPort || defaults.imapPort,
        imapSecure: parsed.imapSecure !== undefined ? parsed.imapSecure : defaults.imapSecure,
        imapEncryption: parsed.imapEncryption || defaults.imapEncryption,
        imapUsername: parsed.imapUsername || defaults.imapUsername,
        imapPassword: parsed.imapPasswordEnc ? decryptCredential(parsed.imapPasswordEnc) : defaults.imapPassword,
        imapPasswordConfigured: Boolean(parsed.imapPasswordEnc || defaults.imapPassword),
        imapStatus: parsed.imapStatus || defaults.imapStatus,
        smtpHost: parsed.smtpHost || defaults.smtpHost,
        smtpPort: parsed.smtpPort || defaults.smtpPort,
        smtpSecure: parsed.smtpSecure !== undefined ? parsed.smtpSecure : defaults.smtpSecure,
        smtpEncryption: parsed.smtpEncryption || defaults.smtpEncryption,
        smtpUsername: parsed.smtpUsername || defaults.smtpUsername,
        smtpPassword: parsed.smtpPasswordEnc ? decryptCredential(parsed.smtpPasswordEnc) : defaults.smtpPassword,
        smtpPasswordConfigured: Boolean(parsed.smtpPasswordEnc || defaults.smtpPassword),
        smtpStatus: parsed.smtpStatus || defaults.smtpStatus,
        lastConnectionTest: parsed.lastConnectionTest,
        updatedAt: parsed.updatedAt || defaults.updatedAt,
      };

      cachedConfig = config;
      return config;
    }
  } catch (err) {
    console.error('[EmailConfig] Failed to load from Firestore:', err);
  }

  // Fallback to defaults
  const defaults: EmailServerSettings = {
    providerName: 'Custom / Bluehost',
    imapHost: process.env.IMAP_HOST || 'mail.playbook.com.ph',
    imapPort: Number(process.env.IMAP_PORT || 993),
    imapSecure: true,
    imapEncryption: 'SSL/TLS',
    imapUsername: process.env.IMAP_USER || 'jw@playbook.com.ph',
    imapPassword: process.env.IMAP_PASSWORD || '',
    imapPasswordConfigured: Boolean(process.env.IMAP_PASSWORD),
    imapStatus: 'untested',
    smtpHost: process.env.SMTP_HOST || 'mail.playbook.com.ph',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: true,
    smtpEncryption: 'SSL/TLS',
    smtpUsername: process.env.SMTP_USER || 'jw@playbook.com.ph',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    smtpPasswordConfigured: Boolean(process.env.SMTP_PASSWORD),
    smtpStatus: 'untested',
    updatedAt: new Date().toISOString(),
  };

  cachedConfig = defaults;
  return defaults;
}

export async function getInternalEmailConfig(): Promise<EmailServerSettings> {
  if (cachedConfig) return cachedConfig;
  return await loadConfigFromFirestore();
}

export async function getSafeClientEmailConfig(): Promise<EmailServerSettings> {
  const internal = await getInternalEmailConfig();

  return {
    ...internal,
    imapPassword: '',
    smtpPassword: '',
  };
}

export async function updateEmailConfig(
  updates: Partial<EmailServerSettings> & {
    newImapPassword?: string;
    newSmtpPassword?: string;
  }
): Promise<EmailServerSettings> {
  const current = await getInternalEmailConfig();

  let updatedImapPass = current.imapPassword;
  const imapPassInput = updates.newImapPassword ?? updates.imapPassword;
  if (
    imapPassInput !== undefined &&
    imapPassInput.trim() !== '' &&
    !imapPassInput.startsWith('••••') &&
    !imapPassInput.startsWith('***')
  ) {
    updatedImapPass = imapPassInput.trim();
  }

  let updatedSmtpPass = current.smtpPassword;
  const smtpPassInput = updates.newSmtpPassword ?? updates.smtpPassword;
  if (
    smtpPassInput !== undefined &&
    smtpPassInput.trim() !== '' &&
    !smtpPassInput.startsWith('••••') &&
    !smtpPassInput.startsWith('***')
  ) {
    updatedSmtpPass = smtpPassInput.trim();
  }

  const imapPort = updates.imapPort ? Number(updates.imapPort) : current.imapPort;
  const imapEncryption = updates.imapEncryption ?? current.imapEncryption;
  const imapSecure = imapPort === 993 || imapEncryption === 'SSL/TLS' || Boolean(updates.imapSecure);

  const smtpPort = updates.smtpPort ? Number(updates.smtpPort) : current.smtpPort;
  const smtpEncryption = updates.smtpEncryption ?? current.smtpEncryption;
  const smtpSecure = smtpPort === 465 || smtpEncryption === 'SSL/TLS' || Boolean(updates.smtpSecure);

  const updated: EmailServerSettings = {
    ...current,
    providerName: updates.providerName ?? current.providerName,
    imapHost: updates.imapHost ?? current.imapHost,
    imapPort,
    imapSecure,
    imapEncryption,
    imapUsername: updates.imapUsername ?? current.imapUsername,
    imapPassword: updatedImapPass,
    imapPasswordConfigured: Boolean(updatedImapPass),
    imapStatus: updates.imapStatus ?? current.imapStatus,
    smtpHost: updates.smtpHost ?? current.smtpHost,
    smtpPort,
    smtpSecure,
    smtpEncryption,
    smtpUsername: updates.smtpUsername ?? current.smtpUsername,
    smtpPassword: updatedSmtpPass,
    smtpPasswordConfigured: Boolean(updatedSmtpPass),
    smtpStatus: updates.smtpStatus ?? current.smtpStatus,
    lastConnectionTest: updates.lastConnectionTest ?? current.lastConnectionTest,
    updatedAt: new Date().toISOString(),
  };

  cachedConfig = updated;

  const encryptedData: StoredEncryptedConfig = {
    providerName: updated.providerName || 'Custom / Bluehost',
    imapHost: updated.imapHost,
    imapPort: updated.imapPort,
    imapSecure: updated.imapSecure,
    imapEncryption: updated.imapEncryption,
    imapUsername: updated.imapUsername,
    imapPasswordEnc: encryptCredential(updated.imapPassword || ''),
    imapStatus: updated.imapStatus,
    smtpHost: updated.smtpHost,
    smtpPort: updated.smtpPort,
    smtpSecure: updated.smtpSecure,
    smtpEncryption: updated.smtpEncryption,
    smtpUsername: updated.smtpUsername,
    smtpPasswordEnc: encryptCredential(updated.smtpPassword || ''),
    smtpStatus: updated.smtpStatus,
    lastConnectionTest: updated.lastConnectionTest,
    updatedAt: updated.updatedAt,
  };

  try {
    await setDoc('settings', 'email_server', encryptedData);
  } catch (err) {
    console.error('[EmailConfig] Failed to save to Firestore:', err);
  }

  return await getSafeClientEmailConfig();
}

export async function updateConnectionTestResult(results: {
  imapStatus?: 'connected' | 'failed';
  smtpStatus?: 'connected' | 'failed';
  timestamp?: string;
}) {
  const current = await getInternalEmailConfig();
  const updated: EmailServerSettings = {
    ...current,
    imapStatus: results.imapStatus ?? current.imapStatus,
    smtpStatus: results.smtpStatus ?? current.smtpStatus,
    lastConnectionTest: results.timestamp || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  cachedConfig = updated;
  try {
    await setDoc('settings', 'email_server', {
      ...updated,
      imapPasswordEnc: encryptCredential(updated.imapPassword || ''),
      smtpPasswordEnc: encryptCredential(updated.smtpPassword || ''),
    });
  } catch (err) {
    console.error('[EmailConfig] Failed to update connection test in Firestore:', err);
  }
}
