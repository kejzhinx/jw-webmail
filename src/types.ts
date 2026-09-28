export interface User {
  id: string;
  email: string;
  name: string;
  title?: string;
  avatar?: string;
  role: 'admin' | 'administrator' | 'standard' | 'staff' | 'executive' | string;
  department?: string;
  storageUsedMb: number;
  storageQuotaMb: number;
  status?: 'active' | 'suspended' | 'locked';
  createdAt?: string;
  connectedToBluehost?: boolean;
  connectionType?: 'local' | 'bluehost' | 'remote' | string;
}

export interface UserAccount extends User {
  password?: string;
  passwordEnc?: string; // Webmail login password encrypted
  connectedToBluehost?: boolean;
  connectionType?: 'local' | 'bluehost' | 'remote' | string;
  
  // Dedicated IMAP connection per user
  imapUsername?: string;
  imapPassword?: string;
  imapPasswordEnc?: string;
  imapHost?: string;
  imapPort?: number;
  imapEncryption?: string;
  imapSecure?: boolean;
  
  smtpUsername?: string;
  smtpPassword?: string;
  smtpPasswordEnc?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpEncryption?: string;
  smtpSecure?: boolean;
  
  status?: 'active' | 'suspended' | 'locked';
  lastLogin?: string;

  mailbox?: {
    imapHost: string;
    imapPort: number;
    imapEncryption: string;
    imapUsername: string;
    imapPasswordEnc?: string;
    smtpHost: string;
    smtpPort: number;
    smtpEncryption: string;
    smtpUsername: string;
    smtpPasswordEnc?: string;
  };
}

export interface UserStorageDetail {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff' | 'executive' | string;
  department?: string;
  avatar?: string;
  storageUsedMb: number;
  storageQuotaMb: number;
  archiveCount: number;
  archiveSizeMb: number;
  trashCount: number;
  trashSizeMb: number;
  inboxCount: number;
  sentCount: number;
  connectedToBluehost?: boolean;
}

export interface DeviceStorageInfo {
  totalDeviceStorageGb: number;
  allocatedGb: number;
  usedGb: number;
  freeDeviceStorageGb: number;
  deviceLabel: string;
}

export type FolderType = 'inbox' | 'sent' | 'spam' | 'archive' | 'trash' | 'starred' | 'drafts' | string;

export interface CustomFolder {
  id: string;
  name: string;
  color: string;
  icon?: string;
  createdAt?: string;
  count?: number;
}

export interface EmailAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  content?: string;
  file?: File;
}

export interface EmailSecurityInfo {
  tlsVersion: string;
  dkimStatus: 'pass' | 'fail';
  spfStatus: 'pass' | 'fail';
  signatureVerified: boolean;
  ipOrigin: string;
}

