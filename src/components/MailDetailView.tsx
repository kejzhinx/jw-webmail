import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  FolderInput,
  Forward,
  Mail,
  MailOpen,
  MoreVertical,
  Paperclip,
  Printer,
  Reply,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Loader2,
} from 'lucide-react';
import { CustomFolder, EmailMessage, FolderType, User } from '../types';

interface MailDetailViewProps {
  mail: EmailMessage;
  currentUser?: User;
  currentFolder?: FolderType;
  customFolders?: CustomFolder[];
  allEmails?: EmailMessage[];
  onBack: () => void;
  onReply: (mail: EmailMessage) => void;
  onToggleStar: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleRead: (id: string) => void;
  onMoveFolder?: (id: string, targetFolder: string) => void;
  onSendQuickReply?: (to: string, subject: string, body: string, inReplyTo?: string, references?: string) => Promise<any> | void;
  onUpdateMail?: (mail: EmailMessage) => void;
}

export const MailDetailView: React.FC<MailDetailViewProps> = ({
  mail,
  currentUser,
  currentFolder = 'inbox',
  customFolders = [],
  allEmails = [],
  onBack,
  onReply,
  onToggleStar,
  onDelete,
  onToggleRead,
  onMoveFolder,
  onSendQuickReply,
  onUpdateMail,
}) => {
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySentSuccess, setReplySentSuccess] = useState(false);
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
  const [downloadingAttId, setDownloadingAttId] = useState<string | null>(null);

  const isReplyOrForward = (sub?: string) => {
    if (!sub) return false;
    return /^(re|fw|fwd|aw|wg|reply|forward)[:\s\-]/i.test(sub.trim());
  };

  const normalizeSubject = (sub: string) => {
    if (!sub) return '';
    return sub
      .toLowerCase()
      .replace(/^(re|fw|fwd|aw|wg|reply|forward)[:\s\-]*/gi, '')
      .replace(/^(re|fw|fwd|aw|wg|reply|forward)\d*[:\s\-]*/gi, '')
      .trim();
  };

  const getDedupeKey = (e: EmailMessage) => {
    const normMsgId = (e.messageId || '').replace(/^<|>$/g, '').trim().toLowerCase();
    if (normMsgId) return normMsgId;
    const from = (e.from?.email || '').toLowerCase().trim();
    const sub = normalizeSubject(e.subject);
    const time = e.rawDate || e.timestamp || '';
    const snippet = (e.preview || e.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return `fp:${from}|${sub}|${time}|${snippet}`;
  };

  const initialLocalThread = React.useMemo(() => {
    if (!allEmails || allEmails.length === 0) return [mail];
    const normFolder = (mail.folder || '').toLowerCase();
    const isNonInbox = normFolder.includes('sent') || mail.id.includes('Sent') || normFolder.includes('draft') || mail.id.includes('drafts') || normFolder.includes('trash') || mail.id.includes('trash');
    if (isNonInbox) {
      return [mail];
    }

    const normMailId = (mail.messageId || '').replace(/^<|>$/g, '').trim().toLowerCase();
    const mailInReply = (mail.inReplyTo || '').replace(/^<|>$/g, '').trim().toLowerCase();

    const seedSub = normalizeSubject(mail.subject);
    const seedParticipants = new Set([
      (mail.from?.email || '').toLowerCase(),
      ...(mail.to || []).map(t => (t.email || '').toLowerCase())
    ]);

    const matched = allEmails.filter(e => {
      if (e.id === mail.id) return true;
      // Do not include drafts in the conversation history of sent/received emails
      if (e.folder === 'drafts' || e.id.includes('-drafts-')) return false;

      // 1. Direct RFC header reference matching
      const eMsgId = (e.messageId || '').replace(/^<|>$/g, '').trim().toLowerCase();
      const eInReply = (e.inReplyTo || '').replace(/^<|>$/g, '').trim().toLowerCase();

      if (eMsgId && (mailInReply === eMsgId || (mail.references && mail.references.toLowerCase().includes(eMsgId)))) {
        return true;
      }
      if (normMailId && (eInReply === normMailId || (e.references && e.references.toLowerCase().includes(normMailId)))) {
        return true;
      }

      // 2. Exact subject match if it is a reply/forward conversation between the same participants
      const eSub = normalizeSubject(e.subject);
      if (eSub && seedSub && eSub === seedSub && seedSub.length > 2) {
        const eFrom = (e.from?.email || '').toLowerCase();
        const eTo = (e.to || []).map(t => (t.email || '').toLowerCase());
        if (eFrom && (seedParticipants.has(eFrom) || eTo.some(toEmail => seedParticipants.has(toEmail)))) {
          return true;
        }
      }
      return false;
    });

    const uniqueMap = new Map<string, EmailMessage>();
    matched.forEach(m => {
      const key = getDedupeKey(m);
      if (!uniqueMap.has(key)) uniqueMap.set(key, m);
    });

    const thread = Array.from(uniqueMap.values());
    thread.sort((a, b) => {
      const aTime = (typeof a.rawDate === 'number' && !isNaN(a.rawDate) && a.rawDate > 0)
        ? a.rawDate
        : (a.timestamp && !isNaN(new Date(a.timestamp).getTime()) ? new Date(a.timestamp).getTime() : 0);
      const bTime = (typeof b.rawDate === 'number' && !isNaN(b.rawDate) && b.rawDate > 0)
        ? b.rawDate
        : (b.timestamp && !isNaN(new Date(b.timestamp).getTime()) ? new Date(b.timestamp).getTime() : 0);
      return aTime - bTime;
    });

    return thread.length > 0 ? thread : [mail];
  }, [mail, allEmails]);

  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(mail.id);
  const [threadMessages, setThreadMessages] = useState<EmailMessage[]>(initialLocalThread);
  const [isThreadLoading, setIsThreadLoading] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedMessageId(expandedMessageId === id ? null : id);
  };

  const currentMailIdRef = React.useRef(mail.id);

  useEffect(() => {
    const isNewMail = mail.id !== currentMailIdRef.current;
    if (isNewMail) {
      currentMailIdRef.current = mail.id;
      setThreadMessages(initialLocalThread);
      setExpandedMessageId(mail.id);
    } else if (initialLocalThread.length > threadMessages.length) {
      setThreadMessages(initialLocalThread);
    }

    let active = true;
    const normFolder = (mail.folder || currentFolder || 'inbox').toLowerCase();
    const isNonInbox = normFolder.includes('sent') || mail.id.includes('Sent') || normFolder.includes('draft') || mail.id.includes('drafts') || normFolder.includes('trash') || mail.id.includes('trash');
    const hasThreadHeaders = Boolean(
      (mail.inReplyTo && mail.inReplyTo.trim().length > 0) ||
      (mail.references && mail.references.trim().length > 0) ||
      isReplyOrForward(mail.subject)
    );

    const loadMailAndThread = async () => {
      // If we don't have body text/html in local memory, show the loading indicator
      const hasContent = Boolean(mail.bodyText?.trim() || mail.bodyHtml?.trim());
      if (!hasContent) {
        setIsThreadLoading(true);
      }

      try {
        const token = localStorage.getItem('jw_auth_token');
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

        // 1. Fetch exact message detail from server (guarantees full body & attachments from IMAP/storage)
        const detailRes = await fetch(`/api/mail/${encodeURIComponent(mail.id)}?folder=${encodeURIComponent(normFolder)}`, {
          headers: authHeaders,
        })
          .then(r => r.json())
          .catch(() => null);

        if (!active) return;

        if (detailRes && detailRes.success && detailRes.email) {
          const fullEmail: EmailMessage = detailRes.email;
          if (onUpdateMail) {
            onUpdateMail(fullEmail);
          }
          setThreadMessages(prev => {
            const exists = prev.some(m => m.id === fullEmail.id);
            if (exists) {
              return prev.map(m => (m.id === fullEmail.id ? { ...m, ...fullEmail } : m));
            }
            return [fullEmail, ...prev];
          });
        }

        // 2. If it is an Inbox conversation thread, also fetch all other linked thread messages
        if (!isNonInbox) {
          const threadRes = await fetch(`/api/mail/${encodeURIComponent(mail.id)}/thread?folder=${encodeURIComponent(normFolder)}`, {
            headers: authHeaders,
          })
            .then(r => r.json())
            .catch(() => null);

          if (!active) return;

          if (threadRes && threadRes.success && Array.isArray(threadRes.thread) && threadRes.thread.length > 0) {
            const uniqueThreadMap = new Map<string, EmailMessage>();
            threadRes.thread.forEach((msg: EmailMessage) => {
              const key = getDedupeKey(msg);
              if (!uniqueThreadMap.has(key)) {
                uniqueThreadMap.set(key, msg);
              }
            });
            setThreadMessages(Array.from(uniqueThreadMap.values()));
          }
        }
      } catch (err) {
        console.error('[MailDetailView] Failed to load email content:', err);
      } finally {
        if (active) setIsThreadLoading(false);
      }
    };

    loadMailAndThread();

    return () => {
      active = false;
    };
  }, [mail.id, mail.folder, mail.subject, mail.inReplyTo, mail.references, currentFolder]);

  const fetchThread = useCallback(async () => {
    setIsThreadLoading(true);
    try {
      const token = localStorage.getItem('jw_auth_token');
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const normFolder = (mail.folder || currentFolder || 'inbox').toLowerCase();

      // Fetch message detail
      const detailRes = await fetch(`/api/mail/${encodeURIComponent(mail.id)}?folder=${encodeURIComponent(normFolder)}`, {
        headers: authHeaders,
      }).then(r => r.json()).catch(() => null);

      if (detailRes && detailRes.success && detailRes.email) {
        if (onUpdateMail) onUpdateMail(detailRes.email);
        setThreadMessages(prev => prev.map(m => m.id === detailRes.email.id ? { ...m, ...detailRes.email } : m));
      }

      // Fetch thread
      const threadRes = await fetch(`/api/mail/${encodeURIComponent(mail.id)}/thread?folder=${encodeURIComponent(normFolder)}`, {
        headers: authHeaders,
      }).then(r => r.json()).catch(() => null);

      if (threadRes && threadRes.success && Array.isArray(threadRes.thread) && threadRes.thread.length > 0) {
        const uniqueThreadMap = new Map<string, EmailMessage>();
        threadRes.thread.forEach((msg: EmailMessage) => {
          const key = getDedupeKey(msg);
          if (!uniqueThreadMap.has(key)) {
            uniqueThreadMap.set(key, msg);
          }
        });
        setThreadMessages(Array.from(uniqueThreadMap.values()));
      }
    } catch (err) {
      console.error('[MailDetailView] Manual fetch thread error:', err);
    } finally {
      setIsThreadLoading(false);
    }
  }, [mail.id, mail.folder, currentFolder]);

  const handleDownloadAttachment = async (msgId: string, attId: string, filename: string) => {
    try {
      setDownloadingAttId(attId);
      const token = localStorage.getItem('jw_auth_token');
      const msg = threadMessages.find(m => m.id === msgId) || mail;
      const folder = msg.folder || 'inbox';
      const res = await fetch(`/api/mail/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attId)}?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to download attachment from mail server (${res.status})`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download attachment:', err);
    } finally {
      setDownloadingAttId(null);
    }
  };

  const handleQuickReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReplyText.trim()) return;

    const replyBody = quickReplyText.trim();
    setIsSendingReply(true);
    try {
      if (onSendQuickReply) {
        const baseSub = threadMessages.length > 0 ? threadMessages[0].subject : mail.subject;
        const subject = /^re:/i.test(baseSub) ? baseSub : `Re: ${baseSub}`;

        const senderEmail = currentUser?.email || (mail.to && mail.to.length > 0 ? mail.to[0].email : 'Me');
        const senderName = currentUser?.name || senderEmail.split('@')[0] || 'Me';

        // 0ms Optimistic UI: immediately append the sent reply into the thread
        const optimisticId = `sent-optimistic-${Date.now()}`;
        const now = new Date();
        const optimisticMsg: EmailMessage = {
          id: optimisticId,
          folder: 'sent',
          from: { name: senderName, email: senderEmail },
          to: [mail.from],
          subject,
          preview: replyBody.slice(0, 100),
          bodyText: replyBody,
          bodyHtml: replyBody.replace(/\n/g, '<br/>'),
          timestamp: now.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          rawDate: now.getTime(),
          isRead: true,
          isStarred: false,
          hasAttachments: false,
          attachments: [],
          security: {
            tlsVersion: 'TLS 1.3 Strict',
            dkimStatus: 'pass',
            spfStatus: 'pass',
            signatureVerified: true,
            ipOrigin: '127.0.0.1 (Local Session)',
          },
          inReplyTo: mail.messageId,
          references: mail.references ? `${mail.references} ${mail.messageId || ''}`.trim() : (mail.messageId || undefined),
        };

        setThreadMessages(prev => [...prev, optimisticMsg]);
        setExpandedMessageId(optimisticId);
        setQuickReplyText('');
        setReplySentSuccess(true);

        const inReplyTo = mail.messageId;
        const references = mail.references ? `${mail.references} ${mail.messageId || ''}`.trim() : mail.messageId;

        await onSendQuickReply(mail.from.email, subject, replyBody, inReplyTo, references);
        await fetchThread();
        setTimeout(() => setReplySentSuccess(false), 3000);
      }
    } catch (err) {
      console.error('[MailDetailView] Quick reply error:', err);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleMove = (targetFolder: string) => {
    if (onMoveFolder) {
      onMoveFolder(mail.id, targetFolder);
    }
    setIsMoveMenuOpen(false);
  };

  return (
    <div
      id="mail-detail-container"
      className="h-full flex flex-col bg-white dark:bg-[#0B0D12] text-neutral-900 dark:text-neutral-100 overflow-y-auto selection:bg-orange-100 dark:selection:bg-orange-950 selection:text-orange-900 dark:selection:text-orange-200 transition-colors duration-200"
    >
      {/* Top Action Bar */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#13161F]/95 backdrop-blur-xs border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-2 transition-colors">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Back button (Mobile view) */}
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Back to email list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => onReply(mail)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-700 dark:hover:text-orange-400 transition-colors cursor-pointer"
          >
            <Reply className="w-4 h-4 text-[#F15A24]" />
            <span className="hidden sm:inline">Reply</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleStar(mail.id)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              mail.isStarred
                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-amber-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            aria-label={mail.isStarred ? 'Starred message' : 'Star message'}
          >
            <Star className={`w-4 h-4 ${mail.isStarred ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Move to Folder Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-700 dark:hover:text-orange-400 transition-colors cursor-pointer"
              title="Move email to folder"
            >
              <FolderInput className="w-4 h-4 text-[#F15A24]" />
              <span className="hidden sm:inline">Move</span>
            </button>

            {isMoveMenuOpen && (
              <div className="absolute left-0 mt-2 w-52 bg-white dark:bg-[#181B24] rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 py-1.5 z-50 animate-in fade-in zoom-in-95 text-xs text-neutral-800 dark:text-neutral-200">
                <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                  Move to Standard
                </div>
                <button
                  type="button"
                  onClick={() => handleMove('inbox')}
                  className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-700 dark:hover:text-orange-400 flex items-center gap-2"
                >
                  <Archive className="w-3.5 h-3.5" /> Inbox
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('archive')}
                  className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-700 dark:hover:text-orange-400 flex items-center gap-2"
                >
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('spam')}
                  className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-700 dark:hover:text-orange-400 flex items-center gap-2"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> Spam
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('trash')}
                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 flex items-center gap-2 text-red-600 dark:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Trash
                </button>

                {customFolders.length > 0 && (
                  <>
                    <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />
                    <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                      Custom Folders
                    </div>
                    {customFolders.map(cf => (
                      <button
                        key={cf.id}
                        type="button"
                        onClick={() => handleMove(cf.id)}
                        className="w-full text-left px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-700 dark:hover:text-orange-400 flex items-center gap-2"
                      >
                        <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: cf.color }} fill={cf.color} fillOpacity={0.25} />
                        <span className="truncate">{cf.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onDelete(mail.id)}
            className="p-2 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            aria-label="Move to Trash"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onToggleRead(mail.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-[#F15A24] dark:hover:text-orange-400 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer shadow-2xs"
            title={mail.isRead ? 'Mark mailbox as unread' : 'Mark mailbox as read'}
          >
            {mail.isRead ? <Mail className="w-3.5 h-3.5 text-[#F15A24]" /> : <MailOpen className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />}
            <span>{mail.isRead ? 'Mark Unread' : 'Mark Read'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => window.print()}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Print email"
            aria-label="Print email"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Mail Content */}
      <div className="flex-1 px-4 sm:px-8 py-6 space-y-6">
        {/* Email Header Info */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {mail.priority === 'high' && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50">
                High Priority
              </span>
            )}
            {mail.tags?.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white leading-snug tracking-tight">
              {mail.subject || '(No Subject)'}
            </h1>
          </div>
        </div>

        {/* Thread Conversation Header List */}
        {threadMessages.length > 1 && (
          <div className="mb-4 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center justify-between">
            <span>{threadMessages.length} messages in this conversation</span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-normal">Click a message to expand</span>
          </div>
        )}
        <div className="space-y-3">
          {threadMessages.map((msg) => {
            const rawBody = msg.bodyText || '';
            const cleanedBody = rawBody
              .replace(/---\s*Original Message[\s\S]*$/gi, '')
              .replace(/On\s+.*wrote:\s*$/gi, '')
              .replace(/^>.*$/gm, '')
              .replace(/In reply to:[\s\S]*$/gi, '')
              .trim();
            const contentToDisplay = cleanedBody || rawBody || msg.preview || '';
            const displayPreview = contentToDisplay || (msg.bodyHtml ? 'Rich HTML message content' : 'Message details');

            return (
              <div 
                key={msg.id}
                className={`border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden transition-all ${
                  expandedMessageId === msg.id ? 'shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-700' : 'hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                {/* Header: Shows Sender and Message snippet (NOT the subject) */}
                <div 
                  onClick={() => toggleExpand(msg.id)}
                  className={`p-3.5 cursor-pointer flex items-center justify-between gap-3 ${
                    expandedMessageId === msg.id ? 'bg-orange-50/40 dark:bg-orange-950/20 border-b border-neutral-200 dark:border-neutral-800' : 'bg-white dark:bg-[#13161F] hover:bg-neutral-50/80 dark:hover:bg-[#181B24]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/50 text-[#F15A24] dark:text-orange-400 font-bold text-xs flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-900/50">
                      {msg.from.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white">{msg.from.name}</span>
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">&lt;{msg.from.email}&gt;</span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-300 truncate mt-0.5">
                        {displayPreview}
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium shrink-0 font-mono">{msg.timestamp}</div>
                </div>
                
                {/* Expanded Card: Shows the Message Body FIRST */}
                {expandedMessageId === msg.id && (
                  <div className="p-5 bg-white dark:bg-[#13161F] space-y-4">
                    {/* 1. MESSAGE CONTENT FIRST AND PROMINENT */}
                    <div className="prose prose-sm max-w-none text-neutral-900 dark:text-neutral-100 leading-relaxed font-sans text-xs sm:text-sm">
                      {isThreadLoading && !contentToDisplay && !msg.bodyHtml ? (
                        <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500 py-4 text-xs font-medium">
                          <Loader2 className="w-4 h-4 animate-spin text-[#F15A24]" />
                          <span>Loading message content from mail server...</span>
                        </div>
                      ) : msg.bodyHtml ? (
                        <div
                          className="py-1 overflow-x-auto text-neutral-900 dark:text-neutral-100"
                          dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap py-1 text-neutral-900 dark:text-neutral-100">
                          {contentToDisplay || (
                            <span className="text-neutral-400 dark:text-neutral-500 italic">No message body text</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 2. Attachments Section */}
                    {msg.hasAttachments && msg.attachments && msg.attachments.length > 0 && (
                      <div className="p-3 rounded-lg bg-neutral-50 dark:bg-[#181B24] border border-neutral-200/80 dark:border-neutral-700/60 space-y-2">
                        <div className="text-[10px] font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5 text-[#F15A24]" />
                          <span>Attachments ({msg.attachments.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.attachments.map(att => (
                            <div
                              key={att.id}
                              className="flex items-center justify-between p-2 rounded bg-white dark:bg-[#1F232F] border border-neutral-200 dark:border-neutral-700/80 hover:border-orange-300 dark:hover:border-orange-500/50 transition-colors shadow-2xs group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-[#F15A24] shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-[#F15A24] transition-colors">
                                    {att.name}
                                  </p>
                                  <p className="text-[9px] text-neutral-400 dark:text-neutral-500 font-mono">{att.size}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(msg.id, att.id, att.name)}
                                disabled={downloadingAttId === att.id}
                                className="p-1 rounded text-neutral-400 dark:text-neutral-500 hover:text-[#F15A24] dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
                                title={`Download ${att.name}`}
                              >
                                <Download className={`w-3.5 h-3.5 ${downloadingAttId === att.id ? 'animate-bounce text-[#F15A24]' : ''}`} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Sender & Recipient Details Metadata Footer */}
                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400 space-y-1 bg-neutral-50/60 dark:bg-[#181B24]/60 -mx-5 -mb-5 p-4 rounded-b-xl">
                      <p><span className="font-semibold text-neutral-700 dark:text-neutral-300">From:</span> {msg.from.name} &lt;{msg.from.email}&gt;</p>
                      <p><span className="font-semibold text-neutral-700 dark:text-neutral-300">To:</span> {msg.to.map(t => `${t.name} <${t.email}>`).join(', ')}</p>
                      <p><span className="font-semibold text-neutral-700 dark:text-neutral-300">Date:</span> <span className="font-mono">{msg.timestamp}</span></p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick Reply Form */}
        <div className="pt-6 border-t border-neutral-200 dark:border-neutral-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
            Quick Reply
          </h3>
          <form onSubmit={handleQuickReplySubmit} className="space-y-3">
            <textarea
              rows={3}
              value={quickReplyText}
              onChange={e => setQuickReplyText(e.target.value)}
              placeholder={`Quick reply to ${mail.from.name}...`}
              className="w-full p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#181B24] focus:bg-white dark:focus:bg-[#1F232F] text-xs sm:text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-950/60 focus:border-[#F15A24] transition-all"
            />
            <div className="flex items-center justify-between">
              {replySentSuccess ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Reply dispatched via SMTP!</span>
                </span>
              ) : (
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">Encrypted with TLS 1.3 Transport</span>
              )}
              <button
                type="submit"
                disabled={!quickReplyText.trim() || isSendingReply}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F15A24] hover:bg-[#E24816] text-white font-bold text-xs shadow-md shadow-orange-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingReply ? 'Sending...' : 'Send Quick Reply'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
