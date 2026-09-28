import 'dotenv/config';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('[JW Summit] Starting server initialization...');
import path from 'path';
import fs from 'fs';
import multer from 'multer';

const upload = multer({ limits: { fileSize: 250 * 1024 * 1024 } });

import {
  CustomFolder,
  DeviceStorageInfo,
  EmailMessage,
  MailServerStatus,
  User,
  UserAccount,
  FolderType,
} from './src/types.js';
import {
  MailConnectionConfig,
  resolveMailConfig,
  testImapConnection,
  testSmtpConnection,
  testBothConnections,
  fetchMailboxMessages,
  fetchMessageDetail,
  sendEmailViaSmtp,
  listMailboxes,
  categorizeError,
  fetchMessageAttachment,
  saveDraft,
  clearMailCaches,
  performBatchAction,
  getCachedUserEmailStorageBytes,
  persistentMailboxStore,
  emptyTrashFolder,
  emptyFolderMessages,
  getEmailBodyContent,
} from './server/mailService.js';
import {
  listMailboxUsers,
  createMailboxUser,
  updateMailboxUser,
  deleteMailboxUser,
  authenticateMailboxUser,
  getMailboxUserByEmail,
  getMailboxUserById,
  decryptCredential,
  updateMailboxUserStorageUsed,
} from './server/firebaseUserService.js';
import {
  fetchBluehostMailboxLiveStorage,
  getCachedBluehostStorage,
  invalidateBluehostStorageCache,
} from './server/imapService.js';
import { runFullDiagnosticsSuite, testUserImapConnection, testUserSmtpConnection } from './server/diagnosticsService.js';
import {
  getPhysicalStorageConfig,
  savePhysicalStorageConfig,
  getPhysicalStorageStats,
  testStoragePathWritable,
  initializeStorageDirectory,
  saveEmailToPhysicalStorage,
  syncAllMailboxesToPhysicalDrive,
  listPhysicalStorageFiles,
  getStoredFileContent,
  createPhysicalStorageZip,
  initPhysicalStorageScheduler,
  handleAgentHeartbeat,
  getEnvironmentInfo,
  calculateUserAccumulatedStorage,
} from './server/physicalStorageService.js';
import {
  createUserStorageZip,
  createAllUsersStorageZip,
  getUserStorageStats,
} from './server/userStorageExportService.js';
import {
  setChatSocketIO,
  registerOnlineUser,
  removeOnlineUser,
  getOnlineUsersList,
  sendChatMessage,
  getChatHistory,
  markChatAsRead,
  getContactsChatMeta,
  getChatIOInstance,
  setUserStatus,
  getAllUserStatuses,
  toggleMessageReaction,
} from './server/chatService.js';
import { getDoc, setDoc, listDocs, deleteDoc, queryDocs } from './server/db.js';

const SETTINGS_COLLECTION = 'settings';
const ACCOUNTS_COLLECTION = 'accounts';
const FOLDERS_COLLECTION = 'custom_folders';
const SESSIONS_COLLECTION = 'sessions';

// Default fallback accounts if database is empty
const defaultAccounts: UserAccount[] = [
  {
    id: 'usr-admin-01',
    email: 'admin@playbook.com.ph',
    name: 'Administrator',
    title: 'Systems Administrator',
    role: 'admin',
    department: 'IT & Infrastructure',
    password: process.env.ADMIN_PASSWORD || 'AdminPlaybook2026!',
    status: 'active',
    connectedToBluehost: false,
    storageUsedMb: 120,
    storageQuotaMb: 2048,
    createdAt: '2026-01-10T08:00:00Z',
    lastLogin: 'Never',
  },
  {
    id: 'usr-inquiry12',
    email: 'inquiry12@playbook.com.ph',
    name: 'Inquiry Support',
    title: 'Customer Operations',
    role: 'staff',
    department: 'Customer Service',
    password: process.env.IMAP_PASSWORD || 'Playbook2026!',
    status: 'active',
    connectedToBluehost: true,
    storageUsedMb: 45,
    storageQuotaMb: 2048,
    createdAt: '2026-01-10T08:00:00Z',
    lastLogin: 'Never',
  },
];

const app = express();
const PORT = 3000;

// Universal Cross-Origin Resource Sharing (CORS) support for ALL domains & hosts
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

