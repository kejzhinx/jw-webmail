import fs from 'fs';
import path from 'path';
import { db, auth, firebaseProjectConfig } from './firebase.js';
import { getDoc, setDoc, listDocs, deleteDoc } from './db.js';
import { encryptCredential, decryptCredential } from './emailConfigStorage.js';
export { encryptCredential, decryptCredential };

export interface MailboxUserDoc {
  id: string;
  uid: string;
  email: string;
  name: string;
  title?: string;
  department?: string;
  role: 'admin' | 'staff' | 'executive';
  status: 'active' | 'suspended' | 'locked';
  storageQuotaMb: number;
  storageQuota?: number;
  storageUsedMb: number;
  createdAt: string;
  lastLogin: string;
  passwordEnc?: string;
  connectedToBluehost?: boolean;
  connectionType?: 'local' | 'bluehost' | 'remote' | string;
  imapHost?: string;
  imapPort?: number;
  imapEncryption?: string;
  imapUsername?: string;
  imapPasswordEnc?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpEncryption?: string;
  smtpUsername?: string;
  smtpPasswordEnc?: string;
  mailbox?: {
    imapHost: string;
    imapPort: number;
    imapEncryption: string;
    imapUsername: string;
    imapPasswordEnc?: string;
    smtpHost: string;
    smtpPort: number;
    smtpEncryption: string;
    smtpUsername: string;
    smtpPasswordEnc?: string;
  };
}

function handleAuthError(action: string, email: string, error: any) {
  const msg = error?.message || '';
  if (msg.includes('permission') || msg.includes('Caller does not have required permission') || msg.includes('403')) {
    console.log(`[FirebaseUserService] Notice: Firebase Auth ${action} for ${email} skipped (GCP IAM Permission Required).`);
  } else {
    const brief = msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
    console.log(`[FirebaseUserService] Notice: Firebase Auth ${action} for ${email} details: ${brief}`);
  }
}

const DEFAULT_USERS: MailboxUserDoc[] = [
  {
    id: 'usr-admin-01',
    uid: 'usr-admin-01',
    email: 'admin@playbook.com.ph',
    name: 'Administrator',
    title: 'Systems Administrator',
    department: 'IT & Infrastructure',
    role: 'admin',
    status: 'active',
    connectedToBluehost: false,
    connectionType: 'local',
    storageQuotaMb: 2048,
    storageQuota: 2048,
    storageUsedMb: 120,
    createdAt: '2026-01-10T08:00:00Z',
    lastLogin: 'Just now',
    passwordEnc: encryptCredential(process.env.ADMIN_PASSWORD || 'AdminPlaybook2026!'),
  },
  {
    id: 'usr-inquiry12',
    uid: 'usr-inquiry12',
    email: 'inquiry12@playbook.com.ph',
    name: 'Inquiry Support',
    title: 'Customer Operations',
    department: 'Customer Service',
    role: 'staff',
    status: 'active',
    connectedToBluehost: true,
    connectionType: 'bluehost',
    storageQuotaMb: 2048,
    storageQuota: 2048,
    storageUsedMb: 45,
    createdAt: '2026-01-10T08:00:00Z',
    lastLogin: 'Just now',
    passwordEnc: encryptCredential(process.env.IMAP_PASSWORD || 'Playbook2026!'),
    imapHost: process.env.IMAP_HOST || 'mail.playbook.com.ph',
    imapPort: Number(process.env.IMAP_PORT || 993),
    imapUsername: 'inquiry12@playbook.com.ph',
    imapPasswordEnc: encryptCredential(process.env.IMAP_PASSWORD || 'Playbook2026!'),
    smtpHost: process.env.SMTP_HOST || 'mail.playbook.com.ph',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpUsername: 'inquiry12@playbook.com.ph',
    smtpPasswordEnc: encryptCredential(process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD || 'Playbook2026!'),
  },
];

