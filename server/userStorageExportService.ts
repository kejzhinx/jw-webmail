import AdmZip from 'adm-zip';
import { EmailMessage, FolderType } from '../src/types.js';
import { persistentMailboxStore, fetchMailboxMessages, resolveMailConfig, fetchMessageDetail, getEmailBodyContent } from './mailService.js';
import { getMailboxUserByEmail, listMailboxUsers, decryptCredential } from './firebaseUserService.js';

/**
 * Generate standard RFC822 EML formatted string compatible with Outlook, Thunderbird, Apple Mail
 */
function generateEmlContent(email: EmailMessage): string {
  const lines: string[] = [];
  const dateStr = email.timestamp && !isNaN(new Date(email.timestamp).getTime())
    ? new Date(email.timestamp).toUTCString()
    : new Date().toUTCString();

  const msgId = email.messageId || `<${email.id || Date.now()}@playbook.com.ph>`;
  lines.push(`Message-ID: ${msgId.startsWith('<') ? msgId : `<${msgId}>`}`);
  lines.push(`Date: ${dateStr}`);
  
  const fromName = email.from?.name ? `"${email.from.name.replace(/"/g, '')}" ` : '';
  const fromEmail = email.from?.email || 'unknown@playbook.com.ph';
  lines.push(`From: ${fromName}<${fromEmail}>`);

  if (email.to && email.to.length > 0) {
    const toFormatted = email.to
      .map(t => `${t.name ? `"${t.name.replace(/"/g, '')}" ` : ''}<${t.email}>`)
      .join(', ');
    lines.push(`To: ${toFormatted}`);
  } else {
    lines.push(`To: Undisclosed Recipients <undisclosed@playbook.com.ph>`);
  }

  if (email.cc && email.cc.length > 0) {
    lines.push(`Cc: ${email.cc.join(', ')}`);
  }

  lines.push(`Subject: ${email.subject || '(No Subject)'}`);
  lines.push(`X-Folder: ${email.folder || 'archive'}`);
  lines.push(`X-JW-Summit-Mail-ID: ${email.id}`);
  lines.push(`X-Priority: ${email.priority === 'urgent' ? '1' : email.priority === 'high' ? '2' : '3'}`);
  lines.push(`MIME-Version: 1.0`);

  const rawBodyText = (email.bodyText || email.preview || '').trim();
  const rawBodyHtml = email.bodyHtml || (rawBodyText ? `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #111827;">${rawBodyText.replace(/\n/g, '<br/>')}</div>` : '<p>(No content)</p>');
  const plainText = rawBodyText || rawBodyHtml.replace(/<[^>]+>/g, '').trim() || '(No content)';

  const altBoundary = `----=_Part_Alt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const mixBoundary = `----=_Part_Mix_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Filter attachments to only include those with actual binary content (prevents broken image placeholder bars)
  const validAttachments = (email.attachments || []).filter(att => {
    if (!att || !att.name) return false;
    const attUrl = (att as any).url;
    if (attUrl && typeof attUrl === 'string' && attUrl.startsWith('data:') && attUrl.length > 20) return true;
    if (att.content && (typeof att.content === 'string' ? att.content.length > 0 : ((att.content as any)?.length || 0) > 0)) return true;
    return false;
  });

  const hasAttachments = validAttachments.length > 0;

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixBoundary}"`);
    lines.push('');
    lines.push(`--${mixBoundary}`);
  }

  // Body content part (multipart/alternative for standard mail client compatibility)
  lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  lines.push('');
  lines.push(`--${altBoundary}`);
  lines.push(`Content-Type: text/plain; charset="utf-8"`);
  lines.push(`Content-Transfer-Encoding: 8bit`);
  lines.push('');
  lines.push(plainText);
  lines.push('');
  lines.push(`--${altBoundary}`);
  lines.push(`Content-Type: text/html; charset="utf-8"`);
  lines.push(`Content-Transfer-Encoding: 8bit`);
  lines.push('');
  lines.push(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${rawBodyHtml}</body></html>`);
  lines.push('');
  lines.push(`--${altBoundary}--`);

  // Attachments with verified binary data
  if (hasAttachments) {
    for (const att of validAttachments) {
      let b64Data = '';
      const attUrl = (att as any).url;
      if (attUrl && attUrl.startsWith('data:')) {
        const parts = attUrl.split(',');
        b64Data = parts[1] || '';
      } else if (att.content) {
        b64Data = typeof att.content === 'string' ? att.content : Buffer.from(att.content).toString('base64');
      }

      if (!b64Data) continue;

      lines.push('');
      lines.push(`--${mixBoundary}`);
      lines.push(`Content-Type: ${att.type || 'application/octet-stream'}; name="${att.name}"`);
      lines.push(`Content-Transfer-Encoding: base64`);
      lines.push(`Content-Disposition: attachment; filename="${att.name}"`);
      lines.push('');
      lines.push(b64Data);
    }
    lines.push('');
    lines.push(`--${mixBoundary}--`);
  }

  return lines.join('\r\n');
}

/**
 * Sanitize filenames for ZIP storage
 */
function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 80);
}

/**
 * Retrieve messages for a user and folder (merges persistent store and live cache)
 */
export async function getEmailsForUserFolder(userEmail: string, folder: FolderType): Promise<EmailMessage[]> {
  const normEmail = userEmail.toLowerCase().trim();
  const storeKey = `${normEmail}:${folder}`;
  const localMap = persistentMailboxStore.get(storeKey);
  const localEmails = localMap ? Array.from(localMap.values()) : [];

  // Try to load user connection config to fetch any additional IMAP messages
  try {
    const user = await getMailboxUserByEmail(normEmail);
    if (user) {
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

      const mailConfig = {
        imapHost,
        imapPort,
        imapSecure: imapPort === 993,
        imapUser,
        imapPass,
        smtpHost: user.mailbox?.smtpHost || user.smtpHost || 'mail.playbook.com.ph',
        smtpPort: Number(user.mailbox?.smtpPort || user.smtpPort || 465),
        smtpSecure: true,
        smtpUser: user.mailbox?.smtpUsername || user.smtpUsername || user.email,
        smtpPass: imapPass,
      };

      const fetched = await fetchMailboxMessages(mailConfig, folder, { limit: 100, forceRefresh: false });
      if (fetched && fetched.emails && fetched.emails.length > 0) {
        const mergedMap = new Map<string, EmailMessage>();
        localEmails.forEach(e => mergedMap.set(e.id, e));
        fetched.emails.forEach(e => mergedMap.set(e.id, e));
        return Array.from(mergedMap.values());
      }
    }
  } catch (err: any) {
    // If IMAP fails (e.g. rate limit), return local cache
  }

  return localEmails;
}

/**
 * Export specific user's folders (e.g. 'archive' or 'trash' or both) as a ZIP Buffer
 */
export async function createUserStorageZip(
  userEmail: string,
  folders: ('archive' | 'trash' | 'inbox' | 'sent' | 'drafts' | string)[],
  options: { includeEml?: boolean; includeJson?: boolean } = { includeEml: true, includeJson: true }
): Promise<{ zipBuffer: Buffer; totalEmails: number; totalBytes: number }> {
  const zip = new AdmZip();
  const normEmail = userEmail.toLowerCase().trim();
  const user = await getMailboxUserByEmail(normEmail);
  const userName = user?.name || normEmail.split('@')[0];

  let mailConfig: any = undefined;
  if (user) {
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

    mailConfig = {
      imapHost,
      imapPort,
      imapSecure: imapPort === 993,
      imapUser,
      imapPass,
      smtpHost: user.mailbox?.smtpHost || user.smtpHost || 'mail.playbook.com.ph',
      smtpPort: Number(user.mailbox?.smtpPort || user.smtpPort || 465),
      smtpSecure: true,
      smtpUser: user.mailbox?.smtpUsername || user.smtpUsername || user.email,
      smtpPass: imapPass,
    };
  }

  let totalEmails = 0;
  const manifestData: any = {
    exportDate: new Date().toISOString(),
    userEmail: normEmail,
    userName,
    foldersExported: folders,
    foldersSummary: {},
  };

  const htmlSummaryRows: string[] = [];

  for (const folder of folders) {
    const emails = await getEmailsForUserFolder(normEmail, folder as FolderType);
    totalEmails += emails.length;
    manifestData.foldersSummary[folder] = {
      count: emails.length,
    };

    if (emails.length === 0) {
      // Add empty folder placeholder notice
      zip.addFile(
        `${folder}/_README.txt`,
        Buffer.from(`No messages found in folder "${folder}" for ${normEmail} at time of export.\nExported on ${new Date().toLocaleString()}`)
      );
      continue;
    }

    for (let idx = 0; idx < emails.length; idx++) {
      let email = emails[idx];

      // Ensure full body content is populated if only summary metadata exists
      if (!email.bodyText && !email.bodyHtml) {
        const cachedBody = getEmailBodyContent(email.messageId || email.id, email.subject);
        if (cachedBody && (cachedBody.bodyText || cachedBody.bodyHtml)) {
          email.bodyText = cachedBody.bodyText || email.bodyText;
          email.bodyHtml = cachedBody.bodyHtml || email.bodyHtml;
          if (cachedBody.preview) email.preview = cachedBody.preview;
          if (cachedBody.attachments?.length) email.attachments = cachedBody.attachments;
        } else if (mailConfig) {
          try {
            const detail = await fetchMessageDetail(mailConfig, folder, email.id);
            if (detail) {
              email = detail;
              emails[idx] = detail;
            }
          } catch (errNote: any) {
            console.warn(`[Export Zip] Detail fetch note for message ${email.id}:`, errNote?.message);
          }
        }
      }

      const idxPadded = String(idx + 1).padStart(3, '0');
      const safeSubject = sanitizeFilename(email.subject || 'No_Subject');
      const baseFilename = `${idxPadded}_${safeSubject}_${email.id.replace(/[^a-zA-Z0-9]/g, '')}`;

      // 1. Standard EML (Outlook, Thunderbird, Apple Mail compatible)
      if (options.includeEml !== false) {
        const emlText = generateEmlContent(email);
        zip.addFile(`${folder}/${baseFilename}.eml`, Buffer.from(emlText, 'utf-8'));
      }

      // 2. Structured JSON Metadata
      if (options.includeJson !== false) {
        const jsonContent = JSON.stringify(
          {
            id: email.id,
            subject: email.subject,
            from: email.from,
            to: email.to,
            cc: email.cc,
            timestamp: email.timestamp,
            folder: email.folder,
            isRead: email.isRead,
            isStarred: email.isStarred,
            preview: email.preview,
            bodyText: email.bodyText,
            bodyHtml: email.bodyHtml,
            hasAttachments: email.hasAttachments,
            attachmentsCount: email.attachments?.length || 0,
            attachments: email.attachments?.map(a => ({
              id: a.id,
              name: a.name,
              size: a.size,
              type: a.type,
            })),
            security: email.security,
          },
          null,
          2
        );
        zip.addFile(`${folder}/${baseFilename}.json`, Buffer.from(jsonContent, 'utf-8'));
      }

      htmlSummaryRows.push(`
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #4b5563;">${folder}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #111827;">${escapeHtml(email.subject || '(No Subject)')}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">${escapeHtml(email.from?.email || '')}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${email.timestamp ? new Date(email.timestamp).toLocaleString() : ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: center;">${email.attachments && email.attachments.length > 0 ? `📎 ${email.attachments.length}` : '—'}</td>
        </tr>
      `);
    }
  }

  // Add Manifest JSON
  zip.addFile('export_manifest.json', Buffer.from(JSON.stringify(manifestData, null, 2), 'utf-8'));

  // Add HTML Visual Overview
  const summaryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>JW Summit Mail Export - ${escapeHtml(userName)} (${escapeHtml(normEmail)})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; background: #f9fafb; color: #111827; }
    .container { max-width: 1000px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #18181b; color: #ffffff; padding: 24px 32px; border-bottom: 3px solid #F15A24; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em; }
    .header p { margin: 0; font-size: 13px; color: #a1a1aa; }
    .stats { display: flex; gap: 16px; padding: 20px 32px; background: #f4f4f5; border-bottom: 1px solid #e5e7eb; }
    .stat-card { background: #ffffff; padding: 12px 18px; border-radius: 8px; border: 1px solid #e4e4e7; flex: 1; }
    .stat-card .val { font-size: 20px; font-weight: 800; color: #F15A24; }
    .stat-card .lbl { font-size: 11px; text-transform: uppercase; color: #71717a; font-weight: 700; margin-top: 2px; }
    .table-wrap { padding: 24px 32px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #f4f4f5; padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #52525b; border-bottom: 2px solid #e4e4e7; }
    .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 11px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>JW Summit Corporate Mail Export</h1>
      <p>Account: <strong>${escapeHtml(userName)}</strong> &lt;${escapeHtml(normEmail)}&gt; | Export Generated on ${new Date().toUTCString()}</p>
    </div>
    <div class="stats">
      <div class="stat-card">
        <div class="val">${totalEmails}</div>
        <div class="lbl">Total Messages Exported</div>
      </div>
      <div class="stat-card">
        <div class="val">${folders.join(', ').toUpperCase()}</div>
        <div class="lbl">Folders Included</div>
      </div>
      <div class="stat-card">
        <div class="val">RFC822 (.eml) & JSON</div>
        <div class="lbl">Format Compatibility</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Folder</th>
            <th>Subject</th>
            <th>From</th>
            <th>Timestamp</th>
            <th>Attachments</th>
          </tr>
        </thead>
        <tbody>
          ${htmlSummaryRows.join('') || '<tr><td colspan="5" style="text-align:center; padding: 24px; color: #71717a;">No messages found in exported folder(s).</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="footer">
      Generated automatically by JW Summit Corporate Webmail Server &bull; RFC822 EML files can be opened directly with Microsoft Outlook, Apple Mail, or Mozilla Thunderbird.
    </div>
  </div>
</body>
</html>`;

  zip.addFile('export_summary.html', Buffer.from(summaryHtml, 'utf-8'));

  const zipBuffer = zip.toBuffer();
  return {
    zipBuffer,
    totalEmails,
    totalBytes: zipBuffer.length,
  };
}

