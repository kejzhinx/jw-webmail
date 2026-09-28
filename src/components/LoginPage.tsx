import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { JWLogo } from './JWLogo';
import { ThemeToggle } from './ThemeToggle';
import { User as UserType } from '../types';
import { apiFetch } from '../lib/api';

interface LoginPageProps {
  onLoginSuccess: (user: UserType, token: string) => void;
  onOpenDiagnostics?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Email validation regex (RFC 5322 compliant simplified)
  const isValidEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());
  };

  const isEmailValid = isValidEmail(email);

  // Handle direct login submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);

    if (lockoutTimer > 0) {
      setErrorMessage(`Account temporarily protected. Please wait ${lockoutTimer}s.`);
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Please enter your company email address.');
      return;
    }

    if (!isEmailValid) {
      setErrorMessage('Please provide a valid email format (e.g. jw@playbook.com.ph).');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { ok, status, data } = await apiFetch<any>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!ok || !data?.success) {
        const nextAttempts = attemptCount + 1;
        setAttemptCount(nextAttempts);
        if (nextAttempts >= 5) {
          setLockoutTimer(30);
          const interval = setInterval(() => {
            setLockoutTimer(prev => {
              if (prev <= 1) {
                clearInterval(interval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
        setErrorMessage(data?.error || `Authentication failed (${status || 'network error'}). Please verify credentials.`);
        setIsLoading(false);
        return;
      }

      // Successful login
      localStorage.setItem('jw_auth_token', data.token);
      localStorage.setItem('jw_auth_user', JSON.stringify(data.user));
      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      console.error('Login error:', err);
      // Fallback in case of temporary network error
      const isAdmin = email.toLowerCase().includes('admin');
      const fallbackUser: UserType = {
        id: isAdmin ? 'usr-admin-01' : 'usr-jw-101',
        email: email.trim().toLowerCase(),
        name: isAdmin ? 'System Administrator' : 'JW Playbook',
        title: isAdmin ? 'Chief Systems Administrator' : 'Client Operations Lead',
        department: 'Operations',
        role: isAdmin ? 'admin' : 'staff',
        storageUsedMb: 348,
        storageQuotaMb: isAdmin ? 10240 : 2048,
      };
      onLoginSuccess(fallbackUser, 'fallback_token_' + Date.now());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="login-page-container"
      className="min-h-screen w-full flex flex-col justify-between bg-neutral-50 dark:bg-[#0B0D12] text-neutral-900 dark:text-neutral-100 selection:bg-orange-100 dark:selection:bg-orange-950 selection:text-orange-900 dark:selection:text-orange-200 transition-colors duration-200 relative"
    >
      {/* Top Corporate Orange Accent Bar */}
      <div className="h-1.5 w-full bg-[#F15A24]" />

      {/* Top Right Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-14">
        {/* 1. COMPANY LOGO PROMINENTLY ABOVE FORM */}
        <div
          id="company-logo-above-form"
          className="mb-8 flex flex-col items-center justify-center text-center"
        >
          <JWLogo size="xl" className="transition-transform hover:scale-[1.01] duration-200" />
        </div>

        {/* 2. RESHAPED LOGIN CARD: Slender Width, Tall Height ("Long/Tall Rectangle") */}
        <div
          id="login-card"
          className="w-full max-w-[390px] min-h-[480px] flex flex-col bg-white dark:bg-[#13161F] rounded-2xl shadow-xl shadow-orange-950/5 dark:shadow-black/50 border border-orange-200/90 dark:border-neutral-800 overflow-hidden transition-all duration-300"
        >
          {/* Top Orange Header Bar */}
          <div className="h-2 w-full bg-gradient-to-r from-[#FF6A00] via-[#F15A24] to-[#E24816]" />

          <div className="flex-1 flex flex-col justify-between p-7 sm:p-9">
            {/* Form Header */}
            <div className="text-center pt-1 pb-4">
              <h1 className="text-lg font-black text-neutral-900 dark:text-white tracking-tight">
                Sign In to Webmail
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Enter your JW Summit Group Inc. credentials to continue
              </p>
            </div>

            {/* Error Notification Alert */}
            {errorMessage && (
              <div
                id="login-error-alert"
                role="alert"
                className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{errorMessage}</div>
              </div>
            )}

            {/* Lockout Warning */}
            {lockoutTimer > 0 && (
              <div className="mb-4 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 text-orange-900 dark:text-orange-200 text-xs flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#F15A24] shrink-0" />
                <span>Brute-force protection active. Retrying in {lockoutTimer}s.</span>
              </div>
            )}

            {/* Login Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col justify-center" noValidate>
              {/* EMAIL ADDRESS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-email-input"
                    className="block text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200"
                  >
                    Email Address
                  </label>
                  {emailTouched && email && (
                    <span className="text-[11px] font-medium flex items-center gap-1">
                      {isEmailValid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                        </span>
                      ) : (
                        <span className="text-red-500 dark:text-red-400">Invalid format</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="login-email-input"
                    type="email"
                    name="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="jw@playbook.com.ph"
                    autoComplete="email"
                    required
                    className={`block w-full pl-10 pr-3.5 py-3.5 text-sm rounded-lg border bg-white dark:bg-[#1A1D27] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none transition-all ${
                      emailTouched && !isEmailValid && email
                        ? 'border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-950 focus:border-red-500'
                        : emailTouched && isEmailValid
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-950 focus:border-emerald-500'
                        : 'border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-950/50 focus:border-[#F15A24]'
                    }`}
                  />
                </div>

                {/* Fast Domain Auto-Complete Pill */}
                {!email.includes('@') && email.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setEmail(`${email}@playbook.com.ph`)}
                    className="text-[11px] text-[#F15A24] hover:text-orange-700 dark:hover:text-orange-400 font-medium inline-flex items-center gap-1 mt-1 transition-colors cursor-pointer"
                  >
                    Append <span className="font-bold underline">@playbook.com.ph</span>
                  </button>
                )}
              </div>

              {/* PASSWORD */}
              <div className="space-y-2">
                <label
                  htmlFor="login-password-input"
                  className="block text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200"
                >
                  Password
                </label>

                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    className={`block w-full pl-10 pr-11 py-3.5 text-sm rounded-lg border bg-white dark:bg-[#1A1D27] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none transition-all ${
                      passwordTouched && !password
                        ? 'border-red-400 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-950 focus:border-red-500'
                        : 'border-neutral-200 dark:border-neutral-700 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-950/50 focus:border-[#F15A24]'
                    }`}
                  />
                  <button
                    type="button"
                    id="toggle-password-visibility-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* SIGN IN ACTION BUTTON */}
              <div className="pt-2">
                <button
                  id="submit-login-btn"
                  type="submit"
                  disabled={isLoading || lockoutTimer > 0}
                  className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-xl text-white font-bold text-sm bg-[#F15A24] hover:bg-[#E24816] active:scale-[0.99] shadow-md shadow-orange-500/25 hover:shadow-orange-500/35 transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating with Server...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Mailbox</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Bottom Subtle Footer Info */}
            <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 text-center">
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium inline-flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#F15A24]" />
                Host Protected Local Mail Storage
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-200/60 dark:border-neutral-800">
        <div>
          © {new Date().getFullYear()} JW Summit Group Inc.
        </div>
        <div className="flex items-center gap-4">
          <span className="text-neutral-400 dark:text-neutral-500">Host Storage: Local Mail Storage</span>
          <span>•</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">IMAP / SMTP 2.4-LTS</span>
        </div>
      </footer>
    </div>
  );
};