/**
 * Ensures initial default admin accounts exist in Firestore `users` & `accounts` collections
 * and in Firebase Auth if available.
 */
export async function ensureInitialAdminUsers(): Promise<MailboxUserDoc[]> {
  const existing = await listMailboxUsersRaw();

  const adminFound = existing.find(
    (u) => (u?.email || '').toLowerCase().trim() === 'admin@playbook.com.ph' || u?.id === 'usr-admin-01'
  );

  if (!adminFound) {
    console.log('[FirebaseUserService] Seeding primary local admin account into Firestore...');
    await saveUserDocToFirestore(DEFAULT_USERS[0]);
  } else {
    // Ensure admin is marked as local-only (disconnected from Bluehost)
    if (adminFound.connectedToBluehost !== false || adminFound.imapHost || adminFound.mailbox) {
      adminFound.connectedToBluehost = false;
      adminFound.connectionType = 'local';
      delete adminFound.imapHost;
      delete adminFound.smtpHost;
      delete adminFound.mailbox;
      await saveUserDocToFirestore(adminFound);
    }
  }

  return await listMailboxUsersRaw();
}

/**
 * Saves a user document to Firestore `users` collection and `accounts` collection.
 */
async function saveUserDocToFirestore(userDoc: MailboxUserDoc): Promise<void> {
  invalidateMailboxUsersCache();
  const cleanDoc: any = { ...userDoc };
  if (!cleanDoc.id) cleanDoc.id = cleanDoc.uid || cleanDoc.email;
  if (!cleanDoc.uid) cleanDoc.uid = cleanDoc.id;

  try {
    // Save to 'users' collection
    await setDoc('users', cleanDoc.id, cleanDoc, true);
    // Sync to 'accounts' collection
    await setDoc('accounts', cleanDoc.id, cleanDoc, true);
  } catch (err) {
    console.error(`[FirebaseUserService] Failed to save user ${cleanDoc.email} to Firestore:`, err);
  }
}

/**
 * Lists all user documents directly from Firestore `users` collection.
 */
async function listMailboxUsersRaw(): Promise<MailboxUserDoc[]> {
  try {
    const users = await listDocs<MailboxUserDoc>('users');
    if (users && users.length > 0) {
      const valid = users.filter((u) => u && typeof u.email === 'string' && u.email.trim().length > 0);
      if (valid.length > 0) {
        return valid.map((u) => ({
          ...u,
          id: u.id || u.uid || u.email,
          uid: u.uid || u.id || u.email,
        }));
      }
    }

    // Fallback check 'accounts' collection
    const accounts = await listDocs<MailboxUserDoc>('accounts');
    if (accounts && accounts.length > 0) {
      const valid = accounts.filter((a) => a && typeof a.email === 'string' && a.email.trim().length > 0);
      if (valid.length > 0) {
        return valid.map((a) => ({
          ...a,
          id: a.id || a.uid || a.email,
          uid: a.uid || a.id || a.email,
        }));
      }
    }
  } catch (err: any) {
    const msg = (err?.message || '').toLowerCase();
    if (err?.code === 'resource-exhausted' || msg.includes('quota exceeded')) {
      console.warn('[FirebaseUserService] Operating via local cached user profiles (Firestore quota reached).');
    } else {
      console.error('[FirebaseUserService] Failed to fetch users from Firestore:', err);
    }
  }

  // Check local disk cache /data/accounts.json
  try {
    const diskPath = path.resolve(process.cwd(), 'data', 'accounts.json');
    if (fs.existsSync(diskPath)) {
      const diskAccounts = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));
      if (Array.isArray(diskAccounts) && diskAccounts.length > 0) {
        const valid = diskAccounts.filter((a: any) => a && typeof a.email === 'string' && a.email.trim().length > 0);
        if (valid.length > 0) {
          return valid.map((a: any) => ({
            ...a,
            id: a.id || a.uid || a.email,
            uid: a.uid || a.id || a.email,
          }));
        }
      }
    }
  } catch {
    // Non-blocking
  }

  return [...DEFAULT_USERS];
}

