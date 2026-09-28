import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  ShieldCheck,
  HardDrive,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Send,
  Globe,
  Terminal,
  Clock,
} from 'lucide-react';
import { MailServerStatus, DiagnosticsSuiteResult, DiagnosticItemResult } from '../types';
import { safeJson } from '../lib/api';

interface ServerDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: MailServerStatus | null;
  currentUserEmail?: string;
}

export const ServerDiagnosticsModal: React.FC<ServerDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  status,
  currentUserEmail,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [suiteResult, setSuiteResult] = useState<DiagnosticsSuiteResult | null>(null);
  const [targetMailbox, setTargetMailbox] = useState<string>('');
  const [targetPassword, setTargetPassword] = useState<string>('');
  const [sendTestEmail, setSendTestEmail] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [copiedLog, setCopiedLog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize target mailbox
  useEffect(() => {
    if (isOpen) {
      const email =
        currentUserEmail ||
        (() => {
          try {
            const raw = localStorage.getItem('jw_auth_user');
            if (raw) {
              const u = JSON.parse(raw);
              if (u?.email) return u.email;
            }
          } catch {
            // ignore
          }
          return 'inquiry12@playbook.com.ph';
        })();
      setTargetMailbox(email);
      setTestRecipient(email);
      runDiagnostics(email);
    }
  }, [isOpen, currentUserEmail]);

  if (!isOpen) return null;

  const runDiagnostics = async (mailboxToTest?: string) => {
    setIsRunning(true);
    setErrorMessage(null);
    const mailbox = mailboxToTest || targetMailbox || 'inquiry12@playbook.com.ph';

    try {
      const token = localStorage.getItem('jw_auth_token');
      const res = await fetch('/api/admin/diagnostics/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mailbox,
          password: targetPassword || undefined,
          sendTestEmail,
          testRecipient: testRecipient || mailbox,
        }),
      });

      const data = await safeJson(res);
      if (data.success && data.suite) {
        setSuiteResult(data.suite);
      } else {
        setErrorMessage(data.error || 'Failed to complete diagnostics run.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error connecting to backend diagnostics service.');
    } finally {
      setIsRunning(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyLog = () => {
    if (!suiteResult) return;
    const logText = [
      `=== BLUEHOST MAIL SERVER REAL DIAGNOSTICS SUITE ===`,
      `Mailbox Tested: ${suiteResult.mailbox}`,
      `Host: ${suiteResult.host}`,
      `Timestamp: ${suiteResult.executedAt}`,
      `Overall Status: ${suiteResult.overallStatus.toUpperCase()} (${suiteResult.passedCount} Passed, ${suiteResult.failedCount} Failed)`,
      `Total Duration: ${suiteResult.totalDurationMs}ms`,
      ``,
      ...suiteResult.results.map(
        (r) =>
          `[${r.status.toUpperCase()}] ${r.name} (${r.latencyMs !== undefined ? r.latencyMs + 'ms' : 'N/A'})\n  Details: ${r.details}${
            r.error ? '\n  Error: ' + r.error : ''
          }${r.data ? '\n  Data: ' + JSON.stringify(r.data, null, 2) : ''}`
      ),
    ].join('\n');

    navigator.clipboard.writeText(logText);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const getStatusBadge = (rStatus: 'passed' | 'failed' | 'skipped' | 'running') => {
    switch (rStatus) {
      case 'passed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Passed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
            Skipped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
            Testing
          </span>
        );
    }
  };

  const imapTcpItem = suiteResult?.results.find((r) => r.id === 'imap_tcp');
  const imapAuthItem = suiteResult?.results.find((r) => r.id === 'imap_auth');
  const smtpTcpItem = suiteResult?.results.find((r) => r.id === 'smtp_tcp');
  const dnsItem = suiteResult?.results.find((r) => r.id === 'dns');
  const hostPcItem = suiteResult?.results.find((r) => r.id === 'host_pc');

  return (
    <div
      id="diagnostics-modal-overlay"
      className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div
        id="diagnostics-modal-dialog"
        className="bg-white dark:bg-[#13161F] rounded-2xl w-full max-w-3xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 my-auto text-neutral-900 dark:text-neutral-100"
      >
        {/* Top Header */}
        <div className="bg-neutral-900 dark:bg-[#10121A] px-6 py-4 flex items-center justify-between text-white border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#F15A24]/20 text-[#F15A24] rounded-xl border border-[#F15A24]/30">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Bluehost Mail Server Diagnostics
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#F15A24]/20 text-orange-300 border border-[#F15A24]/40">
                  REAL-TIME SUITE
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Target: {suiteResult?.host || status?.hostname || 'mail.playbook.com.ph'} • Bluehost IMAP/SMTP Gateway
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action / Mailbox Configuration Bar */}
        <div className="bg-neutral-50 dark:bg-[#181C26] px-6 py-3.5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              <div className="relative flex-1 min-w-[200px]">
                <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="email"
                  value={targetMailbox}
                  onChange={(e) => setTargetMailbox(e.target.value)}
                  placeholder="e.g. inquiry12@playbook.com.ph"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-[#141720] border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-[#F15A24] focus:border-[#F15A24]"
                />
              </div>
              <div className="relative flex-1 min-w-[150px]">
                <input
                  type="password"
                  value={targetPassword}
                  onChange={(e) => setTargetPassword(e.target.value)}
                  placeholder="Password (optional)"
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#141720] border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-[#F15A24] focus:border-[#F15A24]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runDiagnostics()}
                disabled={isRunning}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F15A24] hover:bg-[#d94816] text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                <span>{isRunning ? 'Running Live Suite...' : 'Run Diagnostics'}</span>
              </button>

              {suiteResult && (
                <button
                  type="button"
                  onClick={handleCopyLog}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1E2330] hover:bg-neutral-100 dark:hover:bg-[#252B3A] text-neutral-700 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  title="Copy technical logs to clipboard"
                >
                  {copiedLog ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLog ? 'Copied' : 'Copy Log'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Optional Test Email Trigger */}
          <div className="mt-2.5 flex items-center gap-4 text-xs text-neutral-600 dark:text-neutral-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendTestEmail}
                onChange={(e) => setSendTestEmail(e.target.checked)}
                className="rounded text-[#F15A24] focus:ring-[#F15A24]"
              />
              <span>Send live SMTP loopback test email</span>
            </label>
            {sendTestEmail && (
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="Recipient email address"
                className="px-2.5 py-1 text-xs bg-white dark:bg-[#141720] border border-neutral-300 dark:border-neutral-700 rounded-md text-neutral-800 dark:text-neutral-100"
              />
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Diagnostic Execution Issue: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Top Quick Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* IMAP Card */}
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181C26]/50">
              <div className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>IMAP / SSL (993)</span>
                {imapTcpItem ? (
                  imapTcpItem.status === 'passed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  )
                ) : null}
              </div>
              <div className="text-base font-bold text-neutral-900 dark:text-white mt-1">
                {imapTcpItem?.latencyMs !== undefined ? `${imapTcpItem.latencyMs}ms` : '993 SSL'}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {imapAuthItem?.status === 'passed' ? 'Auth Verified' : imapTcpItem?.status === 'passed' ? 'Connected' : 'Pending'}
              </div>
            </div>

            {/* SMTP Card */}
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181C26]/50">
              <div className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>SMTP / SSL (465)</span>
                {smtpTcpItem ? (
                  smtpTcpItem.status === 'passed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  )
                ) : null}
              </div>
              <div className="text-base font-bold text-neutral-900 dark:text-white mt-1">
                {smtpTcpItem?.latencyMs !== undefined ? `${smtpTcpItem.latencyMs}ms` : '465 SSL'}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {smtpTcpItem?.status === 'passed' ? 'Relay Active' : 'Pending'}
              </div>
            </div>

            {/* DNS Card */}
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181C26]/50">
              <div className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>DNS / Host</span>
                {dnsItem ? (
                  dnsItem.status === 'passed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  )
                ) : null}
              </div>
              <div className="text-base font-bold text-neutral-900 dark:text-white mt-1 truncate" title={dnsItem?.data?.ipAddresses?.[0] || 'Resolved'}>
                {dnsItem?.data?.ipAddresses?.[0] || 'playbook.com.ph'}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {dnsItem?.status === 'passed' ? 'Publicly Resolving' : 'Pending'}
              </div>
            </div>

            {/* Host PC Card */}
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#181C26]/50">
              <div className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>Dedicated Host PC</span>
                {hostPcItem ? (
                  hostPcItem.status === 'passed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  )
                ) : null}
              </div>
              <div className="text-base font-bold text-neutral-900 dark:text-white mt-1">
                {hostPcItem?.data?.isOnline ? 'Online' : 'Standby'}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {hostPcItem?.data?.backupPath || 'Local Disk Queue'}
              </div>
            </div>
          </div>

          {/* Test Execution List */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <div className="bg-neutral-50/80 dark:bg-[#181C26] px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                  Live Test Results & Daemon Handshakes
                </span>
              </div>
              {suiteResult && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-3">
                  <span>Duration: {suiteResult.totalDurationMs}ms</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{suiteResult.passedCount} Passed</span>
                  {suiteResult.failedCount > 0 && (
                    <span className="font-semibold text-rose-700 dark:text-rose-400">{suiteResult.failedCount} Failed</span>
                  )}
                </div>
              )}
            </div>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {isRunning && (!suiteResult || suiteResult.results.length === 0) && (
                <div className="p-8 text-center text-neutral-500 dark:text-neutral-400 space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#F15A24]" />
                  <p className="font-medium text-neutral-700 dark:text-neutral-300">Executing real connection checks against Bluehost mail server...</p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500">Testing DNS resolution, TCP sockets on ports 993 & 465, TLS cryptographic handshake, and IMAP auth.</p>
                </div>
              )}

              {suiteResult?.results.map((item) => {
                const isExpanded = expandedItems[item.id] ?? false;
                const hasData = item.data && Object.keys(item.data).length > 0;

                return (
                  <div key={item.id} className="p-3.5 hover:bg-neutral-50/50 dark:hover:bg-[#181C26]/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 dark:text-white">{item.name}</span>
                          {getStatusBadge(item.status)}
                          {item.latencyMs !== undefined && (
                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                              {item.latencyMs}ms
                            </span>
                          )}
                        </div>
                        <p className="text-neutral-600 dark:text-neutral-400 text-[11px]">{item.details}</p>
                        {item.error && (
                          <div className="mt-1 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-md text-[11px] font-mono text-rose-700 dark:text-rose-300">
                            {item.error}
                          </div>
                        )}
                      </div>

                      {hasData && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="View technical details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {isExpanded && hasData && (
                      <div className="mt-2.5 p-3 bg-neutral-900 dark:bg-[#0B0D12] text-neutral-100 rounded-lg font-mono text-[11px] overflow-x-auto border dark:border-neutral-800">
                        <pre>{JSON.stringify(item.data, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bluehost Guidance Notice */}
          <div className="p-3.5 bg-neutral-50 dark:bg-[#181C26]/60 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-600 dark:text-neutral-300 space-y-1.5">
            <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#F15A24]" />
              Bluehost / cPanel Mail Configuration Reference
            </div>
            <p className="text-[11px] leading-relaxed">
              Standard secure connection for <span className="font-semibold">playbook.com.ph</span>: Incoming IMAP uses{' '}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">mail.playbook.com.ph:993</span> (SSL/TLS required). Outgoing SMTP uses{' '}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">mail.playbook.com.ph:465</span> (SSL/TLS required). Each account authenticates with the mailbox email and password.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-neutral-50 dark:bg-[#181C26] px-6 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>
              {suiteResult?.executedAt
                ? `Last test: ${new Date(suiteResult.executedAt).toLocaleTimeString()}`
                : 'Ready for live test'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-900 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
