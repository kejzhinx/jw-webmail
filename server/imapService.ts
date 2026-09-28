/**
 * Mailcow & Bluehost IMAP Service
 * 
 * Provides stateless IMAP connection and mailbox operations against
 * the Bluehost mail server running the email domain.
 * 
 * Bluehost is the canonical source of truth for mailboxes, accumulated storage,
 * messages, folders, flags, and attachments.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { EmailAttachment, EmailMessage, FolderType } from '../src/types.js';

export interface ImapConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface ImapFolderInfo {
  name: string;
  path: string;
  specialUse?: string;
  unreadCount?: number;
  totalCount?: number;
}

export interface QuotaInfo {
  usedBytes: number;
  totalBytes: number;
  usedMb: number;
  totalMb: number;
  percent: number;
}

export interface BluehostFolderStorageStat {
  name: string;
  path: string;
  messages: number;
  sizeBytes: number;
  sizeMb: number;
}

export interface BluehostMailboxStorageResult {
  email: string;
  host: string;
  connected: boolean;
  usedBytes: number;
  usedMb: number;
  quotaBytes: number;
  quotaMb: number;
  percent: number;
  messageCount: number;
  folders: BluehostFolderStorageStat[];
  source: 'bluehost_quota' | 'bluehost_folder_scan' | 'cached' | 'fallback';
  lastSyncedAt: string;
  error?: string;
}

// In-memory cache for Bluehost mailbox storage results (TTL = 5 minutes)
const bluehostStorageCache = new Map<string, { data: BluehostMailboxStorageResult; timestamp: number }>();
const BLUEHOST_STORAGE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Creates an ImapFlow client configured for Bluehost/Mailcow
 */
export function createMailcowImapClient(config: ImapConnectionConfig): ImapFlow {
  // Direct TLS on port 993, STARTTLS on 143
  const isSecure = config.port === 993 ? true : (config.secure ?? false);

  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false, // Allows self-signed or Let's Encrypt certificates
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
  });
}

/**
 * Categorize and sanitize IMAP errors
 */
export function sanitizeImapError(err: any): string {
  if (!err) return 'Unknown mail server error';
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toUpperCase();
  const resp = ((err.responseText || '') + ' ' + (err.response || '')).toLowerCase();
  const serverCode = (err.serverResponseCode || '').toUpperCase();

  if (
    err.authenticationFailed ||
    serverCode.includes('AUTHENTICATIONFAILED') ||
    resp.includes('authentication failed') ||
    code === 'EAUTH' ||
    msg.includes('authentication') ||
    msg.includes('invalid credentials') ||
    msg.includes('login failed')
  ) {
    return 'Authentication failed: Invalid mailbox username or password.';
  }

  if (code === 'ECONNREFUSED' || msg.includes('connection refused')) {
    return 'Connection refused: Bluehost IMAP server rejected connection. Verify port 993/143.';
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('getaddrinfo')) {
    return 'Host unreachable: Unable to resolve Bluehost mail host. Verify domain DNS records.';
  }

  if (code === 'ETIMEDOUT' || msg.includes('timeout') || msg.includes('timed out')) {
    return 'Connection timed out: Bluehost mail server did not respond.';
  }

  if (code.includes('TLS') || code.includes('CERT') || msg.includes('ssl') || msg.includes('handshake')) {
    return 'TLS error: SSL/TLS handshake failed with Bluehost IMAP server.';
  }

  if (msg.includes('quota') || resp.includes('over quota') || serverCode.includes('OVERQUOTA')) {
    return 'Mailbox quota exceeded on Bluehost mail server.';
  }

  return err.responseText || err.message || 'IMAP operation failed';
}

/**
 * Resolves IMAP path for logical folders (INBOX, Sent, Drafts, Trash, Junk)
 */
