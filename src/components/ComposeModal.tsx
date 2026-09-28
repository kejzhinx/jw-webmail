import React, { Component, useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { EmailAttachment, EmailMessage } from '../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendEmail: (emailData: {
    to: { name: string; email: string }[];
    cc?: string[];
    subject: string;
    bodyText: string;
    attachments?: EmailAttachment[];
    deleteDraftId?: string;
    inReplyTo?: string;
    references?: string;
  }) => Promise<{ success: boolean; error?: string } | boolean>;
  onSaveDraft?: (draftData: {
    to: { name: string; email: string }[];
    cc?: string[];
    subject: string;
    bodyText: string;
    existingDraftId?: string;
  }) => Promise<string | undefined>;
  onDiscardDraft?: (draftId: string) => Promise<boolean>;
  draftToEdit?: EmailMessage | null;
  replyTo?: EmailMessage | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ComposeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Unknown render error' };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ComposeModal Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#13161F] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 dark:border-red-900/50">
            <h3 className="text-base font-bold text-red-600 dark:text-red-400 mb-2">Compose Modal Error</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">An unexpected error occurred while loading the composer: {this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => {
                (this as any).setState({ hasError: false });
                (this as any).props.onClose();
              }}
              className="px-4 py-2 bg-[#F15A24] hover:bg-[#E24816] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Close and Return
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