/**
 * Export all users' archive or trash data in one master ZIP
 */
export async function createAllUsersStorageZip(
  folders: ('archive' | 'trash')[]
): Promise<{ zipBuffer: Buffer; totalEmails: number; usersCount: number }> {
  const masterZip = new AdmZip();
  const allUsers = await listMailboxUsers();
  let totalEmails = 0;
  let processedUsers = 0;

  for (const user of allUsers) {
    const userEmail = user.email.toLowerCase().trim();
    for (const folder of folders) {
      const emails = await getEmailsForUserFolder(userEmail, folder as FolderType);
      totalEmails += emails.length;

      if (emails.length === 0) {
        continue;
      }

      emails.forEach((email, idx) => {
        const idxPadded = String(idx + 1).padStart(3, '0');
        const safeSubject = sanitizeFilename(email.subject || 'No_Subject');
        const filename = `${idxPadded}_${safeSubject}.eml`;
        const emlContent = generateEmlContent(email);
        masterZip.addFile(`${userEmail}/${folder}/${filename}`, Buffer.from(emlContent, 'utf-8'));
      });
    }
    processedUsers++;
  }

  const manifest = {
    exportDate: new Date().toISOString(),
    folders,
    usersCount: processedUsers,
    totalEmails,
  };
  masterZip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  return {
    zipBuffer: masterZip.toBuffer(),
    totalEmails,
    usersCount: processedUsers,
  };
}