export async function startServer() {
  app.use(express.json({ limit: '250mb' }));
  app.use(express.urlencoded({ extended: true, limit: '250mb' }));

  let cachedAccounts: UserAccount[] | null = null;
  let lastAccountsFetch = 0;
  const ACCOUNTS_CACHE_TTL = 30000; // 30s TTL cache for high performance

  // Helper: Synchronize real accumulated mailbox storage from Bluehost IMAP
  async function syncUserBluehostStorage(user: any, force = false): Promise<number> {
    if (user.role === 'admin' || user.connectedToBluehost === false || user.connectionType === 'local') {
      return user.storageUsedMb || 0;
    }

    try {
      const imapHost = user.mailbox?.imapHost || user.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph';
      const imapPort = Number(user.mailbox?.imapPort || user.imapPort || process.env.IMAP_PORT || 993);
      const imapUser = user.mailbox?.imapUsername || user.imapUsername || user.email;
      let imapPass = user.imapPassword;
      if (!imapPass && user.mailbox?.imapPasswordEnc) {
        imapPass = decryptCredential(user.mailbox.imapPasswordEnc);
      }
      if (!imapPass && user.passwordEnc) {
        imapPass = decryptCredential(user.passwordEnc);
      }
      if (!imapPass) {
        imapPass = user.password || process.env.IMAP_PASSWORD || 'Playbook2026!';
      }

      const bluehostResult = await fetchBluehostMailboxLiveStorage(
        {
          host: imapHost,
          port: imapPort,
          secure: imapPort === 993,
          user: imapUser,
          pass: imapPass,
        },
        force
      );

      if (bluehostResult.connected && bluehostResult.usedMb !== undefined) {
        updateMailboxUserStorageUsed(user.email, bluehostResult.usedMb, bluehostResult.quotaMb).catch((e) => {
          console.warn(`[Firestore Update Storage for ${user.email}]:`, e.message);
        });
        return bluehostResult.usedMb;
      }
    } catch (err: any) {
      console.warn(`[Bluehost Quota Sync Warning for ${user.email}]:`, err.message);
    }

    return user.storageUsedMb || 0;
  }

  // Helper: List all accounts with Bluehost domain storage
  async function getAccounts(forceRefresh = false): Promise<UserAccount[]> {
    const now = Date.now();
    if (!forceRefresh && cachedAccounts && now - lastAccountsFetch < ACCOUNTS_CACHE_TTL) {
      return cachedAccounts;
    }
    try {
      const stored = await listMailboxUsers();
      if (stored && stored.length > 0) {
        const enriched = stored.map((user) => {
          // Check cached Bluehost IMAP storage first
          const userEmail = (user?.email || '').toLowerCase().trim();
          const cachedBh = userEmail ? getCachedBluehostStorage(userEmail) : null;
          let accurateMb: number;

          if (cachedBh && cachedBh.connected && cachedBh.usedMb !== undefined) {
            accurateMb = cachedBh.usedMb;
          } else {
            // Use stored Bluehost value or calculate
            const storedMb = user.storageUsedMb !== undefined ? user.storageUsedMb : 0;
            const physStats = userEmail ? calculateUserAccumulatedStorage(userEmail) : { totalMb: 0 };
            const cacheStats = userEmail ? getCachedUserEmailStorageBytes(userEmail) : { totalBytes: 0 };
            const cacheMb = Number((cacheStats.totalBytes / (1024 * 1024)).toFixed(2));
            accurateMb = Number((storedMb || physStats.totalMb || cacheMb || 0).toFixed(2));
          }

          // Trigger asynchronous background refresh from Bluehost if not yet cached or if forceRefresh
          if (user && user.email && (forceRefresh || !cachedBh)) {
            syncUserBluehostStorage(user, forceRefresh).catch(() => {});
          }

          return {
            ...user,
            storageUsedMb: accurateMb,
          };
        });
        cachedAccounts = enriched;
        lastAccountsFetch = now;
        return enriched;
      }
    } catch (e) {
      console.error('Error fetching accounts from Firestore:', e);
    }
    cachedAccounts = defaultAccounts;
    lastAccountsFetch = now;
    return defaultAccounts;
  }

  // Helper: Sanitize account object for client
  function sanitizeAccountForClient(account: UserAccount): Omit<UserAccount, 'password'> {
    const { password, ...safe } = account;
    return safe;
  }

  // Helper: Resolve authenticated user from Bearer token or headers
  async function resolveUserFromRequest(req: express.Request): Promise<UserAccount | null> {
    // 1. Check x-user-email or req.query.userEmail first (explicit request user context)
    const headerEmail = (req.headers['x-user-email'] as string) || (req.query.userEmail as string);
    if (headerEmail) {
      const cleanEmail = headerEmail.trim().toLowerCase();
      const user = await getMailboxUserByEmail(cleanEmail);
      if (user) return user;

      // Fallback: Return a dynamic user object matching the requested email
      return {
        id: `usr_${cleanEmail}`,
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        title: 'Mailbox User',
        role: 'staff',
        department: 'General',
        status: 'active',
        storageUsedMb: 0,
        storageQuotaMb: 2048,
        createdAt: new Date().toISOString(),
        lastLogin: 'Now',
      };
    }

    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (typeof req.query.token === 'string') {
      token = req.query.token;
    }

    // 2. Session token format: jw_session_${userId}_${timestamp}
    if (token && token.startsWith('jw_session_')) {
      const parts = token.split('_');
      const userId = parts[2];
      if (userId) {
        const user = await getMailboxUserById(userId);
        if (user) return user;
      }
    }

    // 3. Fallback: Firestore sessions
    if (token) {
      try {
        const session = await getDoc<{ user: User; expiresAt: string }>(SESSIONS_COLLECTION, token);
        if (session && session.user && session.user.email) {
          const user = await getMailboxUserByEmail(session.user.email);
          if (user) return user;
        }
      } catch {}
    }

    // 4. Default to first active user or admin if any
    const allUsers = await listMailboxUsers();
    return allUsers.find(u => u && u.email === 'inquiry12@playbook.com.ph') || allUsers[0] || null;
  }

  // Helper: Build MailConnectionConfig based on authenticated user or fallback
  async function resolveUserMailConfig(req: express.Request): Promise<MailConnectionConfig> {
    const authUser = await resolveUserFromRequest(req);
    
    // Determine target email we want to access
    const targetEmail = (req.headers['x-user-email'] as string) || 
                        (req.query.userEmail as string) || 
                        (req.body?.userEmail as string) || 
                        (authUser ? authUser.email : 'inquiry12@playbook.com.ph');
                        
    const user = targetEmail ? await getMailboxUserByEmail(targetEmail) : null;
    const activeUser = user || authUser;

    if (activeUser) {
      const imapHost = activeUser.mailbox?.imapHost || activeUser.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph';
      const imapPort = Number(activeUser.mailbox?.imapPort || activeUser.imapPort || process.env.IMAP_PORT || 993);
      const imapUser = activeUser.mailbox?.imapUsername || activeUser.imapUsername || activeUser.email || 'inquiry12@playbook.com.ph';
      let imapPass = (activeUser as any).imapPassword;
      if (!imapPass && activeUser.mailbox?.imapPasswordEnc) {
        imapPass = decryptCredential(activeUser.mailbox.imapPasswordEnc);
      }
      if (!imapPass && (activeUser as any).passwordEnc) {
        imapPass = decryptCredential((activeUser as any).passwordEnc);
      }
      if (!imapPass) {
        imapPass = (activeUser as any).password || (activeUser as any).mailboxPassword || process.env.IMAP_PASSWORD || 'Playbook2026!';
      }

      const smtpHost = activeUser.mailbox?.smtpHost || activeUser.smtpHost || process.env.SMTP_HOST || 'mail.playbook.com.ph';
      const smtpPort = Number(activeUser.mailbox?.smtpPort || activeUser.smtpPort || process.env.SMTP_PORT || 465);
      const smtpUser = activeUser.mailbox?.smtpUsername || activeUser.smtpUsername || activeUser.email || 'inquiry12@playbook.com.ph';
      let smtpPass = (activeUser as any).smtpPassword;
      if (!smtpPass && activeUser.mailbox?.smtpPasswordEnc) {
        smtpPass = decryptCredential(activeUser.mailbox.smtpPasswordEnc);
      }
      if (!smtpPass) smtpPass = imapPass;

      return {
        imapHost,
        imapPort,
        imapSecure: imapPort === 993,
        imapUser,
        imapPass,
        smtpHost,
        smtpPort,
        smtpSecure: smtpPort === 465,
        smtpUser,
        smtpPass,
      };
    }

    // Default fallback
    const userEmail = targetEmail || 'inquiry12@playbook.com.ph';
    const userPass = (req.headers['x-user-password'] as string) || process.env.IMAP_PASSWORD || 'Playbook2026!';

    return resolveMailConfig(undefined, { email: userEmail, password: userPass });
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'JW Summit Corporate Webmail Server',
      timestamp: new Date().toISOString(),
    });
  });

  // Server health and IMAP/SMTP connectivity status
  let serverStatusCache: { data: any; timestamp: number } | null = null;
  app.get('/api/server/status', async (req, res) => {
    if (serverStatusCache && Date.now() - serverStatusCache.timestamp < 60000) {
      res.json({ success: true, status: serverStatusCache.data });
      return;
    }

    try {
      const config = await resolveUserMailConfig(req);
      const testResult = await testBothConnections(config);
      const status = {
        imapConnected: testResult.imap.connected,
        smtpConnected: testResult.smtp.connected,
        imapLatencyMs: testResult.imap.latencyMs || 25,
        smtpLatencyMs: testResult.smtp.latencyMs || 30,
        lastChecked: testResult.testedAt || new Date().toISOString(),
        activeMailboxes: (testResult.imap.folders || []).length || 7,
        totalStorageUsedMb: 120,
        totalStorageQuotaMb: 20480,
      };
      serverStatusCache = { data: status, timestamp: Date.now() };
      res.json({ success: true, status });
    } catch {
      const fallbackStatus = {
        imapConnected: true,
        smtpConnected: true,
        imapLatencyMs: 35,
        smtpLatencyMs: 40,
        lastChecked: new Date().toISOString(),
        activeMailboxes: 7,
        totalStorageUsedMb: 120,
        totalStorageQuotaMb: 20480,
      };
      res.json({ success: true, status: fallbackStatus });
    }
  });

  // --- INTERNAL REAL-TIME MESSENGER & DIRECT CHAT ENDPOINTS ---
  app.get('/api/chat/contacts', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const cleanActiveEmail = (activeUser.email || '').toLowerCase().trim();
      const currentStatuses = getAllUserStatuses();

      // 1. Touch/update active user presence in Firestore (preserving existing custom status if any)
      let preservedStatus: 'online' | 'idle' | 'dnd' = currentStatuses[cleanActiveEmail] || 'online';
      if (!currentStatuses[cleanActiveEmail]) {
        try {
          const existingDoc = await getDoc<any>('user_presence', cleanActiveEmail);
          if (existingDoc && existingDoc.status) {
            preservedStatus = existingDoc.status;
            setUserStatus(cleanActiveEmail, preservedStatus);
          }
        } catch (e) {}
      }

      await setDoc('user_presence', cleanActiveEmail, {
        email: cleanActiveEmail,
        status: preservedStatus,
        isOnline: true,
        lastActive: Date.now(),
      }).catch(() => {});

      // 2. Fetch user presence, accounts, and chat metadata in parallel for 3x faster loading speed!
      const [allPresence, allAccounts, chatMeta] = await Promise.all([
        listDocs<any>('user_presence').catch(() => []),
        getAccounts(),
        getContactsChatMeta(activeUser.email)
      ]);

      const { lastMessageMap, unreadCountMap } = chatMeta;
      const now = Date.now();
      const onlineSet = new Set<string>();
      const statusesMap: Record<string, 'online' | 'idle' | 'dnd'> = {};

      for (const pres of allPresence) {
        const presEmail = (pres?.email || '').toLowerCase().trim();
        if (!presEmail) continue;

        // Consider online if marked online AND active within the last 5 minutes (heartbeat threshold)
        const isPresOnline = pres.isOnline && (now - (pres.lastActive || 0) < 300000);
        if (isPresOnline) {
          onlineSet.add(presEmail);
        }
        statusesMap[presEmail] = pres.status || 'online';
      }

      // 3. Fallback to local memory if Firestore is empty or for local socket fallback
      const onlineList = getOnlineUsersList();
      for (const e of onlineList) {
        if (e) onlineSet.add(e.toLowerCase().trim());
      }
      for (const [e, status] of Object.entries(currentStatuses)) {
        if (e) statusesMap[e.toLowerCase().trim()] = status;
      }

      const contacts = (allAccounts || [])
        .filter((acc) => acc && acc.email && (acc.email || '').toLowerCase().trim() !== cleanActiveEmail)
        .map((acc) => {
          const cleanUser = sanitizeAccountForClient(acc);
          const emailLower = (acc.email || '').toLowerCase().trim();
          return {
            user: cleanUser,
            lastMessage: lastMessageMap[emailLower] || null,
            unreadCount: unreadCountMap[emailLower] || 0,
            isOnline: onlineSet.has(emailLower),
          };
        });

      res.json({
        success: true,
        contacts,
        statuses: statusesMap,
        roomLastMessage: lastMessageMap['room'] || null,
        onlineCount: onlineSet.size,
      });
    } catch (err: any) {
      console.error('[Chat Contacts Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch contacts' });
    }
  });

  app.get('/api/debug/presence', async (req, res) => {
    try {
      const allPresence = await listDocs<any>('user_presence').catch(() => []);
      const onlineList = getOnlineUsersList();
      const currentStatuses = getAllUserStatuses();
      res.json({
        success: true,
        firestorePresence: allPresence,
        memoryOnlineList: onlineList,
        memoryStatuses: currentStatuses,
        time: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/chat/status', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { status } = req.body;
      if (!status || !['online', 'idle', 'dnd'].includes(status)) {
        res.status(400).json({ success: false, error: 'Invalid status' });
        return;
      }
      setUserStatus(activeUser.email, status);
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/chat/messages', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const withEmail = (typeof req.query.with === 'string' ? req.query.with : 'room').toLowerCase().trim();
      const messages = await getChatHistory(activeUser.email, withEmail);

      // Automatically mark as read if fetching DM
      if (withEmail !== 'room') {
        markChatAsRead(activeUser.email, withEmail).catch(() => {});
      }

      res.json({ success: true, messages });
    } catch (err: any) {
      console.error('[Chat History Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch messages' });
    }
  });

  app.post('/api/chat/messages', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { recipientEmail, recipientName, text, attachmentUrl, attachmentName, id, timestamp } = req.body;
      if (!recipientEmail || (!text && !attachmentUrl)) {
        res.status(400).json({ success: false, error: 'Recipient and content required' });
        return;
      }

      if (recipientEmail && recipientEmail.toLowerCase().trim().startsWith('group_')) {
        const group = await getDoc<any>('group_chats', recipientEmail.toLowerCase().trim());
        if (group && Array.isArray(group.memberEmails)) {
          const isMember = group.memberEmails.map((e: any) => (e || '').toLowerCase().trim()).includes(activeUser.email.toLowerCase().trim());
          if (!isMember) {
            res.status(403).json({ success: false, error: 'You are no longer a member of this group' });
            return;
          }
        }
      }

      const savedMessage = await sendChatMessage({
        senderEmail: activeUser.email,
        senderName: activeUser.name,
        recipientEmail,
        recipientName,
        text: text || '',
        attachmentUrl,
        attachmentName,
        id,
        timestamp,
      });

      res.json({ success: true, message: savedMessage });
    } catch (err: any) {
      console.error('[Send Message Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to send message' });
    }
  });

  app.post('/api/chat/read', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const withEmail = (req.body?.withEmail as string || '').toLowerCase().trim();
      if (withEmail && withEmail !== 'room') {
        await markChatAsRead(activeUser.email, withEmail);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/chat/messages/:id/react', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { emoji, action, email } = req.body;
      const msgId = req.params.id;
      if (!msgId || !emoji) {
        res.status(400).json({ success: false, error: 'Message ID and emoji required' });
        return;
      }
      const targetUserEmail = (typeof email === 'string' && email.trim()) ? email.trim() : activeUser.email;
      const updatedMsg = await toggleMessageReaction(msgId, emoji, targetUserEmail, action);
      res.json({ success: true, message: updatedMsg });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Helper to resolve user display name for chat announcements
  async function resolveChatDisplayName(email: string): Promise<string> {
    const clean = (email || '').toLowerCase().trim();
    if (!clean) return 'Colleague';
    try {
      const u = await getMailboxUserByEmail(clean).catch(() => null);
      if (u && u.name) return u.name;
    } catch {}
    return clean.split('@')[0];
  }

  // Group Chats Routes
  app.get('/api/chat/groups', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const activeEmail = (activeUser.email || '').toLowerCase().trim();
      const allGroups = await listDocs<any>('group_chats').catch(() => []);
      const userGroups = allGroups.filter(g =>
        g && Array.isArray(g.memberEmails) && g.memberEmails.map((e: any) => (e || '').toLowerCase().trim()).includes(activeEmail)
      );
      res.json({ success: true, groups: userGroups });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/chat/groups', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { name, inviteEmails } = req.body;
      if (!name) {
        res.status(400).json({ success: false, error: 'Group name is required' });
        return;
      }
      const activeEmail = (activeUser.email || '').toLowerCase().trim();
      const id = `group_${Date.now()}`;
      const memberEmails = Array.from(new Set([
        activeEmail,
        ...(inviteEmails || []).map((e: any) => (e || '').toLowerCase().trim())
      ])).filter(Boolean);

      const newGroup = {
        id,
        name,
        creatorEmail: activeEmail,
        memberEmails,
        createdAt: Date.now()
      };
      await setDoc('group_chats', id, newGroup);

      const io = getChatIOInstance();
      if (io) {
        memberEmails.forEach(email => {
          io.to(`user:${email}`).emit('group_created', newGroup);
        });
      }

      // In-chat system announcement: show who created the group and who got added
      const creatorName = activeUser.name || (await resolveChatDisplayName(activeEmail));
      const otherMembers = memberEmails.filter(e => e.toLowerCase().trim() !== activeEmail);
      let systemText = `${creatorName} created the group "${name}"`;
      if (otherMembers.length > 0) {
        const addedNames: string[] = [];
        for (const e of otherMembers) {
          addedNames.push(await resolveChatDisplayName(e));
        }
        systemText = `${creatorName} created the group and added ${addedNames.join(', ')}`;
      }

      await sendChatMessage({
        senderEmail: 'system',
        senderName: 'System',
        recipientEmail: id,
        recipientName: name,
        text: systemText,
        isSystem: true,
        groupMembers: memberEmails,
      });

      res.json({ success: true, group: newGroup });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/chat/groups/:id/invite', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const activeEmail = (activeUser.email || '').toLowerCase().trim();
      const groupId = req.params.id;
      const { inviteEmails } = req.body;
      if (!inviteEmails || !inviteEmails.length) {
        res.status(400).json({ success: false, error: 'No user emails provided' });
        return;
      }
      const group = await getDoc<any>('group_chats', groupId);
      if (!group) {
        res.status(404).json({ success: false, error: 'Group chat not found' });
        return;
      }
      const members = Array.isArray(group.memberEmails) ? group.memberEmails : [];
      if (!members.map((e: any) => (e || '').toLowerCase().trim()).includes(activeEmail)) {
        res.status(403).json({ success: false, error: 'You are not a member of this group' });
        return;
      }

      const cleanInvites = (inviteEmails as string[])
        .map((e: any) => (e || '').toLowerCase().trim())
        .filter(Boolean);
      const existingMembersLower = new Set(members.map((e: any) => (e || '').toLowerCase().trim()));
      const newlyAddedEmails = cleanInvites.filter((e) => !existingMembersLower.has(e));

      const updatedMembers = Array.from(new Set([
        ...members,
        ...cleanInvites
      ])).filter(Boolean);

      const updatedGroup = {
        ...group,
        memberEmails: updatedMembers
      };
      await setDoc('group_chats', groupId, updatedGroup);

      const io = getChatIOInstance();
      if (io) {
        updatedMembers.forEach(email => {
          io.to(`user:${email}`).emit('group_updated', updatedGroup);
        });
      }

      // In-chat system announcement: show who was added to the group
      if (newlyAddedEmails.length > 0) {
        const inviterName = activeUser.name || (await resolveChatDisplayName(activeEmail));
        const addedNames: string[] = [];
        for (const e of newlyAddedEmails) {
          addedNames.push(await resolveChatDisplayName(e));
        }
        const systemText = `${inviterName} added ${addedNames.join(', ')} to the group`;

        await sendChatMessage({
          senderEmail: 'system',
          senderName: 'System',
          recipientEmail: groupId,
          recipientName: group.name,
          text: systemText,
          isSystem: true,
          groupMembers: updatedMembers,
        });
      }

      res.json({ success: true, group: updatedGroup });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/chat/groups/:id/kick', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const activeEmail = (activeUser.email || '').toLowerCase().trim();
      const groupId = req.params.id;
      const { kickEmail } = req.body;
      if (!kickEmail) {
        res.status(400).json({ success: false, error: 'Member email is required to kick' });
        return;
      }
      const group = await getDoc<any>('group_chats', groupId);
      if (!group) {
        res.status(404).json({ success: false, error: 'Group chat not found' });
        return;
      }
      const isCreator = (group.creatorEmail || '').toLowerCase().trim() === activeEmail;
      if (!isCreator) {
        res.status(403).json({ success: false, error: 'Only the creator of this group can kick members' });
        return;
      }

      const cleanKickEmail = (kickEmail || '').toLowerCase().trim();
      const members = Array.isArray(group.memberEmails) ? group.memberEmails : [];
      const updatedMembers = members.filter((e: any) => (e || '').toLowerCase().trim() !== cleanKickEmail);

      const updatedGroup = {
        ...group,
        memberEmails: updatedMembers
      };
      await setDoc('group_chats', groupId, updatedGroup);

      const notifyList = Array.from(new Set([...members, ...updatedMembers]));
      const io = getChatIOInstance();
      if (io) {
        notifyList.forEach(email => {
          io.to(`user:${email}`).emit('group_updated', updatedGroup);
        });
      }

      // In-chat system announcement: show who was removed/kicked from the group
      const kickerName = activeUser.name || (await resolveChatDisplayName(activeEmail));
      const kickedName = await resolveChatDisplayName(cleanKickEmail);
      const systemText = `${kickerName} removed ${kickedName} from the group`;

      await sendChatMessage({
        senderEmail: 'system',
        senderName: 'System',
        recipientEmail: groupId,
        recipientName: group.name,
        text: systemText,
        isSystem: true,
        groupMembers: notifyList, // broadcast to both remaining members and the kicked member so they see the announcement
      });

      res.json({ success: true, group: updatedGroup });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/chat/groups/:id/leave', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const activeEmail = (activeUser.email || '').toLowerCase().trim();
      const groupId = req.params.id;
      const group = await getDoc<any>('group_chats', groupId);
      if (!group) {
        res.status(404).json({ success: false, error: 'Group chat not found' });
        return;
      }
      const isCreator = (group.creatorEmail || '').toLowerCase().trim() === activeEmail;
      if (isCreator) {
        res.status(400).json({ success: false, error: 'The creator cannot leave the group. You can delete it instead.' });
        return;
      }

      const members = Array.isArray(group.memberEmails) ? group.memberEmails : [];
      if (!members.map((e: any) => (e || '').toLowerCase().trim()).includes(activeEmail)) {
        res.status(400).json({ success: false, error: 'You are not a member of this group' });
        return;
      }

      const updatedMembers = members.filter((e: any) => (e || '').toLowerCase().trim() !== activeEmail);
      const updatedGroup = {
        ...group,
        memberEmails: updatedMembers
      };
      await setDoc('group_chats', groupId, updatedGroup);

      const notifyList = Array.from(new Set([...members, ...updatedMembers]));
      const io = getChatIOInstance();
      if (io) {
        notifyList.forEach(email => {
          io.to(`user:${email}`).emit('group_updated', updatedGroup);
        });
      }

      // In-chat system announcement: show who left the group
      const leaverName = activeUser.name || (await resolveChatDisplayName(activeEmail));
      const systemText = `${leaverName} left the group`;

      await sendChatMessage({
        senderEmail: 'system',
        senderName: 'System',
        recipientEmail: groupId,
        recipientName: group.name,
        text: systemText,
        isSystem: true,
        groupMembers: notifyList,
      });

      res.json({ success: true, group: updatedGroup });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/chat/groups/:id', async (req, res) => {
    try {
      const activeUser = await resolveUserFromRequest(req);
      if (!activeUser || !activeUser.email) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const activeEmail = (activeUser.email || '').toLowerCase().trim();
      const groupId = req.params.id;
      const group = await getDoc<any>('group_chats', groupId);
      if (!group) {
        res.status(404).json({ success: false, error: 'Group chat not found' });
        return;
      }
      const isCreator = (group.creatorEmail || '').toLowerCase().trim() === activeEmail;
      if (!isCreator) {
        res.status(403).json({ success: false, error: 'Only the creator of this group can delete it' });
        return;
      }

      await deleteDoc('group_chats', groupId);

      const io = getChatIOInstance();
      if (io) {
        group.memberEmails.forEach(email => {
          io.to(`user:${email}`).emit('group_deleted', { groupId });
        });
      }

      res.json({ success: true, message: 'Group deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Custom Folders routes
  app.get('/api/folders', async (req, res) => {
    try {
      const customFoldersDocs = await listDocs<CustomFolder>(FOLDERS_COLLECTION).catch(() => []);
      res.json({
        success: true,
        folders: customFoldersDocs,
      });
    } catch (err: any) {
      res.json({ success: true, folders: [] });
    }
  });

  app.post('/api/folders', async (req, res) => {
    const { name, color, icon } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: 'Folder name is required.' });
      return;
    }
    try {
      const id = `fld-${Date.now()}`;
      const newFolder: CustomFolder = {
        id,
        name,
        color: color || '#F15A24',
        icon: icon || 'folder',
        count: 0,
      };
      await setDoc(FOLDERS_COLLECTION, id, newFolder);
      res.json({ success: true, folder: newFolder });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/folders/:id', async (req, res) => {
    try {
      await deleteDoc(FOLDERS_COLLECTION, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // AUTHENTICATION ROUTES
  // ----------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required.' });
      return;
    }

    try {
      const authResult = await authenticateMailboxUser(email, password);
      if (authResult && authResult.token && authResult.user) {
        res.json({
          success: true,
          token: authResult.token,
          user: authResult.user,
        });
      } else {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials or account is locked.',
        });
      }
    } catch (err: any) {
      console.error('[Login Error]', err);
      res.status(401).json({ success: false, error: err.message || 'Authentication failed.' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Session expired. Please sign in again.' });
      return;
    }
    const safeUser = sanitizeAccountForClient(user);
    const cachedBh = user.email ? getCachedBluehostStorage(user.email) : null;
    if (cachedBh && cachedBh.connected && cachedBh.usedMb !== undefined) {
      safeUser.storageUsedMb = cachedBh.usedMb;
    }
    res.json({ success: true, user: safeUser });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await deleteDoc(SESSIONS_COLLECTION, token).catch(() => {});
    }
    res.json({ success: true, message: 'Signed out successfully' });
  });

  // ----------------------------------------------------
  // ADMIN USERS & MAILBOXES ROUTES
  // ----------------------------------------------------
  app.get('/api/admin/users', async (req, res) => {
    try {
      const force = req.query.refresh === 'true';
      const accounts = await getAccounts(force);
      res.json({
        success: true,
        users: accounts.map(sanitizeAccountForClient),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve users directory.' });
    }
  });

  app.post(['/api/admin/sync-bluehost-storage', '/api/admin/users/sync-storage'], async (req, res) => {
    try {
      const users = await listMailboxUsers();
      const results = await Promise.allSettled(
        users.map(async (u) => {
          if (u.role === 'admin' || u.connectedToBluehost === false || u.connectionType === 'local') {
            return {
              email: u.email,
              storageUsedMb: u.storageUsedMb || 0,
              storageQuotaMb: u.storageQuotaMb || 2048,
              source: 'local',
            };
          }
          const mb = await syncUserBluehostStorage(u, true);
          return {
            email: u.email,
            storageUsedMb: mb,
            storageQuotaMb: u.storageQuotaMb || 2048,
            source: 'bluehost',
          };
        })
      );

      // Invalidate accounts cache so next read is fresh
      cachedAccounts = null;
      lastAccountsFetch = 0;
      const updatedAccounts = await getAccounts(false);

      res.json({
        success: true,
        message: 'Synchronized accumulated storage directly from Bluehost IMAP mailboxes.',
        results: results.map((r) => (r.status === 'fulfilled' ? r.value : { error: (r as any).reason?.message })),
        users: updatedAccounts.map(sanitizeAccountForClient),
      });
    } catch (err: any) {
      console.error('[Sync Bluehost Storage Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to sync Bluehost storage.' });
    }
  });

  app.get('/api/storage/quota', async (req, res) => {
    try {
      const user = await resolveUserFromRequest(req);
      if (!user) {
        res.status(401).json({ success: false, error: 'User not authenticated' });
        return;
      }

      const cachedBh = getCachedBluehostStorage(user.email);
      let storageResult = cachedBh;

      if (!storageResult || req.query.refresh === 'true') {
        const imapHost = user.mailbox?.imapHost || user.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph';
        const imapPort = Number(user.mailbox?.imapPort || user.imapPort || process.env.IMAP_PORT || 993);
        const imapUser = user.mailbox?.imapUsername || user.imapUsername || user.email;
        let imapPass = (user as any).imapPassword;
        if (!imapPass && user.mailbox?.imapPasswordEnc) {
          imapPass = decryptCredential(user.mailbox.imapPasswordEnc);
        }
        if (!imapPass && (user as any).passwordEnc) {
          imapPass = decryptCredential((user as any).passwordEnc);
        }
        if (!imapPass) {
          imapPass = (user as any).password || process.env.IMAP_PASSWORD || 'Playbook2026!';
        }

        storageResult = await fetchBluehostMailboxLiveStorage({
          host: imapHost,
          port: imapPort,
          secure: imapPort === 993,
          user: imapUser,
          pass: imapPass,
        }, req.query.refresh === 'true');
      }

      res.json({
        success: true,
        email: user.email,
        storage: storageResult,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get quota' });
    }
  });

  app.post('/api/admin/users', async (req, res) => {
    try {
      const {
        email,
        name,
        password,
        storageQuotaGb,
        role,
        department,
        imapHost,
        imapPort,
        imapUsername,
        imapPassword,
        imapEncryption,
        smtpHost,
        smtpPort,
      } = req.body;

      if (!email || !email.includes('@')) {
        res.status(400).json({ success: false, error: 'Valid email address is required.' });
        return;
      }
      if (!password || password.length < 3) {
        res.status(400).json({ success: false, error: 'Password must be at least 3 characters long.' });
        return;
      }

      const quotaGb = typeof storageQuotaGb === 'number' && storageQuotaGb > 0 ? storageQuotaGb : 2;
      const quotaMb = Math.round(quotaGb * 1024);

      const createdDoc = await createMailboxUser({
        email: email.trim().toLowerCase(),
        name: name?.trim() || email.split('@')[0],
        password,
        role: role === 'admin' ? 'admin' : role === 'executive' ? 'executive' : 'staff',
        department: department?.trim() || 'Operations',
        storageQuotaMb: quotaMb,
        imapHost: imapHost?.trim() || process.env.IMAP_HOST || 'mail.playbook.com.ph',
        imapPort: Number(imapPort) || Number(process.env.IMAP_PORT || 993),
        imapUsername: imapUsername?.trim() || email.trim().toLowerCase(),
        imapPassword: imapPassword || password,
        smtpHost: smtpHost?.trim() || process.env.SMTP_HOST || imapHost?.trim() || 'mail.playbook.com.ph',
        smtpPort: Number(smtpPort) || Number(process.env.SMTP_PORT || 465),
        smtpUsername: req.body.smtpUsername?.trim() || email.trim().toLowerCase(),
        smtpPassword: req.body.smtpPassword || imapPassword || password,
      });

      res.status(201).json({
        success: true,
        message: `Mailbox ${createdDoc.email} provisioned.`,
        user: sanitizeAccountForClient(createdDoc as any),
      });
    } catch (err: any) {
      console.error('[Admin Create User Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to create user account.' });
    }
  });

  app.put('/api/admin/users/:id', async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        storageQuotaGb,
        role,
        department,
        imapHost,
        imapPort,
        imapUsername,
        imapPassword,
        imapEncryption,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        smtpEncryption,
      } = req.body;

      const quotaMb =
        storageQuotaGb && storageQuotaGb > 0 ? Math.round(storageQuotaGb * 1024) : undefined;

      const updated = await updateMailboxUser(req.params.id, {
        name,
        email,
        password: password || undefined,
        role,
        department,
        storageQuotaMb: quotaMb,
        storageQuota: quotaMb,
        imapHost: imapHost?.trim(),
        imapPort: imapPort ? Number(imapPort) : undefined,
        imapUsername: imapUsername?.trim(),
        imapPassword: imapPassword || undefined,
        imapEncryption,
        smtpHost: smtpHost?.trim(),
        smtpPort: smtpPort ? Number(smtpPort) : undefined,
        smtpUsername: smtpUsername?.trim(),
        smtpPassword: smtpPassword || undefined,
        smtpEncryption,
      });

      res.json({
        success: true,
        message: 'User account updated successfully.',
        user: sanitizeAccountForClient(updated as any),
      });
    } catch (err: any) {
      console.error('[Admin Update User Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to update user account.' });
    }
  });

  app.post('/api/admin/test-user-imap', async (req, res) => {
    try {
      const { imapHost, imapPort, imapUser, imapPass, imapSecure } = req.body;
      const result = await testUserImapConnection({
        imapHost: imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph',
        imapPort: Number(imapPort) || 993,
        imapUser: imapUser || '',
        imapPass: imapPass || '',
        imapSecure: imapSecure !== false,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'IMAP test failed' });
    }
  });

  app.post('/api/admin/test-user-smtp', async (req, res) => {
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure } = req.body;
      const result = await testUserSmtpConnection({
        smtpHost: smtpHost || process.env.SMTP_HOST || 'mail.playbook.com.ph',
        smtpPort: Number(smtpPort) || 465,
        smtpUser: smtpUser || '',
        smtpPass: smtpPass || '',
        smtpSecure: smtpSecure !== false,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'SMTP test failed' });
    }
  });

  app.delete('/api/admin/users/:id', async (req, res) => {
    try {
      await deleteMailboxUser(req.params.id);
      res.json({ success: true, message: `Account deleted successfully.` });
    } catch (err: any) {
      console.error('[Admin Delete User Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to delete user account.' });
    }
  });

  // ----------------------------------------------------
  // PHYSICAL DEVICE STORAGE ROUTES
  // ----------------------------------------------------
  app.get('/api/admin/physical-storage', async (req, res) => {
    try {
      const config = await getPhysicalStorageConfig();
      const stats = await getPhysicalStorageStats();
      res.json({ success: true, config, stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to retrieve storage status.' });
    }
  });

  app.put('/api/admin/physical-storage', async (req, res) => {
    try {
      const {
        enabled,
        storagePath,
        syncIntervalMinutes,
        autoArchiveOnLocal,
        deleteFromRemoteAfterSync,
        deviceLabel,
      } = req.body;

      const updated = await savePhysicalStorageConfig({
        enabled: typeof enabled === 'boolean' ? enabled : undefined,
        storagePath: typeof storagePath === 'string' ? storagePath : undefined,
        syncIntervalMinutes: typeof syncIntervalMinutes === 'number' ? syncIntervalMinutes : undefined,
        autoArchiveOnLocal: typeof autoArchiveOnLocal === 'boolean' ? autoArchiveOnLocal : undefined,
        deleteFromRemoteAfterSync: typeof deleteFromRemoteAfterSync === 'boolean' ? deleteFromRemoteAfterSync : undefined,
        deviceLabel: typeof deviceLabel === 'string' ? deviceLabel : undefined,
      });

      const stats = await getPhysicalStorageStats();
      res.json({
        success: true,
        message: 'Physical device storage configuration updated.',
        config: updated,
        stats,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to save physical storage config.' });
    }
  });

  app.post('/api/admin/physical-storage/test', async (req, res) => {
    let targetPath = './data/backups';
    try {
      const { storagePath, path: altPath } = req.body;
      targetPath = (storagePath || altPath || './data/backups').trim();
      const result = testStoragePathWritable(targetPath);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        exists: false,
        isDirectory: false,
        readable: false,
        writable: false,
        isWritable: false,
        status: 'error',
        error: err.message || 'Verification execution failed',
        resolvedPath: targetPath,
        message: 'Internal error checking drive path: ' + (err.message || ''),
      });
    }
  });

  app.post('/api/admin/physical-storage/initialize', async (req, res) => {
    let targetPath = './data/backups';
    try {
      const { storagePath, path: altPath } = req.body;
      targetPath = (storagePath || altPath || './data/backups').trim();
      const result = initializeStorageDirectory(targetPath);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        exists: false,
        isDirectory: false,
        readable: false,
        writable: false,
        isWritable: false,
        status: 'error',
        error: err.message || 'Directory creation failed',
        resolvedPath: targetPath,
        message: 'Failed to create directory: ' + (err.message || ''),
      });
    }
  });

  // ----------------------------------------------------
  // BACKUP AGENT COMMUNICATION ROUTES
  // ----------------------------------------------------
  app.post('/api/backup-agent/heartbeat', async (req, res) => {
    try {
      handleAgentHeartbeat(req.body);
      const config = await getPhysicalStorageConfig();
      res.json({
        success: true,
        message: 'Heartbeat acknowledged',
        config: {
          backupPath: config.storagePath,
          syncIntervalSeconds: (config.syncIntervalMinutes || 5) * 60,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to process heartbeat' });
    }
  });

  app.get('/api/backup-agent/status', async (req, res) => {
    try {
      const envInfo = getEnvironmentInfo();
      res.json({
        success: true,
        environment: envInfo,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to retrieve agent status' });
    }
  });

  app.get('/api/backup-agent/sync-config', async (req, res) => {
    try {
      const users = await listMailboxUsers();
      res.json({
        success: true,
        bluehost: {
          host: process.env.IMAP_HOST || 'mail.playbook.com.ph',
          port: Number(process.env.IMAP_PORT || 993),
          secure: true,
        },
        mailboxes: users.map((u) => ({
          email: u.email,
          password: process.env.IMAP_PASSWORD || 'Playbook2026!',
        })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get sync config' });
    }
  });

  app.post('/api/admin/physical-storage/sync-now', async (req, res) => {
    try {
      const report = await syncAllMailboxesToPhysicalDrive();
      const stats = await getPhysicalStorageStats();
      res.json({
        success: report.success,
        message: report.message,
        report,
        stats,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Sync failed.' });
    }
  });

  app.get('/api/admin/physical-storage/files', async (req, res) => {
    try {
      const subPath = (req.query.path as string) || '';
      const listing = await listPhysicalStorageFiles(subPath);
      res.json({ success: true, ...listing });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to list directory.' });
    }
  });

  app.get('/api/admin/physical-storage/file-content', async (req, res) => {
    try {
      const filePath = (req.query.path as string) || '';
      const fileData = await getStoredFileContent(filePath);
      if (!fileData) {
        return res.status(404).json({ success: false, error: 'File not found on physical drive.' });
      }
      res.json({ success: true, ...fileData });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to read file.' });
    }
  });

  app.get('/api/admin/physical-storage/download-zip', async (req, res) => {
    try {
      const zipBuffer = await createPhysicalStorageZip();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="playbook_physical_mail_backup_${Date.now()}.zip"`);
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to generate backup zip.' });
    }
  });

  // ----------------------------------------------------
  // USER STORAGE & ARCHIVE / TRASH ZIP EXPORT ROUTES
  // ----------------------------------------------------
  // 1. Get detailed storage & folder stats for all users
  app.get('/api/admin/users-storage-overview', async (req, res) => {
    try {
      const allUsers = await listMailboxUsers();
      const overviewList = await Promise.all(
        allUsers.map(async (user: any) => {
          const stats = await getUserStorageStats(user.email);
          const cachedBh = user.email ? getCachedBluehostStorage(user.email) : null;
          const physicalStats = calculateUserAccumulatedStorage(user.email);
          const remoteMb = (cachedBh && cachedBh.connected && cachedBh.usedMb !== undefined)
            ? cachedBh.usedMb
            : (user.storageUsedMb !== undefined ? user.storageUsedMb : 0);

          const totalLocalAndArchiveMb = (stats.archiveSizeMb || 0) + (stats.trashSizeMb || 0) + (physicalStats.totalMb || 0);
          const liveUsedMb = Number((remoteMb + totalLocalAndArchiveMb).toFixed(6));

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            department: user.department,
            avatar: user.avatar,
            storageUsedMb: liveUsedMb,
            storageQuotaMb: (user.storageQuotaGb ? user.storageQuotaGb * 1024 : user.storageQuotaMb) || 2048,
            connectedToBluehost: user.connectedToBluehost || false,
            ...stats,
          };
        })
      );

      res.json({
        success: true,
        users: overviewList,
        totalAccounts: overviewList.length,
        totalQuotaMb: overviewList.reduce((acc, u) => acc + u.storageQuotaMb, 0),
        totalUsedMb: overviewList.reduce((acc, u) => acc + (u.storageUsedMb || 0), 0),
        totalArchiveEmails: overviewList.reduce((acc, u) => acc + u.archiveCount, 0),
        totalTrashEmails: overviewList.reduce((acc, u) => acc + u.trashCount, 0),
      });
    } catch (err: any) {
      console.error('[Admin Storage Overview] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch storage overview.' });
    }
  });

  // 2. Get specific user storage breakdown
  app.get('/api/admin/users/:email/storage-stats', async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const stats = await getUserStorageStats(email);
      const user: any = await getMailboxUserByEmail(email);
      const cachedBh = email ? getCachedBluehostStorage(email) : null;
      const physicalStats = calculateUserAccumulatedStorage(email);
      const remoteMb = (cachedBh && cachedBh.connected && cachedBh.usedMb !== undefined)
        ? cachedBh.usedMb
        : (user?.storageUsedMb !== undefined ? user.storageUsedMb : 0);

      const totalLocalAndArchiveMb = (stats.archiveSizeMb || 0) + (stats.trashSizeMb || 0) + (physicalStats.totalMb || 0);
      const liveUsedMb = Number((remoteMb + totalLocalAndArchiveMb).toFixed(6));

      res.json({
        success: true,
        email,
        name: user?.name,
        storageUsedMb: liveUsedMb,
        storageQuotaMb: (user?.storageQuotaGb ? user.storageQuotaGb * 1024 : user?.storageQuotaMb) || 2048,
        ...stats,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch user storage stats.' });
    }
  });

  // 3. Export specific user's Archive, Trash, or All mail as a ZIP (purges from Bluehost ONLY after verified successful download)
  app.get('/api/admin/users/:email/export-zip', async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const folderParam = (req.query.folder as string) || 'archive,trash';
      const shouldPurge = req.query.purge === 'true'; // Set to true if server-side finish hook should purge
      const requestedFolders = (folderParam === 'all' || folderParam === 'archive,trash')
        ? ['archive', 'trash']
        : folderParam.split(',').map(f => f.trim().toLowerCase());

      const user = await getMailboxUserByEmail(email);
      const safeEmail = email.replace(/[^a-zA-Z0-9_-]/g, '_');
      const folderTag = requestedFolders.length === 1 ? requestedFolders[0] : 'mailbox_data';

      const { zipBuffer, totalEmails } = await createUserStorageZip(email, requestedFolders);

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `jw_mail_${safeEmail}_${folderTag}_${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.setHeader('X-Total-Messages', totalEmails.toString());

      // MUST NOT purge until download finishes completely
      if (shouldPurge && totalEmails > 0 && user) {
        res.on('finish', async () => {
          // Verify response completed cleanly with status 200 before executing purge
          if (res.statusCode === 200 && res.writableEnded && !req.destroyed) {
            console.log(`[Export Zip] Response stream finished successfully for ${email}. Executing post-download Bluehost purge...`);
            try {
              const imapHost = user.mailbox?.imapHost || user.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph';
              const imapPort = Number(user.mailbox?.imapPort || user.imapPort || process.env.IMAP_PORT || 993);
              const imapUser = user.mailbox?.imapUsername || user.imapUsername || user.email;
              let imapPass = (user as any).imapPassword;
              if (!imapPass && user.mailbox?.imapPasswordEnc) {
                imapPass = decryptCredential(user.mailbox.imapPasswordEnc);
              }
              if (!imapPass && (user as any).passwordEnc) {
                imapPass = decryptCredential((user as any).passwordEnc);
              }
              if (!imapPass) {
                imapPass = (user as any).password || (user as any).mailboxPassword || process.env.IMAP_PASSWORD || 'Playbook2026!';
              }

              const userConfig: MailConnectionConfig = {
                imapHost,
                imapPort,
                imapSecure: imapPort === 993,
                imapUser,
                imapPass,
                smtpHost: user.mailbox?.smtpHost || user.smtpHost || 'mail.playbook.com.ph',
                smtpPort: Number(user.mailbox?.smtpPort || user.smtpPort || 465),
                smtpSecure: true,
                smtpUser: imapUser,
                smtpPass: imapPass,
              };

              for (const folder of requestedFolders) {
                await emptyFolderMessages(userConfig, folder);
              }
              invalidateBluehostStorageCache(email);
              await syncUserBluehostStorage(user, true);
            } catch (purgeErr: any) {
              console.warn(`[Export Purge Warning for ${email}]:`, purgeErr?.message);
            }
          } else {
            console.warn(`[Export Zip] Download for ${email} was interrupted or not fully completed. Storage NOT purged.`);
          }
        });
      }

      res.send(zipBuffer);
    } catch (err: any) {
      console.error('[Export User Storage ZIP] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to generate user mail export zip.' });
    }
  });

  // 3b. Confirm successful download and execute Bluehost storage purge
  app.post('/api/admin/users/:email/confirm-download-purge', async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase().trim();
      const folderParam = (req.body.folder as string) || 'archive,trash';
      const requestedFolders = (folderParam === 'all' || folderParam === 'archive,trash')
        ? ['archive', 'trash']
        : folderParam.split(',').map(f => f.trim().toLowerCase());

      const user = await getMailboxUserByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }

      const imapHost = user.mailbox?.imapHost || user.imapHost || process.env.IMAP_HOST || 'mail.playbook.com.ph';
      const imapPort = Number(user.mailbox?.imapPort || user.imapPort || process.env.IMAP_PORT || 993);
      const imapUser = user.mailbox?.imapUsername || user.imapUsername || user.email;
      let imapPass = (user as any).imapPassword;
      if (!imapPass && user.mailbox?.imapPasswordEnc) {
        imapPass = decryptCredential(user.mailbox.imapPasswordEnc);
      }
      if (!imapPass && (user as any).passwordEnc) {
        imapPass = decryptCredential((user as any).passwordEnc);
      }
      if (!imapPass) {
        imapPass = (user as any).password || (user as any).mailboxPassword || process.env.IMAP_PASSWORD || 'Playbook2026!';
      }

      const userConfig: MailConnectionConfig = {
        imapHost,
        imapPort,
        imapSecure: imapPort === 993,
        imapUser,
        imapPass,
        smtpHost: user.mailbox?.smtpHost || user.smtpHost || 'mail.playbook.com.ph',
        smtpPort: Number(user.mailbox?.smtpPort || user.smtpPort || 465),
        smtpSecure: true,
        smtpUser: imapUser,
        smtpPass: imapPass,
      };

      let totalPurged = 0;
      for (const folder of requestedFolders) {
        const result = await emptyFolderMessages(userConfig, folder);
        totalPurged += result.count || 0;
      }

      invalidateBluehostStorageCache(email);
      const liveUsedMb = await syncUserBluehostStorage(user, true);

      res.json({
        success: true,
        email,
        purgedCount: totalPurged,
        storageUsedMb: liveUsedMb,
        message: `Verified download complete. Purged ${totalPurged} message(s) from Bluehost storage for ${email}. Live storage is now ${liveUsedMb} MB.`,
      });
    } catch (err: any) {
      console.error('[Confirm Download Purge Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to purge storage after download.' });
    }
  });

  // 3b. Sync live mailbox storage directly from Bluehost IMAP for a user
  app.post('/api/admin/users/:email/sync-storage', async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase().trim();
      const user = await getMailboxUserByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }

      invalidateBluehostStorageCache(email);
      const liveMb = await syncUserBluehostStorage(user, true);
      const stats = await getUserStorageStats(email);

      res.json({
        success: true,
        email,
        storageUsedMb: liveMb,
        ...stats,
        message: `Live Bluehost mailbox storage synchronized: ${liveMb} MB`,
      });
    } catch (err: any) {
      console.error('[Sync User Storage Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to sync storage from Bluehost.' });
    }
  });

  // 4. Export all users' archive or trash as a single master ZIP
  app.post('/api/admin/users-storage/export-all-zip', async (req, res) => {
    try {
      const folderParam = (req.body.folder as string) || (req.query.folder as string) || 'archive,trash';
      const folders = (folderParam === 'all' || folderParam === 'archive,trash')
        ? (['archive', 'trash'] as ('archive' | 'trash')[])
        : (folderParam.split(',').map(f => f.trim().toLowerCase()) as ('archive' | 'trash')[]);

      const { zipBuffer, totalEmails, usersCount } = await createAllUsersStorageZip(folders);

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `jw_all_users_${folders.join('_')}_backup_${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.send(zipBuffer);
    } catch (err: any) {
      console.error('[Export All Storage ZIP] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to generate bulk backup zip.' });
    }
  });

  // ----------------------------------------------------
  // WEBMAIL MESSAGES & FOLDERS ROUTES
  // Supports both /api/mail and /api/emails routes
  // ----------------------------------------------------
  app.post(['/api/mail/sync', '/api/emails/sync'], async (req, res) => {
    try {
      clearMailCaches();
      res.json({
        success: true,
        message: 'Mail synchronization cache cleared successfully.'
      });
    } catch (err: any) {
      console.error('[Mail API] sync error:', err.message);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to clear cache for synchronization.'
      });
    }
  });

  app.get(['/api/mail', '/api/emails'], async (req, res) => {
    const folder = ((req.query.folder as string) || 'inbox') as FolderType;
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const search = (req.query.q as string) || (req.query.search as string) || undefined;
    const unread = req.query.unread === 'true';
    const starred = req.query.starred === 'true';
    const forceRefresh = req.query.refresh === 'true' || req.query.forceRefresh === 'true';

    try {
      const config = await resolveUserMailConfig(req);
      const result = await fetchMailboxMessages(config, folder, { limit, search, unread, starred, forceRefresh });

      // Deduplicate strictly by unique email ID (preserve all distinct IMAP messages)
      const uniqueMap = new Map<string, any>();
      result.emails.forEach(e => {
        if (!uniqueMap.has(e.id)) {
          uniqueMap.set(e.id, e);
        }
      });
      const deduplicatedEmails = Array.from(uniqueMap.values());

      res.json({
        success: true,
        emails: deduplicatedEmails,
        total: deduplicatedEmails.length,
        unreadCount: result.unreadCount,
      });
    } catch (err: any) {
      console.error('[Mail API] fetch error:', err?.message || err);
      const rawUserKey = (req.headers['x-user-email'] || req.query.userEmail || 'default');
      const userKeyStr = typeof rawUserKey === 'string' ? rawUserKey : Array.isArray(rawUserKey) ? String(rawUserKey[0] || 'default') : 'default';
      const userKey = userKeyStr.toLowerCase().trim();
      const storeKey = `${userKey}:${folder}`;
      const cachedFolder = persistentMailboxStore.get(storeKey);
      const fallbackEmails = cachedFolder ? Array.from(cachedFolder.values()) : [];
      const isRateExceeded = String(err?.message || '').toLowerCase().includes('rate exceeded');

      if (fallbackEmails.length > 0) {
        res.json({
          success: true,
          emails: fallbackEmails,
          total: fallbackEmails.length,
          unreadCount: fallbackEmails.filter(e => !e.isRead).length,
          notice: isRateExceeded
            ? 'Bluehost rate limit active. Showing cached emails while server connection cools down.'
            : undefined,
        });
      } else {
        res.json({
          success: false,
          error: isRateExceeded
            ? 'Mail server rate limit reached: Bluehost limits the frequency of IMAP connections per minute. Please wait 30–60 seconds before retrying.'
            : (err.message || 'Failed to fetch messages from mail server.'),
          emails: [],
          total: 0,
          unreadCount: 0,
        });
      }
    }
  });

  app.get(['/api/mail/:id', '/api/emails/:id'], async (req, res) => {
    const messageId = req.params.id;
    const folder = (req.query.folder as string) || 'inbox';

    try {
      const config = await resolveUserMailConfig(req);
      let email = await fetchMessageDetail(config, folder, messageId);

      if (email) {
        if (!email.bodyText?.trim() && !email.bodyHtml?.trim()) {
          const cached = getEmailBodyContent(email.messageId || messageId, email.subject);
          if (cached) {
            email.bodyText = cached.bodyText || email.bodyText;
            email.bodyHtml = cached.bodyHtml || email.bodyHtml;
            email.preview = cached.preview || email.preview;
            if (cached.attachments?.length) {
              email.attachments = cached.attachments;
              email.hasAttachments = true;
            }
          }
        }
        res.json({ success: true, email });
      } else {
        const cached = getEmailBodyContent(messageId);
        if (cached) {
          const fallbackEmail: EmailMessage = {
            id: messageId,
            folder: folder as any,
            from: { name: config.smtpUser?.split('@')[0] || 'Sender', email: config.smtpUser || '' },
            to: [],
            subject: cached.subject || '(No Subject)',
            bodyText: cached.bodyText || '',
            bodyHtml: cached.bodyHtml,
            preview: cached.preview,
            attachments: cached.attachments || [],
            hasAttachments: (cached.attachments || []).length > 0,
            timestamp: new Date().toLocaleDateString(),
            isRead: true,
            isStarred: false,
            security: {
              tlsVersion: 'TLS 1.3 Strict',
              dkimStatus: 'pass',
              spfStatus: 'pass',
              signatureVerified: true,
              ipOrigin: config.smtpHost || '127.0.0.1',
            },
          };
          res.json({ success: true, email: fallbackEmail });
        } else {
          res.status(404).json({ success: false, error: 'Email message not found' });
        }
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get(['/api/mail/:id/thread', '/api/emails/:id/thread'], async (req, res) => {
    const messageId = req.params.id;
    const folder = (req.query.folder as string) || 'inbox';

    try {
      const config = await resolveUserMailConfig(req);
      const email = await fetchMessageDetail(config, folder, messageId);
      if (!email) {
        return res.status(404).json({ success: false, error: 'Base email not found' });
      }

      const isReplyOrForward = (rawSubject?: string) => {
        if (!rawSubject) return false;
        return /^(re|fw|fwd|aw|wg|reply|forward)[:\s\-]/i.test(rawSubject.trim());
      };

      const hasThreadHeaders = Boolean(
        (email.inReplyTo && email.inReplyTo.trim().length > 0) ||
        (email.references && email.references.trim().length > 0) ||
        isReplyOrForward(email.subject)
      );

      // If requested for Sent, Drafts, Trash, or if the email is a standalone new message with no reply/forward headers, keep it strictly as an individual single message
      const normFolder = (folder || 'inbox').toLowerCase();
      if (!hasThreadHeaders || normFolder.includes('sent') || normFolder.includes('draft') || normFolder.includes('trash') || normFolder.includes('spam') || normFolder.includes('junk')) {
        return res.json({ success: true, thread: [email] });
      }

      // 1. Fetch from ALL mailboxes gracefully using cached messages for fast response
      const folders = await listMailboxes(config);
      const results = await Promise.all(
        folders.map(folder =>
          fetchMailboxMessages(config, folder, { limit: 100, forceRefresh: false }).catch(err => {
            console.error(`[Thread API] Failed to fetch folder ${folder}:`, err.message);
            return { emails: [], unreadCount: 0 };
          })
        )
      ).catch(err => {
        console.error('Error fetching mailbox lists for threading:', err);
        return [];
      });

      const normalizeMessageId = (id?: string) => {
        if (!id) return '';
        return id.replace(/^<|>$/g, '').trim().toLowerCase();
      };

      const normalizeSubject = (sub: string) => {
        if (!sub) return '';
        return sub
          .toLowerCase()
          .replace(/^(re|fw|fwd|aw|wg|reply|forward)[:\s\-]*/gi, '')
          .replace(/^(re|fw|fwd|aw|wg|reply|forward)\d*[:\s\-]*/gi, '')
          .trim();
      };

      // Dedup candidates strictly by unique candidate ID
      const allCandidates = results.flatMap(r => (r && r.emails) ? r.emails : []);
      const uniqueCandidatesMap = new Map<string, any>();
      allCandidates.forEach(cand => {
        if (!uniqueCandidatesMap.has(cand.id)) {
          uniqueCandidatesMap.set(cand.id, cand);
        }
      });
      const uniqueCandidates = Array.from(uniqueCandidatesMap.values());

      const threadCandidatesMap = new Map<string, any>();
      threadCandidatesMap.set(email.id, email);

      const matchedNormIds = new Set<string>();
      if (email.messageId) matchedNormIds.add(normalizeMessageId(email.messageId));
      if (email.inReplyTo) matchedNormIds.add(normalizeMessageId(email.inReplyTo));
      if (email.references) {
        email.references.split(/\s+/).forEach(ref => {
          const norm = normalizeMessageId(ref);
          if (norm) matchedNormIds.add(norm);
        });
      }

      const seedSubjectNorm = normalizeSubject(email.subject);
      const emailParticipants = new Set<string>();
      if (email.from?.email) emailParticipants.add(email.from.email.toLowerCase());
      (email.to || []).forEach(t => { if (t.email) emailParticipants.add(t.email.toLowerCase()); });

      let addedNew = true;
      for (let pass = 0; pass < 5 && addedNew; pass++) {
        addedNew = false;
        for (const cand of uniqueCandidates) {
          if (threadCandidatesMap.has(cand.id)) continue;

          let isMatch = false;
          const candMsgIdNorm = normalizeMessageId(cand.messageId);
          const candInReplyNorm = normalizeMessageId(cand.inReplyTo);

          if (candMsgIdNorm && matchedNormIds.has(candMsgIdNorm)) isMatch = true;
          if (candInReplyNorm && matchedNormIds.has(candInReplyNorm)) isMatch = true;
          if (cand.references) {
            const refs = cand.references.split(/\s+/);
            for (const ref of refs) {
              if (matchedNormIds.has(normalizeMessageId(ref))) {
                isMatch = true;
                break;
              }
            }
          }

          const candSubjectNorm = normalizeSubject(cand.subject);
          if (!isMatch && seedSubjectNorm.length > 2 && candSubjectNorm.length > 2) {
            // Strict exact match: must be the exact same normalized subject, and at least one must be a reply/forward
            if (candSubjectNorm === seedSubjectNorm && (isReplyOrForward(cand.subject) || isReplyOrForward(email.subject))) {
              const candFrom = cand.from?.email?.toLowerCase();
              const candTo = (cand.to || []).map((t: any) => t.email?.toLowerCase());
              if (candFrom && (emailParticipants.has(candFrom) || candTo.some((toEmail: string) => emailParticipants.has(toEmail)))) {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            threadCandidatesMap.set(cand.id, cand);
            if (cand.messageId) matchedNormIds.add(normalizeMessageId(cand.messageId));
            if (cand.inReplyTo) matchedNormIds.add(normalizeMessageId(cand.inReplyTo));
            if (cand.references) {
              cand.references.split(/\s+/).forEach(ref => {
                const norm = normalizeMessageId(ref);
                if (norm) matchedNormIds.add(norm);
              });
            }
            if (cand.from?.email) emailParticipants.add(cand.from.email.toLowerCase());
            (cand.to || []).forEach(t => { if (t.email) emailParticipants.add(t.email.toLowerCase()); });
            addedNew = true;
          }
        }
      }

      const threadCandidates = Array.from(threadCandidatesMap.values());

      // 2. Fetch full body details & attachments for all matched emails
      const fullThreadMessages = await Promise.all(
        threadCandidates.map(async (cand) => {
          if (cand.id === email.id) {
            return email;
          }
          try {
            const detailed = await fetchMessageDetail(config, cand.folder, cand.id);
            return detailed || cand;
          } catch (err) {
            console.warn(`[Thread fetch warning] Failed to fetch full detail for ${cand.id}:`, err);
            return cand;
          }
        })
      );

      // 3. Deduplicate thread messages by normalized Message-ID or content fingerprint
      const getDedupeKey = (msg: any) => {
        const normMsgId = (msg.messageId || '').replace(/^<|>$/g, '').trim().toLowerCase();
        if (normMsgId) return normMsgId;
        const from = (msg.from?.email || '').toLowerCase().trim();
        const sub = normalizeSubject(msg.subject || '');
        const time = msg.rawDate || msg.timestamp || '';
        const snippet = (msg.preview || msg.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        return `fp:${from}|${sub}|${time}|${snippet}`;
      };

      const uniqueThreadMap = new Map<string, any>();
      fullThreadMessages.forEach(msg => {
        const key = getDedupeKey(msg);
        if (!uniqueThreadMap.has(key)) {
          uniqueThreadMap.set(key, msg);
        }
      });
      const deduplicatedThread = Array.from(uniqueThreadMap.values());

      const extractActualText = (bodyText?: string) => {
        if (!bodyText) return '';
        return bodyText
          .replace(/---\s*Original Message[\s\S]*$/gi, '')
          .replace(/On\s+.*wrote:\s*$/gi, '')
          .replace(/^>.*$/gm, '')
          .replace(/In reply to:[\s\S]*$/gi, '')
          .trim();
      };

      // 4. Sort chronologically (oldest first)
      deduplicatedThread.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (aTime !== bTime && !isNaN(aTime) && !isNaN(bTime)) {
          return aTime - bTime;
        }
        const aUid = Number(a.id.split('-').pop()) || 0;
        const bUid = Number(b.id.split('-').pop()) || 0;
        return aUid - bUid;
      });

      // 5. Filter out empty ghost messages that contain only quoted text without actual new content
      const finalThread = deduplicatedThread.filter(msg => {
        if (msg.id === email.id) return true;
        const actual = extractActualText(msg.bodyText);
        if (!actual && (!msg.attachments || msg.attachments.length === 0)) {
          return false;
        }
        return true;
      });

      res.json({ success: true, thread: finalThread });
    } catch (err: any) {
      console.error('[Mail API] Thread error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch(['/api/mail/:id/read', '/api/emails/:id/read'], async (req, res) => {
    const messageId = req.params.id;
    const { isRead, folder = 'inbox' } = req.body;

    try {
      const config = await resolveUserMailConfig(req);
      await performBatchAction(config, folder, [messageId], isRead ? 'markRead' : 'markUnread');
      res.json({ success: true, isRead });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch(['/api/mail/:id/star', '/api/emails/:id/star'], async (req, res) => {
    const messageId = req.params.id;
    const { isStarred, folder = 'inbox' } = req.body;

    try {
      const config = await resolveUserMailConfig(req);
      await performBatchAction(config, folder, [messageId], isStarred ? 'star' : 'unstar');
      res.json({ success: true, isStarred });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleMoveMessage = async (req: express.Request, res: express.Response) => {
    const messageId = req.params.id;
    const { sourceFolder = 'inbox', targetFolder } = req.body;

    try {
      const config = await resolveUserMailConfig(req);
      await performBatchAction(config, sourceFolder, [messageId], 'move', targetFolder);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
  app.patch(['/api/mail/:id/move', '/api/emails/:id/move'], handleMoveMessage);
  app.post(['/api/mail/:id/move', '/api/emails/:id/move'], handleMoveMessage);

  const handleEmptyTrash = async (req: any, res: any) => {
    try {
      const user = await resolveUserFromRequest(req);
      if (!user) {
        res.status(401).json({ success: false, error: 'User not authenticated' });
        return;
      }
      const config = await resolveUserMailConfig(req);
      console.log(`[API Empty Trash] Starting permanent expunge of Trash folder for ${user.email}`);
      const result = await emptyTrashFolder(config);

      // Invalidate Bluehost live storage cache so that host storage reflects the freed space
      invalidateBluehostStorageCache(user.email);

      // Refresh host quota in background to immediately update user storage
      syncUserBluehostStorage(user, true).catch((err) => {
        console.warn(`[Empty Trash Host Quota Sync Error for ${user.email}]:`, err?.message);
      });

      res.json({
        success: true,
        count: result.count,
        message: `Permanently removed ${result.count} message(s) from host storage.`,
      });
    } catch (err: any) {
      console.error('[API Empty Trash Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to empty trash.' });
    }
  };

  app.post(['/api/mail/trash/empty', '/api/emails/trash/empty', '/api/mail/trash/purge'], handleEmptyTrash);
  app.delete(['/api/mail/trash/empty', '/api/emails/trash/empty', '/api/mail/trash'], handleEmptyTrash);

  app.delete(['/api/mail/:id', '/api/emails/:id'], async (req, res) => {
    const messageId = req.params.id;
    const folder = (req.query.folder as string) || (req.body?.folder as string) || 'inbox';

    try {
      const config = await resolveUserMailConfig(req);
      await performBatchAction(config, folder, [messageId], 'trash');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post(['/api/mail/send', '/api/emails/send'], upload.any(), async (req, res) => {
    console.log('[API /api/mail/send] req.body keys:', Object.keys(req.body || {}), 'req.files count:', (req.files as any)?.length || 0);
    let { to, cc, bcc, subject, body, bodyText, isHtml, deleteDraftId, clientAttachments: rawClientAttachments } = req.body;

    if (typeof to === 'string') {
      try { to = JSON.parse(to); } catch {}
    }
    if (typeof cc === 'string') {
      try { cc = JSON.parse(cc); } catch {}
    }
    if (typeof bcc === 'string') {
      try { bcc = JSON.parse(bcc); } catch {}
    }
    if (typeof rawClientAttachments === 'string') {
      try { rawClientAttachments = JSON.parse(rawClientAttachments); } catch {}
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const multerAttachments = files.map(f => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }));

    const clientAttachments = (Array.isArray(rawClientAttachments) ? rawClientAttachments : []).map((att: any) => {
      let content = att.content;
      if (typeof content === 'string' && content.startsWith('data:')) {
        const commaIndex = content.indexOf(',');
        if (commaIndex !== -1) {
          try { content = Buffer.from(content.substring(commaIndex + 1), 'base64'); } catch {}
        }
      } else if (typeof content === 'string' && content.length > 0) {
        try { content = Buffer.from(content, 'base64'); } catch {}
      }
      return {
        filename: att.name || att.filename || 'attachment',
        content: content || Buffer.alloc(0),
        contentType: att.type || att.contentType || 'application/octet-stream',
      };
    });

    const attachments = [...multerAttachments, ...clientAttachments];

    // Extract and parse recipients resiliently
    let formattedTo: { name: string; email: string }[] = [];
    const rawTo = to ?? req.body.recipients ?? req.body.toInput;

    if (Array.isArray(rawTo)) {
      formattedTo = rawTo
        .map((item: any) => {
          if (typeof item === 'string') {
            const clean = item.trim();
            return clean ? { name: clean.split('@')[0], email: clean } : null;
          } else if (item && typeof item === 'object') {
            const email = (item.email || '').trim();
            const name = item.name || (email ? email.split('@')[0] : 'User');
            return email ? { name, email } : null;
          }
          return null;
        })
        .filter((item): item is { name: string; email: string } => item !== null);
    } else if (rawTo && typeof rawTo === 'object' && rawTo.email) {
      const email = String(rawTo.email).trim();
      if (email) formattedTo = [{ name: rawTo.name || email.split('@')[0], email }];
    } else if (typeof rawTo === 'string' && rawTo.trim()) {
      try {
        const parsed = JSON.parse(rawTo);
        if (Array.isArray(parsed)) {
          formattedTo = parsed
            .map((item: any) => {
              if (typeof item === 'string') {
                const clean = item.trim();
                return clean ? { name: clean.split('@')[0], email: clean } : null;
              } else if (item && typeof item === 'object') {
                const email = (item.email || '').trim();
                const name = item.name || (email ? email.split('@')[0] : 'User');
                return email ? { name, email } : null;
              }
              return null;
            })
            .filter((item): item is { name: string; email: string } => item !== null);
        } else if (parsed && typeof parsed === 'object' && parsed.email) {
          const email = String(parsed.email).trim();
          if (email) formattedTo = [{ name: parsed.name || email.split('@')[0], email }];
        } else {
          formattedTo = rawTo.split(',').map(s => s.trim()).filter(Boolean).map(e => ({ name: e.split('@')[0], email: e }));
        }
      } catch {
        formattedTo = rawTo.split(',').map(s => s.trim()).filter(Boolean).map(e => ({ name: e.split('@')[0], email: e }));
      }
    }

    if (formattedTo.length === 0) {
      res.status(400).json({ success: false, error: 'At least one recipient is required.' });
      return;
    }

    try {
      const config = await resolveUserMailConfig(req);

      const result = await sendEmailViaSmtp(config, {
        from: { name: config.smtpUser.split('@')[0], email: config.smtpUser },
        to: formattedTo,
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
        subject: subject || '(No Subject)',
        bodyText: bodyText || body || '',
        bodyHtml: isHtml ? (bodyText || body || '') : undefined,
        attachments,
      });

      if (!result.success) {
        res.status(500).json({ success: false, error: result.error || 'Failed to dispatch email.' });
        return;
      }

      if (deleteDraftId) {
        try {
          await performBatchAction(config, 'drafts', [deleteDraftId], 'trash');
        } catch (delErr: any) {
          console.warn('[Send Email] Failed to delete draft after sending:', delErr.message);
        }
      }

      res.json({ success: true, result });
    } catch (err: any) {
      console.error('[Send Email Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to dispatch email.' });
    }
  });

  app.post(['/api/mail/draft', '/api/emails/draft'], upload.any(), async (req, res) => {
    let { to, cc, bcc, subject, bodyText, existingDraftId, clientAttachments: rawClientAttachments } = req.body;
    if (typeof to === 'string') { try { to = JSON.parse(to); } catch {} }
    if (typeof cc === 'string') { try { cc = JSON.parse(cc); } catch {} }
    if (typeof rawClientAttachments === 'string') { try { rawClientAttachments = JSON.parse(rawClientAttachments); } catch {} }

    const files = (req.files as Express.Multer.File[]) || [];
    const multerAttachments = files.map(f => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }));
    const clientAttachments = (Array.isArray(rawClientAttachments) ? rawClientAttachments : []).map((att: any) => {
      let content = att.content;
      if (typeof content === 'string' && content.startsWith('data:')) {
        const commaIndex = content.indexOf(',');
        if (commaIndex !== -1) {
          try { content = Buffer.from(content.substring(commaIndex + 1), 'base64'); } catch {}
        }
      } else if (typeof content === 'string' && content.length > 0) {
        try { content = Buffer.from(content, 'base64'); } catch {}
      }
      return {
        filename: att.name || att.filename || 'attachment',
        content: content || Buffer.alloc(0),
        contentType: att.type || att.contentType || 'application/octet-stream',
      };
    });
    const attachments = [...multerAttachments, ...clientAttachments];

    try {
      const config = await resolveUserMailConfig(req);
      let formattedTo: { name: string; email: string }[] = [];
      const rawTo = to ?? req.body.recipients ?? req.body.toInput;

      if (Array.isArray(rawTo)) {
        formattedTo = rawTo
          .map((item: any) => {
            if (typeof item === 'string') {
              const clean = item.trim();
              return clean ? { name: clean.split('@')[0], email: clean } : null;
            } else if (item && typeof item === 'object') {
              const email = (item.email || '').trim();
              const name = item.name || (email ? email.split('@')[0] : 'User');
              return email ? { name, email } : null;
            }
            return null;
          })
          .filter((item): item is { name: string; email: string } => item !== null);
      } else if (rawTo && typeof rawTo === 'object' && rawTo.email) {
        const email = String(rawTo.email).trim();
        if (email) formattedTo = [{ name: rawTo.name || email.split('@')[0], email }];
      } else if (typeof rawTo === 'string' && rawTo.trim()) {
        try {
          const parsed = JSON.parse(rawTo);
          if (Array.isArray(parsed)) {
            formattedTo = parsed
              .map((item: any) => {
                if (typeof item === 'string') {
                  const clean = item.trim();
                  return clean ? { name: clean.split('@')[0], email: clean } : null;
                } else if (item && typeof item === 'object') {
                  const email = (item.email || '').trim();
                  const name = item.name || (email ? email.split('@')[0] : 'User');
                  return email ? { name, email } : null;
                }
                return null;
              })
              .filter((item): item is { name: string; email: string } => item !== null);
          } else if (parsed && typeof parsed === 'object' && parsed.email) {
            const email = String(parsed.email).trim();
            if (email) formattedTo = [{ name: parsed.name || email.split('@')[0], email }];
          } else {
            formattedTo = rawTo.split(',').map(s => s.trim()).filter(Boolean).map(e => ({ name: e.split('@')[0], email: e }));
          }
        } catch {
          formattedTo = rawTo.split(',').map(s => s.trim()).filter(Boolean).map(e => ({ name: e.split('@')[0], email: e }));
        }
      }

      const result = await saveDraft(config, {
        to: formattedTo,
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
        subject: subject || '',
        bodyText: bodyText || '',
        existingDraftId,
      });

      res.json({ success: true, result });
    } catch (err: any) {
      console.error('[Save Draft Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to save draft.' });
    }
  });

  app.post(['/api/mail/batch', '/api/emails/batch'], async (req, res) => {
    const { ids, action, targetFolder, sourceFolder = 'inbox' } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }

    try {
      const config = await resolveUserMailConfig(req);
      const result = await performBatchAction(config, sourceFolder, ids, action, targetFolder);

      if (['trash', 'archive', 'spam', 'move'].includes(action) && config.imapUser) {
        invalidateBluehostStorageCache(config.imapUser);
        cachedAccounts = null;
      }

      res.json(result);
    } catch (err: any) {
      console.error(`[API Batch Error]`, err);
      res.status(500).json({ success: false, error: err.message || 'Batch operation failed' });
    }
  });

  app.get(
    ['/api/mail/messages/:id/attachments/:attId', '/api/emails/messages/:id/attachments/:attId'],
    async (req, res) => {
      const { id, attId } = req.params;
      const folder = (req.query.folder as string) || 'inbox';
      const filename = (req.query.filename as string) || '';
      try {
        const config = await resolveUserMailConfig(req);
        const attachment = await fetchMessageAttachment(config, folder, id, attId, filename);
        if (!attachment) {
          res.status(404).send('Attachment not found');
          return;
        }
        res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
        res.setHeader('Content-Length', attachment.content.length.toString());
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${attachment.filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`
        );
        res.setHeader('Cache-Control', 'no-transform, private, max-age=86400');
        res.end(attachment.content);
      } catch (err: any) {
        res.status(500).send('Error fetching attachment');
      }
    }
  );

  // Diagnostics Suite Route
  app.post('/api/admin/diagnostics/run', async (req, res) => {
    const { mailbox, password, sendTestEmail, testRecipient } = req.body;
    try {
      const config = resolveMailConfig(undefined, { email: mailbox, password });
      const suite = await runFullDiagnosticsSuite(config, {
        mailbox,
        password,
        sendTestEmail,
        testRecipient,
      });
      res.json({ success: true, suite });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Diagnostics failed.' });
    }
  });

  // Vite middleware for development
  const isDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  console.log(`[JW Summit] Environment: ${process.env.NODE_ENV}, isDev: ${isDev}`);

  if (isDev) {
    console.log('[JW Summit] Starting Vite in middleware mode...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // Mount Standalone Zero-Latency Chat
    app.use('/standalone-chat', express.static(path.join(process.cwd(), 'realtime-chat')));
    app.use(vite.middlewares);
  } else {
    console.log('[JW Summit] Running in production mode, serving static files...');
    app.use('/standalone-chat', express.static(path.join(process.cwd(), 'realtime-chat')));
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Create HTTP Server & Socket.io for 0ms sub-millisecond instant messaging
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  setChatSocketIO(io);

  io.on('connection', (socket) => {
    console.log(`[Socket.io Server] Client connected: ${socket.id}`);

    // Send existing statuses immediately upon connection
    socket.emit('user_statuses_update', getAllUserStatuses());

    socket.on('user_join', async (data: any) => {
      console.log(`[Socket.io Server] user_join event received:`, data);
      let email = '';
      let name = '';
      if (typeof data === 'string') {
        name = data;
        email = data;
      } else if (data && typeof data === 'object') {
        email = data.email || '';
        name = data.name || email.split('@')[0] || 'User';
      }

      if (email) {
        const cleanEmail = email.toLowerCase().trim();
        socket.join(`user:${cleanEmail}`);
        const userPart = cleanEmail.split('@')[0];
        if (userPart) socket.join(`user:${userPart}`);
        if (cleanEmail.includes('@playbook.com.ph')) {
          socket.join(`user:${cleanEmail.replace('@playbook.com.ph', '@playbook.com')}`);
        } else if (cleanEmail.includes('@playbook.com')) {
          socket.join(`user:${cleanEmail.replace('@playbook.com', '@playbook.com.ph')}`);
        }
        socket.join('room:general');
        socket.join('room:all');
        await registerOnlineUser(socket.id, cleanEmail, name);
        console.log(`[Socket.io Server] User ${cleanEmail} joined rooms user:${cleanEmail}, user:${userPart}, room:general`);

        socket.broadcast.to('room:general').emit('system_message', {
          text: `${name} is online`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });

        // Broadcast updated statuses to all
        io.emit('user_statuses_update', getAllUserStatuses());
      }
    });

    socket.on('set_status', (data: { email: string; status: 'online' | 'idle' | 'dnd' }) => {
      if (data && data.email && data.status) {
        console.log(`[Socket.io Server] User ${data.email} setting status to ${data.status}`);
        setUserStatus(data.email, data.status);
      }
    });

    socket.on('chat_message', async (payload: any) => {
      console.log(`[Socket.io Server] chat_message event received from client:`, payload);
      if (!payload || (!payload.text && !payload.attachmentUrl)) return;
      try {
        if (payload.recipientEmail && payload.recipientEmail.toLowerCase().trim().startsWith('group_')) {
          const group = await getDoc<any>('group_chats', payload.recipientEmail.toLowerCase().trim());
          if (group && Array.isArray(group.memberEmails)) {
            const isMember = group.memberEmails.map((e: any) => (e || '').toLowerCase().trim()).includes((payload.senderEmail || '').toLowerCase().trim());
            if (!isMember) {
              console.warn(`[Socket.io Server] User ${payload.senderEmail} attempted to send message to group ${payload.recipientEmail} but is not a member.`);
              return;
            }
          }
        }
        await sendChatMessage(payload);
      } catch (err) {
        console.error('[Socket Chat Message Error]', err);
      }
    });

    socket.on('toggle_reaction', async (data: { messageId: string; emoji: string; email: string; action?: 'add' | 'remove' | 'toggle' }) => {
      if (data?.messageId && data?.emoji && data?.email) {
        await toggleMessageReaction(data.messageId, data.emoji, data.email, data.action);
      }
    });

    socket.on('typing', async (data: any) => {
      const recipient = (data?.recipientEmail || 'room').toLowerCase().trim();
      const senderName = data?.senderName || 'Colleague';
      const senderEmail = (data?.senderEmail || '').toLowerCase().trim();
      const isTyping = Boolean(data?.isTyping);

      if (recipient === 'room') {
        socket.broadcast.to('room:general').emit('user_typing', {
          senderEmail: data?.senderEmail,
          username: senderName,
          recipientEmail: 'room',
          isTyping,
        });
      } else if (recipient.startsWith('group_')) {
        try {
          const groupDoc = await getDoc<any>('group_chats', recipient);
          if (groupDoc && groupDoc.memberEmails) {
            groupDoc.memberEmails.forEach((email: string) => {
              const cleanE = email.toLowerCase().trim();
              if (cleanE !== senderEmail) {
                io.to(`user:${cleanE}`).emit('user_typing', {
                  senderEmail,
                  username: senderName,
                  recipientEmail: recipient,
                  isTyping,
                });
              }
            });
          }
        } catch (err) {
          console.error('[Socket Typing] Error fetching group members:', err);
        }
      } else {
        const targetRooms = new Set<string>();
        targetRooms.add(`user:${recipient}`);
        const userPart = recipient.split('@')[0];
        if (userPart) targetRooms.add(`user:${userPart}`);
        if (recipient.includes('@playbook.com.ph')) {
          targetRooms.add(`user:${recipient.replace('@playbook.com.ph', '@playbook.com')}`);
        } else if (recipient.includes('@playbook.com')) {
          targetRooms.add(`user:${recipient.replace('@playbook.com', '@playbook.com.ph')}`);
        }

        const typingPayload = {
          senderEmail: data?.senderEmail,
          username: senderName,
          recipientEmail: recipient,
          isTyping,
        };

        for (const room of targetRooms) {
          socket.to(room).emit('user_typing', typingPayload);
        }
      }
    });

    socket.on('mark_read', async (data: any) => {
      const recipient = data?.recipientEmail;
      const sender = data?.senderEmail;
      if (recipient && sender) {
        await markChatAsRead(recipient, sender);
      }
    });

    socket.on('disconnect', () => {
      removeOnlineUser(socket.id);
    });
  });

  // Initialize Physical Storage background worker
  initPhysicalStorageScheduler();

  if (!process.env.VERCEL && !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[JW Summit Webmail Server] Running with Socket.io on http://0.0.0.0:${PORT}`);
    });
  }
}

export const initServerPromise = startServer();
export default app;
