import React, { useEffect, useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FileText,
  Filter,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Inbox,
  Laptop,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  Menu,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Shield,
  ShieldAlert,
  Star,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { ComposeModal } from './ComposeModal';
import { JWLogo } from './JWLogo';
import { ThemeToggle } from './ThemeToggle';
import { MailDetailView } from './MailDetailView';
import { ChatMessengerView } from './ChatMessengerView';
import { ServerDiagnosticsModal } from './ServerDiagnosticsModal';
import {
  CustomFolder,
  EmailAttachment,
  EmailMessage,
  FolderType,
  MailServerStatus,
  User,
} from '../types';
import { safeJson, apiFetch } from '../lib/api';

const getMailCacheKey = (userEmail: string, folder: string) =>
  `jw_cached_emails_${(userEmail || 'user').toLowerCase().trim()}_${folder}`;

const loadLocalCachedEmails = (userEmail: string, folder: FolderType): EmailMessage[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getMailCacheKey(userEmail, folder));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [];
};

const loadAllLocalFolders = (userEmail: string): Record<string, EmailMessage[]> => {
  if (typeof window === 'undefined') return {};
  const res: Record<string, EmailMessage[]> = {};
  const standardList: FolderType[] = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'];
  for (const f of standardList) {
    const list = loadLocalCachedEmails(userEmail, f);
    if (list.length > 0) {
      res[f] = list;
    }
  }
  return res;
};

const saveLocalCachedEmails = (userEmail: string, folder: string, emailsList: EmailMessage[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getMailCacheKey(userEmail, folder), JSON.stringify(emailsList));
  } catch {}
};

interface MailAppProps {
  user: User;
  token: string;
  onLogout: () => void;
  onSwitchToAdmin?: () => void;
}

