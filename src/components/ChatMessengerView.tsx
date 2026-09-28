import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Send,
  MessageSquare,
  Search,
  Paperclip,
  Smile,
  X,
  RefreshCw,
  Mail,
  Loader2,
  Users,
  CheckCheck,
  ExternalLink,
  ShieldCheck,
  Zap,
  Plus,
  UserPlus,
  UserMinus,
  LogOut,
  Lock,
  AlertCircle,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { User } from '../types';
import { apiFetch } from '../lib/api';

let sharedAudioCtx: AudioContext | null = null;
let lastNotificationSoundTime = 0;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// User-gesture audio unlocker: unblocks browser autoplay restriction on first user click or keypress
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

/**
 * Play a subtle, elegant notification chime using Web Audio API.
 * Synthesizes a soft two-tone chime (587.33Hz D5 -> 880Hz A5) with a gentle volume (0.12)
 * and exponential decay so it is pleasant and non-intrusive.
 */
export function playMessageNotificationSound() {
  if (typeof window === 'undefined') return;
  try {
    const isMuted = localStorage.getItem('jw_chat_sound_muted') === 'true';
    if (isMuted) return;

    const nowTime = Date.now();
    // Throttle to avoid repeated chimes if multiple messages arrive within 800ms
    if (nowTime - lastNotificationSoundTime < 800) return;
    lastNotificationSoundTime = nowTime;

    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Master volume set to a subtle level (0.12)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.12, t);
    masterGain.connect(ctx.destination);

    // Primary bell tone (587.33 Hz - D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, t);
    gain1.gain.setValueAtTime(0.0001, t);
    gain1.gain.linearRampToValueAtTime(0.55, t + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.25);

    // Harmonic accent chime tone (880 Hz - A5, offset by 70ms for classic pleasant ding)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, t + 0.07);
    gain2.gain.setValueAtTime(0.0001, t + 0.07);
    gain2.gain.linearRampToValueAtTime(0.65, t + 0.085);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t + 0.07);
    osc2.stop(t + 0.4);
  } catch {
    // Browser audio autoplay restrictions gracefully ignored
  }
}

export interface ChatMessage {
  id: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName?: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  timestamp: string;
  createdAt?: number;
  isRead?: boolean;
  reactions?: Record<string, string[]>;
  isSystem?: boolean;
}

export interface GroupChat {
  id: string;
  name: string;
  creatorEmail: string;
  memberEmails: string[];
  createdAt: number;
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
}

export interface ChatContact {
  user: User;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  isOnline: boolean;
}

interface ChatMessengerViewProps {
  currentUser: User;
  token?: string | null;
  onOpenComposeWithEmail?: (email: string) => void;
  onUnreadCountChange?: (count: number) => void;
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

export const ChatMessengerView: React.FC<ChatMessengerViewProps> = ({
  currentUser,
  token,
  onOpenComposeWithEmail,
  onUnreadCountChange,
}) => {
  // Navigation: 'room' or colleague email
  const [activeRecipient, setActiveRecipient] = useState<string>('room');
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Group states
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(true);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupEmails, setSelectedGroupEmails] = useState<string[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteGroupEmails, setInviteGroupEmails] = useState<string[]>([]);

