import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
  HardDrive,
  Info,
  Layers,
  Lock,
  LogOut,
  Mail,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Server,
  Shield,
  Trash2,
  Unlock,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { JWLogo } from './JWLogo';
import { ThemeToggle } from './ThemeToggle';
import {
  User,
  UserAccount,
  UserStorageDetail,
  PhysicalStorageConfig,
  PhysicalStorageStats,
  PhysicalStorageVerificationResult,
  StoredFileInfo,
  PhysicalStorageSyncReport,
} from '../types';
import { safeJson, apiFetch } from '../lib/api';

interface AdminPanelProps {
  adminUser: User;
  token: string;
  onLogout: () => void;
  onSwitchToMailbox: () => void;
  onUserUpdated?: (user: User) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  adminUser,
  token,
  onLogout,
  onSwitchToMailbox,
  onUserUpdated,
}) => {
  // Navigation State: 'users' | 'users_storage' | 'storage'
  const [activeTab, setActiveTab] = useState<'users' | 'users_storage' | 'storage'>('users');

  // Data States - Users
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'staff' | 'executive'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Data States - Users Storage & Archival
  const [usersStorageList, setUsersStorageList] = useState<UserStorageDetail[]>([]);
  const [isLoadingStorageOverview, setIsLoadingStorageOverview] = useState(false);
  const [storageSearchQuery, setStorageSearchQuery] = useState('');
  const [storageFilter, setStorageFilter] = useState<'all' | 'high_usage' | 'has_archive' | 'has_trash'>('all');
  const [storageSort, setStorageSort] = useState<'usage_desc' | 'name_asc' | 'archive_desc' | 'trash_desc'>('usage_desc');
  const [exportingUserEmail, setExportingUserEmail] = useState<string | null>(null);
  const [exportingFolder, setExportingFolder] = useState<string | null>(null);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [syncingUserEmail, setSyncingUserEmail] = useState<string | null>(null);
  const [selectedUserForExport, setSelectedUserForExport] = useState<UserStorageDetail | null>(null);
  const [customExportFolders, setCustomExportFolders] = useState<{
    archive: boolean;
    trash: boolean;
    inbox: boolean;
    sent: boolean;
    drafts: boolean;
  }>({
    archive: true,
    trash: true,
    inbox: false,
    sent: false,
    drafts: false,
  });

  // Data States - Physical Storage
  const [storageConfig, setStorageConfig] = useState<PhysicalStorageConfig>({
    enabled: true,
    storagePath: './data/backups',
    syncIntervalMinutes: 0,
    autoArchiveOnLocal: false,
    deleteFromRemoteAfterSync: false,
    deviceLabel: 'Local Host Drive (Primary Storage)',
    status: 'active',
  });
  const [storageStats, setStorageStats] = useState<PhysicalStorageStats | null>(null);
  const [isTestingPath, setIsTestingPath] = useState(false);
  const [isSyncingStorage, setIsSyncingStorage] = useState(false);
  const [isSyncingBluehost, setIsSyncingBluehost] = useState(false);
  const [isSavingStorage, setIsSavingStorage] = useState(false);
  const [pathVerification, setPathVerification] = useState<PhysicalStorageVerificationResult | null>(null);
  const [isInitializingDir, setIsInitializingDir] = useState(false);
  const [syncReport, setSyncReport] = useState<PhysicalStorageSyncReport | null>(null);

  // Physical Disk Explorer States
  const [diskFiles, setDiskFiles] = useState<StoredFileInfo[]>([]);
  const [currentBrowseDir, setCurrentBrowseDir] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [viewingFileContent, setViewingFileContent] = useState<{
    name: string;
    content: string;
    sizeBytes: number;
    path: string;
  } | null>(null);
  const [isLoadingFileContent, setIsLoadingFileContent] = useState<boolean>(false);

  // Modals state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Form states: Add User
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('Playbook2026!');
  const [newQuotaGb, setNewQuotaGb] = useState<number>(2);
  const [newRole, setNewRole] = useState<'standard' | 'admin'>('standard');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Incoming (IMAP) Configuration states for Add User Modal
  const [newImapHost, setNewImapHost] = useState('mail.playbook.com.ph');
  const [newImapPort, setNewImapPort] = useState<number>(993);
  const [newImapUsername, setNewImapUsername] = useState('');
  const [newImapPassword, setNewImapPassword] = useState('');
  const [newImapEncryption, setNewImapEncryption] = useState<'SSL/TLS' | 'STARTTLS'>('SSL/TLS');
  const [showNewImapPassword, setShowNewImapPassword] = useState(false);
  const [isTestingNewImap, setIsTestingNewImap] = useState(false);
  const [newImapTestResult, setNewImapTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Outgoing (SMTP) Configuration states for Add User Modal
  const [newUseSameSmtp, setNewUseSameSmtp] = useState(true);
  const [newSmtpHost, setNewSmtpHost] = useState('mail.playbook.com.ph');
  const [newSmtpPort, setNewSmtpPort] = useState<number>(465);
  const [newSmtpUsername, setNewSmtpUsername] = useState('');
  const [newSmtpPassword, setNewSmtpPassword] = useState('');
  const [newSmtpEncryption, setNewSmtpEncryption] = useState<'SSL/TLS' | 'STARTTLS'>('SSL/TLS');
  const [showNewSmtpPassword, setShowNewSmtpPassword] = useState(false);
  const [isTestingNewSmtp, setIsTestingNewSmtp] = useState(false);
  const [newSmtpTestResult, setNewSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form states: Edit User
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editQuotaGb, setEditQuotaGb] = useState<number>(2);
  const [editRole, setEditRole] = useState<'standard' | 'admin'>('standard');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Incoming (IMAP) Configuration states for Edit User Modal
  const [editImapHost, setEditImapHost] = useState('mail.playbook.com.ph');
  const [editImapPort, setEditImapPort] = useState<number>(993);
  const [editImapUsername, setEditImapUsername] = useState('');
  const [editImapPassword, setEditImapPassword] = useState('');
  const [editImapEncryption, setEditImapEncryption] = useState<'SSL/TLS' | 'STARTTLS'>('SSL/TLS');
  const [showEditImapPassword, setShowEditImapPassword] = useState(false);
  const [isTestingEditImap, setIsTestingEditImap] = useState(false);
  const [editImapTestResult, setEditImapTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Outgoing (SMTP) Configuration states for Edit User Modal
  const [editUseSameSmtp, setEditUseSameSmtp] = useState(true);
  const [editSmtpHost, setEditSmtpHost] = useState('mail.playbook.com.ph');
  const [editSmtpPort, setEditSmtpPort] = useState<number>(465);
  const [editSmtpUsername, setEditSmtpUsername] = useState('');
  const [editSmtpPassword, setEditSmtpPassword] = useState('');
  const [editSmtpEncryption, setEditSmtpEncryption] = useState<'SSL/TLS' | 'STARTTLS'>('SSL/TLS');
  const [showEditSmtpPassword, setShowEditSmtpPassword] = useState(false);
  const [isTestingEditSmtp, setIsTestingEditSmtp] = useState(false);
  const [editSmtpTestResult, setEditSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const testUserImap = async (
    host: string,
    port: number,
    user: string,
    pass: string,
    encryption: 'SSL/TLS' | 'STARTTLS'
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/admin/test-user-imap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imapHost: host.trim(),
          imapPort: Number(port),
          imapUser: user.trim(),
          imapPass: pass,
          imapSecure: encryption === 'SSL/TLS',
        }),
      });
      const data = await safeJson(res);
      return {
        success: Boolean(data.success),
        message: data.message || (data.success ? 'IMAP incoming connection verified!' : 'Connection failed'),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error verifying IMAP credentials.',
      };
    }
  };

  const testUserSmtp = async (
    host: string,
    port: number,
    user: string,
    pass: string,
    encryption: 'SSL/TLS' | 'STARTTLS'
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/admin/test-user-smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          smtpHost: host.trim(),
          smtpPort: Number(port),
          smtpUser: user.trim(),
          smtpPass: pass,
          smtpSecure: encryption === 'SSL/TLS',
        }),
      });
      const data = await safeJson(res);
      return {
        success: Boolean(data.success),
        message: data.message || (data.success ? 'SMTP outgoing connection verified!' : 'Connection failed'),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error verifying SMTP credentials.',
      };
    }
  };

  const handleTestNewImap = async () => {
    const userToTest = newImapUsername.trim() || newEmail.trim();
    const passToTest = newImapPassword || newPassword;
    if (!userToTest || !passToTest) {
      setNewImapTestResult({
        success: false,
        message: 'Please enter an email/username and password first to test IMAP incoming connection.',
      });
      return;
    }
    setIsTestingNewImap(true);
    setNewImapTestResult(null);
    const result = await testUserImap(newImapHost, newImapPort, userToTest, passToTest, newImapEncryption);
    setNewImapTestResult(result);
    setIsTestingNewImap(false);
  };

  const handleTestNewSmtp = async () => {
    const hostToTest = newUseSameSmtp ? newImapHost : newSmtpHost;
    const portToTest = newUseSameSmtp ? (newImapEncryption === 'STARTTLS' ? 587 : 465) : newSmtpPort;
    const userToTest = newUseSameSmtp ? (newImapUsername.trim() || newEmail.trim()) : (newSmtpUsername.trim() || newEmail.trim());
    const passToTest = newUseSameSmtp ? (newImapPassword || newPassword) : (newSmtpPassword || newPassword);
    const encToTest = newUseSameSmtp ? newImapEncryption : newSmtpEncryption;

    if (!userToTest || !passToTest) {
      setNewSmtpTestResult({
        success: false,
        message: 'Please enter an email/username and password first to test SMTP outgoing connection.',
      });
      return;
    }
    setIsTestingNewSmtp(true);
    setNewSmtpTestResult(null);
    const result = await testUserSmtp(hostToTest, portToTest, userToTest, passToTest, encToTest);
    setNewSmtpTestResult(result);
    setIsTestingNewSmtp(false);
  };

  const handleTestEditImap = async () => {
    const userToTest = editImapUsername.trim() || editEmail.trim();
    const passToTest = editImapPassword || editPassword;
    if (!userToTest || !passToTest) {
      setEditImapTestResult({
        success: false,
        message: 'Please enter an email/username and password first to test IMAP incoming connection.',
      });
      return;
    }
    setIsTestingEditImap(true);
    setEditImapTestResult(null);
    const result = await testUserImap(editImapHost, editImapPort, userToTest, passToTest, editImapEncryption);
    setEditImapTestResult(result);
    setIsTestingEditImap(false);
  };

  const handleTestEditSmtp = async () => {
    const hostToTest = editUseSameSmtp ? editImapHost : editSmtpHost;
    const portToTest = editUseSameSmtp ? (editImapEncryption === 'STARTTLS' ? 587 : 465) : editSmtpPort;
    const userToTest = editUseSameSmtp ? (editImapUsername.trim() || editEmail.trim()) : (editSmtpUsername.trim() || editEmail.trim());
    const passToTest = editUseSameSmtp ? (editImapPassword || editPassword) : (editSmtpPassword || editPassword);
    const encToTest = editUseSameSmtp ? editImapEncryption : editSmtpEncryption;

    if (!userToTest || !passToTest) {
      setEditSmtpTestResult({
        success: false,
        message: 'Please enter an email/username and password first to test SMTP outgoing connection.',
      });
      return;
    }
    setIsTestingEditSmtp(true);
    setEditSmtpTestResult(null);
    const result = await testUserSmtp(hostToTest, portToTest, userToTest, passToTest, encToTest);
    setEditSmtpTestResult(result);
    setIsTestingEditSmtp(false);
  };

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const { ok, data } = await apiFetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (ok && data.users && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        console.error('Failed to load admin user data:', data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Failed to load admin user data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPhysicalStorageData = async () => {
    try {
      const res = await fetch('/api/admin/physical-storage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (data.success) {
        if (data.config) setStorageConfig(data.config);
        if (data.stats) setStorageStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load physical storage data:', err);
    }
  };

  const loadDiskFiles = async (subDir: string = '') => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch(`/api/admin/physical-storage/files?path=${encodeURIComponent(subDir)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (data.success) {
        setDiskFiles(data.files || []);
        setCurrentBrowseDir(data.currentPath || subDir);
      }
    } catch (err) {
      console.error('Failed to load physical storage files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleViewFile = async (relPath: string) => {
    setIsLoadingFileContent(true);
    try {
      const res = await fetch(`/api/admin/physical-storage/file-content?path=${encodeURIComponent(relPath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (data.success) {
        setViewingFileContent({
          name: data.name,
          content: data.content,
          sizeBytes: data.sizeBytes,
          path: data.path,
        });
      } else {
        showToast(data.error || 'Failed to read file from disk.');
      }
    } catch (err) {
      showToast('Network error reading file from host drive.');
    } finally {
      setIsLoadingFileContent(false);
    }
  };

  const handleDownloadFile = (relPath: string, fileName: string) => {
    window.open(`/api/admin/physical-storage/file-content?path=${encodeURIComponent(relPath)}&token=${encodeURIComponent(token)}`, '_blank');
  };

  const handleDownloadZip = async () => {
    try {
      showToast('Preparing ZIP export from host storage...');
      const res = await fetch('/api/admin/physical-storage/download-zip', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await safeJson(res);
        showToast(data.error || 'No archived mail is available to export.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jw-summit-mail-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Mail storage ZIP export downloaded successfully.');
    } catch (err: any) {
      showToast('Failed to export mail ZIP: ' + err.message);
    }
  };

  const handleInitializeStoragePath = async () => {
    setIsInitializingDir(true);
    try {
      const res = await fetch('/api/admin/physical-storage/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath: storageConfig.storagePath }),
      });
      const data: PhysicalStorageVerificationResult = await safeJson(res);
      setPathVerification(data);
      if (data.success) {
        showToast('Storage directory created and verified successfully.');
        loadPhysicalStorageData();
        loadDiskFiles('');
      } else {
        showToast(data.message || data.error || 'Failed to initialize directory.');
      }
    } catch (err: any) {
      showToast('Error initializing directory: ' + err.message);
    } finally {
      setIsInitializingDir(false);
    }
  };

  const loadUsersStorageOverview = async () => {
    setIsLoadingStorageOverview(true);
    try {
      const { ok, data } = await apiFetch('/api/admin/users-storage-overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (ok && data?.success && Array.isArray(data.users)) {
        setUsersStorageList(data.users);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingStorageOverview(false);
    }
  };

  const handleSyncUserStorage = async (userEmail: string) => {
    setSyncingUserEmail(userEmail);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userEmail)}/sync-storage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (res.ok && data?.success) {
        showToast(data.message || `Synchronized live mailbox storage for ${userEmail}`);
        await loadUsersStorageOverview();
        await loadAdminData();
      } else {
        showToast(data?.error || `Failed to sync storage for ${userEmail}`);
      }
    } catch (err: any) {
      showToast('Error syncing storage: ' + (err.message || 'Network error'));
    } finally {
      setSyncingUserEmail(null);
    }
  };

  const handleExportUserZip = async (
    userEmail: string,
    folder: 'archive' | 'trash' | 'archive,trash' | 'all' = 'archive,trash',
    userName?: string
  ) => {
    setExportingUserEmail(userEmail);
    setExportingFolder(folder);
    try {
      // Step 1: Request ZIP file download (pass purge=false so deletion does NOT happen before/during transfer)
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userEmail)}/export-zip?folder=${folder}&purge=false`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await safeJson(res);
        showToast(data.error || `Failed to export ${folder} data.`);
        return;
      }

      // Step 2: Receive and verify 100% of the downloaded file buffer
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        showToast('Download failed or empty file received. Data was NOT deleted from Bluehost.');
        return;
      }

      // Step 3: Trigger browser save file dialog
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (userName || userEmail.split('@')[0]).replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `jw_${safeName}_archive_trash_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast(`ZIP download completed successfully. Purging Bluehost storage...`);

      // Step 4: NOW that download is 100% verified complete, call post-download confirmation endpoint to purge Bluehost storage
      try {
        const confirmRes = await fetch(`/api/admin/users/${encodeURIComponent(userEmail)}/confirm-download-purge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ folder }),
        });
        const confirmData = await safeJson(confirmRes);
        if (confirmRes.ok && confirmData?.success) {
          showToast(`Downloaded ZIP & successfully purged exported messages from Bluehost storage.`);
        } else {
          showToast(`Downloaded ZIP successfully. Storage purge note: ${confirmData?.error || 'Manual sync recommended.'}`);
        }
      } catch (confirmErr: any) {
        console.warn('Post-download purge error:', confirmErr);
        showToast('Downloaded ZIP successfully.');
      }

      // Refresh storage overview immediately to reflect new live storage
      await loadUsersStorageOverview();
      await loadAdminData();
    } catch (err: any) {
      showToast(`Download failed: ` + (err.message || 'Network error') + `. Data was NOT deleted from Bluehost.`);
    } finally {
      setExportingUserEmail(null);
      setExportingFolder(null);
    }
  };

  const handleExportAllUsersZip = async (folder: 'archive' | 'trash' | 'archive,trash' | 'all' = 'archive,trash') => {
    setIsBulkExporting(true);
    try {
      const res = await fetch(`/api/admin/users-storage/export-all-zip?folder=${folder}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ folder }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        showToast(data.error || 'Failed to generate bulk backup ZIP.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `jw_all_users_archive_trash_backup_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast(`All users Archive & Trash backup ZIP downloaded.`);
    } catch (err: any) {
      showToast('Failed to export all users ZIP: ' + (err.message || 'Error'));
    } finally {
      setIsBulkExporting(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    loadPhysicalStorageData();
    loadDiskFiles('');
    loadUsersStorageOverview();
  }, []);

  // Save Physical Storage Configuration
  const handleSaveStorageConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingStorage(true);
    try {
      const res = await fetch('/api/admin/physical-storage', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(storageConfig),
      });

      const data = await safeJson(res);
      if (data.success) {
        if (data.config) setStorageConfig(data.config);
        if (data.stats) setStorageStats(data.stats);
        showToast('Physical device storage configuration saved successfully.');
        loadDiskFiles(currentBrowseDir);
      } else {
        showToast(data.error || 'Failed to save storage settings.');
      }
    } catch (err) {
      showToast('Connection error while saving storage configuration.');
    } finally {
      setIsSavingStorage(false);
    }
  };

  // Test Storage Path
  const handleTestStoragePath = async () => {
    setIsTestingPath(true);
    setPathVerification(null);
    try {
      const res = await fetch('/api/admin/physical-storage/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath: storageConfig.storagePath }),
      });

      const data: PhysicalStorageVerificationResult = await safeJson(res);
      setPathVerification(data);
      if (data.success) {
        loadPhysicalStorageData();
        loadDiskFiles('');
      }
    } catch (err: any) {
      setPathVerification({
        success: false,
        exists: false,
        isDirectory: false,
        isWritable: false,
        resolvedPath: storageConfig.storagePath,
        message: 'Network error verifying physical drive path.',
        error: err?.message || 'Network connection failed.',
      });
    } finally {
      setIsTestingPath(false);
    }
  };

  // Sync Mailboxes to Physical Device Now
  const handleSyncNow = async () => {
    setIsSyncingStorage(true);
    setSyncReport(null);
    try {
      const res = await fetch('/api/admin/physical-storage/sync-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (data.success) {
        if (data.stats) setStorageStats(data.stats);
        if (data.report) setSyncReport(data.report);
        showToast(data.message || 'Mailboxes synchronized to physical drive.');
        loadDiskFiles(currentBrowseDir);
      } else {
        showToast(data.error || 'Sync operation encountered an error.');
      }
    } catch (err) {
      showToast('Network error triggering synchronization.');
    } finally {
      setIsSyncingStorage(false);
    }
  };

  // Sync Storage directly from Bluehost IMAP
  const handleSyncBluehostStorage = async () => {
    setIsSyncingBluehost(true);
    try {
      const res = await fetch('/api/admin/sync-bluehost-storage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (data.success) {
        if (data.users) setUsers(data.users);
        showToast(data.message || 'Synchronized storage directly from Bluehost IMAP.');
      } else {
        showToast(data.error || 'Failed to sync Bluehost storage.');
      }
    } catch (err) {
      showToast('Network error syncing Bluehost storage.');
    } finally {
      setIsSyncingBluehost(false);
    }
  };

  // Handle Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    let formattedEmail = newEmail.trim().toLowerCase();
    if (!formattedEmail.includes('@')) {
      formattedEmail = `${formattedEmail}@playbook.com.ph`;
    }

    if (!newPassword || newPassword.length < 3) {
      setAddError('Please enter a password with at least 3 characters.');
      return;
    }

    setIsAddingUser(true);
    try {
      const finalSmtpHost = (newUseSameSmtp ? newImapHost : newSmtpHost).trim() || 'mail.playbook.com.ph';
      const finalSmtpPort = Number(newUseSameSmtp ? (newImapEncryption === 'STARTTLS' ? 587 : 465) : newSmtpPort) || 465;
      const finalSmtpUser = (newUseSameSmtp ? (newImapUsername.trim() || formattedEmail) : (newSmtpUsername.trim() || formattedEmail));
      const finalSmtpPass = (newUseSameSmtp ? (newImapPassword || newPassword) : (newSmtpPassword || newPassword));
      const finalSmtpEnc = newUseSameSmtp ? (newImapEncryption === 'STARTTLS' ? 'STARTTLS' : 'SSL/TLS') : newSmtpEncryption;

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: formattedEmail,
          name: newName.trim() || formattedEmail.split('@')[0],
          password: newPassword,
          storageQuotaGb: Number(newQuotaGb),
          role: newRole,
          imapHost: newImapHost.trim() || 'mail.playbook.com.ph',
          imapPort: Number(newImapPort) || 993,
          imapUsername: newImapUsername.trim() || formattedEmail,
          imapPassword: newImapPassword || newPassword,
          imapEncryption: newImapEncryption,
          smtpHost: finalSmtpHost,
          smtpPort: finalSmtpPort,
          smtpUsername: finalSmtpUser,
          smtpPassword: finalSmtpPass,
          smtpEncryption: finalSmtpEnc,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        setAddError(data.error || 'Failed to create user account.');
        return;
      }

      if (data.user) {
        setUsers((prev) => [data.user, ...prev.filter((u) => u.id !== data.user.id && u.email !== data.user.email)]);
      }

      showToast(`User account ${formattedEmail} created with Incoming & Outgoing mail servers configured.`);
      setIsAddUserModalOpen(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('Playbook2026!');
      setNewQuotaGb(2);
      setNewImapHost('mail.playbook.com.ph');
      setNewImapPort(993);
      setNewImapUsername('');
      setNewImapPassword('');
      setNewImapTestResult(null);
      setNewUseSameSmtp(true);
      setNewSmtpHost('mail.playbook.com.ph');
      setNewSmtpPort(465);
      setNewSmtpUsername('');
      setNewSmtpPassword('');
      setNewSmtpTestResult(null);
      loadAdminData();
    } catch (err: any) {
      setAddError(err?.message || 'Connection error while creating account.');
    } finally {
      setIsAddingUser(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (u: UserAccount) => {
    setEditingUser(u);
    setEditName(u.name || '');
    setEditEmail(u.email || '');
    setEditPassword(u.password || '');
    const rawQuota = Number(u.storageQuotaMb);
    const safeQuotaMb = !isNaN(rawQuota) && rawQuota > 0 ? rawQuota : 2048;
    setEditQuotaGb(Number((safeQuotaMb / 1024).toFixed(1)));
    setEditRole((u.role === 'admin' || u.role === 'administrator') ? 'admin' : 'standard');
    setShowEditPassword(false);
    setEditError(null);

    // Incoming IMAP states
    setEditImapHost(u.imapHost || (u as any).mailbox?.imapHost || 'mail.playbook.com.ph');
    setEditImapPort(u.imapPort || (u as any).mailbox?.imapPort || 993);
    setEditImapUsername(u.imapUsername || (u as any).mailbox?.imapUsername || u.email || '');
    setEditImapPassword(u.imapPassword || u.password || '');
    setEditImapEncryption((u.imapPort || (u as any).mailbox?.imapPort) === 143 ? 'STARTTLS' : 'SSL/TLS');
    setShowEditImapPassword(false);
    setEditImapTestResult(null);

    // Outgoing SMTP states
    const userSmtpHost = u.smtpHost || (u as any).mailbox?.smtpHost;
    const isSameServer = !userSmtpHost || userSmtpHost === (u.imapHost || (u as any).mailbox?.imapHost || 'mail.playbook.com.ph');
    setEditUseSameSmtp(isSameServer);
    setEditSmtpHost(userSmtpHost || 'mail.playbook.com.ph');
    setEditSmtpPort(u.smtpPort || (u as any).mailbox?.smtpPort || 465);
    setEditSmtpUsername(u.smtpUsername || (u as any).mailbox?.smtpUsername || u.imapUsername || u.email || '');
    setEditSmtpPassword(u.smtpPassword || u.password || '');
    setEditSmtpEncryption((u.smtpPort || (u as any).mailbox?.smtpPort) === 587 ? 'STARTTLS' : 'SSL/TLS');
    setShowEditSmtpPassword(false);
    setEditSmtpTestResult(null);
  };

  // Quick Lock / Unlock User Account
  const handleToggleLock = async (targetUser: UserAccount) => {
    if (!targetUser || targetUser.id === adminUser?.id || targetUser.email === adminUser?.email) {
      showToast('You cannot lock your own active administrator account.');
      return;
    }

    const nextStatus = targetUser.status === 'locked' ? 'active' : 'locked';
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      const data = await safeJson(res);
      if (data.success) {
        showToast(
          nextStatus === 'locked'
            ? `Locked mailbox access for ${targetUser.email}.`
            : `Unlocked mailbox access for ${targetUser.email}.`
        );
        loadAdminData();
      } else {
        showToast(data.error || 'Failed to update user lock status.');
      }
    } catch (err) {
      showToast('Connection error updating account status.');
    }
  };

  // Handle Edit User
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    if (!editName.trim()) {
      setEditError('Please enter a display username.');
      return;
    }
    if (!editEmail.trim()) {
      setEditError('Please enter an email address.');
      return;
    }
    if (editQuotaGb <= 0) {
      setEditError('Storage quota must be greater than 0 GB.');
      return;
    }

    setIsSavingUser(true);
    try {
      const finalSmtpHost = (editUseSameSmtp ? editImapHost : editSmtpHost).trim() || 'mail.playbook.com.ph';
      const finalSmtpPort = Number(editUseSameSmtp ? (editImapEncryption === 'STARTTLS' ? 587 : 465) : editSmtpPort) || 465;
      const finalSmtpUser = (editUseSameSmtp ? (editImapUsername.trim() || editEmail.trim()) : (editSmtpUsername.trim() || editEmail.trim()));
      const finalSmtpPass = (editUseSameSmtp ? (editImapPassword.trim() || editPassword.trim() || undefined) : (editSmtpPassword.trim() || editPassword.trim() || undefined));
      const finalSmtpEnc = editUseSameSmtp ? (editImapEncryption === 'STARTTLS' ? 'STARTTLS' : 'SSL/TLS') : editSmtpEncryption;

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          password: editPassword.trim() || undefined,
          storageQuotaGb: Number(editQuotaGb),
          role: editRole,
          imapHost: editImapHost.trim() || 'mail.playbook.com.ph',
          imapPort: Number(editImapPort) || 993,
          imapUsername: editImapUsername.trim() || editEmail.trim(),
          imapPassword: editImapPassword.trim() || editPassword.trim() || undefined,
          imapEncryption: editImapEncryption,
          smtpHost: finalSmtpHost,
          smtpPort: finalSmtpPort,
          smtpUsername: finalSmtpUser,
          smtpPassword: finalSmtpPass,
          smtpEncryption: finalSmtpEnc,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok || !data.success) {
        setEditError(data.error || 'Failed to update user account.');
        return;
      }

      showToast(`Updated Mailbox & Server settings for ${editEmail.trim()}`);
      if (editingUser.id === adminUser.id && onUserUpdated) {
        onUserUpdated(data.user);
      }
      setEditingUser(null);
      loadAdminData();
    } catch (err: any) {
      setEditError(err?.message || 'Connection error while saving account.');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = (userToDelete: UserAccount) => {
    if (userToDelete.id === adminUser?.id || userToDelete.email === adminUser?.email) {
      showToast('You cannot delete your own logged-in administrator account.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Delete User Mailbox',
      message: `Are you sure you want to permanently delete the mailbox account for ${userToDelete.email}? All associated account data will be removed.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await safeJson(res);
          if (data.success) {
            showToast(`Mailbox account ${userToDelete.email} has been deleted.`);
            loadAdminData();
          } else {
            showToast(data.error || 'Failed to delete mailbox account.');
          }
        } catch (err) {
          showToast('Connection error while deleting account.');
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.title && u.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole =
      roleFilter === 'all' ||
      (roleFilter === 'admin' && (u.role === 'admin' || u.role === 'administrator')) ||
      (roleFilter === 'standard' && (u.role === 'standard' || u.role === 'staff' || u.role === 'executive' || !u.role));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && u.status !== 'locked') ||
      (statusFilter === 'locked' && u.status === 'locked');

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Calculate Metrics
  const totalUsers = users.length;
  const activeUsersCount = users.filter((u) => u.status !== 'locked').length;
  const lockedUsersCount = users.filter((u) => u.status === 'locked').length;
  const totalAllocatedGb = Number(
    (users.reduce((acc, u) => acc + (u.storageQuotaMb || 2048), 0) / 1024).toFixed(1)
  );
  const totalUsedMb = users.reduce((acc, u) => acc + (u.storageUsedMb || 0), 0);
  const totalUsedGb = Number((totalUsedMb / 1024).toFixed(2));

  const formatStorageSize = (mb: number) => {
    if (mb === undefined || mb === null || isNaN(mb) || mb <= 0) return '0 MB';
    if (mb < 0.1) return `${(mb * 1024).toFixed(0)} KB`;
    if (mb < 1) return `${mb.toFixed(2)} MB`;
    if (mb < 10) return `${mb.toFixed(1)} MB`;
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${Math.round(mb)} MB`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0B0D12] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#12151E]/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <JWLogo size="sm" showText={false} className="h-8 w-auto" />
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">
                  JW Summit Group Inc.
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-orange-100 text-[#F15A24] dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                  Admin Console
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                JW Summit Group Inc. Enterprise Administration & Storage
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          <button
            type="button"
            onClick={onSwitchToMailbox}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-[#F15A24]" />
            <span className="hidden md:inline">Go to Webmail Inbox</span>
            <span className="md:hidden">Inbox</span>
            <ArrowRight className="w-3 h-3 text-neutral-400" />
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-neutral-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400 transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout with Left Navigation Sidebar */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* LEFT NAVIGATION BAR */}
        <aside className="w-full md:w-64 lg:w-72 bg-white dark:bg-[#12151E] border-r border-neutral-200 dark:border-neutral-800 p-4 shrink-0 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-3 mb-2">
                Administration Hub
              </div>
              <nav className="space-y-1">
                {/* Tab: Users & Mailboxes */}
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                    activeTab === 'users'
                      ? 'bg-orange-50 text-[#F15A24] dark:bg-orange-950/50 dark:text-orange-400 border border-orange-200/60 dark:border-orange-900/50 shadow-2xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <div className="flex-1">
                    <div>Mailboxes & Users</div>
                    <div className="text-[10px] font-normal text-neutral-400 dark:text-neutral-500">
                      {users.length} accounts configured
                    </div>
                  </div>
                  {activeTab === 'users' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F15A24]" />
                  )}
                </button>

                {/* Tab: Users Storage & Archival */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('users_storage');
                    loadUsersStorageOverview();
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                    activeTab === 'users_storage'
                      ? 'bg-orange-50 text-[#F15A24] dark:bg-orange-950/50 dark:text-orange-400 border border-orange-200/60 dark:border-orange-900/50 shadow-2xs'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                  }`}
                >
                  <HardDrive className="w-4 h-4 shrink-0" />
                  <div className="flex-1">
                    <div>Users Storage</div>
                    <div className="text-[10px] font-normal text-neutral-400 dark:text-neutral-500">
                      Archive & Trash ZIP Exports
                    </div>
                  </div>
                  {activeTab === 'users_storage' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F15A24]" />
                  )}
                </button>
              </nav>
            </div>
          </div>

          {/* Admin User Profile footer */}
          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/50 text-[#F15A24] font-bold flex items-center justify-center text-xs shrink-0">
                {adminUser?.name?.[0] || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                  {adminUser?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-neutral-400 truncate">{adminUser?.email}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN VIEW CONTENT AREA */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl w-full">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 px-4 py-3 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-bold shadow-xl flex items-center gap-2 border border-white/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* TAB 1: MAILBOXES & USERS */}
          {activeTab === 'users' && (
            <>
              {/* Metrics Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
                    <span className="text-xs font-bold">Total Mailboxes</span>
                    <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                    {totalUsers}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">Configured accounts</p>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
                    <span className="text-xs font-bold">Active Accounts</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                      <UserCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                    {activeUsersCount}
                  </div>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-bold">
                    Ready for sign-in
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
                    <span className="text-xs font-bold">Locked Accounts</span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
                      <UserX className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                    {lockedUsersCount}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">Access suspended</p>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
                    <span className="text-xs font-bold">Allocated Storage</span>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
                      <HardDrive className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                    {totalAllocatedGb} <span className="text-sm font-normal text-neutral-400">GB</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {totalUsedMb >= 1024 ? `${(totalUsedMb / 1024).toFixed(2)} GB` : `${totalUsedMb.toFixed(1)} MB`} used ({((totalUsedGb / (totalAllocatedGb || 1)) * 100).toFixed(1)}%)
                  </p>
                </div>
              </div>

              {/* Mailboxes Directory Table Card */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
                {/* Action Toolbar */}
                <div className="p-4 sm:p-6 border-b border-neutral-100 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Search Bar */}
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, department, or title..."
                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#F15A24]/20 focus:border-[#F15A24] transition-all"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2">
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value as any)}
                        className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold cursor-pointer focus:outline-none"
                      >
                        <option value="all">All Roles</option>
                        <option value="standard">Standard</option>
                        <option value="admin">Administrator</option>
                      </select>

                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold cursor-pointer focus:outline-none"
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="locked">Locked</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={loadAdminData}
                      disabled={isLoading}
                      className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                      title="Refresh User List"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#F15A24]' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAddError(null);
                        setNewEmail('');
                        setNewName('');
                        setNewPassword('Playbook2026!');
                        setNewQuotaGb(2);
                        setNewRole('staff');
                        setNewImapHost('mail.playbook.com.ph');
                        setNewImapPort(993);
                        setNewImapEncryption('SSL/TLS');
                        setNewImapUsername('');
                        setNewImapPassword('');
                        setNewImapTestResult(null);
                        setNewUseSameSmtp(true);
                        setNewSmtpHost('mail.playbook.com.ph');
                        setNewSmtpPort(465);
                        setNewSmtpEncryption('SSL/TLS');
                        setNewSmtpUsername('');
                        setNewSmtpPassword('');
                        setNewSmtpTestResult(null);
                        setIsAddUserModalOpen(true);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#F15A24] hover:bg-[#D94E1B] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add New Mailbox</span>
                    </button>
                  </div>
                </div>

                {/* User Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50/75 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 uppercase text-[10px] font-bold border-b border-neutral-100 dark:border-neutral-800">
                      <tr>
                        <th className="py-3.5 px-4 sm:px-6">User / Account</th>
                        <th className="py-3.5 px-4">Email Address</th>
                        <th className="py-3.5 px-4">Role</th>
                        <th className="py-3.5 px-4">Storage Quota</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-neutral-400">
                            {isLoading
                              ? 'Loading user directory...'
                              : 'No mailbox accounts found matching your filters.'}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u, index) => {
                          const quotaMb = u.storageQuotaMb || 2048;
                          const usedMb = u.storageUsedMb || 0;
                          const percent = Math.min(100, Math.round((usedMb / quotaMb) * 100));
                          const isLocked = u.status === 'locked';

                          return (
                            <tr
                              key={`${u.id || u.email}-${index}`}
                              className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                            >
                              <td className="py-3.5 px-4 sm:px-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-neutral-700 dark:text-neutral-200 uppercase overflow-hidden shrink-0">
                                    {u.avatar ? (
                                      <img
                                        src={u.avatar}
                                        alt={u.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      u.name?.[0] || u.email[0]
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                      <span>{u.name || u.email.split('@')[0]}</span>
                                      {u.id === adminUser?.id && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-100 text-[#F15A24] dark:bg-orange-950/40 dark:text-orange-400 font-extrabold">
                                          YOU
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-neutral-400">
                                      {u.title || u.department || 'Team Member'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 font-mono text-neutral-700 dark:text-neutral-300">
                                {u.email}
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-1 items-start">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold capitalize border ${
                                      u.role === 'admin' || u.role === 'administrator'
                                        ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800'
                                        : 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                                    }`}
                                  >
                                    <Shield className="w-3 h-3" />
                                    {u.role === 'admin' || u.role === 'administrator' ? 'Administrator' : 'Standard'}
                                  </span>
                                  {(u.role === 'admin' || u.connectedToBluehost === false || u.connectionType === 'local') && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 whitespace-nowrap">
                                      Local (No Bluehost)
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="w-36 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">{formatStorageSize(usedMb)}</span>
                                    <span>{(quotaMb / 1024).toFixed(1)} GB</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        percent > 90
                                          ? 'bg-red-500'
                                          : percent > 70
                                          ? 'bg-amber-500'
                                          : 'bg-[#F15A24]'
                                      }`}
                                      style={{ width: `${Math.max(usedMb > 0 ? 2 : 0, percent)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    !isLocked
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
                                  }`}
                                >
                                  {!isLocked ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      Active
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3 h-3 text-red-600" />
                                      Locked
                                    </>
                                  )}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 sm:px-6 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLock(u)}
                                    disabled={u.id === adminUser?.id}
                                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                      isLocked
                                        ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30'
                                        : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/30'
                                    }`}
                                    title={isLocked ? 'Account is Locked (Click to Unlock)' : 'Account is Active/Unlocked (Click to Lock)'}
                                  >
                                    {!isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openEditModal(u)}
                                    className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-[#F15A24] transition-colors cursor-pointer"
                                    title="Edit User Settings"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    disabled={u.id === adminUser?.id}
                                    className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Delete Account"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: USERS STORAGE & EXPORTS */}
          {activeTab === 'users_storage' && (
            <div className="space-y-6">
              {/* Header Banner & Global Actions */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800/80 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center shrink-0 border border-orange-100 dark:border-orange-900/40">
                    <HardDrive className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                      Users Storage & Mailbox Archival
                    </h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400">Backup Engine Ready</span>
                      </div>
                      <span className="text-neutral-300 dark:text-neutral-700">·</span>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">RFC822 EML / JSON Compliant</span>
                    </div>
                  </div>
                </div>

                {/* Bulk Export & Refresh Actions */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={loadUsersStorageOverview}
                    disabled={isLoadingStorageOverview}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStorageOverview ? 'animate-spin text-[#F15A24]' : 'text-neutral-400'}`} />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportAllUsersZip('archive,trash')}
                    disabled={isBulkExporting}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-[#F15A24] hover:bg-[#d94a18] text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                    title="Download Archive & Trash Data for All Users into a ZIP"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isBulkExporting ? 'Packaging Archive...' : 'Download All Backup (ZIP)'}</span>
                  </button>
                </div>
              </div>

              {/* Side-by-Side Settings & Executive Analytics Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Column 1 to 7: Automated Sync & Rules */}
                <div className="lg:col-span-7 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800/80 p-6 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                          Automated Storage Sync & Auto-Purge
                        </h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          Scan Archive and Trash folders automatically to transfer backups and free up Bluehost server space.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] shrink-0 font-mono">
                        <span className={`w-2 h-2 rounded-full inline-block ${storageConfig.syncIntervalMinutes > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`}></span>
                        <span className="font-bold text-neutral-500 dark:text-neutral-400">
                          {storageConfig.syncIntervalMinutes > 0 ? `Active` : 'Manual'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Setting 1: Sync Frequency */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#F15A24]" />
                          Auto-Scan Frequency
                        </label>
                        <select
                          value={storageConfig.syncIntervalMinutes || 0}
                          onChange={(e) =>
                            setStorageConfig((prev) => ({
                              ...prev,
                              syncIntervalMinutes: Number(e.target.value),
                            }))
                          }
                          className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-[#F15A24] cursor-pointer"
                        >
                          <option value={0}>Manual Backup Only (Disabled)</option>
                          <option value={1}>Every 1 Minute (Debugging / Real-Time)</option>
                          <option value={60}>Every 1 Hour</option>
                          <option value={360}>Every 6 Hours</option>
                          <option value={720}>Every 12 Hours</option>
                          <option value={1440}>Every 24 Hours (Daily)</option>
                        </select>
                      </div>

                      {/* Setting 2: Auto Purge Checkbox */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5 text-[#F15A24]" />
                          Server Purge Action
                        </label>
                        <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800 cursor-pointer h-10 select-none">
                          <input
                            type="checkbox"
                            checked={storageConfig.deleteFromRemoteAfterSync || false}
                            onChange={(e) =>
                              setStorageConfig((prev) => ({
                                ...prev,
                                deleteFromRemoteAfterSync: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 mt-0.5 rounded text-[#F15A24] focus:ring-[#F15A24] cursor-pointer border-neutral-300"
                          />
                          <div className="text-[11px] leading-snug">
                            <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
                              Purge data after backup
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800/80">
                    <p className="text-[10px] text-neutral-400 max-w-sm">
                      * Remote data will only be deleted once the backup has been fully downloaded or verified on host storage.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSyncNow}
                        disabled={isSyncingStorage}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingStorage ? 'animate-spin text-[#F15A24]' : 'text-neutral-400'}`} />
                        <span>{isSyncingStorage ? 'Syncing...' : 'Sync Now'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveStorageConfig}
                        disabled={isSavingStorage}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-[#F15A24] hover:bg-[#d94a18] text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSavingStorage ? 'Saving...' : 'Save Settings'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column 8 to 12: Executive Analytics Card */}
                <div className="lg:col-span-5 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800/80 p-6 flex flex-col justify-between space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                      Executive Storage Summary
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono tabular-nums font-black text-4xl text-neutral-900 dark:text-white">
                        {totalUsedMb > 1024 ? `${(totalUsedMb / 1024).toFixed(2)}` : `${Math.round(totalUsedMb)}`}
                      </span>
                      <span className="text-lg font-bold text-neutral-500">
                        {totalUsedMb > 1024 ? 'GB' : 'MB'} Used
                      </span>
                    </div>

                    <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#F15A24] h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(2, (totalUsedMb / (totalAllocatedGb * 1024)) * 100))}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-100 dark:border-neutral-800/80">
                    <div className="space-y-1">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-bold">
                        Avg / Account
                      </span>
                      <span className="font-mono tabular-nums text-sm font-black text-neutral-900 dark:text-white">
                        {formatStorageSize(
                          usersStorageList.length > 0
                            ? totalUsedMb / usersStorageList.length
                            : users.length > 0
                            ? totalUsedMb / users.length
                            : 0
                        )}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider block font-bold">
                        Allocated Quota
                      </span>
                      <span className="font-mono tabular-nums text-sm font-black text-neutral-900 dark:text-white">
                        {totalAllocatedGb} GB
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800/80 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search users by name, email, department..."
                    value={storageSearchQuery}
                    onChange={(e) => setStorageSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:border-[#F15A24]"
                  />
                  {storageSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStorageSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500 shrink-0">
                    <Filter className="w-3.5 h-3.5" />
                    <span className="font-semibold">Filter:</span>
                  </div>
                  <select
                    value={storageFilter}
                    onChange={(e: any) => setStorageFilter(e.target.value)}
                    className="px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-[#F15A24] cursor-pointer font-bold"
                  >
                    <option value="all">All Accounts</option>
                    <option value="high_usage">High Usage (&gt;50%)</option>
                    <option value="low_usage">Low Usage (&lt;20%)</option>
                  </select>

                  <select
                    value={storageSort}
                    onChange={(e: any) => setStorageSort(e.target.value)}
                    className="px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-[#F15A24] cursor-pointer font-bold"
                  >
                    <option value="usage_desc">Sort: Highest Storage</option>
                    <option value="usage_asc">Sort: Lowest Storage</option>
                    <option value="name_asc">Sort: Name (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Users Storage & Export Management Table */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 font-extrabold uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4">User & Mailbox</th>
                        <th className="py-3 px-4">Disk Allocation</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {(() => {
                        const rawList = usersStorageList.length > 0 ? usersStorageList : users.map(u => ({
                          id: u.id,
                          email: u.email,
                          name: u.name,
                          role: u.role,
                          department: u.department,
                          avatar: u.avatar,
                          storageUsedMb: u.storageUsedMb || 120,
                          storageQuotaMb: (u.storageQuotaGb ? u.storageQuotaGb * 1024 : u.storageQuotaMb) || 2048,
                          archiveCount: 0,
                          archiveSizeMb: 0,
                          trashCount: 0,
                          trashSizeMb: 0,
                          inboxCount: 0,
                          sentCount: 0,
                          connectedToBluehost: u.connectedToBluehost,
                        }));

                        const filtered = rawList
                          .filter((u) => {
                            const q = storageSearchQuery.toLowerCase().trim();
                            const matchQuery = !q ||
                              (u.name && u.name.toLowerCase().includes(q)) ||
                              u.email.toLowerCase().includes(q) ||
                              (u.department && u.department.toLowerCase().includes(q));
                            if (!matchQuery) return false;

                            if (storageFilter === 'high_usage') {
                              return ((u.storageUsedMb || 0) / (u.storageQuotaMb || 2048)) > 0.5;
                            }
                            if (storageFilter === 'low_usage') {
                              return ((u.storageUsedMb || 0) / (u.storageQuotaMb || 2048)) < 0.2;
                            }
                            return true;
                          })
                          .sort((a, b) => {
                            if (storageSort === 'usage_desc') {
                              return (b.storageUsedMb || 0) - (a.storageUsedMb || 0);
                            }
                            if (storageSort === 'usage_asc') {
                              return (a.storageUsedMb || 0) - (b.storageUsedMb || 0);
                            }
                            if (storageSort === 'name_asc') {
                              return (a.name || a.email).localeCompare(b.name || b.email);
                            }
                            return 0;
                          });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-neutral-400">
                                <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-40 text-neutral-400" />
                                <p className="font-semibold">No user storage records found.</p>
                                <p className="text-[11px] mt-0.5">Try clearing your search query or filter.</p>
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map((u, index) => {
                          const usedMb = u.storageUsedMb || 0;
                          const quotaMb = u.storageQuotaMb || 2048;
                          const percent = Math.min(100, Math.round((usedMb / quotaMb) * 100));
                          const isExportingAll = exportingUserEmail === u.email;

                          return (
                            <tr key={`${u.id || u.email}-${index}`} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                              {/* User Info */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  {u.avatar ? (
                                    <img
                                      src={u.avatar}
                                      alt={u.name}
                                      className="w-10 h-10 rounded-full object-cover border border-neutral-100 dark:border-neutral-800 shrink-0 shadow-2xs"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-neutral-50 dark:bg-neutral-800 text-[#F15A24] font-black flex items-center justify-center text-xs shrink-0 border border-neutral-200 dark:border-neutral-700">
                                      {(u.name || u.email)[0].toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                                      <span className="truncate">{u.name || u.email.split('@')[0]}</span>
                                      {u.role === 'admin' && (
                                        <span className="text-[10px] text-[#F15A24] font-black tracking-wider uppercase">
                                          · Admin
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-neutral-400 font-mono truncate">
                                      {u.email}
                                    </div>
                                    {u.department && (
                                      <div className="text-[10px] text-neutral-400 mt-0.5">
                                        {u.department}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Disk Allocation with live sync icon */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-56 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                                      <span className="font-bold text-neutral-800 dark:text-neutral-200">
                                        {formatStorageSize(usedMb)}
                                      </span>
                                      <span className="text-neutral-400">
                                        / {(quotaMb / 1024).toFixed(1)} GB ({percent}%)
                                      </span>
                                    </div>
                                    <div className="w-full h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          percent > 85
                                            ? 'bg-red-500'
                                            : percent > 60
                                            ? 'bg-amber-500'
                                            : 'bg-[#F15A24]'
                                        }`}
                                        style={{ width: `${Math.max(usedMb > 0 ? 3 : 0, percent)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSyncUserStorage(u.email)}
                                    disabled={syncingUserEmail === u.email}
                                    className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                    title={`Fetch live mailbox storage from Bluehost for ${u.email}`}
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${syncingUserEmail === u.email ? 'animate-spin text-[#F15A24]' : 'text-neutral-400'}`} />
                                  </button>
                                </div>
                              </td>

                              {/* Actions Column */}
                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleExportUserZip(u.email, 'archive,trash', u.name)}
                                    disabled={exportingUserEmail === u.email}
                                    className="px-4 py-2 rounded-xl text-xs font-black border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                                    title={`Download Archive & Trash backup ZIP & permanently remove from Bluehost for ${u.email}`}
                                  >
                                    <Download className="w-3.5 h-3.5 text-[#F15A24]" />
                                    <span>{isExportingAll ? 'Downloading...' : 'Download Data (.zip)'}</span>
                                    {isExportingAll && <RefreshCw className="w-3 h-3 animate-spin text-[#F15A24]" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PHYSICAL DEVICE STORAGE */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              {/* PRIMARY PHYSICAL STORAGE SERVER CARD */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs space-y-6">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/50 text-[#F15A24] flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-900/60">
                    <HardDrive className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                        Physical Mail Storage Server: Local Host Device
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold border ${
                          storageConfig.enabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
                        }`}
                      >
                        {storageConfig.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                      Emails fetched via IMAP are downloaded and stored directly onto this physical machine's drive as RFC822 (.eml) archives to avoid remote mailbox quota charges.
                    </p>
                  </div>
                </div>

                <div className="border-t border-neutral-100 dark:border-neutral-800" />

                {/* Checkbox: Store all user mailbox data on this server */}
                <label className="flex items-center gap-3 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 cursor-pointer hover:border-orange-300 dark:hover:border-orange-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={storageConfig.enabled}
                    onChange={(e) =>
                      setStorageConfig((prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 rounded-md text-[#F15A24] focus:ring-[#F15A24] cursor-pointer accent-[#F15A24]"
                  />
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    Store all user mailbox data, attachments, and folders on this physical server/host computer
                  </span>
                </label>

                {/* Form Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Local Device Storage Path */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
                      Local Device Storage Path
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={storageConfig.storagePath}
                        onChange={(e) => {
                          setStorageConfig((prev) => ({
                            ...prev,
                            storagePath: e.target.value,
                          }));
                          setPathVerification(null);
                        }}
                        placeholder="./data/backups"
                        className="flex-1 px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:border-[#F15A24]"
                      />
                      <button
                        type="button"
                        onClick={handleTestStoragePath}
                        disabled={isTestingPath}
                        className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-bold cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isTestingPath ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F15A24]" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <span>Verify Path</span>
                        )}
                      </button>

                      {pathVerification && !pathVerification.exists && (
                        <button
                          type="button"
                          onClick={handleInitializeStoragePath}
                          disabled={isInitializingDir}
                          className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
                        >
                          {isInitializingDir ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Creating...</span>
                            </>
                          ) : (
                            <>
                              <FolderPlus className="w-3.5 h-3.5" />
                              <span>Create Directory</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      Server directory where raw emails (.eml) and attachments reside.
                    </p>
                  </div>

                  {/* Backup & Sync Mode */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
                      Backup & Sync Frequency
                    </label>
                    <select
                      value={storageConfig.syncIntervalMinutes}
                      onChange={(e) =>
                        setStorageConfig((prev) => ({
                          ...prev,
                          syncIntervalMinutes: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-bold text-neutral-900 dark:text-white focus:outline-none focus:border-[#F15A24] cursor-pointer"
                    >
                      <option value={0}>Manual Backup Only (Automatic Sync Disabled)</option>
                      <option value={1}>Automatic: Every 1 Minute</option>
                      <option value={5}>Automatic: Every 5 Minutes</option>
                      <option value={15}>Automatic: Every 15 Minutes</option>
                      <option value={30}>Automatic: Every 30 Minutes</option>
                      <option value={60}>Automatic: Every 1 Hour</option>
                    </select>
                    <p className="text-[11px] text-neutral-400">
                      {storageConfig.syncIntervalMinutes === 0
                        ? 'Manual mode is active. Automatic backups are disabled; use the "Run Manual Backup Now" button below to back up.'
                        : `Automated backup timer is active (runs every ${storageConfig.syncIntervalMinutes} minutes).`}
                    </p>
                  </div>
                </div>

                {/* Path Verification Detailed Result Feedback */}
                {pathVerification && (
                  <div
                    className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                      pathVerification.success
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : pathVerification.status === 'missing'
                        ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    {pathVerification.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : pathVerification.status === 'missing' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="font-bold text-sm flex items-center justify-between">
                        <span>
                          {pathVerification.success
                            ? 'Physical Storage Path Verified (Active / Writable)'
                            : pathVerification.status === 'missing'
                            ? 'Storage Path Does Not Exist'
                            : pathVerification.status === 'not_directory'
                            ? 'Specified Path Is Not a Directory'
                            : 'Storage Path Verification Failed'}
                        </span>
                        {pathVerification.exists && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 font-semibold">
                            Directory Exists
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed">{pathVerification.message}</p>
                      {pathVerification.resolvedPath && (
                        <div className="text-[11px] font-mono opacity-85 break-all pt-1">
                          <strong>Resolved Path:</strong> {pathVerification.resolvedPath}
                        </div>
                      )}
                      {pathVerification.realDiskTotalGb !== undefined && (
                        <div className="text-[11px] flex items-center gap-3 pt-0.5 opacity-90">
                          <span>
                            <strong>Drive Capacity:</strong> {pathVerification.realDiskTotalGb} GB
                          </span>
                          <span>
                            <strong>Free Space:</strong> {pathVerification.realDiskFreeGb} GB
                          </span>
                        </div>
                      )}
                      {pathVerification.error && (
                        <div className="text-[11px] font-mono text-red-700 dark:text-red-300 mt-1 bg-red-100/50 dark:bg-red-900/30 p-2 rounded-lg">
                          {pathVerification.error}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Secondary Option: Quota Saver */}
                <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/40 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storageConfig.autoArchiveOnLocal}
                      onChange={(e) =>
                        setStorageConfig((prev) => ({
                          ...prev,
                          autoArchiveOnLocal: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded text-[#F15A24] focus:ring-[#F15A24] cursor-pointer accent-[#F15A24]"
                    />
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Auto-index and store messages on local disk upon receipt
                    </span>
                  </label>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pl-7">
                    Downloads raw MIME content directly to physical drive to eliminate reliance on Bluehost mailbox quotas.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSyncNow}
                      disabled={isSyncingStorage}
                      className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <FolderSync className={`w-4 h-4 text-[#F15A24] ${isSyncingStorage ? 'animate-spin' : ''}`} />
                      <span>{isSyncingStorage ? 'Backing Up to Drive...' : 'Run Manual Backup Now'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSyncBluehostStorage}
                      disabled={isSyncingBluehost}
                      className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <RefreshCw className={`w-4 h-4 text-[#F15A24] ${isSyncingBluehost ? 'animate-spin' : ''}`} />
                      <span>{isSyncingBluehost ? 'Syncing Bluehost...' : 'Sync Bluehost Storage'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadZip}
                      className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
                      title="Export complete mail repository as a ZIP file"
                    >
                      <Download className="w-4 h-4 text-blue-500" />
                      <span>Export All Mail (.ZIP)</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveStorageConfig}
                    disabled={isSavingStorage}
                    className="px-5 py-2.5 rounded-xl bg-[#F15A24] hover:bg-[#D94E1B] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingStorage ? 'Saving...' : 'Save Physical Storage Settings'}</span>
                  </button>
                </div>
              </div>

              {/* LIVE PHYSICAL DRIVE CAPACITY & HEALTH STATS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-2">
                    <span className="text-xs font-bold">Physical Host Capacity</span>
                    <HardDrive className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black text-neutral-900 dark:text-white">
                    {storageStats?.totalDiskCapacityGb || 0} <span className="text-xs font-normal text-neutral-400">GB</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 font-mono truncate">
                    {storageStats?.freeDiskSpaceGb || 0} GB free space available on drive
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-2">
                    <span className="text-xs font-bold">Mail Data On Local Disk</span>
                    <Database className="w-4 h-4 text-[#F15A24]" />
                  </div>
                  <div className="text-2xl font-black text-neutral-900 dark:text-white">
                    {storageStats?.usedByMailStorageMb !== undefined ? storageStats.usedByMailStorageMb : 0}{' '}
                    <span className="text-xs font-normal text-neutral-400">MB</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {storageStats?.storedEmailsCount || 0} EML messages saved & indexed
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
                  <div className="flex items-center justify-between text-neutral-500 mb-2">
                    <span className="text-xs font-bold">Drive I/O Status</span>
                    {storageStats?.isWritable ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div
                    className={`text-2xl font-black flex items-center gap-1.5 ${
                      storageStats?.isWritable
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    <span>{storageStats?.isWritable ? 'Verified' : 'Ready'}</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 font-mono truncate">
                    {storageStats?.storagePath || storageConfig.storagePath}
                  </p>
                </div>
              </div>

              {/* RECENT SYNC REPORT CARD */}
              {syncReport && (
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                        Latest Synchronization Execution Report
                      </h3>
                    </div>
                    <span className="text-xs text-neutral-400 font-mono">
                      {new Date(syncReport.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-400 font-semibold">Synced Accounts</div>
                      <div className="text-lg font-black text-neutral-900 dark:text-white mt-0.5">
                        {syncReport.syncedAccounts} / {syncReport.totalAccounts}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-400 font-semibold">Messages Stored</div>
                      <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {syncReport.totalEmailsStored} EMLs
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-400 font-semibold">Data Written</div>
                      <div className="text-lg font-black text-neutral-900 dark:text-white mt-0.5">
                        {(syncReport.totalBytesWritten / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                      <div className="text-[11px] text-neutral-400 font-semibold">Execution Time</div>
                      <div className="text-lg font-black text-neutral-900 dark:text-white mt-0.5">
                        {(syncReport.durationMs / 1000).toFixed(2)}s
                      </div>
                    </div>
                  </div>

                  {syncReport.details && syncReport.details.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        Account Sync Details:
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs">
                        {syncReport.details.map((d, i) => (
                          <div
                            key={i}
                            className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between text-[11px]"
                          >
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200">{d.email}</span>
                            <span className="text-neutral-500">
                              {d.emailsStored} emails written ({(d.bytesWritten / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LOCAL DISK MAIL EXPLORER */}
              <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-[#F15A24]" />
                      <span>Local Disk Mail Explorer (Physical Storage Drive)</span>
                    </h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Explore and inspect stored RFC822 .eml emails and metadata on the host filesystem
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadDiskFiles(currentBrowseDir)}
                      disabled={isLoadingFiles}
                      className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin text-[#F15A24]' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadZip}
                      className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:opacity-90"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Archive</span>
                    </button>
                  </div>
                </div>

                {/* Directory Navigation Breadcrumb */}
                <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center gap-1.5 text-xs font-mono overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => loadDiskFiles('')}
                    className="text-[#F15A24] font-bold hover:underline cursor-pointer shrink-0"
                  >
                    Root ({storageConfig.storagePath})
                  </button>
                  {currentBrowseDir && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="text-neutral-700 dark:text-neutral-300 font-bold shrink-0">
                        {currentBrowseDir}
                      </span>
                    </>
                  )}
                </div>

                {/* Files and Folders Listing */}
                <div className="overflow-x-auto border border-neutral-100 dark:border-neutral-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50/80 dark:bg-neutral-800/60 text-neutral-500 font-bold uppercase tracking-wider text-[10px] border-b border-neutral-200/60 dark:border-neutral-700/60">
                      <tr>
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4">Size</th>
                        <th className="py-2.5 px-4">Modified</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono">
                      {isLoadingFiles ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-neutral-400">
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-[#F15A24]" />
                              <span>Scanning disk directory...</span>
                            </div>
                          </td>
                        </tr>
                      ) : diskFiles.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-neutral-400">
                            <p className="font-sans">No files or folders in this directory yet.</p>
                            <p className="text-[11px] font-sans text-neutral-500 mt-1">
                              Click "Sync & Store All Mailboxes Now" above to write incoming emails to this path.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        diskFiles.map((file, i) => {
                          const isDir = file.type === 'directory';
                          const isEml = file.name.endsWith('.eml');
                          return (
                            <tr
                              key={file.relativePath || file.name || i}
                              className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                            >
                              <td className="py-3 px-4 font-bold flex items-center gap-2">
                                {isDir ? (
                                  <Folder className="w-4 h-4 text-[#F15A24] shrink-0" />
                                ) : isEml ? (
                                  <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                                )}
                                {isDir ? (
                                  <button
                                    type="button"
                                    onClick={() => loadDiskFiles(file.path)}
                                    className="text-left text-[#F15A24] hover:underline cursor-pointer truncate max-w-xs sm:max-w-md"
                                  >
                                    {file.name}/
                                  </button>
                                ) : (
                                  <span className="text-neutral-800 dark:text-neutral-200 truncate max-w-xs sm:max-w-md">
                                    {file.name}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 uppercase text-[10px] text-neutral-400">
                                {file.type}
                              </td>
                              <td className="py-3 px-4 text-neutral-500">
                                {isDir ? '-' : `${(file.sizeBytes / 1024).toFixed(1)} KB`}
                              </td>
                              <td className="py-3 px-4 text-neutral-400 text-[11px]">
                                {new Date(file.modifiedAt).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {!isDir && (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleViewFile(file.path)}
                                      className="px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-300 text-[11px] font-bold cursor-pointer transition-colors"
                                      title="Inspect raw email/file source"
                                    >
                                      Inspect
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadFile(file.path, file.name)}
                                      className="p-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-300 cursor-pointer transition-colors"
                                      title="Download File"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD NEW USER */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 my-8">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Add New Mailbox Account
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Configure user profile, Incoming (IMAP) & Outgoing (SMTP) servers
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 mx-5 mt-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddUser} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Account Credentials */}
              <div className="space-y-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
                  User Account Information
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      if (!newImapUsername) setNewImapUsername(e.target.value);
                      if (!newSmtpUsername) setNewSmtpUsername(e.target.value);
                    }}
                    placeholder="username@playbook.com.ph"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Display Name *
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="John Doe"
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Role
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold focus:outline-none focus:border-[#F15A24]"
                    >
                      <option value="standard">Standard</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Storage Quota (GB)
                    </label>
                    <input
                      type="number"
                      value={newQuotaGb}
                      onChange={(e) => setNewQuotaGb(Number(e.target.value))}
                      min={0.5}
                      step={0.5}
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Webmail Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (!newImapPassword) setNewImapPassword(e.target.value);
                          if (!newSmtpPassword) setNewSmtpPassword(e.target.value);
                        }}
                        placeholder="Enter password"
                        required
                        className="w-full px-3.5 py-2 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Incoming Mail Server (IMAP) Configuration */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#F15A24]" />
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Incoming Mail Server (IMAP)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-900/40">
                    Incoming
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      IMAP Host
                    </label>
                    <input
                      type="text"
                      value={newImapHost}
                      onChange={(e) => setNewImapHost(e.target.value)}
                      placeholder="mail.playbook.com.ph"
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      IMAP Port
                    </label>
                    <input
                      type="number"
                      value={newImapPort}
                      onChange={(e) => setNewImapPort(Number(e.target.value))}
                      placeholder="993"
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      IMAP Username
                    </label>
                    <input
                      type="text"
                      value={newImapUsername}
                      onChange={(e) => setNewImapUsername(e.target.value)}
                      placeholder={newEmail || 'user@playbook.com.ph'}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Security Protocol
                    </label>
                    <select
                      value={newImapEncryption}
                      onChange={(e) => {
                        const val = e.target.value as 'SSL/TLS' | 'STARTTLS';
                        setNewImapEncryption(val);
                        if (val === 'SSL/TLS' && newImapPort === 143) setNewImapPort(993);
                        if (val === 'STARTTLS' && newImapPort === 993) setNewImapPort(143);
                      }}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold focus:outline-none focus:border-[#F15A24]"
                    >
                      <option value="SSL/TLS">SSL/TLS (Port 993)</option>
                      <option value="STARTTLS">STARTTLS (Port 143)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    IMAP Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewImapPassword ? 'text' : 'password'}
                      value={newImapPassword}
                      onChange={(e) => setNewImapPassword(e.target.value)}
                      placeholder={newPassword ? '(Uses webmail password)' : 'Enter IMAP password'}
                      className="w-full px-3.5 py-2 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewImapPassword(!showNewImapPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      {showNewImapPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* IMAP Test Connection Feedback */}
                {newImapTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                      newImapTestResult.success
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    {newImapTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="font-bold">{newImapTestResult.message}</div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleTestNewImap}
                    disabled={isTestingNewImap}
                    className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingNewImap ? 'animate-spin text-[#F15A24]' : ''}`} />
                    <span>{isTestingNewImap ? 'Testing IMAP...' : 'Test IMAP (Incoming)'}</span>
                  </button>
                </div>
              </div>

              {/* Outgoing Mail Server (SMTP) Configuration */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-[#F15A24]" />
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Outgoing Mail Server (SMTP)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-bold border border-purple-200 dark:border-purple-900/40">
                    Outgoing
                  </span>
                </div>

                {/* Same credentials toggle */}
                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newUseSameSmtp}
                    onChange={(e) => setNewUseSameSmtp(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 text-[#F15A24] focus:ring-[#F15A24]"
                  />
                  <span>Use same server and credentials as Incoming (IMAP)</span>
                </label>

                {!newUseSameSmtp && (
                  <div className="space-y-3 pl-2 border-l-2 border-orange-200 dark:border-orange-900/40">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={newSmtpHost}
                          onChange={(e) => setNewSmtpHost(e.target.value)}
                          placeholder="mail.playbook.com.ph"
                          required
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          SMTP Port
                        </label>
                        <input
                          type="number"
                          value={newSmtpPort}
                          onChange={(e) => setNewSmtpPort(Number(e.target.value))}
                          placeholder="465"
                          required
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          SMTP Username
                        </label>
                        <input
                          type="text"
                          value={newSmtpUsername}
                          onChange={(e) => setNewSmtpUsername(e.target.value)}
                          placeholder={newEmail || 'user@playbook.com.ph'}
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Security Protocol
                        </label>
                        <select
                          value={newSmtpEncryption}
                          onChange={(e) => {
                            const val = e.target.value as 'SSL/TLS' | 'STARTTLS';
                            setNewSmtpEncryption(val);
                            if (val === 'SSL/TLS' && newSmtpPort === 587) setNewSmtpPort(465);
                            if (val === 'STARTTLS' && newSmtpPort === 465) setNewSmtpPort(587);
                          }}
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold focus:outline-none focus:border-[#F15A24]"
                        >
                          <option value="SSL/TLS">SSL/TLS (Port 465)</option>
                          <option value="STARTTLS">STARTTLS (Port 587)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        SMTP Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewSmtpPassword ? 'text' : 'password'}
                          value={newSmtpPassword}
                          onChange={(e) => setNewSmtpPassword(e.target.value)}
                          placeholder="Enter SMTP password"
                          className="w-full px-3.5 py-2 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewSmtpPassword(!showNewSmtpPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                        >
                          {showNewSmtpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SMTP Test Connection Feedback */}
                {newSmtpTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                      newSmtpTestResult.success
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    {newSmtpTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="font-bold">{newSmtpTestResult.message}</div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleTestNewSmtp}
                    disabled={isTestingNewSmtp}
                    className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingNewSmtp ? 'animate-spin text-[#F15A24]' : ''}`} />
                    <span>{isTestingNewSmtp ? 'Testing SMTP...' : 'Test SMTP (Outgoing)'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F15A24] hover:bg-[#D94E1B] text-white flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingUser ? 'Creating...' : 'Create Mailbox'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 my-8">
            <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Edit Mailbox Settings
                  </h3>
                  <p className="text-[11px] text-neutral-400 font-mono">{editingUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 mx-5 mt-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Account Information */}
              <div className="space-y-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
                  User Account Information
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Role
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as any)}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold focus:outline-none focus:border-[#F15A24]"
                    >
                      <option value="standard">Standard</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Storage Quota (GB)
                    </label>
                    <input
                      type="number"
                      value={editQuotaGb}
                      onChange={(e) => setEditQuotaGb(Number(e.target.value))}
                      min={0.5}
                      step={0.5}
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Reset Webmail Password
                    </label>
                    <div className="relative">
                      <input
                        type={showEditPassword ? 'text' : 'password'}
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Leave unchanged or enter new password"
                        className="w-full px-3.5 py-2 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPassword(!showEditPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                      >
                        {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Incoming Mail Server (IMAP) Configuration */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#F15A24]" />
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Incoming Mail Server (IMAP)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-900/40">
                    Incoming
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      IMAP Host
                    </label>
                    <input
                      type="text"
                      value={editImapHost}
                      onChange={(e) => setEditImapHost(e.target.value)}
                      placeholder="mail.playbook.com.ph"
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      IMAP Port
                    </label>
                    <input
                      type="number"
                      value={editImapPort}
                      onChange={(e) => setEditImapPort(Number(e.target.value))}
                      placeholder="993"
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      IMAP Username
                    </label>
                    <input
                      type="text"
                      value={editImapUsername}
                      onChange={(e) => setEditImapUsername(e.target.value)}
                      placeholder={editEmail}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Security Protocol
                    </label>
                    <select
                      value={editImapEncryption}
                      onChange={(e) => {
                        const val = e.target.value as 'SSL/TLS' | 'STARTTLS';
                        setEditImapEncryption(val);
                        if (val === 'SSL/TLS' && editImapPort === 143) setEditImapPort(993);
                        if (val === 'STARTTLS' && editImapPort === 993) setEditImapPort(143);
                      }}
                      className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold focus:outline-none focus:border-[#F15A24]"
                    >
                      <option value="SSL/TLS">SSL/TLS (Port 993)</option>
                      <option value="STARTTLS">STARTTLS (Port 143)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    IMAP Password
                  </label>
                  <div className="relative">
                    <input
                      type={showEditImapPassword ? 'text' : 'password'}
                      value={editImapPassword}
                      onChange={(e) => setEditImapPassword(e.target.value)}
                      placeholder={editPassword ? '(Uses webmail password)' : 'Enter IMAP password'}
                      className="w-full px-3.5 py-2 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditImapPassword(!showEditImapPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      {showEditImapPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* IMAP Test Connection Feedback */}
                {editImapTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                      editImapTestResult.success
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    {editImapTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="font-bold">{editImapTestResult.message}</div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleTestEditImap}
                    disabled={isTestingEditImap}
                    className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingEditImap ? 'animate-spin text-[#F15A24]' : ''}`} />
                    <span>{isTestingEditImap ? 'Testing IMAP...' : 'Test IMAP (Incoming)'}</span>
                  </button>
                </div>
              </div>

              {/* Outgoing Mail Server (SMTP) Configuration */}
              <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-[#F15A24]" />
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Outgoing Mail Server (SMTP)
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-bold border border-purple-200 dark:border-purple-900/40">
                    Outgoing
                  </span>
                </div>

                {/* Same credentials toggle */}
                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editUseSameSmtp}
                    onChange={(e) => setEditUseSameSmtp(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 text-[#F15A24] focus:ring-[#F15A24]"
                  />
                  <span>Use same server and credentials as Incoming (IMAP)</span>
                </label>

                {!editUseSameSmtp && (
                  <div className="space-y-3 pl-2 border-l-2 border-orange-200 dark:border-orange-900/40">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={editSmtpHost}
                          onChange={(e) => setEditSmtpHost(e.target.value)}
                          placeholder="mail.playbook.com.ph"
                          required
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          SMTP Port
                        </label>
                        <input
                          type="number"
                          value={editSmtpPort}
                          onChange={(e) => setEditSmtpPort(Number(e.target.value))}
                          placeholder="465"
                          required
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          SMTP Username
                        </label>
                        <input
                          type="text"
                          value={editSmtpUsername}
                          onChange={(e) => setEditSmtpUsername(e.target.value)}
                          placeholder={editEmail}
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                          Security Protocol
                        </label>
                        <select
                          value={editSmtpEncryption}
                          onChange={(e) => {
                            const val = e.target.value as 'SSL/TLS' | 'STARTTLS';
                            setEditSmtpEncryption(val);
                            if (val === 'SSL/TLS' && editSmtpPort === 587) setEditSmtpPort(465);
                            if (val === 'STARTTLS' && editSmtpPort === 465) setEditSmtpPort(587);
                          }}
                          className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold focus:outline-none focus:border-[#F15A24]"
                        >
                          <option value="SSL/TLS">SSL/TLS (Port 465)</option>
                          <option value="STARTTLS">STARTTLS (Port 587)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        SMTP Password
                      </label>
                      <div className="relative">
                        <input
                          type={showEditSmtpPassword ? 'text' : 'password'}
                          value={editSmtpPassword}
                          onChange={(e) => setEditSmtpPassword(e.target.value)}
                          placeholder="Enter SMTP password"
                          className="w-full px-3.5 py-2 pr-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-mono focus:outline-none focus:border-[#F15A24]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEditSmtpPassword(!showEditSmtpPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                        >
                          {showEditSmtpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SMTP Test Connection Feedback */}
                {editSmtpTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                      editSmtpTestResult.success
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    {editSmtpTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="font-bold">{editSmtpTestResult.message}</div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleTestEditSmtp}
                    disabled={isTestingEditSmtp}
                    className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingEditSmtp ? 'animate-spin text-[#F15A24]' : ''}`} />
                    <span>{isTestingEditSmtp ? 'Testing SMTP...' : 'Test SMTP (Outgoing)'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#F15A24] hover:bg-[#D94E1B] text-white flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingUser ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RAW FILE / EML CONTENT INSPECTOR MODAL */}
      {viewingFileContent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 my-8 flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                    {viewingFileContent.name}
                  </h3>
                  <p className="text-[11px] text-neutral-400 font-mono truncate">
                    {viewingFileContent.path} ({(viewingFileContent.sizeBytes / 1024).toFixed(1)} KB)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadFile(viewingFileContent.path, viewingFileContent.name)
                  }
                  className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingFileContent(null)}
                  className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-neutral-950 text-neutral-200 font-mono text-xs leading-relaxed select-text whitespace-pre-wrap break-all">
              {viewingFileContent.content}
            </div>

            <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 shrink-0 bg-neutral-50 dark:bg-neutral-900">
              <span>RFC822 MIME Content / Metadata</span>
              <button
                type="button"
                onClick={() => setViewingFileContent(null)}
                className="px-4 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 text-neutral-800 dark:text-neutral-200 font-bold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                {confirmDialog.title}
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                {confirmDialog.message}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-xs"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