const ComposeModalContent: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSendEmail,
  onSaveDraft,
  onDiscardDraft,
  draftToEdit,
  replyTo,
}) => {
  const [toInput, setToInput] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [ccInput, setCcInput] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [existingDraftId, setExistingDraftId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize values when modal opens or inputs change
  useEffect(() => {
    if (isOpen) {
      try {
        if (draftToEdit) {
          setToInput(draftToEdit.to && Array.isArray(draftToEdit.to) ? draftToEdit.to.map(t => t.email || '').filter(Boolean).join(', ') : '');
          setShowCc(!!(draftToEdit.cc && draftToEdit.cc.length > 0));
          setCcInput(draftToEdit.cc && Array.isArray(draftToEdit.cc) ? draftToEdit.cc.join(', ') : '');
          setSubject(draftToEdit.subject || '');
          setBodyText(draftToEdit.bodyText || '');
          setAttachments(draftToEdit.attachments && Array.isArray(draftToEdit.attachments) ? draftToEdit.attachments : []);
          setExistingDraftId(draftToEdit.id);
        } else if (replyTo) {
          setToInput(replyTo.from?.email || '');
          setShowCc(false);
          setCcInput('');
          setSubject(replyTo.subject && replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo?.subject || ''}`);
          setBodyText('');
          setAttachments([]);
          setExistingDraftId(undefined);
        } else {
          setToInput('');
          setShowCc(false);
          setCcInput('');
          setSubject('');
          setBodyText('');
          setAttachments([]);
          setExistingDraftId(undefined);
        }
      } catch (e) {
        console.error('Error initializing compose modal:', e);
      }
      setValidationError(null);
      setSendSuccess(false);
      setIsSending(false);
    }
  }, [isOpen, draftToEdit, replyTo]);

  const handleFileSelectClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: EmailAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

      newAttachments.push({
        id: `att-${Date.now()}-${i}-${Math.random()}`,
        name: file.name,
        size: sizeStr,
        type: file.type || 'application/octet-stream',
        file: file,
      });
    }

    setAttachments(prev => [...prev, ...newAttachments]);

    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanTo = toInput.trim();
    if (!cleanTo) {
      setValidationError('Please enter at least one recipient email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const toList = cleanTo
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    for (const email of toList) {
      if (!emailRegex.test(email)) {
        setValidationError(`"${email}" is not a valid email address.`);
        return;
      }
    }

    if (!subject.trim()) {
      setValidationError('Please provide a subject line for this email.');
      return;
    }

    setIsSending(true);

    const ccList = ccInput
      .split(',')
      .map(s => s.trim())
      .filter(s => emailRegex.test(s));

    const formattedRecipients = toList.map(email => ({
      name: email.split('@')[0].replace('.', ' '),
      email,
    }));

    try {
      const sendRes = await onSendEmail({
        to: formattedRecipients,
        cc: ccList,
        subject: subject.trim(),
        bodyText,
        attachments,
        deleteDraftId: existingDraftId,
        inReplyTo: replyTo?.messageId || undefined,
        references: replyTo?.references ? `${replyTo.references} ${replyTo.messageId || ''}`.trim() : (replyTo?.messageId || undefined),
      });

      const isSuccess = typeof sendRes === 'boolean' ? sendRes : sendRes?.success;
      const errorMsg = typeof sendRes === 'object' && sendRes?.error ? sendRes.error : 'Failed to deliver message via mail server queue.';

      if (isSuccess) {
        setSendSuccess(true);
        setTimeout(() => {
          setIsSending(false);
          setSendSuccess(false);
          onClose();
        }, 900);
      } else {
        setValidationError(errorMsg);
        setIsSending(false);
      }
    } catch (err: any) {
      setValidationError(err?.message || 'Network error while contacting SMTP server.');
      setIsSending(false);
    }
  };

  const handleClose = async () => {
    const hasContent = toInput.trim() || subject.trim() || bodyText.trim();
    if (hasContent && onSaveDraft && !sendSuccess) {
      try {
        setIsSending(true);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const toList = toInput
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const formattedRecipients = toList.map(email => ({
          name: email.split('@')[0].replace('.', ' '),
          email,
        }));
        const ccList = ccInput
          .split(',')
          .map(s => s.trim())
          .filter(s => emailRegex.test(s));

        await onSaveDraft({
          to: formattedRecipients,
          cc: ccList,
          subject: subject.trim(),
          bodyText,
          existingDraftId,
        });
      } catch (err) {
        console.error('Failed to auto-save draft on close:', err);
      }
    }
    onClose();
  };

  const handleDiscard = async () => {
    if (existingDraftId && onDiscardDraft) {
      try {
        setIsSending(true);
        await onDiscardDraft(existingDraftId);
      } catch (err) {
        console.error('Failed to discard draft:', err);
      }
    }
    onClose();
  };

  const handleManualSaveDraft = async () => {
    if (onSaveDraft) {
      try {
        setIsSending(true);
        setValidationError(null);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const toList = toInput
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const formattedRecipients = toList.map(email => ({
          name: email.split('@')[0].replace('.', ' '),
          email,
        }));
        const ccList = ccInput
          .split(',')
          .map(s => s.trim())
          .filter(s => emailRegex.test(s));

        const newDraftId = await onSaveDraft({
          to: formattedRecipients,
          cc: ccList,
          subject: subject.trim(),
          bodyText,
          existingDraftId,
        });
        if (newDraftId) {
          setExistingDraftId(newDraftId);
        }
      } catch (err) {
        console.error('Failed to save draft:', err);
      } finally {
        setIsSending(false);
      }
    }
  };

  return (
    <div
      id="compose-modal-overlay"
      className="fixed inset-0 z-50 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 transition-colors"
    >
      <div
        id="compose-modal-dialog"
        className="bg-white dark:bg-[#13161F] rounded-2xl w-full max-w-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 transition-colors"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-5 py-3.5 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <h2 className="text-sm sm:text-base font-bold tracking-tight">
              {replyTo ? 'Reply via JW Summit Mail Server' : existingDraftId ? 'Edit Draft' : 'New Outgoing Message'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="Close compose modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Validation Warning */}
        {validationError && (
          <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/50 px-5 py-2.5 flex items-center gap-2 text-red-700 dark:text-red-300 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Success Alert */}
        {sendSuccess && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 px-5 py-2.5 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-medium animate-pulse">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Message successfully submitted to SMTP queue (TLS 1.3 Signed).</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-y-auto p-5 space-y-3.5">
          {/* TO Field */}
          <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
            <label
              htmlFor="compose-to"
              className="w-16 text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider"
            >
              To:
            </label>
            <input
              id="compose-to"
              type="text"
              value={toInput}
              onChange={e => setToInput(e.target.value)}
              placeholder="e.g. client@partner.com, director@jwsummit.com"
              className="flex-1 text-sm text-neutral-800 dark:text-neutral-100 bg-transparent focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              required
            />
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-xs text-orange-600 dark:text-orange-400 font-semibold hover:underline cursor-pointer"
              >
                Cc
              </button>
            )}
          </div>

          {/* CC Field */}
          {showCc && (
            <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <label
                htmlFor="compose-cc"
                className="w-16 text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider"
              >
                Cc:
              </label>
              <input
                id="compose-cc"
                type="text"
                value={ccInput}
                onChange={e => setCcInput(e.target.value)}
                placeholder="colleagues@jwsummit.com"
                className="flex-1 text-sm text-neutral-800 dark:text-neutral-100 bg-transparent focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>
          )}

          {/* SUBJECT Field */}
          <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
            <label
              htmlFor="compose-subject"
              className="w-16 text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400 tracking-wider"
            >
              Subject:
            </label>
            <input
              id="compose-subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Executive memorandum or project update"
              className="flex-1 text-sm font-semibold text-neutral-900 dark:text-white bg-transparent focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              required
            />
          </div>

          {/* Attachments List */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800/80 px-3 py-1 rounded-lg text-xs"
                >
                  <Paperclip className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium truncate max-w-[180px]">{att.name}</span>
                  <span className="text-[10px] text-orange-600 dark:text-orange-400">({att.size})</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="text-orange-700 dark:text-orange-300 hover:text-red-600 dark:hover:text-red-400 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MESSAGE BODY */}
          <div className="flex-1 min-h-[180px] flex flex-col">
            <textarea
              id="compose-body"
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              placeholder="Draft your corporate correspondence here..."
              rows={8}
              className="w-full h-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-[#181B24] focus:bg-white dark:focus:bg-[#1F232F] text-sm text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-950/60 focus:border-[#F15A24] resize-none font-sans transition-all"
            />
          </div>

          {/* Bottom Actions Bar */}
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                className="hidden"
              />
              <button
                type="button"
                onClick={handleFileSelectClick}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5 text-[#F15A24]" />
                <span>Attach File</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleManualSaveDraft}
                disabled={isSending}
                className="px-4 py-2 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-600 active:scale-95 shadow-md shadow-orange-600/20 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending...' : 'Send Message'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ComposeModal: React.FC<ComposeModalProps> = props => {
  return (
    <ComposeErrorBoundary onClose={props.onClose}>
      {props.isOpen && <ComposeModalContent {...props} />}
    </ComposeErrorBoundary>
  );
};