  // Messages in current active thread
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [roomOnlineCount, setRoomOnlineCount] = useState<number>(1);
  const [onlineUserEmails, setOnlineUserEmails] = useState<Set<string>>(new Set());
  const [userStatus, setUserStatusLocal] = useState<'online' | 'idle' | 'dnd'>('online');
  const [userStatuses, setUserStatuses] = useState<Record<string, 'online' | 'idle' | 'dnd'>>({});
  const [showChatInfoDropdown, setShowChatInfoDropdown] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<'photos' | 'files' | null>(null);
  const [activeReactionMenuMsgId, setActiveReactionMenuMsgId] = useState<string | null>(null);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('jw_chat_sound_muted') === 'true';
  });

  const toggleSound = () => {
    setIsSoundMuted((prev) => {
      const next = !prev;
      localStorage.setItem('jw_chat_sound_muted', String(next));
      if (!next) {
        playMessageNotificationSound();
      }
      return next;
    });
  };

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reactionDebounceRef = useRef<Map<string, number>>(new Map());

  const handleTouchStart = (msgId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(40);
        } catch (_) {}
      }
      setActiveReactionMenuMsgId(msgId);
    }, 400);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    const handleGlobalPointerDown = (e: MouseEvent | TouchEvent) => {
      setActiveReactionMenuMsgId(null);
    };
    if (activeReactionMenuMsgId) {
      document.addEventListener('pointerdown', handleGlobalPointerDown);
      return () => document.removeEventListener('pointerdown', handleGlobalPointerDown);
    }
  }, [activeReactionMenuMsgId]);

  const handleStatusChange = (status: 'online' | 'idle' | 'dnd') => {
    setUserStatusLocal(status);
    
    apiFetch('/api/chat/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': currentUser.email,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ status }),
    }).catch((err) => {
      console.error('[HTTP status write error]', err);
    });

    if (socketRef.current?.connected) {
      socketRef.current.emit('set_status', {
        email: currentUser.email.toLowerCase().trim(),
        status,
      });
    }
  };

  // Input states
  const [inputText, setInputText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handleGlobalClickForEmojiPicker = () => {
      setShowEmojiPicker(false);
    };
    if (showEmojiPicker) {
      document.addEventListener('pointerdown', handleGlobalClickForEmojiPicker);
      return () => document.removeEventListener('pointerdown', handleGlobalClickForEmojiPicker);
    }
  }, [showEmojiPicker]);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const activeRecipientRef = useRef<string>(activeRecipient);
  activeRecipientRef.current = activeRecipient;
  const messageCacheRef = useRef<Record<string, ChatMessage[]>>({});

  const emojis = ['👍', '❤️', '💼', '🚀', '🔥', '✅', '👋', '🎉', '💡', '⚠️'];

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const isNearBottom = () => {
    if (!chatContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 150;
  };

  // Selected colleague object (null if general room)
  const selectedContact = useMemo(() => {
    if (!activeRecipient || activeRecipient === 'room' || activeRecipient.startsWith('group_')) return null;
    const cleanActive = (activeRecipient || '').toLowerCase().trim();
    return contacts.find((c) => (c?.user?.email || '').toLowerCase().trim() === cleanActive)?.user || {
      id: activeRecipient,
      email: activeRecipient,
      name: activeRecipient.split('@')[0],
      role: 'staff',
      status: 'active',
    };
  }, [activeRecipient, contacts]);

  const selectedContactItem = useMemo(() => {
    if (!activeRecipient || activeRecipient === 'room' || activeRecipient.startsWith('group_')) return null;
    const cleanActive = (activeRecipient || '').toLowerCase().trim();
    return contacts.find((c) => (c?.user?.email || '').toLowerCase().trim() === cleanActive) || null;
  }, [activeRecipient, contacts]);

  const activeRecipientStatus = useMemo(() => {
    const cleanRecipient = (activeRecipient || '').toLowerCase().trim();
    if (cleanRecipient === (currentUser?.email || '').toLowerCase().trim()) {
      return userStatus;
    }
    return userStatuses[cleanRecipient] || 'online';
  }, [activeRecipient, userStatuses, userStatus, currentUser?.email]);

  const isGroupActive = Boolean(activeRecipient && activeRecipient.startsWith('group_'));
  const activeGroup = useMemo(() => {
    if (!isGroupActive) return null;
    const cleanActive = (activeRecipient || '').toLowerCase().trim();
    return groups.find((g) => (g?.id || '').toLowerCase().trim() === cleanActive) || null;
  }, [activeRecipient, groups, isGroupActive]);

  // Total unread count for standard mail sidebar (both direct chats and groups)
  const totalUnreadCount = useMemo(() => {
    const contactUnreads = contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const groupUnreads = groups.reduce((sum, g) => sum + (g.unreadCount || 0), 0);
    return contactUnreads + groupUnreads;
  }, [contacts, groups]);

  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(totalUnreadCount);
    }
  }, [totalUnreadCount, onUnreadCountChange]);

  const getCacheKey = (recipient: string) => {
    const normalized = recipient.toLowerCase().trim();
    if (normalized === 'room' || normalized.includes('room')) {
      return 'room';
    }
    return normalized;
  };

  // Fetch Groups
  const fetchGroups = async (silent = false) => {
    if (!silent) setIsLoadingGroups(true);
    try {
      const { ok, data } = await apiFetch('/api/chat/groups', {
        headers: {
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (ok && data?.success && Array.isArray(data.groups)) {
        setGroups((prevGroups) => {
          if (!prevGroups || prevGroups.length === 0) return data.groups;
          return data.groups.map((incomingGroup: GroupChat) => {
            const existing = prevGroups.find((g) => g.id === incomingGroup.id);
            if (!existing) return incomingGroup;
            let bestLastMessage = incomingGroup.lastMessage;
            if (existing.lastMessage && incomingGroup.lastMessage) {
              if (getMessageTime(existing.lastMessage) > getMessageTime(incomingGroup.lastMessage)) {
                bestLastMessage = existing.lastMessage;
              }
            } else if (existing.lastMessage && !incomingGroup.lastMessage) {
              bestLastMessage = existing.lastMessage;
            }
            return {
              ...incomingGroup,
              lastMessage: bestLastMessage,
            };
          });
        });
      }
    } catch (err) {
      console.error('[Chat Groups Fetch Error]', err);
    } finally {
      if (!silent) setIsLoadingGroups(false);
    }
  };

  // 1. Fetch Contacts
  const fetchContacts = async (silent = false) => {
    if (!silent) setIsLoadingContacts(true);
    try {
      const { ok, data } = await apiFetch('/api/chat/contacts', {
        headers: {
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (ok && data?.success && Array.isArray(data.contacts)) {
        setContacts((prevContacts) => {
          if (!prevContacts || prevContacts.length === 0) return data.contacts;
          return data.contacts.map((incomingContact: ChatContact) => {
            const incomingEmail = (incomingContact.user?.email || '').toLowerCase().trim();
            const existing = prevContacts.find(
              (c) => (c.user?.email || '').toLowerCase().trim() === incomingEmail
            );
            if (!existing) return incomingContact;

            let bestLastMessage = incomingContact.lastMessage;
            if (existing.lastMessage && incomingContact.lastMessage) {
              if (getMessageTime(existing.lastMessage) > getMessageTime(incomingContact.lastMessage)) {
                bestLastMessage = existing.lastMessage;
              }
            } else if (existing.lastMessage && !incomingContact.lastMessage) {
              bestLastMessage = existing.lastMessage;
            }

            return {
              ...incomingContact,
              lastMessage: bestLastMessage,
            };
          });
        });

        if (data.statuses) {
          setUserStatuses((prev) => ({ ...prev, ...data.statuses }));
          const myEmailClean = currentUser.email.toLowerCase().trim();
          if (data.statuses[myEmailClean] && !silent) {
            setUserStatusLocal(data.statuses[myEmailClean]);
          }
        }
        if (typeof data.onlineCount === 'number') {
          setRoomOnlineCount(Math.max(1, data.onlineCount));
        }
      }
    } catch (err) {
      console.error('[Chat Contacts Fetch Error]', err);
    } finally {
      if (!silent) setIsLoadingContacts(false);
    }
  };

  const getMessageTime = (m: Partial<ChatMessage> | null | undefined): number => {
    if (!m) return 0;
    if (typeof m.createdAt === 'number' && !isNaN(m.createdAt) && m.createdAt > 0) return m.createdAt;
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
  };

  // 2. Fetch Messages for Active Thread (Cache-first for 0ms transition)
  const fetchMessagesForThread = async (recipient: string, silent = false) => {
    const threadKey = getCacheKey(recipient);
    
    if (!silent) {
      const cached = messageCacheRef.current[threadKey];
      if (cached && cached.length > 0) {
        setMessages(cached);
        setTimeout(() => scrollToBottom('auto'), 20);
      } else {
        setMessages([]); // Clear previous thread's messages to avoid displaying the wrong thread
      }
      setIsLoadingMessages(true);
    }

    try {
      const { ok, data } = await apiFetch(`/api/chat/messages?with=${encodeURIComponent(recipient)}`, {
        headers: {
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (ok && data?.success && Array.isArray(data.messages)) {
        const currentCache = messageCacheRef.current[threadKey] || [];
        const map = new Map<string, ChatMessage>();
        for (const m of data.messages) {
          map.set(m.id, {
            ...m,
            reactions: m.reactions || {},
          });
        }
        for (const m of currentCache) {
          if (!map.has(m.id)) {
            map.set(m.id, m);
          }
        }
        const merged = Array.from(map.values()).sort((a, b) => getMessageTime(a) - getMessageTime(b));
        
        const oldJSON = JSON.stringify(messageCacheRef.current[threadKey] || []);
        const newJSON = JSON.stringify(merged);

        // If background polling detects newly arrived incoming messages from others, play sound
        if (silent && oldJSON !== newJSON) {
          const oldIds = new Set(currentCache.map((m) => m.id));
          const myEmail = (currentUser?.email || '').toLowerCase().trim();
          const hasNewIncoming = merged.some(
            (m) =>
              !oldIds.has(m.id) &&
              (m?.senderEmail || '').toLowerCase().trim() !== myEmail &&
              (m?.senderEmail || '').toLowerCase().trim() !== 'system'
          );
          if (hasNewIncoming) {
            playMessageNotificationSound();
          }
        }

        messageCacheRef.current[threadKey] = merged;

        // Ensure we only update active view if the recipient still matches
        if (activeRecipientRef.current.toLowerCase() === recipient.toLowerCase()) {
          // If silent and nothing changed, DO NOT call setMessages to avoid DOM re-renders!
          if (!silent || oldJSON !== newJSON) {
            setMessages(merged);
          }

          // ONLY auto-scroll on explicit channel selection (!silent), never on background poll
          if (!silent) {
            setTimeout(() => scrollToBottom('auto'), 50);
          }
        }

        // Mark as read locally in contact and group list
        const cleanRecipient = (recipient || '').toLowerCase().trim();
        if (cleanRecipient !== 'room') {
          if (cleanRecipient.startsWith('group_')) {
            setGroups((prev) =>
              prev.map((g) =>
                (g?.id || '').toLowerCase().trim() === cleanRecipient
                  ? { ...g, unreadCount: 0 }
                  : g
              )
            );
          } else {
            setContacts((prev) =>
              prev.map((c) =>
                (c?.user?.email || '').toLowerCase().trim() === cleanRecipient
                  ? { ...c, unreadCount: 0 }
                  : c
              )
            );
          }
        }
      }
    } catch (err) {
      console.error('[Chat Messages Fetch Error]', err);
    } finally {
      if (activeRecipientRef.current.toLowerCase() === recipient.toLowerCase()) {
        setIsLoadingMessages(false);
      }
    }
  };

  // Initial Load
  useEffect(() => {
    fetchContacts();
    fetchGroups();
  }, [currentUser.email]);

  useEffect(() => {
    fetchMessagesForThread(activeRecipient);
  }, [activeRecipient]);

  // 3. Socket.io Real-time WebSocket connection
  useEffect(() => {
    const socket = io({
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 2000,
      timeout: 10000,
    });
    socketRef.current = socket;

    const joinUser = () => {
      socket.emit('user_join', {
        email: currentUser.email,
        name: currentUser.name || currentUser.email.split('@')[0],
      });
    };

    socket.on('connect', () => {
      console.log(`[Socket Client] Connected successfully with socket ID: ${socket.id}`);
      setIsConnected(true);
      joinUser();
    });

    socket.io.on('reconnect', () => {
      console.log(`[Socket Client] Reconnected, re-joining rooms...`);
      setIsConnected(true);
      joinUser();
      fetchContacts(true);
      fetchGroups(true);
      if (activeRecipientRef.current) {
        fetchMessagesForThread(activeRecipientRef.current, true);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket Client] Disconnected from server:`, reason);
      setIsConnected(false);
    });

    socket.on('online_users', (list: string[]) => {
      if (Array.isArray(list)) {
        const set = new Set(list.map((e) => e.toLowerCase().trim()));
        setOnlineUserEmails(set);
        setRoomOnlineCount(Math.max(1, list.length));
        setContacts((prev) =>
          prev.map((c) => ({
            ...c,
            isOnline: set.has(c.user.email.toLowerCase().trim()),
          }))
        );
      }
    });

    socket.on('online_count', (count: number) => {
      if (typeof count === 'number') {
        setRoomOnlineCount(Math.max(1, count));
      }
    });

    // Real-time inbound chat message handler
    socket.on('chat_message', (msg: ChatMessage) => {
      if (!msg) return;
      console.log(`[Socket Client] Received chat_message event:`, msg, {
        activeRecipient: activeRecipientRef.current,
        currentUser: currentUser.email,
      });

      const senderLower = (msg.senderEmail || '').toLowerCase();
      const recipientLower = (msg.recipientEmail || '').toLowerCase();
      const myEmailLower = currentUser.email.toLowerCase();
      const currentActiveLower = activeRecipientRef.current.toLowerCase();

      const getClean = (s: string) => (s || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const senderClean = getClean(senderLower);
      const recipientClean = getClean(recipientLower);
      const activeClean = getClean(currentActiveLower);

      const isRoomMsg = recipientLower === 'room' || recipientLower.includes('room');
      const isGroupMsg = recipientLower.startsWith('group_');
      const cacheKey = isGroupMsg 
        ? recipientLower 
        : (isRoomMsg ? 'room' : (senderLower === myEmailLower ? recipientLower : senderLower));

      // Check if message is already stored (duplicate)
      const isDuplicate = messageCacheRef.current[cacheKey] && messageCacheRef.current[cacheKey].some((m) => m.id === msg.id);

      // Store in message cache immediately
      if (!messageCacheRef.current[cacheKey]) messageCacheRef.current[cacheKey] = [];
      if (!isDuplicate) {
        messageCacheRef.current[cacheKey].push(msg);

        // Play subtle sound chime for incoming messages from other users
        const isFromOther = senderLower !== myEmailLower && senderLower !== 'system';
        if (isFromOther) {
          playMessageNotificationSound();
        }
      }

      const isForCurrentRoom =
        currentActiveLower === 'room' && isRoomMsg;

      const isForCurrentGroup =
        currentActiveLower === recipientLower && isGroupMsg;

      const isForCurrentDM =
        currentActiveLower !== 'room' &&
        !isGroupMsg &&
        (senderClean === activeClean ||
         recipientClean === activeClean ||
         senderLower === currentActiveLower ||
         recipientLower === currentActiveLower ||
         senderLower.includes(currentActiveLower) ||
         currentActiveLower.includes(senderLower) ||
         senderClean.includes(activeClean) ||
         activeClean.includes(senderClean));

      if (isForCurrentRoom || isForCurrentDM || isForCurrentGroup) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (senderLower === myEmailLower || isNearBottom()) {
          setTimeout(() => scrollToBottom('smooth'), 40);
        }

        // Acknowledge read if it's currently open DM
        if (isForCurrentDM && senderLower !== myEmailLower) {
          socket.emit('mark_read', {
            recipientEmail: myEmailLower,
            senderEmail: senderLower,
          });
        }
      } else {
        // If it's a group message and we're not currently viewing it, increment unread
        if (isGroupMsg) {
          setGroups(prev =>
            prev.map(g =>
              g.id.toLowerCase() === recipientLower
                ? { ...g, unreadCount: isDuplicate ? (g.unreadCount || 0) : ((g.unreadCount || 0) + 1), lastMessage: msg }
                : g
            )
          );
        }
      }

      // Always update contact list snippet and unread count
      setContacts((prev) =>
        prev.map((c) => {
          const cEmailLower = c.user.email.toLowerCase().trim();
          const cClean = getClean(cEmailLower).trim();
          const senderCleanTrimmed = senderClean.trim();
          if (cEmailLower === senderLower || cClean === senderCleanTrimmed || senderLower.includes(cClean) || cClean.includes(senderCleanTrimmed)) {
            const isSelectedOpen = isForCurrentDM || activeRecipientRef.current.toLowerCase().trim() === cEmailLower || activeRecipientRef.current.toLowerCase().trim() === cClean;
            return {
              ...c,
              lastMessage: msg,
              unreadCount: isSelectedOpen ? 0 : (isDuplicate ? c.unreadCount : c.unreadCount + 1),
            };
          }
          return c;
        })
      );
    });

    // Real-time statuses notification
    socket.on('user_statuses_update', (statuses: Record<string, 'online' | 'idle' | 'dnd'>) => {
      console.log('[Socket Client] User statuses updated:', statuses);
      if (statuses) {
        setUserStatuses(statuses);
      }
    });

    // Real-time message reactions notification
    socket.on('message_reaction_updated', (data: { messageId: string; reactions: Record<string, string[]> }) => {
      if (!data || !data.messageId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
      );
      Object.keys(messageCacheRef.current).forEach((key) => {
        if (messageCacheRef.current[key]) {
          messageCacheRef.current[key] = messageCacheRef.current[key].map((m) =>
            m.id === data.messageId ? { ...m, reactions: data.reactions } : m
          );
        }
      });
    });

    // Real-time typing notification
    socket.on(
      'user_typing',
      (data: { senderEmail: string; username: string; recipientEmail: string; isTyping: boolean }) => {
        if (!data) return;
        const targetLower = (data.recipientEmail || '').toLowerCase();
        const senderLower = (data.senderEmail || '').toLowerCase();
        const activeLower = activeRecipientRef.current.toLowerCase();

        const isForCurrentRoom = activeLower === 'room' && targetLower === 'room' && senderLower !== currentUser.email.toLowerCase();
        const isForCurrentDM = activeLower !== 'room' && !activeLower.startsWith('group_') && senderLower === activeLower;
        const isForCurrentGroup = activeLower.startsWith('group_') && targetLower === activeLower && senderLower !== currentUser.email.toLowerCase();

        if (isForCurrentRoom || isForCurrentDM || isForCurrentGroup) {
          if (data.isTyping) {
            setTypingUser(data.username || 'Colleague');
            if (isNearBottom()) {
              scrollToBottom();
            }
          } else {
            setTypingUser(null);
          }
        }
      }
    );

    // Messages read acknowledgment
    socket.on('messages_read', (data: { by: string }) => {
      const byLower = (data?.by || '').toLowerCase();
      if (activeRecipientRef.current.toLowerCase() === byLower) {
        setMessages((prev) =>
          prev.map((m) => (m.senderEmail.toLowerCase() === currentUser.email.toLowerCase() ? { ...m, isRead: true } : m))
        );
      }
    });

    socket.on('group_created', (newGroup: any) => {
      console.log('[Socket Client] Group created event:', newGroup);
      fetchGroups(true);
    });

    socket.on('group_updated', (updatedGroup: any) => {
      console.log('[Socket Client] Group updated event:', updatedGroup);
      fetchGroups(true);
      if (updatedGroup?.id && activeRecipientRef.current.toLowerCase() === updatedGroup.id.toLowerCase()) {
        fetchMessagesForThread(updatedGroup.id, true);
      }
    });

    socket.on('group_deleted', (data: { groupId: string }) => {
      console.log('[Socket Client] Group deleted event:', data);
      fetchGroups(true);
      if (activeRecipientRef.current.toLowerCase() === data.groupId.toLowerCase()) {
        setActiveRecipient('room');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentUser.email, currentUser.name]);

  // 4. Smooth Background Synchronization (Safety fallback alongside WebSocket)
  useEffect(() => {
    const runFastSync = () => {
      fetchContacts(true);
      fetchGroups(true);
      if (activeRecipient) {
        fetchMessagesForThread(activeRecipient, true);
      }
    };

    const syncInterval = setInterval(runFastSync, 6000);

    const handleFocus = () => runFastSync();
    window.addEventListener('focus', handleFocus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runFastSync();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeRecipient, currentUser.email, token]);

  // Send Message handler with 0ms Optimistic UI
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText && !attachmentUrl) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const myEmail = currentUser.email.toLowerCase();
    const targetRecipient = activeRecipient.toLowerCase();

    const isGroup = targetRecipient.startsWith('group_');
    const targetGroup = isGroup ? groups.find(g => g.id.toLowerCase() === targetRecipient) : null;
    const resolvedRecipientName = targetRecipient === 'room'
      ? 'Company Room'
      : isGroup
        ? (targetGroup?.name || 'Group Chat')
        : (selectedContact?.name || targetRecipient);

    const optimisticMsg: ChatMessage = {
      id: msgId,
      senderEmail: myEmail,
      senderName: currentUser.name || myEmail.split('@')[0],
      recipientEmail: targetRecipient,
      recipientName: resolvedRecipientName,
      text: cleanText,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentName || undefined,
      timestamp: timeStr,
      createdAt: Date.now(),
      isRead: false,
    };

    // 1. OPTIMISTIC UI: Instant 0ms local append
    setMessages((prev) => {
      if (prev.some((m) => m.id === optimisticMsg.id)) return prev;
      return [...prev, optimisticMsg];
    });
    setInputText('');
    setAttachmentUrl(null);
    setAttachmentName(null);
    setShowEmojiPicker(false);
    setTimeout(() => scrollToBottom('smooth'), 20);

    // Cache message locally
    const cacheKey = targetRecipient;
    if (!messageCacheRef.current[cacheKey]) messageCacheRef.current[cacheKey] = [];
    if (!messageCacheRef.current[cacheKey].some((m) => m.id === optimisticMsg.id)) {
      messageCacheRef.current[cacheKey].push(optimisticMsg);
    }

    // Update list snippet
    if (isGroup) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id.toLowerCase() === targetRecipient ? { ...g, lastMessage: optimisticMsg } : g
        )
      );
    } else if (targetRecipient !== 'room') {
      setContacts((prev) =>
        prev.map((c) =>
          c.user.email.toLowerCase() === targetRecipient ? { ...c, lastMessage: optimisticMsg } : c
        )
      );
    }

    // 2. Dispatch to Socket.io for immediate WebSocket propagation
    if (socketRef.current) {
      socketRef.current.emit('chat_message', optimisticMsg);
      socketRef.current.emit('typing', {
        senderEmail: myEmail,
        senderName: currentUser.name || myEmail.split('@')[0],
        recipientEmail: targetRecipient,
        isTyping: false,
      });
    }

    // 3. Dispatch to REST endpoint for guaranteed database persistence
    try {
      await apiFetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(optimisticMsg),
      });
    } catch (err) {
      console.error('[Send Message REST Error]', err);
    }
  };

  const handleToggleReaction = async (msgId: string, emoji: string, explicitAction?: 'add' | 'remove') => {
    const myEmailClean = currentUser.email.toLowerCase().trim();
    const lockKey = `${msgId}_${emoji}`;
    const now = Date.now();
    const lastClick = reactionDebounceRef.current.get(lockKey) || 0;
    if (now - lastClick < 60) {
      // Guard only against hardware touch ghost bounce (<60ms)
      return;
    }
    reactionDebounceRef.current.set(lockKey, now);

    // Determine target action ('add' or 'remove') based on explicitAction or current state
    const targetMsg = messages.find((m) => m.id === msgId);
    const existingList = targetMsg?.reactions?.[emoji] || [];
    const hasReacted = existingList.some((e) => isSameUserEmail(e, myEmailClean));
    const action: 'add' | 'remove' = explicitAction ? explicitAction : (hasReacted ? 'remove' : 'add');

    // 1. Optimistic UI update locally (0ms)
    setMessages((prevMsgs) =>
      prevMsgs.map((m) => {
        if (m.id !== msgId) return m;

        const currentReactions = { ...(m.reactions || {}) };
        const currentList = currentReactions[emoji] || [];

        let updatedList: string[];
        if (action === 'remove') {
          updatedList = currentList.filter((e) => !isSameUserEmail(e, myEmailClean));
        } else {
          updatedList = currentList.some((e) => isSameUserEmail(e, myEmailClean))
            ? currentList
            : [...currentList.filter((e) => !isSameUserEmail(e, myEmailClean)), myEmailClean];
        }

        if (updatedList.length > 0) {
          currentReactions[emoji] = updatedList;
        } else {
          delete currentReactions[emoji];
        }

        return { ...m, reactions: currentReactions };
      })
    );

    // Update message cache as well
    Object.keys(messageCacheRef.current).forEach((key) => {
      if (messageCacheRef.current[key]) {
        messageCacheRef.current[key] = messageCacheRef.current[key].map((m) => {
          if (m.id !== msgId) return m;
          const currentReactions = { ...(m.reactions || {}) };
          const currentList = currentReactions[emoji] || [];

          let updatedList: string[];
          if (action === 'remove') {
            updatedList = currentList.filter((e) => !isSameUserEmail(e, myEmailClean));
          } else {
            updatedList = currentList.some((e) => isSameUserEmail(e, myEmailClean))
              ? currentList
              : [...currentList.filter((e) => !isSameUserEmail(e, myEmailClean)), myEmailClean];
          }

          if (updatedList.length > 0) {
            currentReactions[emoji] = updatedList;
          } else {
            delete currentReactions[emoji];
          }

          return { ...m, reactions: currentReactions };
        });
      }
    });

    // 2. Emit via socket with explicit action and email
    if (socketRef.current?.connected) {
      socketRef.current.emit('toggle_reaction', {
        messageId: msgId,
        emoji,
        email: myEmailClean,
        action,
      });
    }

    // 3. POST via REST endpoint with explicit action and email
    try {
      await apiFetch(`/api/chat/messages/${msgId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ emoji, action, email: myEmailClean }),
      });
    } catch (err) {
      console.error('[Reaction REST Error]', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    const lastWord = val.split(/\s+/).pop() || '';
    if (lastWord.startsWith('@')) {
      setMentionSearch(lastWord.substring(1));
    } else {
      setMentionSearch(null);
    }

    if (socketRef.current) {
      socketRef.current.emit('typing', {
        senderEmail: currentUser.email.toLowerCase(),
        senderName: currentUser.name || currentUser.email.split('@')[0],
        recipientEmail: activeRecipient.toLowerCase(),
        isTyping: true,
      });

      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.emit('typing', {
            senderEmail: currentUser.email.toLowerCase(),
            senderName: currentUser.name || currentUser.email.split('@')[0],
            recipientEmail: activeRecipient.toLowerCase(),
            isTyping: false,
          });
        }
      }, 1200);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.');
      return;
    }

    setAttachmentName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const sharedPhotos = useMemo(() => {
    return messages.filter(m => {
      if (!m.attachmentUrl || typeof m.attachmentUrl !== 'string') return false;
      const lowerUrl = m.attachmentUrl.toLowerCase();
      return lowerUrl.startsWith('data:image/') ||
             lowerUrl.endsWith('.png') || 
             lowerUrl.endsWith('.jpg') || 
             lowerUrl.endsWith('.jpeg') || 
             lowerUrl.endsWith('.gif') || 
             lowerUrl.endsWith('.webp') ||
             Boolean(m.attachmentName && /\.(png|jpe?g|gif|webp)$/i.test(m.attachmentName));
    });
  }, [messages]);

  const sharedFiles = useMemo(() => {
    return messages.filter(m => {
      if (!m.attachmentUrl || typeof m.attachmentUrl !== 'string') return false;
      const lowerUrl = m.attachmentUrl.toLowerCase();
      const isImg = lowerUrl.startsWith('data:image/') ||
                    lowerUrl.endsWith('.png') || 
                    lowerUrl.endsWith('.jpg') || 
                    lowerUrl.endsWith('.jpeg') || 
                    lowerUrl.endsWith('.gif') || 
                    lowerUrl.endsWith('.webp') ||
                    Boolean(m.attachmentName && /\.(png|jpe?g|gif|webp)$/i.test(m.attachmentName));
      return !isImg;
    });
  }, [messages]);

  const handleStartGroupWithCurrent = () => {
    if (selectedContact) {
      setSelectedGroupEmails([selectedContact.email]);
    } else {
      setSelectedGroupEmails([]);
    }
    setNewGroupName('');
    setShowCreateGroupModal(true);
    setShowChatInfoDropdown(false);
  };

  const handleKickMember = async (kickEmail: string) => {
    if (!activeGroup) return;
    if (!confirm(`Are you sure you want to kick ${kickEmail} from this group chat?`)) return;

    try {
      const { ok, data } = await apiFetch(`/api/chat/groups/${activeGroup.id}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ kickEmail }),
      });
      if (ok && data?.success) {
        fetchGroups();
        fetchMessagesForThread(activeGroup.id, true);
      } else {
        alert(data?.error || 'Failed to kick member');
      }
    } catch (err) {
      console.error('[Kick Member Error]', err);
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeGroup) return;
    if (!confirm(`Are you sure you want to leave "${activeGroup.name}"?`)) return;

    try {
      const { ok, data } = await apiFetch(`/api/chat/groups/${activeGroup.id}/leave`, {
        method: 'POST',
        headers: {
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (ok && data?.success) {
        setShowChatInfoDropdown(false);
        setActiveRecipient('room');
        fetchGroups();
      } else {
        alert(data?.error || 'Failed to leave group');
      }
    } catch (err) {
      console.error('[Leave Group Error]', err);
    }
  };

  const handleDeleteGroup = async () => {
    if (!activeGroup) return;
    if (!confirm(`Are you sure you want to permanently delete the group chat "${activeGroup.name}"? This action cannot be undone.`)) return;

    try {
      const { ok, data } = await apiFetch(`/api/chat/groups/${activeGroup.id}`, {
        method: 'DELETE',
        headers: {
          'x-user-email': currentUser.email,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (ok && data?.success) {
        setShowChatInfoDropdown(false);
        setActiveRecipient('room');
        fetchGroups();
      } else {
        alert(data?.error || 'Failed to delete group');
      }
    } catch (err) {
      console.error('[Delete Group Error]', err);
    }
  };

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase().trim();
    return contacts.filter(
      (c) =>
        (c?.user?.name || '').toLowerCase().includes(q) ||
        (c?.user?.email || '').toLowerCase().includes(q) ||
        Boolean(c?.user?.department && c.user.department.toLowerCase().includes(q))
    );
  }, [contacts, searchQuery]);

  const mentionMatches = useMemo(() => {
    if (mentionSearch === null) return [];
    const q = mentionSearch.toLowerCase().trim();
    const list = contacts.map(c => ({
      name: c?.user?.name || (c?.user?.email ? c.user.email.split('@')[0] : 'Colleague'),
      email: c?.user?.email || '',
    }));
    list.unshift({ name: 'everyone', email: 'Mention everyone in this chat' });
    list.unshift({ name: 'all', email: 'Mention all colleagues' });

    return list.filter(m =>
      (m?.name || '').toLowerCase().includes(q) || (m?.email || '').toLowerCase().includes(q)
    ).slice(0, 5);
  }, [contacts, mentionSearch]);

  const handleSelectMention = (name: string) => {
    const words = inputText.split(/\s+/);
    words.pop();
    words.push(`@${name} `);
    setInputText(words.join(' '));
    setMentionSearch(null);
  };

  const renderMessageText = (text: string, isMe: boolean) => {
    if (!text) return null;
    const mentionableNames = contacts.map((c) => (c?.user?.name || '').toLowerCase().trim()).filter(Boolean);
    mentionableNames.push('everyone', 'all');

    const parts = text.split(/(\s+)/);
    
    return (
      <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
        {parts.map((part, idx) => {
          if (part.startsWith('@')) {
            const cleanMention = part.substring(1).replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
            const cleanMentionLower = cleanMention.toLowerCase();
            
            const isMatch = mentionableNames.some(name => name.includes(cleanMentionLower) || cleanMentionLower.includes(name));
            
            if (isMatch || cleanMentionLower === 'everyone' || cleanMentionLower === 'all') {
              return (
                <span
                  key={idx}
                  className={`inline-block px-1.5 py-0.5 rounded-md font-extrabold mx-0.5 text-[11px] sm:text-xs tracking-wide shadow-3xs border ${
                    isMe
                      ? 'bg-white text-[#F15A24] border-orange-100'
                      : 'bg-orange-100/90 text-[#F15A24] border-orange-200'
                  }`}
                >
                  @{cleanMention}
                </span>
              );
            }
          }
          return part;
        })}
      </p>
    );
  };

  return (
    <div className="w-full h-full flex bg-white dark:bg-[#0B0D12] text-neutral-800 dark:text-neutral-100 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden font-sans antialiased transition-colors">
      {/* LEFT PANE: CONTACTS & CHANNELS LIST */}
      <div className="w-72 sm:w-80 bg-neutral-50/50 dark:bg-[#0E1015] border-r border-neutral-200 dark:border-neutral-800 flex flex-col shrink-0 transition-colors">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#12141A] space-y-3 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] dark:text-orange-400 rounded-xl border border-orange-200/60 dark:border-orange-900/50">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-extrabold text-neutral-800 dark:text-white text-sm">JW Messenger</h2>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">Direct & Corporate Chat</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isSoundMuted
                    ? 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    : 'text-[#F15A24] dark:text-orange-400 hover:text-[#D94F1E] hover:bg-orange-50 dark:hover:bg-orange-950/30'
                }`}
                title={isSoundMuted ? 'Notification sounds muted (Click to enable)' : 'Notification sounds active (Click to mute)'}
              >
                {isSoundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => fetchContacts()}
                className="p-1.5 rounded-lg text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Refresh contacts"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search Contacts */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              placeholder="Search colleagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-[#181B24] border border-neutral-200 dark:border-neutral-700/80 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 transition-all"
            />
          </div>
        </div>

        {/* Channels & Direct Contacts */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/80 bg-white dark:bg-[#0E1015] transition-colors">
          {/* Pinned Company General Room */}
          <div className="p-2">
            <button
              type="button"
              onClick={() => setActiveRecipient('room')}
              className={`w-full p-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer text-left ${
                activeRecipient === 'room'
                  ? 'bg-orange-50 dark:bg-orange-950/30 text-[#F15A24] dark:text-orange-400 border border-orange-200 dark:border-orange-900/50 shadow-2xs font-bold'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <div className="relative shrink-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                    activeRecipient === 'room'
                      ? 'bg-[#F15A24] text-white shadow-inner'
                      : 'bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] dark:text-orange-400 border border-orange-100 dark:border-orange-900/50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-neutral-900 animate-pulse" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs truncate text-neutral-900 dark:text-white">🏢 Company Room</span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      activeRecipient === 'room' ? 'bg-[#F15A24] text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {roomOnlineCount} online
                  </span>
                </div>
                <p
                  className={`text-[11px] truncate mt-0.5 ${
                    activeRecipient === 'room' ? 'text-orange-700/80 dark:text-orange-300/80 font-medium' : 'text-neutral-400 dark:text-neutral-500'
                  }`}
                >
                  General broadcast for all members
                </p>
              </div>
            </button>
          </div>

          {/* Group Chats Section */}
          <div className="px-4 py-2 flex items-center justify-between text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider bg-neutral-50 dark:bg-[#13151D] border-t border-b border-neutral-100 dark:border-neutral-800">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#F15A24]" />
              Group Chats
            </span>
          </div>

          <div className="p-2 space-y-1">
            {isLoadingGroups && groups.length === 0 ? (
              <div className="p-4 text-center text-neutral-400 dark:text-neutral-500 text-[11px] flex flex-col items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-[#F15A24]" />
                <span>Loading groups...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="p-3 text-center text-neutral-400 dark:text-neutral-500 text-[11px] italic">
                No active group chats.
              </div>
            ) : (
              groups.map((group) => {
                const isSelected = activeRecipient.toLowerCase() === group.id.toLowerCase();
                const lastMsg = group.lastMessage || null;
                const unread = group.unreadCount || 0;

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveRecipient(group.id)}
                    className={`w-full p-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-orange-50 dark:bg-orange-950/30 text-[#F15A24] dark:text-orange-400 border border-orange-200 dark:border-orange-900/50 shadow-2xs font-bold'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isSelected
                            ? 'bg-[#F15A24] text-white shadow-inner'
                            : 'bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] dark:text-orange-400 border border-orange-100 dark:border-orange-900/50'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs truncate text-neutral-800 dark:text-neutral-100">{group.name}</span>
                        {unread > 0 && (
                          <span className="bg-[#F15A24] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {unread}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] truncate mt-0.5 ${
                          isSelected ? 'text-orange-700/80 dark:text-orange-300/80 font-medium' : 'text-neutral-400 dark:text-neutral-500'
                        }`}
                      >
                        {lastMsg ? ((lastMsg.senderEmail || '').toLowerCase().trim() === 'system' || lastMsg.isSystem ? lastMsg.text : `${lastMsg.senderName}: ${lastMsg.text}`) : `${group.memberEmails.length} members`}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Section Divider */}
          <div className="px-4 py-2 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider bg-neutral-50 dark:bg-[#13151D] border-t border-b border-neutral-100 dark:border-neutral-800">
            Direct Messages
          </div>

          {/* Colleague List */}
          {isLoadingContacts && contacts.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 dark:text-neutral-400 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#F15A24]" />
              <span>Loading colleagues...</span>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 dark:text-neutral-400 text-xs">
              No colleagues found
            </div>
          ) : (
            filteredContacts.map((item) => {
              const cleanContactEmail = (item?.user?.email || '').toLowerCase().trim();
              const isSelected = activeRecipient.toLowerCase().trim() === cleanContactEmail;
              const isMe = cleanContactEmail === (currentUser?.email || '').toLowerCase().trim();
              const isUserOnline = isMe || item.isOnline || onlineUserEmails.has(cleanContactEmail);
              const targetStatus = isMe
                ? userStatus
                : (isUserOnline ? (userStatuses[cleanContactEmail] || 'online') : 'offline');

              const statusColor = targetStatus === 'online'
                ? 'bg-emerald-500'
                : targetStatus === 'idle'
                  ? 'bg-amber-500'
                  : targetStatus === 'dnd'
                    ? 'bg-rose-500'
                    : 'bg-neutral-300 dark:bg-neutral-600';

              const statusTitle = targetStatus === 'offline'
                ? 'Offline'
                : `Online - ${targetStatus.toUpperCase()}`;

              return (
                <button
                  key={item.user.id || item.user.email}
                  type="button"
                  onClick={() => setActiveRecipient(item.user.email)}
                  className={`w-full p-3 flex items-start gap-3 transition-colors text-left cursor-pointer ${
                    isSelected
                      ? 'bg-orange-50/80 dark:bg-orange-950/30 text-[#F15A24] dark:text-orange-400 border-l-3 border-[#F15A24] font-bold shadow-2xs'
                      : 'hover:bg-neutral-50/70 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <div className="relative shrink-0">
                    {item.user.avatar ? (
                      <img
                        src={item.user.avatar}
                        alt={item.user.name}
                        className="w-9 h-9 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                      />
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs ${
                          isSelected
                            ? 'bg-[#F15A24] text-white'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700'
                        }`}
                      >
                        {item.user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-neutral-900 ${statusColor}`}
                      title={statusTitle}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs truncate text-neutral-900 dark:text-white">{item.user.name}</span>
                      {item.lastMessage && (
                        <span
                          className={`text-[10px] shrink-0 font-medium ${
                            isSelected ? 'text-orange-700 dark:text-orange-300' : 'text-neutral-400 dark:text-neutral-500'
                          }`}
                        >
                          {item.lastMessage.timestamp}
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        isSelected ? 'text-neutral-600 dark:text-neutral-300 font-medium' : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    >
                      {item.lastMessage
                        ? item.lastMessage.text || 'Attached file'
                        : item.user.title || item.user.department || item.user.email}
                    </p>
                  </div>

                  {!isSelected && item.unreadCount > 0 && (
                    <span className="bg-[#F15A24] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                      {item.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* User Profile Card with status setter as Pinned Footer */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#12141A] shrink-0 transition-colors">
          <div className="p-2 bg-neutral-50 dark:bg-[#181B24] border border-neutral-200/80 dark:border-neutral-700/80 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/50 text-[#F15A24] dark:text-orange-400 font-bold flex items-center justify-center text-xs border border-orange-200/50 dark:border-orange-900/50 shadow-2xs">
                  {currentUser.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                  userStatus === 'online' ? 'bg-emerald-500' : userStatus === 'idle' ? 'bg-amber-500' : 'bg-rose-500'
                }`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-neutral-800 dark:text-white truncate leading-tight">{currentUser.name}</p>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium capitalize flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    userStatus === 'online' ? 'bg-emerald-500 animate-pulse' : userStatus === 'idle' ? 'bg-amber-500' : 'bg-rose-500'
                  }`} />
                  {userStatus === 'dnd' ? 'Do Not Disturb' : userStatus === 'idle' ? 'Idle' : 'Online'}
                </span>
              </div>
            </div>

            <select
              value={userStatus}
              onChange={(e) => handleStatusChange(e.target.value as 'online' | 'idle' | 'dnd')}
              className="text-[10px] font-bold bg-white dark:bg-[#13161F] border border-neutral-200 dark:border-neutral-700 rounded-lg py-1 px-1.5 focus:outline-none focus:border-orange-500 text-neutral-700 dark:text-neutral-200 cursor-pointer shadow-2xs focus:ring-1 focus:ring-orange-500 shrink-0"
            >
              <option value="online">🟢 Online</option>
              <option value="idle">🟡 Idle</option>
              <option value="dnd">🔴 DND</option>
            </select>
          </div>
        </div>
      </div>

      {/* RIGHT PANE: ACTIVE CONVERSATION THREAD */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#0B0D12] overflow-hidden transition-colors">
        {/* Active Conversation Header */}
        <header className="bg-white dark:bg-[#12141A] border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-5 py-3 flex items-center justify-between shrink-0 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              {activeRecipient === 'room' ? (
                <div className="w-10 h-10 rounded-xl bg-[#F15A24] text-white flex items-center justify-center font-bold text-base shadow-sm">
                  🏢
                </div>
              ) : isGroupActive ? (
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] dark:text-orange-400 border border-orange-200 dark:border-orange-900/50 flex items-center justify-center font-bold text-base shadow-sm">
                  👥
                </div>
              ) : selectedContact?.avatar ? (
                <img
                  src={selectedContact.avatar}
                  alt={selectedContact.name}
                  className="w-10 h-10 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {selectedContact?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                  activeRecipient === 'room'
                    ? 'bg-emerald-500'
                    : isGroupActive
                      ? 'bg-indigo-500'
                      : activeRecipientStatus === 'dnd'
                        ? 'bg-rose-500'
                        : activeRecipientStatus === 'idle'
                          ? 'bg-amber-500'
                          : (selectedContactItem?.isOnline || onlineUserEmails.has(activeRecipient.toLowerCase().trim()))
                            ? 'bg-emerald-500'
                            : 'bg-neutral-300'
                }`}
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-sm font-bold text-neutral-800 tracking-wide truncate flex items-center gap-2">
                <span>
                  {activeRecipient === 'room'
                    ? 'JW Summit Company Room'
                    : isGroupActive
                      ? (activeGroup?.name || 'Group Chat')
                      : selectedContact?.name}
                </span>
              </h1>
              <p className="text-xs text-neutral-500 truncate flex items-center gap-1.5">
                {activeRecipient === 'room' ? (
                  <span>Broadcast to all company staff &bull; {roomOnlineCount} active members</span>
                ) : isGroupActive ? (
                  <span>
                    Group Chat &bull; {activeGroup?.memberEmails?.length || 0} members: {activeGroup?.memberEmails?.join(', ')}
                  </span>
                ) : (
                  <>
                    <span className="text-neutral-500 font-medium text-[11px]">{selectedContact?.email}</span>
                    {selectedContact?.department && (
                      <>
                        <span>&bull;</span>
                        <span className="text-neutral-500">{selectedContact.department}</span>
                      </>
                    )}
                    <span>&bull;</span>
                    <span
                      className={
                        activeRecipientStatus === 'dnd'
                          ? 'text-rose-600 font-semibold'
                          : activeRecipientStatus === 'idle'
                            ? 'text-amber-600 font-semibold'
                          : (selectedContactItem?.isOnline || onlineUserEmails.has(activeRecipient.toLowerCase().trim()))
                            ? 'text-emerald-600 font-semibold'
                            : 'text-neutral-400'
                      }
                    >
                      {activeRecipientStatus === 'dnd'
                        ? 'Do Not Disturb'
                        : activeRecipientStatus === 'idle'
                          ? 'Idle'
                        : (selectedContactItem?.isOnline || onlineUserEmails.has(activeRecipient.toLowerCase().trim()))
                          ? 'Online'
                          : 'Offline'}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Notification Sound Mute / Unmute Button */}
            <button
              type="button"
              onClick={toggleSound}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-center shadow-3xs ${
                isSoundMuted
                  ? 'text-neutral-400 hover:text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border-neutral-200'
                  : 'text-[#F15A24] hover:text-[#D94F1E] bg-orange-50/70 hover:bg-orange-100/70 border-orange-200'
              }`}
              title={isSoundMuted ? 'Notification sounds muted (Click to enable)' : 'Notification sounds enabled (Click to mute)'}
            >
              {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {isGroupActive && (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="px-2.5 py-1.5 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-[#F15A24] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Invite colleagues to group"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Invite Colleagues</span>
              </button>
            )}

            {/* Circle-! Icon with Dropdown for user options */}
            {activeRecipient !== 'room' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowChatInfoDropdown(!showChatInfoDropdown)}
                  className="p-1.5 text-neutral-500 hover:text-orange-600 hover:bg-neutral-50 rounded-xl border border-neutral-200 transition-colors cursor-pointer flex items-center justify-center shadow-3xs"
                  title="Conversation Info & Options"
                >
                  <AlertCircle className="w-5 h-5 text-[#F15A24]" />
                </button>

                {showChatInfoDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowChatInfoDropdown(false)} 
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#13161F] border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-2xl z-50 py-1.5 animate-fade-in divide-y divide-neutral-100 dark:divide-neutral-800">
                      <div className="px-4 py-2 bg-neutral-50 dark:bg-[#181C26] text-[10px] font-extrabold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider rounded-t-2xl">
                        Chat Options
                      </div>
                      
                      {!isGroupActive && (
                        <button
                          type="button"
                          onClick={handleStartGroupWithCurrent}
                          className="w-full px-4 py-3 text-left hover:bg-orange-50 dark:hover:bg-[#181C26] text-xs text-neutral-700 dark:text-neutral-200 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Users className="w-4 h-4 text-[#F15A24] shrink-0" />
                          <div className="min-w-0">
                            <p className="font-extrabold text-neutral-800 dark:text-neutral-100">Add Group Chat</p>
                            <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">Create group with {selectedContact?.name}</p>
                          </div>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveInfoTab('photos');
                          setShowChatInfoDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-orange-50 dark:hover:bg-[#181C26] text-xs text-neutral-700 dark:text-neutral-200 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Smile className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-extrabold text-neutral-800 dark:text-neutral-100">Shared Photos</p>
                          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{sharedPhotos.length} photos in this chat</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveInfoTab('files');
                          setShowChatInfoDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-orange-50 dark:hover:bg-[#181C26] text-xs text-neutral-700 dark:text-neutral-200 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Paperclip className="w-4 h-4 text-sky-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-extrabold text-neutral-800 dark:text-neutral-100">Shared Files</p>
                          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{sharedFiles.length} files in this chat</p>
                        </div>
                      </button>

                      {isGroupActive && (
                        <div className="py-2.5 border-t border-neutral-100 dark:border-neutral-800">
                          <div className="px-4 pb-1.5 text-[10px] font-extrabold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                            Group Members ({activeGroup?.memberEmails?.length || 0})
                          </div>
                          <div className="max-h-40 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/80 px-1">
                            {activeGroup?.memberEmails?.map((email) => {
                              const isMemberCreator = (activeGroup?.creatorEmail || '').toLowerCase().trim() === email.toLowerCase().trim();
                              const isMe = email.toLowerCase().trim() === currentUser.email.toLowerCase().trim();
                              const canKick = (activeGroup?.creatorEmail || '').toLowerCase().trim() === currentUser.email.toLowerCase().trim() && !isMe;

                              return (
                                <div key={email} className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-neutral-50/50 dark:hover:bg-[#181C26]/50 rounded-lg">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-extrabold text-neutral-800 dark:text-neutral-100 truncate" title={email}>{email.split('@')[0]}</p>
                                    <p className="text-[9px] text-neutral-400 dark:text-neutral-500 truncate" title={email}>{email}</p>
                                    {isMemberCreator && <span className="text-[9px] font-bold text-orange-500 uppercase">Creator</span>}
                                  </div>
                                  {canKick && (
                                    <button
                                      type="button"
                                      onClick={() => handleKickMember(email)}
                                      className="text-[10px] font-extrabold text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 dark:border-rose-800/80 hover:border-rose-500 px-2 py-0.5 rounded-lg transition-all cursor-pointer shadow-3xs"
                                    >
                                      Kick
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Group Creator Delete Option vs Member Leave Option */}
                          {(activeGroup?.creatorEmail || '').toLowerCase().trim() === currentUser.email.toLowerCase().trim() ? (
                            <div className="border-t border-neutral-100 dark:border-neutral-800 mt-2 pt-2 px-1">
                              <button
                                type="button"
                                onClick={handleDeleteGroup}
                                className="w-full px-3 py-2.5 text-left hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs text-rose-600 dark:text-rose-400 font-extrabold flex items-center gap-2 transition-colors cursor-pointer rounded-xl"
                              >
                                <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                                <span>Delete Group Chat</span>
                              </button>
                            </div>
                          ) : (
                            <div className="border-t border-neutral-100 dark:border-neutral-800 mt-2 pt-2 px-1">
                              <button
                                type="button"
                                onClick={handleLeaveGroup}
                                className="w-full px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-2 transition-colors cursor-pointer rounded-xl"
                              >
                                <LogOut className="w-4 h-4 text-amber-500 shrink-0" />
                                <span>Leave Group Chat</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Message Feed Window */}
        <main ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 scroll-smooth bg-neutral-50/30 dark:bg-[#0B0D12]">
          {isLoadingMessages && messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
              <span>Loading messages...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-500 dark:text-neutral-400">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-[#141720] border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400 mb-3">
                <MessageSquare className="w-6 h-6 stroke-1 text-neutral-400 dark:text-neutral-500" />
              </div>
              <p className="font-bold text-sm text-neutral-700 dark:text-neutral-200">No messages yet</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-xs">
                {activeRecipient === 'room'
                  ? 'Be the first to post a message in the company room!'
                  : `Start a direct conversation with ${selectedContact?.name}!`}
              </p>
            </div>
          ) : (
            Array.from(new Map<string, ChatMessage>(messages.map((m) => [m.id, m])).values()).map((msg) => {
              const senderClean = (msg?.senderEmail || '').toLowerCase().trim();
              const myClean = (currentUser?.email || '').toLowerCase().trim();
              const isMe = senderClean === myClean;

              if (senderClean === 'system' || msg.isSystem) {
                const textLower = (msg.text || '').toLowerCase();
                const isKick = textLower.includes('removed') || textLower.includes('kicked');
                const isAdd = textLower.includes('added') || textLower.includes('joined');
                const isLeave = textLower.includes('left');
                const isCreate = textLower.includes('created');

                return (
                  <div key={msg.id} className="flex justify-center my-3 animate-in fade-in duration-200">
                    <div
                      className={`text-[11px] sm:text-xs font-medium rounded-full px-4 py-1.5 flex items-center gap-2 shadow-2xs border backdrop-blur-xs transition-colors ${
                        isKick
                          ? 'bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/90 dark:border-rose-900/60'
                          : isAdd
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/90 dark:border-emerald-900/60'
                          : isLeave
                          ? 'bg-amber-50/90 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/90 dark:border-amber-900/60'
                          : isCreate
                          ? 'bg-orange-50/90 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200/90 dark:border-orange-900/60'
                          : 'bg-neutral-100/90 dark:bg-[#141720] text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800'
                      }`}
                    >
                      {isKick ? (
                        <UserMinus className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      ) : isAdd ? (
                        <UserPlus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : isCreate ? (
                        <Users className="w-3.5 h-3.5 text-[#F15A24] shrink-0" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      )}
                      <span>{msg.text}</span>
                      <span className="text-neutral-400 dark:text-neutral-500 text-[10px] ml-0.5 font-normal">&bull; {msg.timestamp}</span>
                    </div>
                  </div>
                );
              }

              const isReactionMenuOpen = activeReactionMenuMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1 animate-in fade-in duration-150 ${
                    isReactionMenuOpen ? 'z-30' : 'z-0'
                  }`}
                >
                  {!isMe && (
                    <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 mb-0.5 px-1">
                      {msg.senderName}
                    </span>
                  )}

                  {/* Message Row with Bubble & Quick Reaction (+) Button */}
                  <div className={`relative flex items-center gap-1.5 max-w-[92%] sm:max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    
                    {/* Floating Quick Reaction Bar */}
                    {isReactionMenuOpen && (
                      <div
                        className={`absolute -top-11 ${
                          isMe ? 'right-0' : 'left-0'
                        } transition-all duration-150 ease-out bg-white dark:bg-[#141721] backdrop-blur-md border border-neutral-200/90 dark:border-neutral-700/80 rounded-full px-2 py-1 shadow-xl flex items-center gap-1 z-40 animate-in fade-in zoom-in-95 duration-100`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'].map((emoji) => {
                          const myEmailClean = currentUser.email.toLowerCase().trim();
                          const hasReacted = msg.reactions?.[emoji]?.some(
                            (e) => isSameUserEmail(e, myEmailClean)
                          );
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReaction(msg.id, emoji, hasReacted ? 'remove' : 'add');
                                setActiveReactionMenuMsgId(null);
                              }}
                              className={`hover:scale-125 transition-transform p-1.5 rounded-full text-sm cursor-pointer select-none ${
                                hasReacted ? 'bg-orange-100 dark:bg-orange-950/60 ring-1 ring-orange-400' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              }`}
                              title={hasReacted ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Message Bubble (Supports Mobile Long Press) */}
                    <div
                      onTouchStart={() => handleTouchStart(msg.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      className={`rounded-2xl px-4 py-2.5 shadow-xs text-xs sm:text-sm break-words leading-relaxed select-text ${
                        isMe
                          ? 'bg-[#F15A24] text-white rounded-tr-xs font-medium shadow-orange-500/10'
                          : 'bg-neutral-100 dark:bg-[#161922] text-neutral-800 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-700/60 rounded-tl-xs'
                      }`}
                    >
                      {/* Attached Image or File */}
                      {msg.attachmentUrl && (
                        <div className="mb-2">
                          {msg.attachmentUrl.startsWith('data:image') ? (
                            <img
                              src={msg.attachmentUrl}
                              alt={msg.attachmentName || 'Attachment'}
                              className="max-w-xs max-h-48 rounded-xl object-contain bg-neutral-200/50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                            />
                          ) : (
                            <a
                              href={msg.attachmentUrl}
                              download={msg.attachmentName || 'attachment'}
                              className={`inline-flex items-center gap-2 p-2 rounded-xl text-xs font-mono border ${
                                isMe
                                  ? 'bg-white/10 text-white border-white/20'
                                  : 'bg-white dark:bg-[#1E2330] text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 shadow-2xs'
                              }`}
                            >
                              <Paperclip className="w-3.5 h-3.5 text-orange-500" />
                              <span className="underline truncate max-w-[160px]">
                                {msg.attachmentName || 'Download attachment'}
                              </span>
                            </a>
                          )}
                        </div>
                      )}

                      {msg.text && renderMessageText(msg.text, isMe)}
                    </div>

                    {/* Quick Reaction (+) Button */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveReactionMenuMsgId((prev) => (prev === msg.id ? null : msg.id));
                      }}
                      className={`shrink-0 transition-all duration-150 p-1.5 rounded-full border shadow-2xs cursor-pointer select-none ${
                        isReactionMenuOpen
                          ? 'opacity-100 bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-800 scale-100'
                          : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100 bg-white dark:bg-[#161922] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 border-neutral-200/80 dark:border-neutral-700/60'
                      }`}
                      title="Add reaction (+)"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Active Reaction Badges (Grouped cleanly in an aligned cluster) */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className={`flex mt-1 max-w-[82%] sm:max-w-[70%] ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className="inline-flex flex-wrap gap-1 items-center bg-neutral-50/90 dark:bg-[#141720]/90 backdrop-blur-xs p-1 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/60 shadow-2xs">
                        {Object.entries(msg.reactions).map(([emoji, userList]) => {
                          if (!userList || userList.length === 0) return null;
                          const myEmailClean = currentUser.email.toLowerCase().trim();
                          const hasMyReaction = userList.some((e) => isSameUserEmail(e, myEmailClean));
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReaction(msg.id, emoji, hasMyReaction ? 'remove' : 'add');
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none active:scale-95 ${
                                hasMyReaction
                                  ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-bold ring-1 ring-orange-400/80 shadow-2xs hover:bg-orange-200/80 dark:hover:bg-orange-900/60'
                                  : 'bg-white dark:bg-[#1E222D] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#252B3A] border border-neutral-200/60 dark:border-neutral-700/60'
                              }`}
                              title={hasMyReaction ? `Click to remove your reaction (Reacted by ${userList.join(', ')})` : `Click to add reaction (Reacted by ${userList.join(', ')})`}
                            >
                              <span className="leading-none">{emoji}</span>
                              <span className="text-[10px] font-mono leading-none">{userList.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-0.5 px-1">
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">{msg.timestamp}</span>
                    {isMe && activeRecipient !== 'room' && (
                      <CheckCheck
                        className={`w-3.5 h-3.5 ${msg.isRead ? 'text-orange-500' : 'text-neutral-300 dark:text-neutral-600'}`}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </main>

        {/* Typing Notification */}
        {typingUser && (
          <div className="px-5 py-1 text-xs text-orange-600 dark:text-orange-400 italic shrink-0 flex items-center gap-1.5 h-6 bg-neutral-50 dark:bg-[#10131A] border-t border-neutral-100 dark:border-neutral-800">
            <span className="inline-flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:0.4s]" />
            </span>
            <span>{typingUser} is typing...</span>
          </div>
        )}

        {/* Attachment Preview Banner */}
        {attachmentName && (
          <div className="px-4 py-2 bg-orange-50/70 dark:bg-orange-950/30 border-t border-orange-200/80 dark:border-orange-900/50 flex items-center justify-between text-xs text-orange-800 dark:text-orange-300 font-mono font-medium">
            <div className="flex items-center gap-2 truncate">
              <Paperclip className="w-3.5 h-3.5 text-[#F15A24]" />
              <span className="truncate">{attachmentName}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachmentUrl(null);
                setAttachmentName(null);
              }}
              className="text-[#F15A24] hover:text-orange-800 dark:hover:text-orange-200 p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Emoji Picker Popup */}
        {showEmojiPicker && (
          <div className="p-2 bg-white dark:bg-[#141721] border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl mx-4 mb-2 flex items-center gap-2 z-20 shrink-0">
            {emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + e);
                  setShowEmojiPicker(false);
                }}
                className="text-lg p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-transform active:scale-125 cursor-pointer"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Input Form Footer */}
        {isGroupActive && activeGroup && !activeGroup.memberEmails?.map((e: any) => (e || '').toLowerCase().trim()).includes(currentUser?.email?.toLowerCase().trim()) ? (
          <footer className="p-4 bg-neutral-100/90 dark:bg-[#10121A] border-t border-neutral-200 dark:border-neutral-800 shrink-0 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 py-1.5">
              <Lock className="w-4 h-4 text-rose-500 shrink-0" />
              <span>You are no longer a member of this group chat.</span>
            </div>
          </footer>
        ) : (
          <footer className="p-3 sm:p-4 bg-white dark:bg-[#10121A] border-t border-neutral-100 dark:border-neutral-800 shrink-0">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
              {/* Mention Suggestions Popup */}
              {mentionMatches.length > 0 && (
                <div className="absolute bottom-16 left-0 right-0 bg-white dark:bg-[#141721] border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 z-50 animate-fade-in py-1">
                  <div className="px-3.5 py-2 bg-neutral-50 dark:bg-[#181C26] text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    Mention Colleagues (Type @ to search)
                  </div>
                  {mentionMatches.map((m) => (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => handleSelectMention(m.name)}
                      className="w-full px-4 py-2.5 text-left hover:bg-orange-50 dark:hover:bg-orange-950/40 text-xs text-neutral-700 dark:text-neutral-300 flex flex-col cursor-pointer transition-colors"
                    >
                      <span className="font-bold text-neutral-800 dark:text-neutral-100">@{m.name}</span>
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{m.email}</span>
                    </button>
                  ))}
                </div>
              )}

              <label
                htmlFor="messenger-file-upload"
                className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                title="Attach file or image"
              >
                <Paperclip className="w-4 h-4" />
                <input
                  id="messenger-file-upload"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>

              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                title="Quick emojis"
              >
                <Smile className="w-4 h-4" />
              </button>

              <input
                type="text"
                placeholder={
                  activeRecipient === 'room'
                    ? 'Message Company Room...'
                    : isGroupActive
                      ? `Message ${activeGroup?.name || 'Group Chat'}...`
                      : `Message ${selectedContact?.name || 'Colleague'}...`
                }
                value={inputText}
                onChange={handleInputChange}
                autoComplete="off"
                className="flex-1 bg-neutral-50 dark:bg-[#151822] border border-neutral-200 dark:border-neutral-700/80 focus:border-[#F15A24] dark:focus:border-[#F15A24] rounded-xl px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#F15A24] transition-all"
              />

              <button
                type="submit"
                disabled={!inputText.trim() && !attachmentUrl}
                className="bg-[#F15A24] hover:bg-[#D94F1E] active:scale-95 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </form>
          </footer>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#13161F] rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => {
                setShowCreateGroupModal(false);
                setNewGroupName('');
                setSelectedGroupEmails([]);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2.5 bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] rounded-xl border border-orange-200/50 dark:border-orange-900/40">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-neutral-800 dark:text-neutral-100 text-base">Create Group Chat</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Start a group conversation with colleagues</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. Project Delivery, Marketing Sync"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-neutral-50 dark:bg-[#181C26] border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Select Colleagues</label>
                <div className="max-h-48 overflow-y-auto border border-neutral-100 dark:border-neutral-800 rounded-xl divide-y divide-neutral-50 dark:divide-neutral-800 bg-neutral-50/50 dark:bg-[#181C26]/50 p-1">
                  {contacts.map((c) => {
                    const isSelected = selectedGroupEmails.includes(c.user.email);
                    return (
                      <button
                        key={c.user.email}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedGroupEmails(prev => prev.filter(e => e !== c.user.email));
                          } else {
                            setSelectedGroupEmails(prev => [...prev, c.user.email]);
                          }
                        }}
                        className={`w-full p-2.5 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer text-xs ${
                          isSelected ? 'bg-orange-50/80 dark:bg-orange-950/40 font-semibold text-[#F15A24]' : 'hover:bg-white dark:hover:bg-[#1E2330] text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold flex items-center justify-center text-[10px]">
                            {c.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate text-neutral-800 dark:text-neutral-100">{c.user.name}</p>
                            <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{c.user.email}</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded text-[#F15A24] focus:ring-[#F15A24]"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setNewGroupName('');
                    setSelectedGroupEmails([]);
                  }}
                  className="px-4 py-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newGroupName.trim()}
                  onClick={async () => {
                    try {
                      const { ok, data } = await apiFetch('/api/chat/groups', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-user-email': currentUser.email,
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({
                          name: newGroupName,
                          inviteEmails: selectedGroupEmails
                        })
                      });
                      if (ok && data?.success) {
                        setShowCreateGroupModal(false);
                        setNewGroupName('');
                        setSelectedGroupEmails([]);
                        fetchGroups();
                        if (data.group?.id) {
                          setActiveRecipient(data.group.id);
                          fetchMessagesForThread(data.group.id);
                        }
                      }
                    } catch (err) {
                      console.error('[Create Group Error]', err);
                    }
                  }}
                  className="px-4.5 py-2 bg-[#F15A24] hover:bg-[#D94F1E] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && activeGroup && (
        <div className="fixed inset-0 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#13161F] rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-2xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => {
                setShowInviteModal(false);
                setInviteGroupEmails([]);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2.5 bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] rounded-xl border border-orange-200/50 dark:border-orange-900/40">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-neutral-800 dark:text-neutral-100 text-base">Invite to {activeGroup.name}</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Add more colleagues to this conversation</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">Select Colleagues</label>
                <div className="max-h-48 overflow-y-auto border border-neutral-100 dark:border-neutral-800 rounded-xl divide-y divide-neutral-50 dark:divide-neutral-800 bg-neutral-50/50 dark:bg-[#181C26]/50 p-1">
                  {(() => {
                    const memberSet = new Set((activeGroup?.memberEmails || []).map(e => (e || '').toLowerCase().trim()));
                    const available = contacts.filter(c => {
                      const email = (c?.user?.email || '').toLowerCase().trim();
                      return email && !memberSet.has(email);
                    });

                    if (available.length === 0) {
                      return (
                        <div className="p-4 text-center text-xs text-neutral-400 italic">
                          All colleagues are already members of this group!
                        </div>
                      );
                    }

                    return available.map((c) => {
                      const contactEmail = c.user.email;
                      const isSelected = inviteGroupEmails.includes(contactEmail);
                      return (
                        <button
                          key={contactEmail}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setInviteGroupEmails(prev => prev.filter(e => e !== contactEmail));
                            } else {
                              setInviteGroupEmails(prev => [...prev, contactEmail]);
                            }
                          }}
                          className={`w-full p-2.5 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer text-xs ${
                            isSelected ? 'bg-orange-50/80 dark:bg-orange-950/40 font-semibold text-[#F15A24]' : 'hover:bg-white dark:hover:bg-[#1E2330] text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold flex items-center justify-center text-[10px]">
                              {c.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold truncate text-neutral-800 dark:text-neutral-100">{c.user.name}</p>
                              <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{c.user.email}</p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="rounded text-[#F15A24] focus:ring-[#F15A24]"
                          />
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteGroupEmails([]);
                  }}
                  className="px-4 py-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={inviteGroupEmails.length === 0}
                  onClick={async () => {
                    try {
                      const { ok, data } = await apiFetch(`/api/chat/groups/${activeGroup.id}/invite`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-user-email': currentUser.email,
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({
                          inviteEmails: inviteGroupEmails
                        })
                      });
                      if (ok && data?.success) {
                        setShowInviteModal(false);
                        setInviteGroupEmails([]);
                        fetchGroups();
                        fetchMessagesForThread(activeGroup.id, true);
                      }
                    } catch (err) {
                      console.error('[Invite Member Error]', err);
                    }
                  }}
                  className="px-4.5 py-2 bg-[#F15A24] hover:bg-[#D94F1E] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Add Colleagues
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared Photos & Files Modal */}
      {activeInfoTab && (
        <div className="fixed inset-0 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#13161F] rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-2xl max-w-2xl w-full p-6 relative max-h-[85vh] flex flex-col">
            <button
              type="button"
              onClick={() => setActiveInfoTab(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4 shrink-0">
              <div className={`p-2.5 rounded-xl border ${
                activeInfoTab === 'photos' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/50 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-sky-50 dark:bg-sky-950/40 border-sky-200/50 dark:border-sky-800/50 text-sky-600 dark:text-sky-400'
              }`}>
                {activeInfoTab === 'photos' ? <Smile className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-extrabold text-neutral-800 dark:text-neutral-100 text-base">
                  {activeInfoTab === 'photos' ? 'Shared Photos' : 'Shared Files'}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                  {activeInfoTab === 'photos' 
                    ? `Photos shared in your conversation with ${selectedContact?.name || 'Colleagues'}`
                    : `Documents and files shared in your conversation with ${selectedContact?.name || 'Colleagues'}`
                  }
                </p>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto min-h-0 py-2">
              {activeInfoTab === 'photos' ? (
                sharedPhotos.length === 0 ? (
                  <div className="py-12 text-center text-neutral-400 dark:text-neutral-500 text-xs italic">
                    No photos have been shared in this chat yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {sharedPhotos.map((m) => (
                      <div key={m.id} className="relative group rounded-xl overflow-hidden border border-neutral-200/60 dark:border-neutral-700/60 shadow-2xs bg-neutral-50 dark:bg-[#181C26]">
                        <img 
                          src={m.attachmentUrl} 
                          alt={m.attachmentName || 'Shared Photo'} 
                          className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                          <span className="truncate max-w-[70%] font-bold">{m.attachmentName || 'Photo'}</span>
                          <a 
                            href={m.attachmentUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="bg-[#F15A24] px-2 py-0.5 rounded text-white font-extrabold hover:bg-[#D94F1E]"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                sharedFiles.length === 0 ? (
                  <div className="py-12 text-center text-neutral-400 dark:text-neutral-500 text-xs italic">
                    No files have been shared in this chat yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sharedFiles.map((m) => (
                      <div key={m.id} className="p-3 bg-neutral-50 dark:bg-[#181C26] border border-neutral-200/60 dark:border-neutral-700/60 rounded-xl flex items-center justify-between gap-3 hover:bg-neutral-100/50 dark:hover:bg-[#202533] transition-all">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 rounded-lg shrink-0">
                            <Paperclip className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-100 truncate">{m.attachmentName || 'Shared Document'}</p>
                            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Shared by {m.senderName} &bull; {m.timestamp}</p>
                          </div>
                        </div>
                        <a 
                          href={m.attachmentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="px-3 py-1.5 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100/80 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 font-bold text-[10px] rounded-lg transition-all shadow-3xs flex items-center gap-1 shrink-0"
                        >
                          Download
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-neutral-100 dark:border-neutral-800 shrink-0 mt-4">
              <button
                type="button"
                onClick={() => setActiveInfoTab(null)}
                className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl text-neutral-700 dark:text-neutral-200 text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
