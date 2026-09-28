import dns from 'dns/promises';
import net from 'net';
import tls from 'tls';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { MailConnectionConfig, categorizeError } from './mailService.js';
import { DiagnosticItemResult, DiagnosticsSuiteResult } from '../src/types.js';

export interface DiagnosticsRunOptions {
  mailbox?: string;
  password?: string;
  sendTestEmail?: boolean;
  testRecipient?: string;
}

/**
 * Execute real DNS resolution for IMAP and SMTP hostnames
 */
async function testDnsResolution(host: string): Promise<DiagnosticItemResult> {
  const start = Date.now();
  try {
    const addresses = await dns.lookup(host, { all: true });
    let mxRecords: any[] = [];
    try {
      const domain = host.replace(/^mail\./i, '');
      mxRecords = await dns.resolveMx(domain);
    } catch {
      // MX lookup optional if testing direct host
    }

    const latencyMs = Date.now() - start;
    const ipList = addresses.map((a) => a.address).join(', ');
    const mxSummary =
      mxRecords.length > 0
        ? ` (MX: ${mxRecords.map((m) => `${m.exchange} priority ${m.priority}`).join('; ')})`
        : '';

    return {
      id: 'imap_dns',
      name: 'IMAP DNS Resolution',
      category: 'imap',
      status: 'passed',
      latencyMs,
      details: `Resolved ${host} -> [${ipList}] in ${latencyMs}ms${mxSummary}`,
      data: { ips: addresses.map((a) => a.address), mx: mxRecords },
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      id: 'imap_dns',
      name: 'IMAP DNS Resolution',
      category: 'imap',
      status: 'failed',
      latencyMs: Date.now() - start,
      details: `DNS resolution failed for ${host}: ${err.message}`,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Raw TCP Port Socket Probe
 */
async function testTcpSocket(host: string, port: number, category: 'imap' | 'smtp', name: string): Promise<DiagnosticItemResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isSettled = false;

    socket.setTimeout(6000);

    socket.on('connect', () => {
      if (isSettled) return;
      isSettled = true;
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({
        id: `${category}_tcp_${port}`,
        name: `${name} (TCP Port ${port})`,
        category,
        status: 'passed',
        latencyMs,
        details: `Raw TCP socket opened successfully to ${host}:${port} in ${latencyMs}ms`,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('timeout', () => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        id: `${category}_tcp_${port}`,
        name: `${name} (TCP Port ${port})`,
        category,
        status: 'failed',
        latencyMs: Date.now() - start,
        details: `TCP connection timed out to ${host}:${port} after 6000ms`,
        error: 'ETIMEDOUT',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('error', (err) => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        id: `${category}_tcp_${port}`,
        name: `${name} (TCP Port ${port})`,
        category,
        status: 'failed',
        latencyMs: Date.now() - start,
        details: `TCP connection error to ${host}:${port}: ${err.message}`,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    });

    socket.connect(port, host);
  });
}

/**
 * Real SSL/TLS Certificate & Handshake test
 */
async function testTlsHandshake(host: string, port: number, category: 'imap' | 'smtp'): Promise<DiagnosticItemResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    let isSettled = false;
    const socket = tls.connect(
      {
        host,
        port,
        rejectUnauthorized: false,
        timeout: 8000,
        servername: host,
      },
      () => {
        if (isSettled) return;
        isSettled = true;
        const latencyMs = Date.now() - start;
        const cert = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();

        socket.end();

        resolve({
          id: `${category}_tls_${port}`,
          name: `${category.toUpperCase()} TLS Handshake & Certificate (Port ${port})`,
          category,
          status: 'passed',
          latencyMs,
          details: `Negotiated ${protocol} cipher ${cipher.name} in ${latencyMs}ms. Certificate issued to ${cert.subject?.CN || host} by ${cert.issuer?.O || cert.issuer?.CN || 'CA'} (Valid until ${cert.valid_to || 'N/A'}).`,
          data: {
            protocol,
            cipher: cipher.name,
            subjectCN: cert.subject?.CN,
            issuer: cert.issuer?.O || cert.issuer?.CN,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
          },
          timestamp: new Date().toISOString(),
        });
      }
    );

    socket.on('timeout', () => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        id: `${category}_tls_${port}`,
        name: `${category.toUpperCase()} TLS Handshake (Port ${port})`,
        category,
        status: 'failed',
        latencyMs: Date.now() - start,
        details: `TLS handshake timed out on ${host}:${port}`,
        error: 'TLS_TIMEOUT',
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('error', (err) => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      resolve({
        id: `${category}_tls_${port}`,
        name: `${category.toUpperCase()} TLS Handshake (Port ${port})`,
        category,
        status: 'failed',
        latencyMs: Date.now() - start,
        details: `TLS handshake error on ${host}:${port}: ${err.message}`,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    });
  });
}

/**
 * Full Diagnostics Suite Execution
 */
export async function runFullDiagnosticsSuite(
  config: MailConnectionConfig,
  options: DiagnosticsRunOptions = {}
): Promise<DiagnosticsSuiteResult> {
  const startTime = Date.now();
  const results: DiagnosticItemResult[] = [];

  const mailbox = options.mailbox || config.imapUser || 'jw@playbook.com.ph';
  const password = options.password || config.imapPass;
  const imapHost = config.imapHost || 'mail.playbook.com.ph';
  const smtpHost = config.smtpHost || imapHost;
  const imapPort = config.imapPort || 993;
  const smtpPort = config.smtpPort || 465;

  // 1. DNS Resolution IMAP
  results.push(await testDnsResolution(imapHost));

  // 2. DNS Resolution SMTP
  if (smtpHost !== imapHost) {
    results.push(await testDnsResolution(smtpHost));
  }

  // 3. Raw TCP Socket IMAP
  results.push(await testTcpSocket(imapHost, imapPort, 'imap', 'IMAP Port Connectivity'));

  // 4. Raw TCP Socket SMTP
  results.push(await testTcpSocket(smtpHost, smtpPort, 'smtp', 'SMTP Port Connectivity'));

  // 5. TLS Handshake IMAP
  results.push(await testTlsHandshake(imapHost, imapPort, 'imap'));

  // 6. TLS Handshake SMTP
  results.push(await testTlsHandshake(smtpHost, smtpPort, 'smtp'));

  // 7. IMAP Auth & Folder Inspection
  if (password) {
    const imapStart = Date.now();
    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: config.imapSecure !== false,
      auth: {
        user: mailbox,
        pass: password,
      },
      logger: false,
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 8000,
    });

    try {
      await client.connect();
      const latencyMs = Date.now() - imapStart;
      const mailboxes = await client.list();
      const lock = await client.getMailboxLock('INBOX');
      const mailboxStatus = client.mailbox;
      const totalMessages = mailboxStatus && typeof mailboxStatus === 'object' ? mailboxStatus.exists : 0;
      lock.release();

      await client.logout();

      results.push({
        id: 'imap_auth_folders',
        name: 'IMAP Authentication & Mailbox Access',
        category: 'imap',
        status: 'passed',
        latencyMs,
        details: `Successfully authenticated as ${mailbox} in ${latencyMs}ms. Folders found: [${mailboxes.map((m) => m.path).join(', ')}]. INBOX exists: ${totalMessages} messages.`,
        data: {
          folders: mailboxes.map((m) => ({ name: m.name, path: m.path, specialUse: m.specialUse })),
          inboxCount: totalMessages,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      results.push({
        id: 'imap_auth_folders',
        name: 'IMAP Authentication & Mailbox Access',
        category: 'imap',
        status: 'failed',
        latencyMs: Date.now() - imapStart,
        details: `IMAP Authentication failed for ${mailbox}: ${err.message}`,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 8. SMTP Auth Check
  if (password) {
    const smtpStart = Date.now();
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: config.smtpSecure !== false,
      auth: {
        user: mailbox,
        pass: password,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 8000,
    });

    try {
      await transporter.verify();
      const latencyMs = Date.now() - smtpStart;
      results.push({
        id: 'smtp_auth',
        name: 'SMTP Authentication Handshake',
        category: 'smtp',
        status: 'passed',
        latencyMs,
        details: `SMTP Authentication handshake verified for ${mailbox} on ${smtpHost}:${smtpPort} in ${latencyMs}ms`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      results.push({
        id: 'smtp_auth',
        name: 'SMTP Authentication Handshake',
        category: 'smtp',
        status: 'failed',
        latencyMs: Date.now() - smtpStart,
        details: `SMTP Authentication failed for ${mailbox}: ${err.message}`,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const overallStatus = failedCount === 0 ? 'passed' : passedCount > 0 ? 'partial' : 'failed';

  return {
    mailbox,
    host: imapHost,
    executedAt: new Date().toISOString(),
    overallStatus,
    passedCount,
    failedCount,
    totalDurationMs: Date.now() - startTime,
    results,
  };
}

/**
 * Direct IMAP credentials test for individual user mailbox configuration
 */
export async function testUserImapConnection(params: {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapSecure?: boolean;
}): Promise<{ success: boolean; message: string; folders?: string[]; latencyMs: number }> {
  const start = Date.now();
  const host = (params.imapHost || 'mail.playbook.com.ph').trim();
  const port = Number(params.imapPort) || 993;
  const user = (params.imapUser || '').trim();
  const pass = params.imapPass || '';

  if (!user || !pass) {
    return {
      success: false,
      message: 'IMAP username/email and password are required to test connection.',
      latencyMs: 0,
    };
  }

  const client = new ImapFlow({
    host,
    port,
    secure: params.imapSecure !== false && port === 993,
    auth: {
      user,
      pass,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    const folderNames = mailboxes.map((m) => m.name || m.path);
    await client.logout();
    const latencyMs = Date.now() - start;
    return {
      success: true,
      message: `IMAP Connected successfully in ${latencyMs}ms! Folders found: ${folderNames.slice(0, 4).join(', ')}${folderNames.length > 4 ? ` (+${folderNames.length - 4} more)` : ''}`,
      folders: folderNames,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      message: `Connection failed: ${err.message || 'Unable to connect to IMAP server.'}`,
      latencyMs,
    };
  }
}

/**
 * Direct Outgoing SMTP credentials test for individual user mailbox configuration
 */
export async function testUserSmtpConnection(params: {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure?: boolean;
}): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  const host = (params.smtpHost || 'mail.playbook.com.ph').trim();
  const port = Number(params.smtpPort) || 465;
  const user = (params.smtpUser || '').trim();
  const pass = params.smtpPass || '';

  if (!user || !pass) {
    return {
      success: false,
      message: 'SMTP username/email and password are required to test outgoing connection.',
      latencyMs: 0,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: params.smtpSecure !== undefined ? params.smtpSecure : (port === 465),
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
  });

  try {
    await transporter.verify();
    const latencyMs = Date.now() - start;
    return {
      success: true,
      message: `SMTP Connected and verified successfully in ${latencyMs}ms! (Ready to send outgoing emails)`,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      message: `SMTP Connection failed: ${err.message || 'Unable to connect to SMTP outgoing server.'}`,
      latencyMs,
    };
  }
}

