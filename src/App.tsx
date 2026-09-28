import React, { useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { LoginPage } from './components/LoginPage';
import { MailApp } from './components/MailApp';
import { ServerDiagnosticsModal } from './components/ServerDiagnosticsModal';
import { MailServerStatus, User } from './types';
import { safeJson } from './lib/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [adminActiveView, setAdminActiveView] = useState<'admin' | 'mailbox'>('admin');
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState<MailServerStatus | null>(null);

  // Restore session from localStorage if present
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('jw_auth_token');
      const savedUserStr = localStorage.getItem('jw_auth_user');
      if (savedToken && savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        if (parsed && parsed.email) {
          setCurrentUser(parsed);
          setAuthToken(savedToken);
          if (parsed.role === 'admin') {
            setAdminActiveView('admin');
          }
        }
      }
    } catch {
      localStorage.removeItem('jw_auth_token');
      localStorage.removeItem('jw_auth_user');
    }
  }, []);

  // Fetch server status periodically
  useEffect(() => {
    fetch('/api/server/status')
      .then(res => safeJson(res))
      .then(data => {
        if (data.success) {
          setServerStatus(data.status);
        }
      })
      .catch(() => {});
  }, []);

  const handleLoginSuccess = (user: User, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    if (user.role === 'admin') {
      setAdminActiveView('admin');
    }
  };

  const handleUserUpdated = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    try {
      localStorage.setItem('jw_auth_user', JSON.stringify(updatedUser));
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }
    } catch {
      // Ignore network failure on logout
    } finally {
      localStorage.removeItem('jw_auth_token');
      localStorage.removeItem('jw_auth_user');
      setCurrentUser(null);
      setAuthToken(null);
    }
  };

  return (
    <div id="jw-summit-mail-system" className="min-h-screen w-full font-sans antialiased text-neutral-900 dark:text-neutral-100 bg-white dark:bg-[#0B0D12] transition-colors duration-200">
      {currentUser && authToken ? (
        currentUser.role === 'admin' && adminActiveView === 'admin' ? (
          <AdminPanel
            adminUser={currentUser}
            token={authToken}
            onLogout={handleLogout}
            onSwitchToMailbox={() => setAdminActiveView('mailbox')}
            onUserUpdated={handleUserUpdated}
          />
        ) : (
          <MailApp
            user={currentUser}
            token={authToken}
            onLogout={handleLogout}
            onSwitchToAdmin={
              currentUser.role === 'admin' ? () => setAdminActiveView('admin') : undefined
            }
          />
        )
      ) : (
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        />
      )}

      {/* Global Server Diagnostics */}
      <ServerDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        status={serverStatus}
        currentUserEmail={currentUser?.email}
      />
    </div>
  );
}