export const MailApp: React.FC<MailAppProps> = ({
  user,
  token,
  onLogout,
  onSwitchToAdmin,
}) => {
  const [currentUser, setCurrentUser] = useState<User>(user);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => safeJson(res))
      .then(data => {
        if (data.success && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, [token]);

  const [navMode, setNavMode] = useState<'mail' | 'chat'>('mail');
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [currentFolder, setCurrentFolder] = useState<FolderType>('inbox');
  const [emails, setEmails] = useState<EmailMessage[]>(() =>
    loadLocalCachedEmails(user?.email || '', 'inbox')
  );
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
  const [emailsByFolder, setEmailsByFolder] = useState<Record<string, EmailMessage[]>>(() =>
    loadAllLocalFolders(user?.email || '')
  );
  const [folderUnreadCounts, setFolderUnreadCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    const initFolders = loadAllLocalFolders(user?.email || '');
    for (const [fName, list] of Object.entries(initFolders)) {
      counts[fName] = list.filter(m => !m.isRead).length;
    }
    return counts;
  });
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'starred' | 'attachments'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<EmailMessage | null>(null);
  const [draftToEdit, setDraftToEdit] = useState<EmailMessage | null>(null);
  const [serverStatus, setServerStatus] = useState<MailServerStatus | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasPreloadedRef = useRef(false);

  // Sync cached emails when user object updates
  useEffect(() => {
    if (currentUser?.email) {
      const cached = loadLocalCachedEmails(currentUser.email, currentFolder);
      if (cached.length > 0) {
        setEmails(prev => (prev.length === 0 ? cached : prev));
        setEmailsByFolder(prev => {
          if (!prev[currentFolder] || prev[currentFolder].length === 0) {
            return { ...prev, [currentFolder]: cached };
          }
          return prev;
        });
      }
    }
  }, [currentUser?.email, currentFolder]);

  // Helper to safely parse JSON responses
  const safeParseJson = async (res: Response) => {
    return await safeJson(res);
  };

  // Create custom folder modal state
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#F15A24');
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);

  // Batch move menu
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Custom Iframe-Safe Confirmation Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Empty Trash Modal State
  const [isEmptyTrashModalOpen, setIsEmptyTrashModalOpen] = useState(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);

  // Permanently Empty Trash from Host Storage
  const handleEmptyTrashConfirm = async () => {
    setIsEmptyingTrash(true);
    try {
      const { ok, data } = await apiFetch('/api/mail/trash/empty', {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (ok && data?.success) {
        setEmails([]);
        saveLocalCachedEmails(currentUser.email, 'trash', []);
        setEmailsByFolder(c => ({ ...c, trash: [] }));
        setFolderUnreadCounts(c => ({ ...c, trash: 0 }));
        setSelectedIds(new Set());
        if (selectedMailId) {
          setSelectedMailId(null);
        }
        setIsEmptyTrashModalOpen(false);
        showToast(data.message || 'Trash emptied. Host storage freed.');

        // Refresh user info & host quota
        if (token) {
          fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => safeJson(res))
            .then(authData => {
              if (authData?.success && authData?.user) {
                setCurrentUser(authData.user);
              }
            })
            .catch(() => {});
        }
      } else {
        showToast(data?.error || 'Failed to empty trash from host storage.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error occurred while emptying trash.');
    } finally {
      setIsEmptyingTrash(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch emails from server with incremental non-destructive merge
  const fetchEmails = async (folderToFetch: FolderType = currentFolder, forceRefresh = false, silent = false) => {
    const hasExisting = (emailsByFolder[folderToFetch] && emailsByFolder[folderToFetch].length > 0) ||
                        (currentFolder === folderToFetch && emails.length > 0);
    if (!silent && !hasExisting) {
      setIsLoading(true);
    }
    setIsScanning(true);
    try {
      let url = `/api/mail?folder=${folderToFetch}&userEmail=${encodeURIComponent(currentUser.email)}`;
      if (searchQuery.trim()) {
        url += `&q=${encodeURIComponent(searchQuery.trim())}`;
      }
      if (filterMode === 'unread') url += `&unread=true`;
      if (filterMode === 'starred') url += `&starred=true`;
      if (forceRefresh) url += `&refresh=true`;

      const { ok, data } = await apiFetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
      });

      if (ok && data?.success && Array.isArray(data.emails)) {
        setEmailsByFolder(prevFolders => {
          // Client-side deduplication by messageId / id / (from+subject+time)
          const dedupMap = new Map<string, EmailMessage>();
          for (const item of data.emails) {
            let key = item.id;
            if (item.messageId && typeof item.messageId === 'string') {
              const norm = item.messageId.trim().toLowerCase().replace(/[<>]/g, '');
              if (norm) key = `msgid:${norm}`;
            } else if (item.from?.email && item.subject) {
              const sender = item.from.email.toLowerCase().trim();
              const subj = item.subject.toLowerCase().trim();
              const time = item.timestamp || item.rawDate || '';
              key = `fuzzy:${sender}:${subj}:${time}`;
            }
            if (!dedupMap.has(key) || item.id.startsWith('imap-')) {
              dedupMap.set(key, item);
            }
          }

          const freshEmails = Array.from(dedupMap.values());
          freshEmails.sort((a, b) => {
            const aTime = (typeof a.rawDate === 'number' && !isNaN(a.rawDate) && a.rawDate > 0)
              ? a.rawDate
              : (a.timestamp && !isNaN(new Date(a.timestamp).getTime()) ? new Date(a.timestamp).getTime() : 0);
            const bTime = (typeof b.rawDate === 'number' && !isNaN(b.rawDate) && b.rawDate > 0)
              ? b.rawDate
              : (b.timestamp && !isNaN(new Date(b.timestamp).getTime()) ? new Date(b.timestamp).getTime() : 0);
            if (bTime !== aTime) return bTime - aTime;
            const aUid = Number(a.id.split('-').pop() || 0);
            const bUid = Number(b.id.split('-').pop() || 0);
            return bUid - aUid;
          });

          saveLocalCachedEmails(currentUser.email, folderToFetch, freshEmails);

          if (currentFolder === folderToFetch) {
            setEmails(freshEmails);
          }

          return {
            ...prevFolders,
            [folderToFetch]: freshEmails,
          };
        });

        const count = data.unreadCount ?? data.emails.filter((m: any) => !m.isRead).length;
        setFolderUnreadCounts(prev => ({
          ...prev,
          [folderToFetch]: count,
        }));
        setFetchError(null);
      } else if (data?.notice) {
        if (!hasExisting) {
          setFetchError(data.notice);
        }
      } else if (data?.error && !hasExisting) {
        setFetchError(data.error);
      }
    } catch {
      // Keep local cached state active during transient offline/network transitions
    } finally {
      if (!silent) setIsLoading(false);
      setIsScanning(false);
    }
  };

  // Refresh mailbox: scans for new emails while keeping existing emails visible
  const handleRefreshMailbox = async () => {
    setIsScanning(true);
    try {
      await Promise.allSettled([
        fetchEmails(currentFolder, true),
        fetchCustomFolders(),
        fetchServerStatus(),
      ]);
    } catch {
      // Ignore
    } finally {
      setIsScanning(false);
    }
  };

  // Fetch custom folders
  const fetchCustomFolders = async () => {
    try {
      const { ok, data } = await apiFetch('/api/folders', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (ok && data?.success && Array.isArray(data.folders)) {
        const systemNames = ['inbox', 'inbox.sent', 'inbox.drafts', 'inbox.archive', 'inbox.spam', 'inbox.trash', 'inbox.junk', 'sent', 'drafts', 'archive', 'spam', 'trash', 'junk'];
        const userFolders = data.folders.filter((f: any) => {
          const name = (f.name || f.id || '').toLowerCase().trim();
          return !systemNames.includes(name) && !name.startsWith('inbox.');
        });
        setCustomFolders(userFolders);
      }
    } catch {
      // Ignore
    }
  };

  // Fetch server status
  const fetchServerStatus = async () => {
    try {
      const { ok, data } = await apiFetch('/api/server/status', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (ok && data?.success && data?.status) {
        setServerStatus(data.status);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchEmails(currentFolder);
    if (currentFolder === 'inbox') {
      fetchEmails('sent', false, true);
    }
  }, [currentFolder, filterMode, currentUser.email]);

  useEffect(() => {
    fetchCustomFolders();
    fetchServerStatus();

    // Preload standard folders sequentially only ONCE on startup with 2.5s spacing
    if (!hasPreloadedRef.current) {
      hasPreloadedRef.current = true;
      const standardFolderList: FolderType[] = ['sent', 'drafts', 'archive', 'trash', 'spam'];
      standardFolderList.forEach((folder, idx) => {
        setTimeout(() => {
          fetchEmails(folder, false, true);
        }, (idx + 1) * 2500);
      });
    }

    // Gentle background polling: checks active folder every 45s without forcing hard re-syncs
    const mailInterval = setInterval(() => {
      fetchEmails(currentFolder, false, true);
    }, 45000);

    // Periodic server status check every 60s
    const statusInterval = setInterval(() => {
      fetchServerStatus();
    }, 60000);

    return () => {
      clearInterval(mailInterval);
      clearInterval(statusInterval);
    };
  }, [currentFolder]);

  const getNumericTime = (m: EmailMessage | null | undefined): number => {
    if (!m) return 0;
    if (typeof m.rawDate === 'number' && !isNaN(m.rawDate) && m.rawDate > 0) {
      return m.rawDate;
    }
    if (m.timestamp) {
      const parsed = new Date(m.timestamp).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };

  const isReplyOrForward = (rawSubject?: string) => {
    if (!rawSubject) return false;
    return /^(re|fw|fwd|aw|wg|reply|forward)[:\s\-]/i.test(rawSubject.trim());
  };

  const normalizeSubject = (sub: string) => {
    if (!sub) return '';
    return sub
      .toLowerCase()
      .replace(/^(re|fw|fwd|aw|wg|reply|forward)[:\s\-]*/gi, '')
      .replace(/^(re|fw|fwd|aw|wg|reply|forward)\d*[:\s\-]*/gi, '')
      .replace(/\[.*?\]/g, '')
      .trim();
  };

  // Gather all emails across all loaded folders, strictly deduplicated by unique email ID
  const allLoadedEmails = React.useMemo(() => {
    const list: EmailMessage[] = [];
    const seenIds = new Set<string>();

    const addEmail = (e: EmailMessage) => {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        list.push(e);
      }
    };

    emails.forEach(addEmail);
    (Object.values(emailsByFolder) as EmailMessage[][]).forEach(folderEmails => {
      folderEmails.forEach(addEmail);
    });

    return list;
  }, [emails, emailsByFolder]);

  // Group emails into distinct conversation threads for Inbox view or list items for other folders
  const conversationGroups = React.useMemo(() => {
    const filtered = emails.filter(mail => {
      if (filterMode === 'attachments') {
        return mail.hasAttachments;
      }
      return true;
    });

    // Strictly deduplicate across ALL folders by unique ID / messageId / fingerprint
    const uniqueMap = new Map<string, EmailMessage>();
    filtered.forEach(m => {
      const uniqueKey = m.id || m.messageId || `${m.from?.email || ''}-${m.subject || ''}-${m.timestamp || ''}`;
      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, m);
      }
    });
    const uniqueEmails = Array.from(uniqueMap.values());

    // In folders other than Inbox (like Sent, Drafts, Trash, Spam, Archive, Custom Folders), show emails individually as separate items (strictly deduplicated)
    if (currentFolder !== 'inbox') {
      const sorted = [...uniqueEmails].sort((a, b) => {
        const aTime = getNumericTime(a);
        const bTime = getNumericTime(b);
        if (bTime !== aTime) return bTime - aTime;
        const aUid = Number(a.id.split('-').pop() || 0);
        const bUid = Number(b.id.split('-').pop() || 0);
        return bUid - aUid;
      });
      return sorted.map(mail => ({
        representative: mail,
        count: 1,
      }));
    }

    // Group emails into conversation threads for Inbox ONLY if they are genuine replies/forwards or share thread linkage
    const groupsMap = new Map<string, EmailMessage[]>();
    uniqueEmails.forEach(mail => {
      const normSub = normalizeSubject(mail.subject);
      const isConvo = isReplyOrForward(mail.subject) || mail.inReplyTo || mail.references;
      const threadKey = (isConvo && normSub && normSub.length > 2) ? normSub : mail.id;

      if (!groupsMap.has(threadKey)) {
        groupsMap.set(threadKey, []);
      }
      groupsMap.get(threadKey)!.push(mail);
    });

    const list: { representative: EmailMessage; count: number }[] = [];
    groupsMap.forEach(group => {
      group.sort((a, b) => {
        const aTime = getNumericTime(a);
        const bTime = getNumericTime(b);
        if (bTime !== aTime) return bTime - aTime;
        const aUid = Number(a.id.split('-').pop() || 0);
        const bUid = Number(b.id.split('-').pop() || 0);
        return bUid - aUid;
      });
      list.push({
        representative: group[0],
        count: group.length,
      });
    });

    list.sort((a, b) => {
      const aTime = getNumericTime(a.representative);
      const bTime = getNumericTime(b.representative);
      if (bTime !== aTime) return bTime - aTime;
      const aUid = Number(a.representative.id.split('-').pop() || 0);
      const bUid = Number(b.representative.id.split('-').pop() || 0);
      return bUid - aUid;
    });

    return list;
  }, [emails, filterMode, currentFolder]);

  const displayedEmails = conversationGroups.map(g => g.representative);

  const selectedMail = allLoadedEmails.find(m => m.id === selectedMailId) || emails.find(m => m.id === selectedMailId) || null;

  // Map thread counts strictly within the current folder's emails so it NEVER bleeds across folders or doubles
  const threadCountMap = React.useMemo(() => {
    const map = new Map<string, number>();
    conversationGroups.forEach(g => {
      map.set(g.representative.id, g.count);
      const norm = normalizeSubject(g.representative.subject);
      if (norm) {
        map.set(norm, g.count);
      }
    });
    return map;
  }, [conversationGroups]);

  const getConversationCount = (mail: EmailMessage) => {
    if (currentFolder !== 'inbox') return 1;
    const count = threadCountMap.get(mail.id) || threadCountMap.get(normalizeSubject(mail.subject)) || 1;
    return count;
  };

  // Toggle Read (Immediate 0ms optimistic update + server sync)
  const handleToggleRead = async (id: string, e?: React.MouseEvent, explicitState?: boolean) => {
    if (e) e.stopPropagation();
    const target = emails.find(m => m.id === id) || allLoadedEmails.find(m => m.id === id);
    if (!target) return;

    const nextIsRead = explicitState !== undefined ? explicitState : !target.isRead;
    if (target.isRead === nextIsRead) return;

    // Immediate 0ms local state update
    setEmails(prev => {
      const updated = prev.map(m => (m.id === id ? { ...m, isRead: nextIsRead } : m));
      saveLocalCachedEmails(currentUser.email, currentFolder, updated);
      setEmailsByFolder(c => ({
        ...c,
        [currentFolder]: (c[currentFolder] || []).map(m => (m.id === id ? { ...m, isRead: nextIsRead } : m))
      }));
      const count = updated.filter(m => !m.isRead).length;
      setFolderUnreadCounts(c => ({ ...c, [currentFolder]: count }));
      return updated;
    });

    try {
      await fetch(`/api/mail/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify({ isRead: nextIsRead, folder: currentFolder }),
      });
    } catch (err) {
      console.error('Failed to sync read status:', err);
    }
  };

  // Toggle Star
  const handleToggleStar = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = emails.find(m => m.id === id);
    if (!target) return;

    try {
      const { ok, data } = await apiFetch(`/api/mail/${id}/star`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isStarred: !target.isStarred, folder: currentFolder }),
      });
      if (ok && data?.success) {
        setEmails(prev => {
          const updated = prev.map(m => (m.id === id ? { ...m, isStarred: !target.isStarred } : m));
          saveLocalCachedEmails(currentUser.email, currentFolder, updated);
          setEmailsByFolder(c => ({ ...c, [currentFolder]: updated }));
          return updated;
        });
      }
    } catch {
      // Ignore
    }
  };

  // Move Single Email to Folder
  const handleMoveEmail = async (id: string, targetFolder: string) => {
    try {
      const { ok, data } = await apiFetch(`/api/mail/${id}/move`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify({ sourceFolder: currentFolder, targetFolder }),
      });
      if (ok && data?.success) {
        showToast(`Email moved to ${targetFolder}.`);
        setEmails(prev => {
          const updated = prev.filter(m => m.id !== id);
          saveLocalCachedEmails(currentUser.email, currentFolder, updated);
          setEmailsByFolder(c => ({ ...c, [currentFolder]: updated }));
          const count = updated.filter(m => !m.isRead).length;
          setFolderUnreadCounts(c => ({ ...c, [currentFolder]: count }));
          return updated;
        });
        fetchEmails(currentFolder);
        if (selectedMailId === id && currentFolder !== targetFolder) {
          setSelectedMailId(null);
        }
      }
    } catch {
      // Ignore
    }
  };

  // Delete / Trash
  const handleDeleteMail = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const { ok, data } = await apiFetch(`/api/mail/${id}?folder=${encodeURIComponent(currentFolder)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
      });
      if (ok && data?.success) {
        if (currentFolder === 'trash') {
          setEmails(prev => {
            const updated = prev.filter(m => m.id !== id);
            saveLocalCachedEmails(currentUser.email, currentFolder, updated);
            setEmailsByFolder(c => ({ ...c, [currentFolder]: updated }));
            const count = updated.filter(m => !m.isRead).length;
            setFolderUnreadCounts(c => ({ ...c, [currentFolder]: count }));
            return updated;
          });
          showToast('Message permanently removed from host storage.');
        } else {
          setEmails(prev => {
            const updated = prev.filter(m => m.id !== id);
            saveLocalCachedEmails(currentUser.email, currentFolder, updated);
            setEmailsByFolder(c => ({ ...c, [currentFolder]: updated }));
            const count = updated.filter(m => !m.isRead).length;
            setFolderUnreadCounts(c => ({ ...c, [currentFolder]: count }));
            return updated;
          });
          showToast('Message moved to Trash.');
        }
        if (selectedMailId === id) {
          setSelectedMailId(null);
        }
      }
    } catch {
      // Ignore
    }
  };

  // Send new email
  const handleSendEmail = async (emailData: {
    to: { name: string; email: string }[];
    cc?: string[];
    subject: string;
    bodyText: string;
    attachments?: EmailAttachment[];
    deleteDraftId?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const clientAttachments: any[] = [];
      if (emailData.attachments && emailData.attachments.length > 0) {
        for (const att of emailData.attachments) {
          if (att.file) {
            const base64Content = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string) || '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(att.file as File);
            });
            clientAttachments.push({
              id: att.id,
              name: att.name,
              size: att.size,
              type: att.type,
              content: base64Content,
            });
          } else {
            clientAttachments.push(att);
          }
        }
      }

      const { ok, data } = await apiFetch<any>('/api/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify({
          to: emailData.to,
          cc: emailData.cc,
          subject: emailData.subject,
          bodyText: emailData.bodyText,
          deleteDraftId: emailData.deleteDraftId,
          clientAttachments,
        }),
      });

      if (ok && data && data.success) {
        showToast('Message dispatched via SMTP (TLS 1.3).');
        fetchEmails(currentFolder, true, true);
        fetchServerStatus();
        // Rapid post-send syncs to catch recipient replies instantly
        setTimeout(() => fetchEmails(currentFolder, true, true), 3000);
        setTimeout(() => fetchEmails(currentFolder, true, true), 7000);
        setTimeout(() => fetchEmails(currentFolder, true, true), 15000);
        return { success: true };
      }
      return { success: false, error: data?.error || 'Failed to dispatch email via mail server queue.' };
    } catch (err: any) {
      console.error('[handleSendEmail Error]', err);
      return { success: false, error: err?.message || 'Network error while contacting SMTP server.' };
    }
  };

  // Save email as draft
  const handleSaveDraft = async (draftData: {
    to: { name: string; email: string }[];
    cc?: string[];
    subject: string;
    bodyText: string;
    existingDraftId?: string;
  }): Promise<string | undefined> => {
    try {
      const { ok, data } = await apiFetch<any>('/api/mail/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify(draftData),
      });
      if (ok && data?.success && data.result) {
        showToast('Draft updated on mail server.');
        fetchEmails(currentFolder);
        return data.result.draftId;
      }
    } catch (err) {
      console.error('Failed to save draft:', err);
    }
    return undefined;
  };

  // Discard/delete email draft
  const handleDiscardDraft = async (draftId: string): Promise<boolean> => {
    try {
      const { ok, data } = await apiFetch<any>(`/api/mail/${draftId}?folder=drafts`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
      });
      if (ok && data?.success) {
        showToast('Draft discarded.');
        fetchEmails(currentFolder);
        return true;
      }
    } catch (err) {
      console.error('Failed to discard draft:', err);
    }
    return false;
  };

  // Reply trigger
  const handleReplyTo = (mail: EmailMessage) => {
    setReplyTarget(mail);
    setIsComposeOpen(true);
  };

  // Quick reply handler
  const handleQuickReply = async (toEmail: string, subject: string, bodyText: string) => {
    await handleSendEmail({
      to: [{ name: toEmail.split('@')[0], email: toEmail }],
      subject,
      bodyText,
    });
  };

  // Handler when full message detail is fetched in DetailView
  const handleUpdateMail = (updatedMail: EmailMessage) => {
    setEmails(prev => {
      const exists = prev.some(m => m.id === updatedMail.id);
      if (!exists) return prev;
      const updated = prev.map(m => (m.id === updatedMail.id ? { ...m, ...updatedMail } : m));
      saveLocalCachedEmails(currentUser.email, currentFolder, updated);
      return updated;
    });
    setEmailsByFolder(prev => {
      const folderList = prev[currentFolder] || [];
      const updated = folderList.map(m => (m.id === updatedMail.id ? { ...m, ...updatedMail } : m));
      return { ...prev, [currentFolder]: updated };
    });
  };

  // Batch actions
  const handleSelectAll = () => {
    if (selectedIds.size === displayedEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedEmails.map(m => m.id)));
    }
  };

  const handleToggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchAction = async (action: 'markRead' | 'markUnread' | 'trash' | 'archive' | 'spam' | 'move', targetFolder?: string) => {
    if (selectedIds.size === 0 || isBatchProcessing) return;

    const idsToProcess = Array.from(selectedIds);
    const originalEmails = [...emails];
    const originalEmailsByFolder = { ...emailsByFolder };
    const originalSelectedIds = new Set(selectedIds);

    // 1. UI FEEDBACK & OPTIMISTIC UPDATE
    setIsBatchProcessing(true);
    setIsBatchMoveOpen(false);
    
    // Immediately remove from list if it's a move/delete action
    const isMoveAction = ['trash', 'archive', 'spam', 'move'].includes(action);
    if (isMoveAction) {
      const remainingEmails = originalEmails.filter(email => !originalSelectedIds.has(email.id));
      setEmails(remainingEmails);
      saveLocalCachedEmails(currentUser.email, currentFolder, remainingEmails);
      setEmailsByFolder(prev => ({
        ...prev,
        [currentFolder]: remainingEmails
      }));
      const count = remainingEmails.filter(m => !m.isRead).length;
      setFolderUnreadCounts(c => ({ ...c, [currentFolder]: count }));
      showToast(`${action === 'trash' ? 'Deleting' : 'Moving'} ${idsToProcess.length} message(s)...`);
    } else if (action === 'markRead' || action === 'markUnread') {
      const isRead = action === 'markRead';
      const updatedEmails = originalEmails.map(email => 
        originalSelectedIds.has(email.id) ? { ...email, isRead } : email
      );
      setEmails(updatedEmails);
      saveLocalCachedEmails(currentUser.email, currentFolder, updatedEmails);
      setEmailsByFolder(prev => ({
        ...prev,
        [currentFolder]: updatedEmails
      }));
      const count = updatedEmails.filter(m => !m.isRead).length;
      setFolderUnreadCounts(c => ({ ...c, [currentFolder]: count }));
      showToast(`${isRead ? 'Marking' : 'Unmarking'} ${idsToProcess.length} message(s)...`);
    }

    // Clear selection immediately so user can continue working
    setSelectedIds(new Set());

    try {
      const res = await fetch('/api/mail/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-email': currentUser.email,
        },
        body: JSON.stringify({ 
          ids: idsToProcess, 
          action, 
          targetFolder, 
          sourceFolder: currentFolder 
        }),
      });
      
      const data = await safeParseJson(res);
      
      if (!data.success) {
        // 2. ROLLBACK ON FAILURE
        setEmails(originalEmails);
        saveLocalCachedEmails(currentUser.email, currentFolder, originalEmails);
        setEmailsByFolder(originalEmailsByFolder);
        setSelectedIds(originalSelectedIds);
        showToast(data.error || 'Failed to apply operation.');
      } else {
        // 3. SUCCESS - Final refresh in background
        showToast(`Success: Operation applied to ${idsToProcess.length} message(s).`);
        
        // Trigger background sync
        fetchEmails(currentFolder, true, true);
        fetchServerStatus();
      }
    } catch (err) {
      console.error('[BatchAction Error]', err);
      // ROLLBACK ON NETWORK ERROR
      setEmails(originalEmails);
      saveLocalCachedEmails(currentUser.email, currentFolder, originalEmails);
      setEmailsByFolder(originalEmailsByFolder);
      setSelectedIds(originalSelectedIds);
      showToast('Connection error. Could not complete batch action.');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Create Custom Folder
  const handleCreateCustomFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateFolderError(null);

    if (!newFolderName.trim()) {
      setCreateFolderError('Folder name is required.');
      return;
    }

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          color: newFolderColor,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        setCreateFolderError(data.error || 'Failed to create folder.');
        return;
      }

      showToast(`Custom folder "${newFolderName.trim()}" created.`);
      setIsCreateFolderOpen(false);
      setNewFolderName('');
      fetchCustomFolders();
    } catch (err) {
      setCreateFolderError('Failed to create folder.');
    }
  };

  // Delete Custom Folder
  const handleDeleteCustomFolder = (folderId: string, folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Custom Folder',
      message: `Delete folder "${folderName}"? Emails inside will be safely moved to Inbox.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          const data = await safeJson(res);
          if (data.success) {
            showToast(`Folder "${folderName}" deleted.`);
            const nextFolder = currentFolder === folderId ? 'inbox' : currentFolder;
            if (currentFolder === folderId) {
              setCurrentFolder('inbox');
            }
            fetchCustomFolders();
            fetchEmails(nextFolder);
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  // Standard Folders specified: Inbox, Sent, Spam, Archive, Trash
  const standardFolders: { id: FolderType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'inbox',
      label: 'Inbox',
      icon: <Inbox className="w-4 h-4" />,
    },
    {
      id: 'sent',
      label: 'Sent',
      icon: <Send className="w-4 h-4" />,
    },
    {
      id: 'spam',
      label: 'Spam',
      icon: <ShieldAlert className="w-4 h-4" />,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: <Archive className="w-4 h-4" />,
    },
    {
      id: 'drafts',
      label: 'Drafts',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'trash',
      label: 'Trash',
      icon: <Trash2 className="w-4 h-4" />,
    },
  ];

  return (
    <div
      id="mail-app-root"
      className="h-screen w-full flex flex-col bg-neutral-100 dark:bg-[#0c0d10] text-neutral-900 dark:text-neutral-100 overflow-hidden font-sans transition-colors duration-150"
    >
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-neutral-900 text-white text-xs sm:text-sm font-medium shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER BAR (White & Orange Theme) */}
      <header className="h-16 bg-white dark:bg-[#121316] border-b border-orange-200/90 dark:border-neutral-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 shadow-2xs z-20 transition-colors">
        {/* Left: Brand & Mobile Menu */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="md:hidden p-2 text-neutral-600 dark:text-neutral-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <JWLogo size="sm" showText={false} />
            <div className="leading-tight">
              <div className="text-sm font-extrabold text-neutral-900 dark:text-white tracking-tight">
                JW Summit Group Inc.
              </div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400 hidden sm:block font-medium">
                Corporate Webmail
              </div>
            </div>
          </div>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-xl mx-2 hidden sm:block">
          <form
            onSubmit={e => {
              e.preventDefault();
              fetchEmails(currentFolder);
            }}
            className="relative"
          >
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search messages, senders, or attachments..."
              className="w-full pl-10 pr-10 py-2 rounded-xl bg-neutral-50 dark:bg-[#18191d] border border-neutral-200 dark:border-neutral-700/80 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:bg-white dark:focus:bg-[#1f2026] focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-900/30 focus:border-[#F15A24] dark:focus:border-[#F15A24] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchEmails(currentFolder);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>

        {/* Right Actions & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin Switcher Button (if logged in as admin) */}
          {currentUser.role === 'admin' && onSwitchToAdmin && (
            <button
              type="button"
              id="admin-console-shortcut-btn"
              onClick={onSwitchToAdmin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F15A24] text-white font-bold text-xs shadow-xs hover:bg-[#E24816] transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Console</span>
            </button>
          )}

          <ThemeToggle />

          <button
            type="button"
            id="header-signout-btn"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1. LEFT SIDEBAR: USER INFO (USERNAME + EMAIL BELOW), COMPOSE, STANDARD FOLDERS, CUSTOM FOLDERS */}
        <aside
          id="mail-sidebar"
          className={`fixed md:relative z-30 inset-y-0 left-0 w-64 bg-white dark:bg-[#0E1015] border-r border-neutral-200 dark:border-neutral-800/80 flex flex-col justify-between shrink-0 transform md:transform-none transition-transform duration-200 ease-in-out ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* User Profile Header inside Sidebar with Dropdown - Statically positioned at the top of aside to prevent overflow clipping */}
          <div
            id="sidebar-user-header"
            className="p-4 bg-orange-50/60 dark:bg-[#13151D] border-b border-orange-200/80 dark:border-neutral-800/80 relative z-40 shrink-0 transition-colors"
          >
            <div className="flex items-center gap-3">
              {/* LEFT SIDE OF JERIC RMA: THE MAIL BUTTON WHEN CLICKED FOR DROPDOWN */}
              <button
                type="button"
                onClick={() => {
                  if (currentUser.role === 'admin') {
                    setUserDropdownOpen(!userDropdownOpen);
                  }
                }}
                className="w-10 h-10 rounded-xl bg-[#F15A24] text-white flex items-center justify-center shadow-xs shrink-0 cursor-default"
                title="Account"
              >
                <Mail className="w-5 h-5" />
              </button>
              
              <div
                onClick={() => {
                  if (currentUser.role === 'admin') {
                    setUserDropdownOpen(!userDropdownOpen);
                  }
                }}
                className={`min-w-0 flex-1 text-left flex items-center justify-between group ${
                  currentUser.role === 'admin' ? 'cursor-pointer' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  {/* USERNAME */}
                  <div className="text-sm font-black text-neutral-900 dark:text-neutral-100 truncate tracking-tight group-hover:text-[#F15A24] dark:group-hover:text-[#F15A24] transition-colors">
                    {currentUser.name}
                  </div>
                  {/* BELOW USERNAME: EMAIL ADDRESS OF USER */}
                  <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate font-mono mt-0.5">
                    {currentUser.email}
                  </div>
                </div>
                {currentUser.role === 'admin' && (
                  <ChevronDown className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-[#F15A24] dark:group-hover:text-[#F15A24] transition-all ml-1 shrink-0" />
                )}
              </div>
            </div>

            {/* Dropdown Menu when Sidebar User icon is clicked (Admin options only) */}
            {userDropdownOpen && currentUser.role === 'admin' && (
              <div className="absolute left-4 right-4 mt-2 bg-white dark:bg-[#18191d] rounded-xl shadow-xl border border-orange-200/80 dark:border-neutral-700 p-1.5 z-50 animate-in fade-in zoom-in-95">
                <div className="space-y-1">
                  {onSwitchToAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onSwitchToAdmin();
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-[#F15A24]" />
                      <span>Admin Console</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setIsDiagnosticsOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Server className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <span>Server Diagnostics</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Primary Compose Button */}
              <button
                id="compose-trigger-btn"
                type="button"
                onClick={() => {
                  setReplyTarget(null);
                  setIsComposeOpen(true);
                  setIsMobileSidebarOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-bold text-xs sm:text-sm bg-[#F15A24] hover:bg-[#E24816] active:scale-[0.98] shadow-md shadow-orange-500/25 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Compose Email</span>
              </button>

              {/* STANDARD MAILBOX FOLDERS: INBOX, SENT, SPAM, ARCHIVE, TRASH */}
              <nav className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-3 py-1.5">
                  Mailboxes
                </div>
                {standardFolders.map(f => {
                  const isActive = currentFolder === f.id;
                  return (
                    <div
                      key={f.id}
                      id={`folder-btn-${f.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        // Switch folder view instantly using client-side cache
                        setNavMode('mail');
                        const cached = (emailsByFolder[f.id] && emailsByFolder[f.id].length > 0)
                          ? emailsByFolder[f.id]
                          : loadLocalCachedEmails(currentUser.email, f.id);
                        setEmails(cached);
                        setCurrentFolder(f.id);
                        setSelectedMailId(null);
                        setIsMobileSidebarOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setNavMode('mail');
                          const cached = (emailsByFolder[f.id] && emailsByFolder[f.id].length > 0)
                            ? emailsByFolder[f.id]
                            : loadLocalCachedEmails(currentUser.email, f.id);
                          setEmails(cached);
                          setCurrentFolder(f.id);
                          setSelectedMailId(null);
                          setIsMobileSidebarOpen(false);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none ${
                        navMode === 'mail' && isActive
                          ? 'bg-orange-50 dark:bg-[#F15A24]/15 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-[#F15A24]/30 shadow-2xs font-bold'
                          : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={navMode === 'mail' && isActive ? 'text-[#F15A24]' : 'text-neutral-500 dark:text-neutral-400'}>
                          {f.icon}
                        </span>
                        <span>{f.label}</span>
                      </div>

                      {f.id === 'trash' && (emailsByFolder['trash']?.length > 0 || (currentFolder === 'trash' && displayedEmails.length > 0)) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEmptyTrashModalOpen(true);
                          }}
                          className="text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200/80 dark:border-red-800/50 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                          title="Permanently empty trash to free host storage"
                        >
                          Empty
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* CUSTOM FOLDERS SECTION (Placed directly below Trash folder) */}
                <div className="pt-3 space-y-1">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                      <span>Custom Folders</span>
                    </span>
                    <button
                      type="button"
                      id="create-custom-folder-btn"
                      onClick={() => {
                        setIsCreateFolderOpen(true);
                        setCreateFolderError(null);
                      }}
                      className="text-neutral-400 dark:text-neutral-500 hover:text-[#F15A24] dark:hover:text-orange-400 p-1 rounded hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Create custom folder"
                    >
                      <FolderPlus className="w-4 h-4 text-[#F15A24]" />
                    </button>
                  </div>

                  {customFolders.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-neutral-400 dark:text-neutral-500 italic flex items-center gap-2">
                      <Folder className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600 shrink-0" />
                      <span>No custom folders. Click + to create.</span>
                    </div>
                  ) : (
                    customFolders.map(cf => {
                      const isActive = navMode === 'mail' && currentFolder === cf.id;
                      return (
                        <div
                          key={cf.id}
                          className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-orange-50 dark:bg-[#F15A24]/15 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-[#F15A24]/30 shadow-2xs font-bold'
                              : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                          }`}
                          onClick={() => {
                            setNavMode('mail');
                            const cached = (emailsByFolder[cf.id] && emailsByFolder[cf.id].length > 0)
                              ? emailsByFolder[cf.id]
                              : loadLocalCachedEmails(currentUser.email, cf.id);
                            setEmails(cached);
                            setCurrentFolder(cf.id);
                            setSelectedMailId(null);
                            setIsMobileSidebarOpen(false);
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Folder
                              className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110"
                              style={{ color: cf.color }}
                              fill={cf.color}
                              fillOpacity={0.25}
                            />
                            <span className="truncate">{cf.name}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustomFolder(cf.id, cf.name, e)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-opacity cursor-pointer"
                              title="Delete folder"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </nav>

              {/* COMMUNICATION: MESSENGER / CHAT */}
              <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-3 py-1.5">
                  Apps & Messaging
                </div>
                <button
                  type="button"
                  id="chat-messenger-nav-btn"
                  onClick={() => {
                    setNavMode('chat');
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    navMode === 'chat'
                      ? 'bg-orange-50 dark:bg-[#F15A24]/15 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-[#F15A24]/30 shadow-2xs font-bold'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className={navMode === 'chat' ? 'w-4 h-4 text-[#F15A24]' : 'w-4 h-4 text-neutral-500 dark:text-neutral-400'} />
                    <span>Messenger / Chat</span>
                  </div>
                  {unreadChatCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F15A24] text-white">
                      {unreadChatCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SIDEBAR FOOTER: LAPTOP DEVICE STORAGE QUOTA */}
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#12151E] space-y-2 transition-colors">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-[#F15A24]" />
                <span>Mail Storage</span>
              </span>
              <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[10px]">
                {currentUser.storageUsedMb} MB / {(currentUser.storageQuotaMb / 1024).toFixed(1)} GB
              </span>
            </div>

            <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                style={{
                  width: `${Math.min(100, Math.round((currentUser.storageUsedMb / currentUser.storageQuotaMb) * 100))}%`,
                }}
                className="h-full bg-[#F15A24] rounded-full transition-all duration-300"
              />
            </div>

            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
              <span>Host Device Quota</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {((currentUser.storageQuotaMb - currentUser.storageUsedMb) / 1024).toFixed(1)} GB free
              </span>
            </div>

            {/* Trash host storage reclaim action */}
            {(emailsByFolder['trash']?.length > 0 || (currentFolder === 'trash' && displayedEmails.length > 0)) && (
              <div className="pt-2 border-t border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between text-[10px]">
                <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                  <Trash2 className="w-3 h-3 text-red-500" />
                  <span>Trash has items</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEmptyTrashModalOpen(true)}
                  disabled={isEmptyingTrash}
                  className="font-bold text-red-600 dark:text-red-400 hover:text-red-700 hover:underline cursor-pointer disabled:opacity-50"
                >
                  Empty Trash
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* 1B. CHAT MESSENGER VIEW (Kept mounted for zero-delay instant real-time sync) */}
        <main
          className={`flex-1 p-2 sm:p-4 bg-neutral-50/70 dark:bg-[#0B0D12] overflow-hidden flex-col ${
            navMode === 'chat' ? 'flex' : 'hidden'
          }`}
        >
          <ChatMessengerView
            currentUser={currentUser}
            token={token}
            onOpenComposeWithEmail={email => {
              setNavMode('mail');
              setReplyTarget(null);
              setDraftToEdit(null);
              setIsComposeOpen(true);
            }}
            onUnreadCountChange={count => setUnreadChatCount(count)}
          />
        </main>

        {/* 2. MIDDLE PANE: EMAIL LIST VIEW */}
        <section
          id="email-list-pane"
          className={`flex-1 md:w-80 lg:w-96 flex flex-col bg-white dark:bg-[#12151E] border-r border-neutral-200 dark:border-neutral-800/80 shrink-0 transition-colors ${
            navMode === 'chat' ? 'hidden' : selectedMailId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* List Header Toolbar */}
          <div className="p-3 sm:p-4 border-b border-neutral-200 dark:border-neutral-800/80 flex items-center justify-between gap-2 bg-neutral-50/50 dark:bg-[#161924] transition-colors">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === displayedEmails.length}
                onChange={handleSelectAll}
                className="rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[#F15A24] focus:ring-[#F15A24] cursor-pointer"
                title="Select all"
              />

              {/* Batch Actions */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-1 text-xs animate-in fade-in">
                  <span className="text-neutral-500 dark:text-neutral-400 font-bold flex items-center gap-1.5">
                    {isBatchProcessing && <Loader2 className="w-3 h-3 animate-spin text-[#F15A24]" />}
                    <span>{selectedIds.size} selected</span>
                  </span>

                  {/* Move to folder dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={isBatchProcessing}
                      onClick={() => setIsBatchMoveOpen(!isBatchMoveOpen)}
                      className="p-1.5 rounded hover:bg-orange-100 dark:hover:bg-neutral-800 text-[#F15A24] transition-colors disabled:opacity-50"
                      title="Move selected"
                    >
                      <FolderInput className="w-4 h-4" />
                    </button>

                    {isBatchMoveOpen && (
                      <div className="absolute left-0 mt-1 w-44 bg-white dark:bg-[#1c1d22] rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 z-50 text-xs text-neutral-800 dark:text-neutral-200">
                        <button
                          type="button"
                          onClick={() => handleBatchAction('archive')}
                          className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 flex items-center gap-1.5"
                        >
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBatchAction('spam')}
                          className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 flex items-center gap-1.5"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" /> Spam
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBatchAction('trash')}
                          className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Trash
                        </button>
                        {customFolders.map(cf => (
                          <button
                            key={cf.id}
                            type="button"
                            onClick={() => handleBatchAction('move', cf.id)}
                            className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 flex items-center gap-2"
                          >
                            <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: cf.color }} fill={cf.color} fillOpacity={0.25} />
                            <span className="truncate">{cf.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isBatchProcessing}
                    onClick={() => handleBatchAction('markUnread')}
                    className="p-1.5 rounded hover:bg-orange-100 dark:hover:bg-neutral-800 text-[#F15A24] transition-colors disabled:opacity-50"
                    title="Mark selected as unread"
                  >
                    <Mail className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={isBatchProcessing}
                    onClick={() => handleBatchAction('markRead')}
                    className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition-colors disabled:opacity-50"
                    title="Mark selected as read"
                  >
                    <MailOpen className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={isBatchProcessing}
                    onClick={() => handleBatchAction('trash')}
                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
                    title="Move to trash"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {selectedIds.size === 0 && (
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  {currentFolder.startsWith('folder-')
                    ? customFolders.find(cf => cf.id === currentFolder)?.name || 'Custom Folder'
                    : currentFolder.toUpperCase()}
                </span>
              )}
            </div>

            <button
              type="button"
              id="refresh-mailbox-btn"
              onClick={handleRefreshMailbox}
              disabled={isLoading || isScanning}
              className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Refresh messages"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading || isScanning ? 'animate-spin text-[#F15A24]' : ''}`} />
            </button>
          </div>

          {/* Mail Server Notice Banner */}
          {fetchError && (
            <div className="mx-3 my-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex flex-col gap-2 shadow-2xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-bold text-amber-900 dark:text-amber-200">Mail Server Status</p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 break-words">
                      {fetchError.toLowerCase().includes('rate')
                        ? 'Bluehost rate limit active: Too many connection requests were sent recently. Existing messages remain loaded; connection will resume shortly.'
                        : fetchError}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => fetchEmails(currentFolder, true)}
                    className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 font-bold text-[11px] underline cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setFetchError(null)}
                    className="text-amber-700 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-100 text-[11px] px-1 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {currentUser.role === 'admin' && onSwitchToAdmin && (
                <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-amber-200/60 dark:border-amber-800/60">
                  <button
                    type="button"
                    onClick={onSwitchToAdmin}
                    className="text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:underline cursor-pointer"
                  >
                    Open Admin Settings
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Emails Scrollable List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {displayedEmails.length === 0 ? (
              <div className="p-10 text-center text-neutral-400 dark:text-neutral-500 space-y-2">
                {currentFolder === 'trash' ? (
                  <>
                    <Trash2 className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-600" />
                    <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">Trash is empty</p>
                    <p className="text-[11px]">No messages in your trash folder. Host storage is optimized.</p>
                  </>
                ) : (
                  <>
                    <Mail className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-600" />
                    <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">No emails in this folder</p>
                    <p className="text-[11px]">Messages you move or receive here will appear instantly.</p>
                  </>
                )}
              </div>
            ) : (
              displayedEmails.map(mail => {
                const isSelected = selectedMailId === mail.id;
                const isChecked = selectedIds.has(mail.id);

                return (
                  <div
                    key={mail.id}
                    onClick={() => {
                      if (currentFolder === 'drafts') {
                        setDraftToEdit(mail);
                        setReplyTarget(null);
                        setIsComposeOpen(true);
                      } else {
                        setSelectedMailId(mail.id);
                        if (!mail.isRead) {
                          handleToggleRead(mail.id, undefined, true);
                        }
                      }
                    }}
                    className={`p-3.5 sm:p-4 transition-colors cursor-pointer relative group ${
                      isSelected
                        ? 'bg-orange-50/80 dark:bg-[#F15A24]/15 border-l-4 border-l-[#F15A24]'
                        : !mail.isRead
                        ? 'bg-white dark:bg-[#151822] hover:bg-neutral-50/90 dark:hover:bg-[#1C202C]'
                        : 'bg-neutral-50/40 dark:bg-[#11131A] hover:bg-neutral-100/60 dark:hover:bg-[#171A24]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => handleToggleSelectOne(mail.id, e)}
                          onClick={e => e.stopPropagation()}
                          className="rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[#F15A24] focus:ring-[#F15A24] cursor-pointer"
                        />
                        {!mail.isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#F15A24] shrink-0" title="Unread" />
                        )}
                        <span
                          className={`text-xs truncate ${
                            !mail.isRead ? 'font-bold text-neutral-900 dark:text-white' : 'font-normal text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          {mail.from.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Option to unread/read directly on the mailbox item */}
                        <button
                          type="button"
                          onClick={e => handleToggleRead(mail.id, e)}
                          className="p-1 rounded text-neutral-400 dark:text-neutral-500 hover:text-[#F15A24] dark:hover:text-[#F15A24] hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors"
                          title={mail.isRead ? 'Mark as unread' : 'Mark as read'}
                          aria-label={mail.isRead ? 'Mark as unread' : 'Mark as read'}
                        >
                          {mail.isRead ? (
                            <Mail className="w-3.5 h-3.5" />
                          ) : (
                            <MailOpen className="w-3.5 h-3.5 text-[#F15A24]" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={e => handleToggleStar(mail.id, e)}
                          className={`p-1 text-neutral-300 dark:text-neutral-600 hover:text-amber-500 transition-colors ${
                            mail.isStarred ? 'text-amber-500' : ''
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${mail.isStarred ? 'fill-amber-400 text-amber-500' : ''}`} />
                        </button>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium">{mail.timestamp}</span>
                      </div>
                    </div>

                    <p
                      className={`text-xs truncate mb-1 ${
                        !mail.isRead ? 'font-bold text-neutral-900 dark:text-neutral-100' : 'font-normal text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {mail.subject} {getConversationCount(mail) > 1 && <span className="text-neutral-400 dark:text-neutral-500 font-normal">({getConversationCount(mail)})</span>}
                    </p>

                    <p className={`text-[11px] line-clamp-2 leading-relaxed ${
                      !mail.isRead ? 'text-neutral-700 dark:text-neutral-300 font-medium' : 'text-neutral-400 dark:text-neutral-500 font-normal'
                    }`}>
                      {mail.preview}
                    </p>

                    {mail.hasAttachments && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                        <Paperclip className="w-3 h-3 text-[#F15A24]" />
                        <span>Attachment</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 3. RIGHT PANE: DETAIL VIEW */}
        <section
          id="email-detail-pane"
          className={`flex-1 bg-white dark:bg-[#0B0D12] overflow-hidden transition-colors ${
            navMode === 'chat' ? 'hidden' : selectedMailId ? 'flex flex-col' : 'hidden md:flex flex-col'
          }`}
        >
          {selectedMail ? (
            <MailDetailView
              mail={selectedMail}
              currentFolder={currentFolder}
              customFolders={customFolders}
              allEmails={allLoadedEmails}
              onBack={() => setSelectedMailId(null)}
              onReply={handleReplyTo}
              onToggleStar={handleToggleStar}
              onDelete={handleDeleteMail}
              onToggleRead={handleToggleRead}
              onMoveFolder={handleMoveEmail}
              onSendQuickReply={handleQuickReply}
              onUpdateMail={handleUpdateMail}
            />
          ) : (
            currentFolder === 'trash' ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-neutral-50/50 dark:bg-[#0B0D12]">
                <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 flex items-center justify-center text-red-500 dark:text-red-400 mb-3 shadow-xs">
                  <Trash2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-neutral-800 dark:text-neutral-100">Trash Folder</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mt-1 leading-relaxed">
                  {displayedEmails.length > 0
                    ? `You have ${displayedEmails.length} message${displayedEmails.length === 1 ? '' : 's'} in Trash. Emptying Trash permanently deletes them to free up host mailbox storage.`
                    : 'Your Trash folder is currently empty. Host storage is optimized.'}
                </p>
                {displayedEmails.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsEmptyTrashModalOpen(true)}
                    disabled={isEmptyingTrash}
                    className="mt-5 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm shadow-red-900/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Empty Trash ({displayedEmails.length} {displayedEmails.length === 1 ? 'message' : 'messages'})</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-neutral-50/50 dark:bg-[#0e0f12]">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/50 flex items-center justify-center text-[#F15A24] dark:text-orange-400 mb-3 shadow-xs">
                  <Mail className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-neutral-800 dark:text-neutral-100">Select an email to view</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mt-1">
                  Choose a message from your mailbox or custom folders to read, reply, or move to custom folders.
                </p>
              </div>
            )
          )}
        </section>
      </div>

      {/* CREATE CUSTOM FOLDER MODAL */}
      {isCreateFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#13161F] rounded-xl shadow-2xl border border-orange-200 dark:border-neutral-800 p-6 animate-in fade-in zoom-in-95 text-neutral-900 dark:text-neutral-100">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-neutral-900 dark:text-white text-sm flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[#F15A24]" />
                <span>Create Custom Mailbox Folder</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateFolderOpen(false)}
                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createFolderError && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{createFolderError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCustomFolder} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-800 dark:text-neutral-200 text-[11px] mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. Work Projects, Invoices, Clients"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181B24] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-950/60 focus:border-[#F15A24]"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-800 dark:text-neutral-200 text-[11px] mb-1.5">
                  Folder Color Tag
                </label>
                <div className="flex items-center gap-2">
                  {[
                    { hex: '#F15A24', name: 'Orange' },
                    { hex: '#10B981', name: 'Emerald' },
                    { hex: '#3B82F6', name: 'Blue' },
                    { hex: '#8B5CF6', name: 'Purple' },
                    { hex: '#F59E0B', name: 'Amber' },
                    { hex: '#EF4444', name: 'Red' },
                  ].map(c => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewFolderColor(c.hex)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                        newFolderColor === c.hex ? 'ring-2 ring-offset-2 ring-neutral-900 dark:ring-white scale-110' : 'hover:scale-105'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateFolderOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-[#F15A24] text-white font-bold hover:bg-[#E24816] cursor-pointer"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compose Email Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => {
          setIsComposeOpen(false);
          setReplyTarget(null);
          setDraftToEdit(null);
        }}
        onSendEmail={handleSendEmail}
        onSaveDraft={handleSaveDraft}
        onDiscardDraft={handleDiscardDraft}
        draftToEdit={draftToEdit}
        replyTo={replyTarget}
      />

      {/* Server Diagnostics Modal */}
      <ServerDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        status={serverStatus}
        currentUserEmail={user.email}
      />

      {/* Custom Confirmation Modal */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-red-600 text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-500" />
              <span>{confirmDialog.title}</span>
            </h3>
            <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Trash Confirmation Modal */}
      {isEmptyTrashModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="empty-trash-title"
        >
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 id="empty-trash-title" className="font-bold text-neutral-900 dark:text-white text-base">
                  Empty Trash?
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Permanently free up mail host storage
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                Are you sure you want to permanently delete{' '}
                <strong className="text-neutral-900 dark:text-white">
                  {displayedEmails.length} {displayedEmails.length === 1 ? 'message' : 'messages'}
                </strong>{' '}
                within your Trash folder?
              </p>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[11px]">This action cannot be undone</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    All messages in Trash will be permanently expunged from the host mail server, immediately freeing up your host storage quota.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isEmptyingTrash}
                onClick={() => setIsEmptyTrashModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-empty-trash-btn"
                disabled={isEmptyingTrash}
                onClick={handleEmptyTrashConfirm}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-red-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isEmptyingTrash ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Emptying Trash...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Empty Trash</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