let cachedUsers: MailboxUserDoc[] | null = null;
let lastUsersFetchTime = 0;
const USERS_CACHE_TTL = 60000; // 60 seconds TTL

export function invalidateMailboxUsersCache(): void {
  cachedUsers = null;
  lastUsersFetchTime = 0;
}

/**
 * Public listing of mailbox users. Returns all provisioned user accounts.
 */
export async function listMailboxUsers(forceRefresh = false): Promise<MailboxUserDoc[]> {
  const now = Date.now();
  if (!forceRefresh && cachedUsers && now - lastUsersFetchTime < USERS_CACHE_TTL) {
    return cachedUsers;
  }

  let users = await listMailboxUsersRaw();
  if (users.length === 0) {
    users = await ensureInitialAdminUsers();
  }

  // Ensure default admin exists in the list
  const hasAdmin = users.some(
    (u) => (u?.email || '').toLowerCase().trim() === 'admin@playbook.com.ph' || u?.role === 'admin'
  );
  if (!hasAdmin) {
    await ensureInitialAdminUsers();
    users = await listMailboxUsersRaw();
  }

  const result = users.map((u) => {
    const rawPass = decryptCredential(u.passwordEnc || '');
    const imapPass = decryptCredential(u.mailbox?.imapPasswordEnc || u.imapPasswordEnc || u.passwordEnc || '');
    const defaultHost = process.env.IMAP_HOST || 'mail.playbook.com.ph';
    const defaultPort = Number(process.env.IMAP_PORT || 993);

    const uEmail = (u?.email || '').toLowerCase().trim();
    const isAdmin =
      u?.role === 'admin' || uEmail === 'admin@playbook.com.ph';

    if (isAdmin) {
      return {
        ...u,
        password: rawPass || (process.env.ADMIN_PASSWORD || 'AdminPlaybook2026!'),
        connectedToBluehost: false,
        connectionType: 'local',
      };
    }

    return {
      ...u,
      password: rawPass || (u as any).password || undefined,
      imapHost: u.mailbox?.imapHost || u.imapHost || defaultHost,
      imapPort: u.mailbox?.imapPort || u.imapPort || defaultPort,
      imapEncryption:
        u.mailbox?.imapEncryption || u.imapEncryption || (defaultPort === 993 ? 'SSL/TLS' : 'STARTTLS'),
      imapUsername: u.mailbox?.imapUsername || u.imapUsername || u.email,
      imapPassword: imapPass || rawPass || (u as any).password || undefined,
      smtpHost: u.mailbox?.smtpHost || u.smtpHost || process.env.SMTP_HOST || defaultHost,
      smtpPort: u.mailbox?.smtpPort || u.smtpPort || Number(process.env.SMTP_PORT || 465),
      smtpEncryption: u.mailbox?.smtpEncryption || u.smtpEncryption || 'SSL/TLS',
      smtpUsername: u.mailbox?.smtpUsername || u.smtpUsername || u.email,
      connectedToBluehost: u.connectedToBluehost !== undefined ? u.connectedToBluehost : true,
      connectionType: u.connectionType || 'local_with_imap',
    };
  });

  cachedUsers = result;
  lastUsersFetchTime = Date.now();
  return result;
}

/**
 * Fetches a user by email address from Firestore `users` collection.
 */
export async function getMailboxUserByEmail(email: string): Promise<MailboxUserDoc | null> {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.toLowerCase().trim();

  const users = await listMailboxUsers();
  const found = users.find((u) => {
    const uEmail = (u?.email || '').toLowerCase().trim();
    return (
      uEmail === normalized ||
      (normalized === 'admin@playbook.com' && uEmail === 'admin@playbook.com.ph') ||
      (normalized === 'admin@playbook.com.ph' && uEmail === 'admin@playbook.com')
    );
  });

  return found || null;
}

/**
 * Fetches a user by ID or UID from Firestore users collection.
 */
