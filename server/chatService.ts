import { getDoc, setDoc, listDocs, isFirestoreQuotaExhausted } from './db.js';
import { Server as SocketIOServer } from 'socket.io';

export interface ChatMessage {
  id: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string; // 'room' for general room, or specific email for DM
  recipientName?: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  timestamp: string;
  createdAt: number;
  isRead: boolean;
  reactions?: Record<string, string[]>;
  isSystem?: boolean;
}

let ioInstance: SocketIOServer | null = null;
const onlineUsers = new Map<string, { email: string; name: string }>(); // Keyed by socketId
const userStatuses = new Map<string, 'online' | 'idle' | 'dnd'>();
let syncIntervalStarted = false;

// Authoritative in-memory message store for instant 0ms access and guaranteed reaction sync
const inMemoryMessages = new Map<string, ChatMessage>();
let messagesLoaded = false;
let loadingPromise: Promise<void> | null = null;

export function getMessageTime(m: Partial<ChatMessage> | null | undefined): number {
  if (!m) return 0;
  if (typeof m.createdAt === 'number' && !isNaN(m.createdAt) && m.createdAt > 0) {
    return m.createdAt;
  }
  if (m.timestamp) {
    const parsed = new Date(m.timestamp).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;

    const timeMatch = m.timestamp.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const ampm = (timeMatch[4] || '').toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d.getTime();
    }
  }
  if (m.id) {
    const match = m.id.match(/(?:msg|chat|temp)_(\d{10,14})/);
    if (match) {
      let num = parseInt(match[1], 10);
      if (num < 10000000000) num *= 1000;
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return 0;
}

async function ensureMessagesLoaded(): Promise<void> {
  if (messagesLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const allMsgs = await listDocs<ChatMessage>('chat_messages');
      for (const m of allMsgs) {
        if (m && m.id) {
          const time = getMessageTime(m);
          inMemoryMessages.set(m.id, {
            ...m,
            createdAt: time || m.createdAt || 0,
          });
        }
      }
      messagesLoaded = true;
      console.log(`[ChatService] Preloaded ${inMemoryMessages.size} chat messages into in-memory store.`);
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (err?.code === 'resource-exhausted' || msg.includes('quota exceeded')) {
        console.warn('[ChatService] Initialized with in-memory chat store (Firestore quota reached).');
      } else {
        console.error('[ChatService] Error loading messages from DB:', err);
      }
      messagesLoaded = true;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

// Background sync to ensure multiple instances / external updates sync smoothly
setInterval(async () => {
  if (isFirestoreQuotaExhausted()) return;
  try {
    const allMsgs = await listDocs<ChatMessage>('chat_messages');
    for (const m of allMsgs) {
      if (!m || !m.id) continue;
      const existing = inMemoryMessages.get(m.id);
      if (!existing) {
        inMemoryMessages.set(m.id, {
          ...m,
          createdAt: getMessageTime(m) || 0,
        });
      } else {
        inMemoryMessages.set(m.id, {
          ...existing,
          ...m,
          reactions: m.reactions || {},
        });
      }
    }
  } catch (err) {
    // Ignore background sync errors
  }
}, 60000);

export function setChatSocketIO(io: SocketIOServer) {
  ioInstance = io;
  if (!syncIntervalStarted) {
    syncIntervalStarted = true;
    setInterval(async () => {
      if (isFirestoreQuotaExhausted()) return;
      try {
        const now = Date.now();
        const uniqueEmails = new Set<string>();
        for (const user of onlineUsers.values()) {
          if (user && user.email) {
            uniqueEmails.add(user.email.toLowerCase().trim());
          }
        }
        for (const email of uniqueEmails) {
          await setDoc('user_presence', email, {
            email,
            status: userStatuses.get(email) || 'online',
            isOnline: true,
            lastActive: now,
          }).catch(() => {});
        }
      } catch (err) {
        // Suppress background presence sync noise
      }
    }, 60000);
  }
}

export async function registerOnlineUser(socketId: string, email: string, name: string) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  onlineUsers.set(socketId, { email: cleanEmail, name });
  
  let status: 'online' | 'idle' | 'dnd' = 'online';
  try {
    const existing = await getDoc<any>('user_presence', cleanEmail);
    if (existing && existing.status) {
      status = existing.status;
    }
  } catch (err) {}

  userStatuses.set(cleanEmail, status);

  await setDoc('user_presence', cleanEmail, {
    email: cleanEmail,
    status,
    isOnline: true,
    lastActive: Date.now(),
  }).catch(() => {});

  broadcastOnlineStatus();
  broadcastStatuses();
}

export function removeOnlineUser(socketId: string) {
  const user = onlineUsers.get(socketId);
  if (user && user.email) {
    const cleanEmail = user.email.toLowerCase().trim();
    setDoc('user_presence', cleanEmail, {
      email: cleanEmail,
      status: userStatuses.get(cleanEmail) || 'online',
      isOnline: false,
      lastActive: Date.now(),
    }).catch(() => {});
  }
  onlineUsers.delete(socketId);
  broadcastOnlineStatus();
  broadcastStatuses();
}

export function getOnlineUsersList(): string[] {
  const emails = new Set<string>();
  for (const user of onlineUsers.values()) {
    if (user && user.email) {
      emails.add(user.email.toLowerCase().trim());
    }
  }
  return Array.from(emails);
}

const pendingStatusTimeouts = new Map<string, NodeJS.Timeout>();

export function setUserStatus(email: string, status: 'online' | 'idle' | 'dnd') {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();

  // Clear any existing pending update timeout for this user
  const existingTimeout = pendingStatusTimeouts.get(cleanEmail);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    pendingStatusTimeouts.delete(cleanEmail);
  }

  // Set user status immediately with 0ms lag
  userStatuses.set(cleanEmail, status);

  // Commit to database asynchronously
  setDoc('user_presence', cleanEmail, {
    email: cleanEmail,
    status,
    isOnline: true,
    lastActive: Date.now(),
  }).catch(() => {});

  // Broadcast updated status via WebSocket immediately
  broadcastStatuses();
}

export function getUserStatus(email: string): 'online' | 'idle' | 'dnd' {
  const cleanEmail = (email || '').toLowerCase().trim();
  return userStatuses.get(cleanEmail) || 'online';
}

export function getAllUserStatuses(): Record<string, 'online' | 'idle' | 'dnd'> {
  const record: Record<string, 'online' | 'idle' | 'dnd'> = {};
  for (const [email, status] of userStatuses.entries()) {
    record[email] = status;
  }
  return record;
}

function broadcastStatuses() {
  if (!ioInstance) return;
  ioInstance.emit('user_statuses_update', getAllUserStatuses());
}

function broadcastOnlineStatus() {
  if (!ioInstance) return;
  const list = getOnlineUsersList();
  ioInstance.emit('online_users', list);
  ioInstance.emit('online_count', list.length);
}

/**
 * Save and broadcast a chat message
 */
export async function sendChatMessage(data: {
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName?: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  id?: string;
  timestamp?: string;
  isSystem?: boolean;
  groupMembers?: string[];
}): Promise<ChatMessage> {
  const normSender = (data.senderEmail || '').toLowerCase().trim();
  const normRecipient = (data.recipientEmail || '').toLowerCase().trim();

  const msgId = data.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Fast deduplication: if this message was already processed (e.g. parallel socket + REST), return existing
  if (inMemoryMessages.has(msgId)) {
    return inMemoryMessages.get(msgId)!;
  }

  const message: ChatMessage = {
    id: msgId,
    senderEmail: normSender,
    senderName: data.senderName || normSender.split('@')[0],
    recipientEmail: normRecipient,
    recipientName: data.recipientName || (normRecipient === 'room' ? 'Company Room' : normRecipient.split('@')[0]),
    text: (data.text || '').trim(),
    attachmentUrl: data.attachmentUrl,
    attachmentName: data.attachmentName,
    timestamp,
    createdAt: Date.now(),
    isRead: false,
    reactions: {},
    isSystem: Boolean(data.isSystem || normSender === 'system'),
  };

  // 1. Instant in-memory cache update for 0ms consistency
  inMemoryMessages.set(msgId, message);

  // 2. Real-time WebSocket dispatch immediately for 0ms instant speed
  console.log(`[ChatService] [0ms WebSocket Broadcast] Sending message ID ${msgId} from ${normSender} to ${normRecipient}`);
  if (ioInstance) {
    if (normRecipient === 'room' || normRecipient === 'company room') {
      ioInstance.to('room:general').to('room:all').emit('chat_message', message);
      ioInstance.emit('chat_message', message);
    } else if (normRecipient.startsWith('group_')) {
      ioInstance.to(`group:${normRecipient}`).emit('chat_message', message);

      const broadcastToEmails = (memberEmails: string[]) => {
        memberEmails.forEach((email: string) => {
          const cleanE = (email || '').toLowerCase().trim();
          if (ioInstance && cleanE) {
            ioInstance.to(`user:${cleanE}`).emit('chat_message', message);
            const userPart = cleanE.split('@')[0];
            if (userPart) ioInstance.to(`user:${userPart}`).emit('chat_message', message);
          }
        });
      };

      if (data.groupMembers && Array.isArray(data.groupMembers) && data.groupMembers.length > 0) {
        broadcastToEmails(data.groupMembers);
      } else {
        getDoc<any>('group_chats', normRecipient)
          .then((groupDoc) => {
            if (groupDoc && groupDoc.memberEmails) {
              broadcastToEmails(groupDoc.memberEmails);
            }
          })
          .catch((err) => {
            console.error('[ChatService] Error loading group for socket broadcast:', err);
          });
      }
    } else {
      const targetRooms = new Set<string>();
      const addAliases = (str: string) => {
        if (!str) return;
        const clean = str.toLowerCase().trim();
        targetRooms.add(`user:${clean}`);
        const userPart = clean.split('@')[0];
        if (userPart) targetRooms.add(`user:${userPart}`);
        if (clean.includes('@playbook.com.ph')) {
          targetRooms.add(`user:${clean.replace('@playbook.com.ph', '@playbook.com')}`);
        } else if (clean.includes('@playbook.com')) {
          targetRooms.add(`user:${clean.replace('@playbook.com', '@playbook.com.ph')}`);
        }
      };

      addAliases(normRecipient);
      addAliases(normSender);

      for (const room of targetRooms) {
        ioInstance.to(room).emit('chat_message', message);
      }
    }
  }

  // 3. Persist in Firestore in background (non-blocking)
  setDoc('chat_messages', msgId, message)
    .then(() => {
      console.log(`[ChatService] [Firestore Sync Success] Persisted message ID ${msgId}`);
    })
    .catch((err) => {
      console.error('[ChatService] Error saving message to Firestore:', err);
    });

  return message;
}

/**
 * Get conversation history between two users or for the general room
 */
export async function getChatHistory(user1Email: string, user2Email: string): Promise<ChatMessage[]> {
  const norm1 = (user1Email || '').toLowerCase().trim();
  const norm2 = (user2Email || '').toLowerCase().trim();

  const getClean = (str: string) => str.split('@')[0].toLowerCase().trim();
  const clean1 = getClean(norm1);
  const clean2 = getClean(norm2);

  try {
    await ensureMessagesLoaded();
    const allMsgs = Array.from(inMemoryMessages.values());
    let filtered: ChatMessage[] = [];

    if (norm2 === 'room' || norm2 === 'company room') {
      filtered = allMsgs.filter((m) => {
        const r = (m.recipientEmail || '').toLowerCase().trim();
        return r === 'room' || r.includes('room');
      });
    } else if (norm2.startsWith('group_')) {
      filtered = allMsgs.filter((m) => {
        const r = (m.recipientEmail || '').toLowerCase().trim();
        return r === norm2;
      });
    } else {
      filtered = allMsgs.filter((m) => {
        const s = (m.senderEmail || '').toLowerCase().trim();
        const r = (m.recipientEmail || '').toLowerCase().trim();
        const sClean = getClean(s);
        const rClean = getClean(r);

        // Disallow leaking company room messages into direct messages
        if (r === 'room' || r.includes('room')) return false;

        const match1 =
          (s === norm1 || s === clean1 || sClean === clean1) &&
          (r === norm2 || r === clean2 || rClean === clean2);

        const match2 =
          (s === norm2 || s === clean2 || sClean === clean2) &&
          (r === norm1 || r === clean1 || rClean === clean1);

        return match1 || match2;
      });
    }

    // Sort chronologically using robust timestamp detection
    return filtered.sort((a, b) => getMessageTime(a) - getMessageTime(b));
  } catch (err) {
    console.error('[ChatService] Error listing chat history:', err);
    return [];
  }
}

/**
 * Mark messages in a conversation as read
 */
export async function markChatAsRead(recipientEmail: string, senderEmail: string): Promise<void> {
  const normRecipient = (recipientEmail || '').toLowerCase().trim();
  const normSender = (senderEmail || '').toLowerCase().trim();
  if (!normRecipient || !normSender || normSender === 'room') return;

  try {
    await ensureMessagesLoaded();
    const unread: ChatMessage[] = [];

    for (const msg of inMemoryMessages.values()) {
      const s = (msg.senderEmail || '').toLowerCase().trim();
      const r = (msg.recipientEmail || '').toLowerCase().trim();
      if (s === normSender && r === normRecipient && !msg.isRead) {
        const updated = { ...msg, isRead: true };
        inMemoryMessages.set(msg.id, updated);
        unread.push(updated);
      }
    }

    for (const msg of unread) {
      await setDoc('chat_messages', msg.id, msg).catch(() => {});
    }

    if (ioInstance && unread.length > 0) {
      ioInstance.to(`user:${normSender}`).emit('messages_read', { by: normRecipient });
    }
  } catch (err) {
    console.error('[ChatService] Error marking as read:', err);
  }
}

/**
 * Get unread counts and last message snippet for all contacts for a user
 */
export async function getContactsChatMeta(activeUserEmail: string): Promise<{
  lastMessageMap: Record<string, ChatMessage>;
  unreadCountMap: Record<string, number>;
}> {
  const normUser = (activeUserEmail || '').toLowerCase().trim();
  const cleanUser = normUser.split('@')[0];
  const lastMessageMap: Record<string, ChatMessage> = {};
  const unreadCountMap: Record<string, number> = {};

  try {
    const allGroups = await listDocs<any>('group_chats').catch(() => []);
    const myGroupIds = new Set(
      allGroups
        .filter(g => g && Array.isArray(g.memberEmails) && g.memberEmails.map((e: any) => (e || '').toLowerCase().trim()).includes(normUser))
        .map(g => (g.id || '').toLowerCase().trim())
        .filter(Boolean)
    );

    await ensureMessagesLoaded();
    const allMsgs = Array.from(inMemoryMessages.values());
    const sorted = allMsgs.sort((a, b) => {
      const diff = getMessageTime(a) - getMessageTime(b);
      if (diff !== 0) return diff;
      return (a.id || '').localeCompare(b.id || '');
    });

    for (const msg of sorted) {
      const s = (msg.senderEmail || '').toLowerCase().trim();
      const r = (msg.recipientEmail || '').toLowerCase().trim();

      if (r === 'room' || r.includes('room')) {
        const existing = lastMessageMap['room'];
        if (!existing || getMessageTime(msg) >= getMessageTime(existing)) {
          lastMessageMap['room'] = msg;
        }
        continue;
      }

      if (r.startsWith('group_')) {
        if (myGroupIds.has(r)) {
          const existing = lastMessageMap[r];
          if (!existing || getMessageTime(msg) >= getMessageTime(existing)) {
            lastMessageMap[r] = msg;
          }
          if (s !== normUser && !msg.isRead) {
            unreadCountMap[r] = (unreadCountMap[r] || 0) + 1;
          }
        }
        continue;
      }

      const sClean = s.split('@')[0];
      const rClean = r.split('@')[0];

      const isSenderUser = s === normUser || s === cleanUser || sClean === cleanUser;
      const isRecipientUser = r === normUser || r === cleanUser || rClean === cleanUser;

      let partner = '';
      if (isSenderUser && !isRecipientUser) {
        partner = r;
      } else if (isRecipientUser && !isSenderUser) {
        partner = s;
      }

      if (partner) {
        const partnerEmail = (partner.includes('@') ? partner : `${partner}@playbook.com.ph`).toLowerCase().trim();
        const partnerUserPart = partnerEmail.split('@')[0];

        const existing = lastMessageMap[partnerEmail];
        if (!existing || getMessageTime(msg) >= getMessageTime(existing)) {
          lastMessageMap[partnerEmail] = msg;
          lastMessageMap[partnerUserPart] = msg;
          lastMessageMap[partner] = msg;
        }

        if (isRecipientUser && !msg.isRead) {
          const currentCount = (unreadCountMap[partnerEmail] || 0) + 1;
          unreadCountMap[partnerEmail] = currentCount;
          unreadCountMap[partnerUserPart] = currentCount;
          unreadCountMap[partner] = currentCount;
        }
      }
    }
  } catch (err) {
    console.error('[ChatService] Error getting chat meta:', err);
  }

  return { lastMessageMap, unreadCountMap };
}

export function getChatIOInstance(): SocketIOServer | null {
  return ioInstance;
}

export function isSameUserEmail(email1?: string | null, email2?: string | null): boolean {
  if (!email1 || !email2) return false;
  const e1 = (email1 || '').toLowerCase().trim();
  const e2 = (email2 || '').toLowerCase().trim();
  if (e1 === e2) return true;

  const u1 = e1.split('@')[0].replace(/[^a-z0-9]/g, '');
  const u2 = e2.split('@')[0].replace(/[^a-z0-9]/g, '');

  if (!u1 || !u2) return false;

  const d1 = e1.includes('@') ? e1.split('@')[1] : '';
  const d2 = e2.includes('@') ? e2.split('@')[1] : '';

  const isPlaybook1 = d1 === 'playbook.com' || d1 === 'playbook.com.ph';
  const isPlaybook2 = d2 === 'playbook.com' || d2 === 'playbook.com.ph';

  if (u1 === u2) {
    if (isPlaybook1 && isPlaybook2) return true;
    if (!d1 || !d2) return true;
    if (d1 === d2) return true;
  }

  return false;
}

/**
 * Toggle or explicitly add/remove a reaction on a chat message
 */
export async function toggleMessageReaction(
  msgId: string,
  emoji: string,
  userEmail: string,
  action?: 'add' | 'remove' | 'toggle'
): Promise<ChatMessage | null> {
  const normUser = (userEmail || '').toLowerCase().trim();
  if (!msgId || !emoji || !normUser) return null;

  try {
    await ensureMessagesLoaded();
    let msg = inMemoryMessages.get(msgId);
    if (!msg) {
      msg = await getDoc<ChatMessage>('chat_messages', msgId);
      if (msg) {
        inMemoryMessages.set(msgId, msg);
      }
    }
    if (!msg) return null;

    const reactions = msg.reactions || {};
    const existingList = reactions[emoji] || [];
    const hasReacted = existingList.some(e => isSameUserEmail(e, normUser));

    let shouldRemove = false;
    if (action === 'remove') {
      shouldRemove = true;
    } else if (action === 'add') {
      shouldRemove = false;
    } else {
      shouldRemove = hasReacted;
    }

    let updatedList: string[];
    if (shouldRemove) {
      // Remove all occurrences / aliases of this user
      updatedList = existingList.filter(e => !isSameUserEmail(e, normUser));
    } else {
      if (hasReacted) {
        updatedList = existingList;
      } else {
        // Add user while ensuring no duplicate aliases
        updatedList = [...existingList.filter(e => !isSameUserEmail(e, normUser)), normUser];
      }
    }

    const updatedReactions = { ...reactions };
    if (updatedList.length > 0) {
      updatedReactions[emoji] = updatedList;
    } else {
      delete updatedReactions[emoji];
    }

    // Check if reactions actually changed to avoid duplicate socket broadcasts and unnecessary writes
    const prevReactionsJSON = JSON.stringify(reactions);
    const newReactionsJSON = JSON.stringify(updatedReactions);
    const hasChanged = prevReactionsJSON !== newReactionsJSON;

    const updatedMsg: ChatMessage = {
      ...msg,
      reactions: updatedReactions,
    };

    // Update in-memory map IMMEDIATELY for 0ms synchronous read consistency
    inMemoryMessages.set(msgId, updatedMsg);

    // Persist to Firestore asynchronously only if state actually changed
    if (hasChanged) {
      setDoc('chat_messages', msgId, updatedMsg, false).catch((err) => {
        console.error('[ChatService] Error saving reaction to Firestore:', err);
      });
    }

    // Broadcast update over Socket.io immediately only if state changed
    if (ioInstance && hasChanged) {
      ioInstance.emit('message_reaction_updated', {
        messageId: msgId,
        reactions: updatedReactions,
        userEmail: normUser,
        emoji,
      });
    }

    return updatedMsg;
  } catch (err) {
    console.error('[ChatService] Error toggling reaction:', err);
    return null;
  }
}