export interface EmailMessage {
  id: string;
  folder: FolderType;
  from: {
    name: string;
    email: string;
    avatar?: string;
  };
  to: {
    name: string;
    email: string;
  }[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  preview: string;
  bodyText: string;
  bodyHtml?: string;
  timestamp: string;
  rawDate?: number;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachment[];
  security: EmailSecurityInfo;
  tags?: string[];
  priority?: 'normal' | 'high' | 'urgent';
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface ChatMessage {
  id: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  clientMsgId?: string;
  createdAt?: number;
  replyToId?: string;
  replyToSender?: string;
  replyToText?: string;
  isSystem?: boolean;
  reactions?: { emoji: string; userEmails: string[] }[];
}

export interface ChatConversation {
  user: User;
  lastMessage?: ChatMessage;
  unreadCount: number;
}

export interface MailServerStatus {
  status: 'operational' | 'degraded' | 'maintenance';
  uptimeSeconds: number;
  hostname: string;
  imapStatus: 'connected' | 'reconnecting' | 'disconnected';
  smtpStatus: 'active' | 'idle' | 'busy';
  tlsVersion: string;
  sslCertificate: {
    issuedTo: string;
    issuer: string;
    validUntil: string;
    algorithm: string;
  };
  ports: {
    imapSsl: number;
    smtpSsl: number;
    submission: number;
  };
  queueCount: number;
  deliveredToday: number;
  blockedSpamCount: number;
  storageUsedPercent: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

export interface EmailDomainInfo {
  id: string;
  domain: string;
  isPrimary: boolean;
  status: 'active' | 'verified';
  createdAt: string;
}

export interface DiagnosticItemResult {
  id: string;
  name: string;
  category: 'imap' | 'smtp' | 'connection' | 'dns';
  status: 'passed' | 'failed' | 'skipped' | 'running';
  latencyMs?: number;
  details: string;
  error?: string;
  data?: Record<string, any>;
  timestamp: string;
}

export interface PhysicalStorageConfig {
  enabled: boolean;
  storagePath: string;
  syncIntervalMinutes: number;
  autoArchiveOnLocal: boolean;
  deleteFromRemoteAfterSync: boolean;
  deviceLabel: string;
  lastSyncAt?: string;
  status: 'active' | 'syncing' | 'error' | 'disabled';
}

export interface PhysicalStorageStats {
  totalDiskCapacityGb: number;
  usedByMailStorageMb: number;
  freeDiskSpaceGb: number;
  storedEmailsCount: number;
  storedAttachmentsCount: number;
  storagePath: string;
  isWritable: boolean;
  lastCheckedAt: string;
  scheduler?: PhysicalStorageSchedulerStatus;
  environment?: PhysicalStorageEnvironmentInfo;
}

export interface DiagnosticsSuiteResult {
  mailbox: string;
  host: string;
  executedAt: string;
  overallStatus: 'passed' | 'failed' | 'partial';
  passedCount: number;
  failedCount: number;
  totalDurationMs: number;
  results: DiagnosticItemResult[];
}

export type StorageVerificationStatus =
  | 'unverified'
  | 'verifying'
  | 'verified'
  | 'missing'
  | 'not_directory'
  | 'not_readable'
  | 'not_writable'
  | 'error';

export interface PhysicalStorageVerificationResult {
  success: boolean;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  writable: boolean;
  isWritable: boolean;
  status: StorageVerificationStatus;
  canCreate?: boolean;
  parentExists?: boolean;
  parentPath?: string;
  resolvedPath: string;
  message: string;
  error?: string;
  warning?: string;
  realDiskTotalGb?: number;
  realDiskFreeGb?: number;
  storedFilesCount?: number;
  diskCapacityGb?: number;
  freeSpaceGb?: number;
}

export interface PhysicalStorageSchedulerStatus {
  schedulerEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncStarted: string | null;
  lastSyncCompleted: string | null;
  nextScheduledSync: string | null;
  lastSyncStatus: 'idle' | 'running' | 'success' | 'failed';
  lastSyncError: string | null;
  totalMessagesProcessed: number;
  totalFailures: number;
}

export interface PhysicalStorageEnvironmentInfo {
  isContainer: boolean;
  containerPath: string;
  hostPath?: string;
  isMountedVolume: boolean;
  backupAgent: {
    connected: boolean;
    hostId?: string;
    hostName?: string;
    osPlatform?: string;
    agentVersion?: string;
    backupPath?: string;
    lastHeartbeat?: string | null;
    status?: string;
    storage?: any;
  };
}

export interface StoredFileInfo {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  formattedSize: string;
  modifiedAt: string;
  type?: 'folder' | 'eml' | 'json' | 'attachment' | 'other';
  subject?: string;
  from?: string;
  date?: string;
}

export interface PhysicalStorageSyncReport {
  success: boolean;
  message: string;
  syncedAccounts: number;
  emailsStored: number;
  attachmentsStored: number;
  totalBytesWritten: number;
  formattedBytesWritten: string;
  storagePath: string;
  durationMs: number;
  accountDetails: {
    email: string;
    emailsSynced: number;
    bytesWritten: number;
    error?: string;
  }[];
}