export async function resolveImapPath(client: ImapFlow, requestedFolder: string): Promise<string> {
  const mailboxes = await client.list();
  const target = requestedFolder.toLowerCase().trim();

  // 1. Check special-use attributes
  for (const mb of mailboxes) {
    const specialUse = (mb.specialUse || '').toLowerCase();
    if (target === 'inbox' && (mb.path.toUpperCase() === 'INBOX' || specialUse === '\\inbox')) return mb.path;
    if (target === 'sent' && (specialUse === '\\sent' || mb.path.toLowerCase().includes('sent'))) return mb.path;
    if (target === 'trash' && (specialUse === '\\trash' || mb.path.toLowerCase().includes('trash') || mb.path.toLowerCase().includes('deleted'))) return mb.path;
    if ((target === 'spam' || target === 'junk') && (specialUse === '\\junk' || specialUse === '\\spam' || mb.path.toLowerCase().includes('junk') || mb.path.toLowerCase().includes('spam'))) return mb.path;
    if (target === 'drafts' && (specialUse === '\\drafts' || mb.path.toLowerCase().includes('draft'))) return mb.path;
    if (target === 'archive' && (specialUse === '\\archive' || mb.path.toLowerCase().includes('archive'))) return mb.path;
  }

  // 2. Exact or normalized matching
  for (const mb of mailboxes) {
    if (mb.path.toLowerCase() === target || mb.name.toLowerCase() === target) {
      return mb.path;
    }
  }

  return target === 'inbox' ? 'INBOX' : requestedFolder;
}

/**
 * Get real-time mailbox quota from Bluehost Dovecot via IMAP RFC 2087
 */
export async function getImapQuota(client: ImapFlow): Promise<QuotaInfo | null> {
  try {
    const quotaData = await client.getQuota('INBOX');
    if (quotaData && quotaData.storage) {
      const storageObj = quotaData.storage as any;
      const usedKb = storageObj.used !== undefined ? storageObj.used : (storageObj.usage || 0);
      const limitKb = storageObj.limit !== undefined ? storageObj.limit : 0;
      const usedBytes = usedKb * 1024;
      const totalBytes = limitKb * 1024;
      const usedMb = Number((usedBytes / (1024 * 1024)).toFixed(2));
      const totalMb = Math.round(totalBytes / (1024 * 1024));
      const percent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
      return {
        usedBytes,
        totalBytes,
        usedMb,
        totalMb,
        percent,
      };
    }
    return null;
  } catch {
    // Quota extension may not be advertised or root not set; safe fallback
    return null;
  }
}

/**
 * Fetches real-time accumulated storage and quota metrics directly from Bluehost IMAP server
 * for a specified mailbox user.
 */
