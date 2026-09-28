/**
 * Mailcow Postfix SMTP Service
 * 
 * Provides stateless SMTP transmission via Mailcow's Postfix server
 * running on the Ubuntu host. Supports:
 * - HTML and Plain-Text messages
 * - Attachments (Buffer or Base64)
 * - CC, BCC, In-Reply-To, References
 * - Automatic IMAP Sent folder synchronization via Dovecot append
 * - Sanitized delivery reporting
 */

import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { ImapFlow } from 'imapflow';
import { createMailcowImapClient, resolveImapPath } from './imapService.js';

export interface SmtpConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface SendMailOptions {
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  priority?: 'normal' | 'high';
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

/**
 * Creates a Nodemailer transporter configured for Mailcow Postfix
 */
export function createMailcowSmtpTransporter(config: SmtpConnectionConfig) {
  // Port 465 is direct SSL/TLS; Port 587 uses STARTTLS (secure: false)
  const isSecure = config.port === 465 ? true : (config.secure ?? false);

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false, // Allows self-signed or Let's Encrypt certificates
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
}

/**
 * Categorize SMTP errors without exposing credentials
 */
export function sanitizeSmtpError(err: any): string {
  if (!err) return 'Unknown SMTP error';
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toUpperCase();
  const resp = ((err.response || '') + ' ' + (err.responseText || '')).toLowerCase();

  if (code === 'EAUTH' || msg.includes('auth') || resp.includes('authentication failed')) {
    return 'SMTP Authentication failed: Check mailbox username and password.';
  }

  if (code === 'ECONNREFUSED' || msg.includes('connection refused')) {
    return 'SMTP Connection refused: Mailcow Postfix server rejected connection. Verify port 587/465.';
  }

  if (code === 'ENOTFOUND' || msg.includes('getaddrinfo')) {
    return 'SMTP Host unreachable: Unable to resolve Mailcow mail server address.';
  }

  if (code === 'ETIMEDOUT' || msg.includes('timed out')) {
    return 'SMTP Connection timed out: Mailcow server did not respond.';
  }

  if (resp.includes('relay access denied') || resp.includes('relaying denied')) {
    return 'Mail relay denied by Mailcow Postfix: Sender is not permitted to relay.';
  }

  if (resp.includes('quota') || resp.includes('mailbox full')) {
    return 'Recipient or sender mailbox quota exceeded.';
  }

  if (resp.includes('user unknown') || resp.includes('recipient address rejected')) {
    return 'Recipient address was rejected by mail server.';
  }

  return err.response || err.message || 'Failed to dispatch email via Mailcow SMTP.';
}

/**
 * Dispatch an email through Mailcow Postfix SMTP and append a copy to the IMAP Sent mailbox
 */
export async function sendMailViaMailcow(
  smtpConfig: SmtpConnectionConfig,
  imapConfig: { host: string; port: number; secure: boolean; user: string; pass: string },
  options: SendMailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    return {
      success: false,
      error: 'SMTP configuration incomplete: Host, user, and password are required.',
    };
  }

  const transporter = createMailcowSmtpTransporter(smtpConfig);

  const formattedTo = options.to
    .map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email))
    .join(', ');

  const formattedAttachments = (options.attachments || []).map((att: any) => {
    let content = att.content;
    if (Buffer.isBuffer(content)) {
      // Raw binary Buffer - preserve 100% untouched
    } else if (typeof content === 'string') {
      if (content.startsWith('data:')) {
        const commaIndex = content.indexOf(',');
        if (commaIndex !== -1) {
          try {
            content = Buffer.from(content.substring(commaIndex + 1), 'base64');
          } catch (e) {
            console.error('[SMTP Attachment] Failed to decode base64 data URI:', e);
          }
        }
      } else if (att.encoding === 'base64') {
        try {
          content = Buffer.from(content, 'base64');
        } catch {
          content = Buffer.from(content, 'utf-8');
        }
      } else {
        content = Buffer.from(content, 'utf-8');
      }
    }

    return {
      filename: att.name || att.filename || 'attachment',
      content: content || Buffer.alloc(0),
      contentType: att.type || att.contentType || 'application/octet-stream',
      encoding: 'base64', // Standard MIME Base64 Content-Transfer-Encoding for Outlook/RFC MIME compatibility
    };
  });

  const mailOptions = {
    from: `"${options.from.name}" <${options.from.email}>`,
    to: formattedTo,
    cc: options.cc && options.cc.length > 0 ? options.cc.join(', ') : undefined,
    bcc: options.bcc && options.bcc.length > 0 ? options.bcc.join(', ') : undefined,
    subject: options.subject,
    text: options.bodyText,
    html: options.bodyHtml || options.bodyText.replace(/\n/g, '<br/>'),
    inReplyTo: options.inReplyTo,
    references: options.references,
    priority: options.priority === 'high' ? 'high' : 'normal',
    attachments: formattedAttachments,
  };

  try {
    // 1. Submit through Mailcow Postfix SMTP
    const info = await transporter.sendMail(mailOptions);

    // 2. Synchronize to Dovecot IMAP Sent folder
    try {
      if (imapConfig.host && imapConfig.user && imapConfig.pass) {
        const imapClient = createMailcowImapClient(imapConfig);
        await imapClient.connect();
        try {
          const sentPath = await resolveImapPath(imapClient, 'sent');
          const composer = new (MailComposer as any)(mailOptions);
          const rawEml = await composer.compile().build();
          await imapClient.append(sentPath, rawEml, ['\\Seen']);
        } catch (sentErr: any) {
          console.warn('[Mailcow SMTP] Sent folder append warning:', sentErr.message);
        } finally {
          await imapClient.logout();
        }
      }
    } catch (e: any) {
      console.warn('[Mailcow SMTP] IMAP Sent sync warning:', e.message);
    }

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: sanitizeSmtpError(err),
    };
  }
}