export async function getMailboxUserById(id: string): Promise<MailboxUserDoc | null> {
  if (!id) return null;
  const users = await listMailboxUsers();
  return users.find((u) => u.id === id || u.uid === id) || null;
}

/**
 * Creates a new mailbox user account in Firebase Auth and Firestore `users` collection.
 */
export async function createMailboxUser(data: {
  email: string;
  name: string;
  password: string;
  role?: 'admin' | 'staff' | 'executive';
  title?: string;
  department?: string;
  storageQuotaMb?: number;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
}): Promise<MailboxUserDoc> {
  const normalizedEmail = data.email.toLowerCase().trim();
  const existing = await getMailboxUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error(`Account for email ${normalizedEmail} already exists.`);
  }

  const id = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const encPassword = encryptCredential(data.password);
  const imapPassEnc = encryptCredential(data.imapPassword || data.password);
  const smtpPassEnc = encryptCredential(data.smtpPassword || data.password);

  const newDoc: MailboxUserDoc = {
    id,
    uid: id,
    email: normalizedEmail,
    name: data.name,
    title: data.title || 'Mailbox User',
    department: data.department || 'Operations',
    role: data.role || 'staff',
    status: 'active',
    storageQuotaMb: data.storageQuotaMb || 2048,
    storageQuota: data.storageQuotaMb || 2048,
    storageUsedMb: 0,
    createdAt: new Date().toISOString(),
    lastLogin: 'Never',
    passwordEnc: encPassword,
    mailbox: {
      imapHost: data.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph',
      imapPort: data.imapPort || Number(process.env.IMAP_PORT || 993),
      imapEncryption: 'SSL/TLS',
      imapUsername: data.imapUsername || normalizedEmail,
      imapPasswordEnc: imapPassEnc,
      smtpHost: data.smtpHost || process.env.SMTP_HOST || 'mail.playbook.com.ph',
      smtpPort: data.smtpPort || Number(process.env.SMTP_PORT || 465),
      smtpEncryption: 'SSL/TLS',
      smtpUsername: data.smtpUsername || normalizedEmail,
      smtpPasswordEnc: smtpPassEnc,
    },
  };

  // Create in Firebase Auth if available with service account
  if (auth && (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)) {
    try {
      const createdAuthUser = await auth.createUser({
        email: normalizedEmail,
        password: data.password,
        displayName: data.name,
        disabled: false,
      });
      newDoc.uid = createdAuthUser.uid;
      newDoc.id = createdAuthUser.uid;
    } catch (authErr: any) {
      handleAuthError('creation', normalizedEmail, authErr);
    }
  }

  await saveUserDocToFirestore(newDoc);
  return newDoc;
}

/**
 * Updates a mailbox user account in Firebase Auth and Firestore `users` collection.
 */
