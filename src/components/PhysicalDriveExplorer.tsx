import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileCheck,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
  HardDrive,
  Mail,
  RefreshCw,
  Search,
  Server,
  Shield,
  X,
  Cpu,
  Activity,
} from 'lucide-react';
import {
  PhysicalStorageConfig,
  PhysicalStorageSyncReport,
  PhysicalStorageStats,
  PhysicalStorageVerificationResult,
  StoredFileInfo,
  User,
} from '../types';
import { safeJson } from '../lib/api';

interface PhysicalDriveExplorerProps {
  currentUser: User;
  token: string;
  onShowToast: (msg: string) => void;
  onSwitchToMail?: () => void;
  onSwitchToAdmin?: () => void;
}

export const PhysicalDriveExplorer: React.FC<PhysicalDriveExplorerProps> = ({
  currentUser,
  token,
  onShowToast,
  onSwitchToMail,
  onSwitchToAdmin,
}) => {
  const [storageConfig, setStorageConfig] = useState<PhysicalStorageConfig>({
    enabled: true,
    storagePath: './data/backups',
    syncIntervalMinutes: 5,
    autoArchiveOnLocal: true,
    deleteFromRemoteAfterSync: false,
    deviceLabel: 'Local Host Device',
    status: 'active',
  });

  const [storageStats, setStorageStats] = useState<PhysicalStorageStats | null>(null);
  const [pathVerification, setPathVerification] = useState<PhysicalStorageVerificationResult | null>(null);
  const [isTestingPath, setIsTestingPath] = useState(false);
  const [isInitializingDir, setIsInitializingDir] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<PhysicalStorageSyncReport | null>(null);
  const [diskFiles, setDiskFiles] = useState<StoredFileInfo[]>([]);
  const [currentBrowseDir, setCurrentBrowseDir] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [viewingFile, setViewingFile] = useState<{
    path: string;
    name: string;
    content: string;
    sizeBytes: number;
  } | null>(null);

  // Load storage configuration and disk stats
  const fetchStorageData = async () => {
    try {
      const res = await fetch('/api/admin/physical-storage', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await safeJson(res);
      if (data.success) {
        if (data.config) setStorageConfig(data.config);
        if (data.stats) setStorageStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load storage config:', err);
    }
  };

  // Load files in directory
  const loadFiles = async (subDir: string = '') => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch(
        `/api/admin/physical-storage/files?path=${encodeURIComponent(subDir)}`,
        {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }
      );
      const data = await safeJson(res);
      if (data.success && Array.isArray(data.files)) {
        setDiskFiles(data.files);
        setCurrentBrowseDir(subDir);
      } else {
        setDiskFiles([]);
      }
    } catch (err) {
      console.error('Failed to list disk files:', err);
      setDiskFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchStorageData();
    loadFiles('');
  }, []);

  // Strict verification of storage path
  const handleVerifyPath = async () => {
    setIsTestingPath(true);
    setPathVerification(null);
    try {
      const res = await fetch('/api/admin/physical-storage/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ storagePath: storageConfig.storagePath }),
      });
      const data: PhysicalStorageVerificationResult = await safeJson(res);
      setPathVerification(data);
      if (data.success) {
        onShowToast('Physical storage path verified and accessible.');
        fetchStorageData();
      } else if (data.status === 'missing') {
        onShowToast('Storage path does not exist on server.');
      } else {
        onShowToast('Verification error: ' + (data.message || 'Check path permissions.'));
      }
    } catch (err: any) {
      setPathVerification({
        success: false,
        exists: false,
        isDirectory: false,
        readable: false,
        writable: false,
        isWritable: false,
        status: 'error',
        resolvedPath: storageConfig.storagePath,
        message: err.message || 'Network error verifying path',
      });
    } finally {
      setIsTestingPath(false);
    }
  };

  // Dedicated directory initialization
  const handleInitializeDirectory = async () => {
    setIsInitializingDir(true);
    try {
      const res = await fetch('/api/admin/physical-storage/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ storagePath: storageConfig.storagePath }),
      });
      const data: PhysicalStorageVerificationResult = await safeJson(res);
      setPathVerification(data);
      if (data.success) {
        onShowToast('Storage directory created and verified successfully.');
        fetchStorageData();
        loadFiles('');
      } else {
        onShowToast('Creation failed: ' + (data.message || data.error || 'Permission denied'));
      }
    } catch (err: any) {
      onShowToast('Network error creating directory: ' + err.message);
    } finally {
      setIsInitializingDir(false);
    }
  };

  // Sync emails from IMAP to local disk
  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      const res = await fetch('/api/admin/physical-storage/sync-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await safeJson(res);
      if (data.success && data.report) {
        setSyncReport(data.report);
        if (data.stats) setStorageStats(data.stats);
        onShowToast(`Successfully stored ${data.report.emailsStored} emails to local drive!`);
        loadFiles(currentBrowseDir);
      } else {
        onShowToast(data.message || data.error || 'Sync failed.');
      }
    } catch (err: any) {
      onShowToast('Network error during synchronization.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Inspect raw EML file content
  const handleInspectFile = async (filePath: string) => {
    try {
      const res = await fetch(
        `/api/admin/physical-storage/file-content?path=${encodeURIComponent(filePath)}`,
        {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }
      );
      const data = await safeJson(res);
      if (data.success && data.content !== undefined) {
        setViewingFile({
          path: data.path,
          name: data.name,
          content: data.content,
          sizeBytes: data.sizeBytes,
        });
      } else {
        onShowToast(data.error || 'Could not read file content');
      }
    } catch (err: any) {
      onShowToast('Error opening file: ' + err.message);
    }
  };

  // Download a single file
  const handleDownloadFile = (filePath: string, fileName: string) => {
    const downloadUrl = `/api/admin/physical-storage/file-content?path=${encodeURIComponent(
      filePath
    )}&download=true`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onShowToast(`Downloading ${fileName}...`);
  };

  // Download entire mail repository ZIP
  const handleDownloadZip = async () => {
    try {
      onShowToast('Preparing full mail archive ZIP download...');
      const res = await fetch('/api/admin/physical-storage/download-zip', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const errData = await safeJson(res);
        onShowToast(errData.error || 'No archived mail is available to export.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jw_webmail_physical_backup_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onShowToast('Mail backup ZIP downloaded successfully.');
    } catch (err: any) {
      onShowToast('Download failed: ' + err.message);
    }
  };

  const filteredFiles = diskFiles.filter((f) =>
    f.name.toLowerCase().includes(fileSearchQuery.toLowerCase().trim())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-100 dark:bg-[#0B0D12] text-neutral-900 dark:text-neutral-100 overflow-y-auto transition-colors">
      {/* Top Banner / Header */}
      <div className="bg-white dark:bg-[#12151E] border-b border-orange-200/90 dark:border-neutral-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 shadow-2xs">
        <div className="flex items-center gap-3">
          {onSwitchToMail && (
            <button
              type="button"
              onClick={onSwitchToMail}
              className="p-2 rounded-xl text-neutral-600 dark:text-neutral-300 hover:text-[#F15A24] dark:hover:text-[#F15A24] hover:bg-orange-50 dark:hover:bg-orange-950/40 border border-neutral-200 dark:border-neutral-700 transition-colors cursor-pointer"
              title="Return to Webmail"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center border border-orange-200 dark:border-orange-900/50 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-neutral-900 dark:text-white">
                Physical Device Mail Storage Drive
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Host File Store
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">
              Target Path: {storageConfig.storagePath}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-[#F15A24] hover:bg-[#D94E1B] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <FolderSync className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing to Drive...' : 'Sync Mail to Drive Now'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadZip}
            className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181C26] hover:bg-neutral-50 dark:hover:bg-[#202533] text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Download full backup zip"
          >
            <Download className="w-4 h-4 text-blue-500" />
            <span>Export ZIP</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* PHYSICAL DISK CAPACITY & STATS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-bold">Physical Host Capacity</span>
              <HardDrive className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-neutral-900 dark:text-white">
              {storageStats?.totalDiskCapacityGb || 0}{' '}
              <span className="text-xs font-normal text-neutral-400">GB</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1 font-mono truncate">
              {storageStats?.freeDiskSpaceGb || 0} GB free space on drive
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-bold">Stored Messages on Disk</span>
              <Mail className="w-4 h-4 text-[#F15A24]" />
            </div>
            <div className="text-2xl font-black text-neutral-900 dark:text-white">
              {storageStats?.storedEmailsCount || 0}{' '}
              <span className="text-xs font-normal text-neutral-400">EML</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Raw RFC822 email files saved
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-bold">Local Disk Data Size</span>
              <Database className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-neutral-900 dark:text-white">
              {storageStats?.usedByMailStorageMb !== undefined
                ? storageStats.usedByMailStorageMb
                : 0}{' '}
              <span className="text-xs font-normal text-neutral-400">MB</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Used by mail archive files
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151E] border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-bold">Drive I/O Health</span>
              {storageStats?.isWritable ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              )}
            </div>
            <div
              className={`text-2xl font-black ${
                storageStats?.isWritable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {storageStats?.isWritable ? 'Verified' : 'Unverified'}
            </div>
            <p className="text-[11px] text-neutral-400 mt-1 font-mono truncate">
              Path: {storageConfig.storagePath}
            </p>
          </div>
        </div>

        {/* VERIFICATION & PATH TEST CONTROL */}
        <div className="bg-white dark:bg-[#12151E] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#F15A24] flex items-center justify-center">
                <FileCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Drive Storage Path & Permissions Verification
                </h3>
                <p className="text-xs text-neutral-400">
                  Performs real filesystem read, write, and directory check operations on the host OS
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleVerifyPath}
                disabled={isTestingPath}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#181C26] hover:bg-neutral-100 dark:hover:bg-[#202533] text-neutral-800 dark:text-neutral-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isTestingPath ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F15A24]" />
                    <span>Verifying Drive...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verify Path</span>
                  </>
                )}
              </button>

              {pathVerification && !pathVerification.exists && (
                <button
                  type="button"
                  onClick={handleInitializeDirectory}
                  disabled={isInitializingDir}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isInitializingDir ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Create / Initialize Directory</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {pathVerification && (
            <div
              className={`p-4 rounded-xl text-xs flex items-start gap-3 border animate-in fade-in ${
                pathVerification.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/60'
                  : pathVerification.status === 'missing'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/60'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 border-red-200 dark:border-red-800/60'
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
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold">
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
                  <div className="text-[11px] flex items-center gap-4 pt-0.5 opacity-90">
                    <span>
                      <strong>Total Disk:</strong> {pathVerification.realDiskTotalGb} GB
                    </span>
                    <span>
                      <strong>Free Space:</strong> {pathVerification.realDiskFreeGb} GB
                    </span>
                  </div>
                )}
                {pathVerification.error && (
                  <div className="text-[11px] font-mono text-red-700 dark:text-red-300 mt-1 bg-red-100/50 dark:bg-red-950/60 p-2 rounded-lg">
                    {pathVerification.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ENVIRONMENT & SCHEDULER MONITORING */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Scheduler Status */}
          <div className="bg-white dark:bg-[#12151E] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#F15A24]" />
                IMAP Synchronization Worker
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  storageStats?.scheduler?.schedulerEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {storageStats?.scheduler?.schedulerEnabled ? 'Active Worker' : 'Disabled'}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400">Sync Interval:</span>
                <span className="font-bold">Every {storageConfig.syncIntervalMinutes} Minute(s)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400">Next Scheduled Sync:</span>
                <span className="font-mono text-[11px]">
                  {storageStats?.scheduler?.nextScheduledSync
                    ? new Date(storageStats.scheduler.nextScheduledSync).toLocaleTimeString()
                    : 'Manual Only'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400">Last Sync Status:</span>
                <span className="font-bold capitalize">
                  {storageStats?.scheduler?.lastSyncStatus || 'idle'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500 dark:text-neutral-400">Messages Archived:</span>
                <span className="font-bold text-[#F15A24]">
                  {storageStats?.storedEmailsCount || 0} EML files
                </span>
              </div>
            </div>
          </div>

          {/* Environment & Backup Agent */}
          <div className="bg-white dark:bg-[#12151E] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500" />
                Runtime & Backup Agent
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  storageStats?.environment?.backupAgent?.connected
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {storageStats?.environment?.backupAgent?.connected
                  ? 'Backup Agent Connected'
                  : 'Standalone Host Server'}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400">Execution Runtime:</span>
                <span className="font-bold">
                  {storageStats?.environment?.isContainer ? 'Linux Container' : 'Native Linux Host'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400">Storage Location:</span>
                <span className="font-mono text-[11px] truncate max-w-[220px]">
                  {storageStats?.environment?.containerPath || storageConfig.storagePath}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-neutral-500 dark:text-neutral-400">Agent Service:</span>
                <span className="text-[11px]">
                  {storageStats?.environment?.backupAgent?.connected
                    ? storageStats.environment.backupAgent.agentVersion || 'v1.0.0'
                    : '/opt/jw-backup-agent'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-500 dark:text-neutral-400">Auto-Archive on Receipt:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {storageConfig.autoArchiveOnLocal ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SYNC REPORT DETAILS IF AVAILABLE */}
        {syncReport && (
          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151E] border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Latest Physical Storage Sync Report
              </h3>
              <span className="text-xs text-neutral-400 font-mono">
                Duration: {(syncReport.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#181C26]">
                <span className="text-neutral-500 dark:text-neutral-400 block">Accounts Synced</span>
                <span className="text-base font-bold text-neutral-900 dark:text-white">
                  {syncReport.syncedAccounts}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#181C26]">
                <span className="text-neutral-500 dark:text-neutral-400 block">Emails Stored</span>
                <span className="text-base font-bold text-[#F15A24]">
                  {syncReport.emailsStored}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#181C26]">
                <span className="text-neutral-500 dark:text-neutral-400 block">Bytes Written</span>
                <span className="text-base font-bold text-neutral-900 dark:text-white">
                  {syncReport.formattedBytesWritten}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#181C26]">
                <span className="text-neutral-500 dark:text-neutral-400 block">Storage Root</span>
                <span className="text-xs font-mono text-neutral-700 dark:text-neutral-300 truncate block">
                  {syncReport.storagePath}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* FILE EXPLORER BROWSER */}
        <div className="bg-white dark:bg-[#12151E] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-50 dark:bg-[#161923]">
            <div className="flex items-center gap-2 font-mono text-xs text-neutral-700 dark:text-neutral-300">
              <button
                type="button"
                onClick={() => loadFiles('')}
                className="hover:text-[#F15A24] font-bold cursor-pointer"
              >
                root
              </button>
              {currentBrowseDir && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="font-bold">{currentBrowseDir}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  placeholder="Filter files..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs bg-white dark:bg-[#181C26] text-neutral-900 dark:text-white focus:outline-none focus:border-[#F15A24]"
                />
              </div>

              <button
                type="button"
                onClick={() => loadFiles(currentBrowseDir)}
                disabled={isLoadingFiles}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181C26] hover:bg-neutral-100 dark:hover:bg-[#202533] text-neutral-600 dark:text-neutral-300 cursor-pointer"
                title="Refresh File List"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoadingFiles ? (
              <div className="p-8 text-center text-neutral-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#F15A24]" />
                <span>Reading drive filesystem...</span>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-xs">
                {fileSearchQuery ? 'No files match your search query.' : 'No files found in this directory.'}
              </div>
            ) : (
              filteredFiles.map((file) => (
                <div
                  key={file.relativePath}
                  className="p-3.5 px-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#181C26]/70 text-xs transition-colors"
                >
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => {
                      if (file.isDirectory) {
                        loadFiles(file.relativePath);
                      } else {
                        handleInspectFile(file.relativePath);
                      }
                    }}
                  >
                    {file.isDirectory ? (
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : file.type === 'eml' ? (
                      <Mail className="w-4 h-4 text-[#F15A24] shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-neutral-900 dark:text-neutral-100 truncate">{file.name}</div>
                      {file.subject && (
                        <div className="text-[11px] text-neutral-400 truncate">
                          {file.subject} &bull; {file.from}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-neutral-400 font-mono text-[11px]">
                    <span>{file.formattedSize}</span>
                    <span className="hidden sm:inline">
                      {new Date(file.modifiedAt).toLocaleDateString()}
                    </span>
                    {!file.isDirectory && (
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(file.relativePath, file.name)}
                        className="p-1 text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                        title="Download File"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* FILE VIEWER MODAL */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#13161F] rounded-2xl border border-neutral-200 dark:border-neutral-700 max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between bg-neutral-50 dark:bg-[#181C26]">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#F15A24]" />
                <span className="font-bold text-xs text-neutral-900 dark:text-white truncate">{viewingFile.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  {(viewingFile.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingFile(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto bg-neutral-900 text-neutral-100 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre-wrap break-all">{viewingFile.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