/**
 * Calculate per-user storage summary stats (specifically scanning archive and trash folders)
 */
export async function getUserStorageStats(userEmail: string) {
  const normEmail = userEmail.toLowerCase().trim();
  const archiveEmails = await getEmailsForUserFolder(normEmail, 'archive');
  const trashEmails = await getEmailsForUserFolder(normEmail, 'trash');

  const estimateSizeMb = (emails: EmailMessage[]) => {
    if (!emails || emails.length === 0) return 0;
    let bytes = 0;
    emails.forEach(e => {
      bytes += (e.bodyText?.length || 0) + (e.bodyHtml?.length || 0) + 1500;
      if (e.attachments) {
        e.attachments.forEach(a => {
          let sizeVal = 10000;
          if (a.size) {
            const parsed = parseFloat(String(a.size));
            if (!isNaN(parsed)) {
              const lowerStr = String(a.size).toLowerCase();
              if (lowerStr.includes('kb')) {
                sizeVal = parsed * 1024;
              } else if (lowerStr.includes('mb')) {
                sizeVal = parsed * 1024 * 1024;
              } else {
                sizeVal = parsed; // already in bytes
              }
            }
          }
          bytes += a.content?.length || sizeVal;
        });
      }
    });
    return Number((bytes / (1024 * 1024)).toFixed(6));
  };

  return {
    archiveCount: archiveEmails.length,
    archiveSizeMb: estimateSizeMb(archiveEmails),
    trashCount: trashEmails.length,
    trashSizeMb: estimateSizeMb(trashEmails),
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