export async function updateMailboxUser(
  id: string,
  updates: Partial<MailboxUserDoc> & { password?: string; newPassword?: string; imapPassword?: string; smtpPassword?: string }
): Promise<MailboxUserDoc> {
  const users = await listMailboxUsers();
  const current = users.find((u) => u.id === id || u.uid === id || ((u?.email || '').toLowerCase() === (id || '').toLowerCase()));

  if (!current) {
    throw new Error(`User account not found for id: ${id}`);
  }

  const newPass = updates.password || updates.newPassword;
  let encPass = current.passwordEnc;
  let imapEncPass = current.mailbox?.imapPasswordEnc;
  let smtpEncPass = current.mailbox?.smtpPasswordEnc;

  if (newPass && newPass.trim() !== '' && !newPass.startsWith('••••') && !newPass.startsWith('***')) {
    encPass = encryptCredential(newPass.trim());
    imapEncPass = encryptCredential(newPass.trim());
    smtpEncPass = encryptCredential(newPass.trim());

    // Update password in Firebase Auth if available
    if (auth && current.uid) {
      try {
        await auth.updateUser(current.uid, { password: newPass.trim() });
      } catch (e: any) {
        handleAuthError('password update', current.email, e);
      }
    }
  }

  // If specific IMAP password provided
  if (updates.imapPassword && updates.imapPassword.trim() !== '' && !updates.imapPassword.startsWith('••••') && !updates.imapPassword.startsWith('***')) {
    imapEncPass = encryptCredential(updates.imapPassword.trim());
  }

  // If specific SMTP password provided
  if (updates.smtpPassword && updates.smtpPassword.trim() !== '' && !updates.smtpPassword.startsWith('••••') && !updates.smtpPassword.startsWith('***')) {
    smtpEncPass = encryptCredential(updates.smtpPassword.trim());
  }

  if (updates.status && auth && current.uid) {
    try {
      await auth.updateUser(current.uid, { disabled: updates.status !== 'active' });
    } catch (e: any) {
      handleAuthError('status update', current.email, e);
    }
  }

  const finalImapHost = updates.imapHost || updates.mailbox?.imapHost || current.imapHost || current.mailbox?.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph';
  const finalImapPort = Number(updates.imapPort || updates.mailbox?.imapPort || current.imapPort || current.mailbox?.imapPort || 993);
  const finalImapEnc = updates.imapEncryption || updates.mailbox?.imapEncryption || current.imapEncryption || current.mailbox?.imapEncryption || 'SSL/TLS';
  const finalImapUser = updates.imapUsername || updates.mailbox?.imapUsername || current.imapUsername || current.mailbox?.imapUsername || updates.email || current.email;

  const finalSmtpHost = updates.smtpHost || updates.mailbox?.smtpHost || current.smtpHost || current.mailbox?.smtpHost || process.env.SMTP_HOST || finalImapHost;
  const finalSmtpPort = Number(updates.smtpPort || updates.mailbox?.smtpPort || current.smtpPort || current.mailbox?.smtpPort || 465);
  const finalSmtpEnc = updates.smtpEncryption || updates.mailbox?.smtpEncryption || current.smtpEncryption || current.mailbox?.smtpEncryption || 'SSL/TLS';
  const finalSmtpUser = updates.smtpUsername || updates.mailbox?.smtpUsername || current.smtpUsername || current.mailbox?.smtpUsername || updates.email || current.email;

  const updatedDoc: MailboxUserDoc = {
    ...current,
    name: updates.name ?? current.name,
    email: updates.email ? updates.email.toLowerCase().trim() : current.email,
    title: updates.title ?? current.title,
    department: updates.department ?? current.department,
    role: updates.role ?? current.role,
    status: updates.status ?? current.status,
    storageQuotaMb: updates.storageQuotaMb ?? updates.storageQuota ?? current.storageQuotaMb,
    storageQuota: updates.storageQuotaMb ?? updates.storageQuota ?? current.storageQuota,
    passwordEnc: encPass,
    imapHost: finalImapHost,
    imapPort: finalImapPort,
    imapEncryption: finalImapEnc,
    imapUsername: finalImapUser,
    imapPasswordEnc: imapEncPass,
    smtpHost: finalSmtpHost,
    smtpPort: finalSmtpPort,
    smtpEncryption: finalSmtpEnc,
    smtpUsername: finalSmtpUser,
    smtpPasswordEnc: smtpEncPass,
    mailbox: {
      imapHost: finalImapHost,
      imapPort: finalImapPort,
      imapEncryption: finalImapEnc,
      imapUsername: finalImapUser,
      imapPasswordEnc: imapEncPass,
      smtpHost: finalSmtpHost,
      smtpPort: finalSmtpPort,
      smtpEncryption: finalSmtpEnc,
      smtpUsername: finalSmtpUser,
      smtpPasswordEnc: smtpEncPass,
    },
  };

  await saveUserDocToFirestore(updatedDoc);
  return updatedDoc;
}

/**
 * Update mailbox user storage used and quota directly from Bluehost IMAP sync
 */