export async function fetchBluehostMailboxLiveStorage(
  config: ImapConnectionConfig,
  forceRefresh = false
): Promise<BluehostMailboxStorageResult> {
  const normEmail = (config.user || '').trim().toLowerCase();
  const now = Date.now();

  if (!forceRefresh && normEmail && bluehostStorageCache.has(normEmail)) {
    const cached = bluehostStorageCache.get(normEmail)!;
    if (now - cached.timestamp < BLUEHOST_STORAGE_CACHE_TTL) {
      return cached.data;
    }
  }

  const host = config.host || process.env.IMAP_HOST || 'mail.playbook.com.ph';
  const port = Number(config.port || process.env.IMAP_PORT || 993);
  const user = (config.user || '').trim();
  const pass = config.pass || '';

  const fallbackResult: BluehostMailboxStorageResult = {
    email: user,
    host,
    connected: false,
    usedBytes: 0,
    usedMb: 0,
    quotaBytes: 2048 * 1024 * 1024,
    quotaMb: 2048,
    percent: 0,
    messageCount: 0,
    folders: [],
    source: 'fallback',
    lastSyncedAt: new Date().toISOString(),
  };

  if (!user || !pass) {
    fallbackResult.error = 'Missing credentials for Bluehost IMAP connection.';
    return fallbackResult;
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993 ? true : (config.secure ?? false),
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });

  try {
    await client.connect();

    // 1. Check RFC 2087 IMAP QUOTA
    let quotaUsedKb = 0;
    let quotaLimitKb = 0;
    try {
      const q = await client.getQuota('INBOX');
      if (q && q.storage) {
        quotaUsedKb = (q.storage as any).used !== undefined ? (q.storage as any).used : ((q.storage as any).usage || 0);
        quotaLimitKb = (q.storage as any).limit !== undefined ? (q.storage as any).limit : 0;
      }
    } catch {
      // Quota extension not present or unsupported
    }

    // 2. Scan all mailboxes on Bluehost to calculate exact message count & accumulated sizes
    let totalMessages = 0;
    let totalScanBytes = 0;
    const folderStats: BluehostFolderStorageStat[] = [];

    const mailboxes = await client.list();
    for (const mb of mailboxes) {
      let folderBytes = 0;
      let folderMsgs = 0;
      try {
        const lock = await client.getMailboxLock(mb.path);
        try {
          const exists = client.mailbox ? client.mailbox.exists : 0;
          folderMsgs = exists;
          totalMessages += exists;
          if (exists > 0) {
            for await (const msg of client.fetch('1:*', { size: true, uid: true })) {
              folderBytes += (msg.size || 0);
            }
          }
        } finally {
          lock.release();
        }
      } catch (err: any) {
        console.warn(`[Bluehost Storage] Folder scan error for ${mb.path} (${user}):`, err.message);
      }

      totalScanBytes += folderBytes;
      folderStats.push({
        name: mb.name || mb.path,
        path: mb.path,
        messages: folderMsgs,
        sizeBytes: folderBytes,
        sizeMb: Number((folderBytes / (1024 * 1024)).toFixed(2)),
      });
    }

    await client.logout();

    let authoritativeUsedBytes = totalScanBytes;
    
    // Only fall back to previous cached storage if there were messages found but folder scan failed to fetch size
    if (authoritativeUsedBytes === 0 && totalMessages > 0 && normEmail && bluehostStorageCache.has(normEmail)) {
      const prev = bluehostStorageCache.get(normEmail)?.data;
      if (prev && prev.usedBytes > 0) {
        authoritativeUsedBytes = prev.usedBytes;
      }
    }

    const usedMb = Number((authoritativeUsedBytes / (1024 * 1024)).toFixed(2));
    
    // If quota limit is cPanel host-wide (> 50GB = 52428800 KB), default per-mailbox quota to 2048 MB (2 GB)
    const MAX_REASONABLE_QUOTA_KB = 50 * 1024 * 1024; // 50 GB
    const validQuotaKb = quotaLimitKb > 0 && quotaLimitKb <= MAX_REASONABLE_QUOTA_KB ? quotaLimitKb : 0;
    
    const quotaLimitBytes = validQuotaKb > 0 ? validQuotaKb * 1024 : 2048 * 1024 * 1024;
    const quotaMb = validQuotaKb > 0 ? Math.round(validQuotaKb / 1024) : 2048;
    const percent = quotaLimitBytes > 0 ? Math.min(100, Math.round((authoritativeUsedBytes / quotaLimitBytes) * 100)) : 0;

    const result: BluehostMailboxStorageResult = {
      email: user,
      host,
      connected: true,
      usedBytes: authoritativeUsedBytes,
      usedMb,
      quotaBytes: quotaLimitBytes,
      quotaMb,
      percent,
      messageCount: totalMessages,
      folders: folderStats,
      source: 'bluehost_folder_scan',
      lastSyncedAt: new Date().toISOString(),
    };

    if (normEmail) {
      bluehostStorageCache.set(normEmail, { data: result, timestamp: now });
    }

    return result;
  } catch (err: any) {
    try { await client.logout(); } catch {}
    
    // Fall back to previous cached storage if connection/scan failed transiently
    if (normEmail && bluehostStorageCache.has(normEmail)) {
      const prev = bluehostStorageCache.get(normEmail)?.data;
      if (prev && prev.usedBytes > 0) {
        return prev;
      }
    }

    fallbackResult.error = sanitizeImapError(err);
    if (normEmail) {
      bluehostStorageCache.set(normEmail, { data: fallbackResult, timestamp: now });
    }
    return fallbackResult;
  }
}

/**
 * Returns cached Bluehost storage for a user or null
 */
export function getCachedBluehostStorage(email: string): BluehostMailboxStorageResult | null {
  const normEmail = (email || '').trim().toLowerCase();
  const cached = bluehostStorageCache.get(normEmail);
  return cached ? cached.data : null;
}

/**
 * Invalidate cached Bluehost storage for a user to force fresh host sync
 */
export function invalidateBluehostStorageCache(email: string): void {
  const normEmail = (email || '').trim().toLowerCase();
  if (normEmail) {
    bluehostStorageCache.delete(normEmail);
  }
}


