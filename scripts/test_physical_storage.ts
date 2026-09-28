import fs from 'fs';
import path from 'path';
import {
  testStoragePathWritable,
  initializeStorageDirectory,
  syncAllMailboxesToPhysicalDrive,
  createPhysicalStorageZip,
  getPhysicalStorageStats,
  resolveStoragePath,
  restartStorageScheduler,
  getSchedulerStatus,
  handleAgentHeartbeat,
  getEnvironmentInfo,
} from '../server/physicalStorageService';

async function runStorageVerificationSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING 10-POINT REAL PHYSICAL STORAGE TEST SUITE');
  console.log('====================================================\n');

  // Simulate backup agent connected for tests
  handleAgentHeartbeat({
    hostId: 'host-ubuntu-local',
    hostName: 'ubuntu-host',
    osPlatform: 'linux',
    agentVersion: '2.0.0-auto',
    backupPath: '/mnt/jw-mail-backup',
    status: 'RUNNING',
    storage: {
      totalBytes: 500 * 1024 * 1024 * 1024,
      freeBytes: 450 * 1024 * 1024 * 1024,
      freeGb: 450,
      freeFormatted: '450 GB',
      verifiedWritable: true,
    },
  });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   └─ ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   └─ ${detail}`);
      failed++;
    }
  }

  // TEST 1: Test Nonexistent Path
  console.log('\n--- Test 1: Nonexistent Path Verification ---');
  const nonExistentPath = `./data/test_fake_dir_${Date.now()}`;
  const test1Result = testStoragePathWritable(nonExistentPath);
  assert(
    test1Result.success === false &&
      test1Result.exists === false &&
      test1Result.status === 'missing',
    'Test 1: Nonexistent Path Returns exists=false & status="missing"',
    `Result: success=${test1Result.success}, exists=${test1Result.exists}, status=${test1Result.status}, msg="${test1Result.message}"`
  );

  // TEST 2: Path Traversal & System Directory Protection
  console.log('\n--- Test 2: Path Traversal and Restricted System Path Protection ---');
  const traversalBlocked1 = resolveStoragePath('../../etc');
  const traversalBlocked2 = resolveStoragePath('/etc/shadow');
  const traversalBlocked3 = resolveStoragePath('/proc/1/cgroup');
  assert(
    traversalBlocked1.isSafe === false &&
      traversalBlocked2.isSafe === false &&
      traversalBlocked3.isSafe === false,
    'Test 2: Path Traversal & Restricted Paths (/etc, /proc, relative escapes) Are Blocked',
    `Blocked paths safely. Error 1: ${traversalBlocked1.securityError}, Error 2: ${traversalBlocked2.securityError}`
  );

  // TEST 3: Directory Initialization & Real Directory Creation
  console.log('\n--- Test 3: Directory Initialization on Server ---');
  const testDir = `./data/test_physical_storage_${Date.now()}`;
  const initResult = initializeStorageDirectory(testDir);
  const dirActuallyExists = fs.existsSync(initResult.resolvedPath) && fs.statSync(initResult.resolvedPath).isDirectory();
  assert(
    initResult.success === true &&
      initResult.exists === true &&
      initResult.isWritable === true &&
      dirActuallyExists,
    'Test 3: Directory Initialization Created Real Folder on Filesystem',
    `Path: ${initResult.resolvedPath}, Created & Verified Writable`
  );

  // TEST 4: Real Probe File Creation & Writable Verification
  console.log('\n--- Test 4: Real Probe File Verification on Initialized Directory ---');
  const test4Result = testStoragePathWritable(testDir);
  assert(
    test4Result.success === true &&
      test4Result.exists === true &&
      test4Result.isWritable === true &&
      test4Result.status === 'verified',
    'Test 4: Storage Path Verified (Active & Writable)',
    `Status: ${test4Result.status}, Resolved: ${test4Result.resolvedPath}`
  );

  // TEST 5: Real Disk Space Reporting (statfs)
  console.log('\n--- Test 5: Real Host Disk Space Reporting (statfs) ---');
  assert(
    test4Result.realDiskTotalGb !== undefined &&
      test4Result.realDiskTotalGb > 0 &&
      test4Result.realDiskFreeGb !== undefined &&
      test4Result.realDiskFreeGb >= 0,
    'Test 5: Real Host Drive Capacity and Free Space Queried via OS statfs',
    `Total: ${test4Result.realDiskTotalGb} GB, Free: ${test4Result.realDiskFreeGb} GB`
  );

  // TEST 6: Real IMAP Mail Fetch and .eml Storage to Disk
  console.log('\n--- Test 6: IMAP Sync and Physical .eml Archival ---');
  const syncReport = await syncAllMailboxesToPhysicalDrive(testDir);
  const accountDirs = fs.readdirSync(initResult.resolvedPath);
  const hasAccountFolders = accountDirs.length > 0;
  let emlCount = 0;
  function countEmls(dir: string) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        countEmls(full);
      } else if (f.endsWith('.eml')) {
        emlCount++;
      }
    }
  }
  countEmls(initResult.resolvedPath);

  assert(
    syncReport.success === true &&
      syncReport.emailsStored > 0 &&
      hasAccountFolders &&
      emlCount > 0,
    'Test 6: Mailboxes Synced to Host Filesystem with Genuine RFC822 .eml Files',
    `Stored ${syncReport.emailsStored} emails across ${accountDirs.length} accounts (${syncReport.formattedBytesWritten}). On-disk .eml count: ${emlCount}`
  );

  // TEST 7: Inspect Real Stored EML File Content
  console.log('\n--- Test 7: Verify Real MIME / RFC822 Structure of Stored .eml File ---');
  let sampleEmlPath = '';
  function findFirstEml(dir: string) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        findFirstEml(full);
      } else if (f.endsWith('.eml') && !sampleEmlPath) {
        sampleEmlPath = full;
      }
    }
  }
  findFirstEml(initResult.resolvedPath);
  const emlContent = fs.readFileSync(sampleEmlPath, 'utf8');
  assert(
    emlContent.includes('Message-ID:') &&
      emlContent.includes('Subject:') &&
      emlContent.includes('From:'),
    'Test 7: Stored .eml File Has Valid RFC822 Headers and MIME Content',
    `Sample File: ${path.basename(sampleEmlPath)} (Size: ${emlContent.length} bytes)`
  );

  // TEST 8: Real ZIP Archive Generation from On-Disk Mailbox Files
  console.log('\n--- Test 8: ZIP Export of Physical Mail Repository ---');
  const zipBuffer = await createPhysicalStorageZip(testDir);
  const isZipValid = zipBuffer && zipBuffer.length > 100 && zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b; // PK zip magic bytes
  assert(
    isZipValid,
    'Test 8: Real ZIP Export Generated with PK Magic Header from Filesystem Files',
    `Generated ZIP Buffer Size: ${(zipBuffer.length / 1024).toFixed(2)} KB`
  );

  // TEST 9: Background Scheduler State & Sync Worker Controls
  console.log('\n--- Test 9: Background IMAP Sync Scheduler State ---');
  restartStorageScheduler({
    enabled: true,
    storagePath: testDir,
    syncIntervalMinutes: 5,
    autoArchiveOnLocal: true,
    deleteFromRemoteAfterSync: false,
    deviceLabel: 'Test Storage Host',
    status: 'active',
  });
  const schedStatus = getSchedulerStatus();
  assert(
    schedStatus.schedulerEnabled === true &&
      schedStatus.syncIntervalMinutes === 5,
    'Test 9: Background Scheduler Configured & Tracking Active State',
    `Interval: ${schedStatus.syncIntervalMinutes}m, Last Status: ${schedStatus.lastSyncStatus}`
  );

  // TEST 10: Backup Agent Integration & Heartbeat
  console.log('\n--- Test 10: Backup Agent Heartbeat & Environment Info ---');
  handleAgentHeartbeat({
    agentVersion: 'v1.4.2-linux-x86_64',
    hostPath: '/var/mail/jw-storage',
    backupPath: '/var/mail/jw-storage',
    freeSpaceBytes: 50 * 1024 * 1024 * 1024,
    totalCapacityBytes: 500 * 1024 * 1024 * 1024,
    status: 'online',
  });
  const envInfo = getEnvironmentInfo();
  assert(
    envInfo.backupAgent.connected === true &&
      envInfo.backupAgent.agentVersion === 'v1.4.2-linux-x86_64',
    'Test 10: Backup Agent Heartbeat Registered and Active in Environment Info',
    `Agent Status: Connected (${envInfo.backupAgent.agentVersion}), Host Path: ${envInfo.hostPath}`
  );

  // Cleanup test directory
  try {
    fs.rmSync(initResult.resolvedPath, { recursive: true, force: true });
    console.log(`\n🧹 Cleaned up temporary test directory: ${initResult.resolvedPath}`);
  } catch (e) {
    // ignore
  }

  console.log('\n====================================================');
  console.log(`🏁 TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runStorageVerificationSuite().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