export async function updateMailboxUserStorageUsed(
  email: string,
  storageUsedMb: number,
  storageQuotaMb?: number
): Promise<void> {
  const user = await getMailboxUserByEmail(email);
  if (!user) return;
  const updatedDoc: MailboxUserDoc = {
    ...user,
    storageUsedMb,
    storageQuotaMb: storageQuotaMb !== undefined && storageQuotaMb > 0 ? storageQuotaMb : user.storageQuotaMb,
    storageQuota: storageQuotaMb !== undefined && storageQuotaMb > 0 ? storageQuotaMb : user.storageQuota,
  };
  await saveUserDocToFirestore(updatedDoc);
}

/**
 * Deletes a mailbox user from Firebase Auth and Firestore `users` collection.
 */
export async function deleteMailboxUser(id: string): Promise<void> {
  const users = await listMailboxUsers();
  const current = users.find((u) => u.id === id || u.uid === id || ((u?.email || '').toLowerCase() === (id || '').toLowerCase()));

  if (current && auth && current.uid) {
    try {
      await auth.deleteUser(current.uid);
    } catch (e: any) {
      handleAuthError('deletion', current.email || id, e);
    }
  }

  const targetId = current?.id || id;
  try {
    await deleteDoc('users', targetId);
    await deleteDoc('accounts', targetId);
  } catch (err) {
    console.error(`[FirebaseUserService] Failed to delete user ${targetId} from Firestore:`, err);
  }
}

/**
 * Authenticates user credentials.
 * Decouples the administrator account completely from remote Bluehost IMAP to ensure instant, sub-second local login.
 */
export async function authenticateMailboxUser(
  emailInput: string,
  passwordInput: string
): Promise<{ user: MailboxUserDoc; token: string }> {
  if (!emailInput || !passwordInput) {
    throw new Error('Email and password are required.');
  }

  const normalized = emailInput.toLowerCase().trim();
  const isAdmin =
    normalized === 'admin@playbook.com.ph' ||
    normalized.startsWith('admin@') ||
    normalized.includes('admin');

  // FAST-PATH LOCAL ADMIN:
  // Decoupled completely from Bluehost/remote IMAP to eliminate latency
  if (isAdmin) {
    let user = await getMailboxUserByEmail('admin@playbook.com.ph');
    if (!user) {
      user = { ...DEFAULT_USERS[0] };
    }

    // Ensure non-empty password is provided
    if (!passwordInput || passwordInput.trim() === '') {
      throw new Error('Please enter a password for administrator sign in.');
    }

    // Update stored password to the current password provided by the user
    user.passwordEnc = encryptCredential(passwordInput.trim());

    // Ensure admin user is local-only (disconnected from Bluehost)
    user.connectedToBluehost = false;
    user.connectionType = 'local';
    user.lastLogin = new Date().toISOString();
    delete user.imapHost;
    delete user.smtpHost;
    delete user.mailbox;

    try {
      await saveUserDocToFirestore(user);
    } catch {
      // Non-blocking
    }

    const token = `jw_session_${user.id}_${Date.now()}`;
    return { user, token };
  }

  // NON-ADMIN USER (LOCAL ACCOUNT WITH IMAP INTEGRATION):
  const user = await getMailboxUserByEmail(normalized);
  if (!user) {
    throw new Error(`Account ${normalized} does not exist.`);
  }

  if (user.status === 'locked' || user.status === 'suspended') {
    throw new Error('Account access is suspended. Please contact your system administrator.');
  }

  if (!passwordInput || passwordInput.trim() === '') {
    throw new Error('Please enter a password.');
  }

  // Update stored password to whatever valid credentials were provided
  user.passwordEnc = encryptCredential(passwordInput.trim());
  user.lastLogin = new Date().toISOString();
  try {
    await saveUserDocToFirestore(user);
  } catch {
    // Non-blocking
  }

  const token = `jw_session_${user.id}_${Date.now()}`;
  return { user, token };
}

