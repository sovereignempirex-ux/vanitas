import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, ClientSource, PermissionScope, WeeklyAgentQuota } from '../types.ts';
import { api } from '../lib/apiClient.ts';
import { BRAND_ASSETS } from '../data/assets.ts';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  badge: string;
  description: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'user_sovereign_admin',
    name: 'Sovereign Administrator',
    email: 'admin@vanitas-cloud.net',
    role: 'ADMIN',
    avatarUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop',
    badge: 'Root Sovereign',
    description: 'Full administrative access across all API clusters, keys, rate limits, and audit logs.',
  },
  {
    id: 'user_lead_architect',
    name: 'Caelum Vance',
    email: 'caelum.vance@vanitas.dev',
    role: 'ADMIN',
    avatarUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop',
    badge: 'Lead Architect',
    description: 'Platform engineer with system management, security inspection, and key creation privileges.',
  },
  {
    id: 'user_security_auditor',
    name: 'Seraphina Lynn',
    email: 'seraphina.sec@vanitas.org',
    role: 'USER',
    avatarUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
    badge: 'Security Auditor',
    description: 'Read-only security inspector monitoring API usage anomalies and webhook delivery logs.',
  },
  {
    id: 'user_guest_developer',
    name: 'Guest Developer',
    email: 'guest.dev@external.io',
    role: 'USER',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=800&auto=format&fit=crop',
    badge: 'Guest Developer',
    description: 'Standard sandbox developer exploring the Vanitas API playground and client downloads.',
  },
];

interface AuthContextType {
  user: User | null;
  role: UserRole;
  permissions: PermissionScope[];
  activeView: string;
  setActiveView: (view: string) => void;
  setRole: (role: UserRole) => void;
  toggleRole: () => void;
  loginOAuth: (provider: string) => Promise<void>;
  loginWithEmail: (
    email: string,
    pass: string,
    mode: 'login' | 'register',
    name?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Offline/demo-only session (ingress key tab) — never hits the server. */
  loginLocalSynthetic: (email: string, name?: string) => { success: boolean };
  /** Adopt the session token delivered by the OAuth callback (#vnt_oauth=…). */
  completeOAuthLogin: (token: string) => Promise<void>;
  loginAsDemoAccount: (account: DemoAccount) => void;
  logout: () => void;
  clientSource: ClientSource;
  setClientSource: (source: ClientSource) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  refreshUser: () => Promise<void>;
  updateUserProfile: (updates: Partial<User>) => void;
  // Weekly Agent Quota System (1 run / week per account)
  weeklyAgentQuota: WeeklyAgentQuota;
  executeAgentRun: (agentType?: string) => { success: boolean; message: string };
  resetAgentQuota: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('vanitas_active_user');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  const [role, setRoleState] = useState<UserRole>(() => {
    // Least privilege by default. Server is source of truth for ADMIN.
    return user ? user.role : 'USER';
  });

  const [permissions, setPermissions] = useState<PermissionScope[]>([]);
  const [activeView, setActiveView] = useState<string>('welcome');
  const [clientSource, setClientSourceState] = useState<ClientSource>('WEB');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Weekly Agent Quota state
  const [agentQuotaState, setAgentQuotaState] = useState<{
    lastRunTimestamp: number | null;
  }>(() => {
    try {
      const userId = user?.id || 'default_user';
      const stored = localStorage.getItem(`vanitas_agent_quota_${userId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return { lastRunTimestamp: null };
  });

  // Calculate quota object
  const calculateQuota = useCallback((): WeeklyAgentQuota => {
    const now = Date.now();
    const lastRun = agentQuotaState.lastRunTimestamp;

    if (!lastRun) {
      return {
        weeklyLimit: 1,
        weeklyUsed: 0,
        remainingRuns: 1,
        lastRunTimestamp: null,
        nextAvailableTimestamp: null,
        canExecute: true,
        timeRemainingFormatted: 'Ready now (1 action available this week)',
      };
    }

    const elapsed = now - lastRun;
    if (elapsed >= ONE_WEEK_MS) {
      return {
        weeklyLimit: 1,
        weeklyUsed: 0,
        remainingRuns: 1,
        lastRunTimestamp: lastRun,
        nextAvailableTimestamp: null,
        canExecute: true,
        timeRemainingFormatted: 'Ready now (Weekly quota reset)',
      };
    }

    const remainingMs = ONE_WEEK_MS - elapsed;
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    const secs = Math.floor((remainingMs % (60 * 1000)) / 1000);

    const formatted = `${days}d ${hours}h ${mins}m ${secs}s`;

    return {
      weeklyLimit: 1,
      weeklyUsed: 1,
      remainingRuns: 0,
      lastRunTimestamp: lastRun,
      nextAvailableTimestamp: lastRun + ONE_WEEK_MS,
      canExecute: false,
      timeRemainingFormatted: formatted,
    };
  }, [agentQuotaState]);

  const [weeklyAgentQuota, setWeeklyAgentQuota] = useState<WeeklyAgentQuota>(calculateQuota);

  // Live timer update for countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setWeeklyAgentQuota(calculateQuota());
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateQuota]);

  // Load quota when user changes
  useEffect(() => {
    const userId = user?.id || 'default_user';
    try {
      const stored = localStorage.getItem(`vanitas_agent_quota_${userId}`);
      if (stored) {
        setAgentQuotaState(JSON.parse(stored));
      } else {
        setAgentQuotaState({ lastRunTimestamp: null });
      }
    } catch {
      setAgentQuotaState({ lastRunTimestamp: null });
    }
  }, [user]);

  const refreshUser = async () => {
    try {
      const data = await api.getMe();
      // Server is source of truth — sync role from server, don't trust localStorage.
      if (data.user) {
        setUser(data.user);
        setRoleState(data.user.role);
        try {
          localStorage.setItem('vanitas_active_user', JSON.stringify(data.user));
        } catch {
          // ignore
        }
      }
      setPermissions(data.permissions);
    } catch (err) {
      console.warn('Failed fetching me:', err);
    }
  };

  useEffect(() => {
    api.setClientSource(clientSource);
    refreshUser();
  }, [clientSource]);

  const setRole = (newRole: UserRole) => {
    // SECURITY: client-side role switch is UI-only preview. Real promotion
    // must happen via PATCH /api/v1/admin/users/:id/role with ADMIN_API_TOKEN.
    // We keep local state but refresh from server on next refreshUser().
    setRoleState(newRole);
    if (user) {
      const updated = { ...user, role: newRole };
      setUser(updated);
      localStorage.setItem('vanitas_active_user', JSON.stringify(updated));
    }
    refreshUser();
  };

  const toggleRole = () => {
    console.warn('toggleRole is UI-only and does not grant server privileges.');
    const nextRole: UserRole = role === 'ADMIN' ? 'USER' : 'ADMIN';
    setRole(nextRole);
  };

  const setClientSource = (src: ClientSource) => {
    setClientSourceState(src);
    api.setClientSource(src);
  };

  const loginOAuth = async (provider: string) => {
    const res = await api.oauthLogin(provider);
    if (res.user) {
      // Server decides role. Never self-promote here.
      const serverRole = res.user.role === 'ADMIN' ? 'ADMIN' : 'USER';
      const safeUser = { ...res.user, role: serverRole as UserRole };
      setUser(safeUser);
      setRoleState(serverRole);
      api.setAuthToken(res.token);
      localStorage.setItem('vanitas_active_user', JSON.stringify(safeUser));
    }
    setIsAuthModalOpen(false);
  };

  /** Complete a real social login: the OAuth callback redirected to the SPA
   *  with a session token in the URL fragment — adopt it and load the user. */
  const completeOAuthLogin = async (token: string) => {
    api.setAuthToken(token);
    await refreshUser();
  };

  const loginLocalSynthetic = (email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase().slice(0, 120);
    const generatedUser: User = {
      id: `usr_${Date.now().toString(36)}`,
      email: cleanEmail,
      name: (name || cleanEmail.split('@')[0] || 'Developer').slice(0, 80),
      username: (cleanEmail.split('@')[0] || 'dev').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40),
      avatarUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09041?q=80&w=800&auto=format&fit=crop',
      // SECURITY: local sessions can never grant ADMIN.
      role: 'USER',
      twoFactorEnabled: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      connectedAccounts: {
        google: cleanEmail.includes('gmail'),
        github: false,
        discord: false,
      },
    };
    setUser(generatedUser);
    setRoleState('USER');
    localStorage.setItem('vanitas_active_user', JSON.stringify(generatedUser));
    setIsAuthModalOpen(false);
    return { success: true };
  };

  const loginWithEmail = async (email: string, password: string, mode: 'login' | 'register', name?: string) => {
    const cleanEmail = email.trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'Invalid email address' };
    }
    if (!password) {
      return { success: false, error: 'Password is required' };
    }
    if (mode === 'register' && password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    try {
      const data =
        mode === 'register'
          ? await api.register({ email: cleanEmail, password, name: (name || cleanEmail.split('@')[0]).slice(0, 80) })
          : await api.login({ email: cleanEmail, password });

      // Server is the source of truth for role & permissions.
      setUser(data.user);
      setRoleState(data.user.role);
      setPermissions(data.permissions);
      localStorage.setItem('vanitas_active_user', JSON.stringify(data.user));
      setIsAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      // Server answered (wrong password, duplicate email, storage down) → show it.
      if (err?.status) {
        return { success: false, error: err.message || 'Authentication failed' };
      }
      // Network/server unreachable → keep the offline demo session working.
      console.warn('[auth] server unreachable, using local session fallback:', err);
      return loginLocalSynthetic(cleanEmail, name);
    }
  };

  const loginAsDemoAccount = (demo: DemoAccount) => {
    const demoUser: User = {
      id: demo.id,
      email: demo.email,
      name: demo.name,
      username: demo.email.split('@')[0],
      avatarUrl: demo.avatarUrl,
      role: demo.role,
      twoFactorEnabled: demo.role === 'ADMIN',
      createdAt: '2026-01-01T00:00:00Z',
      lastLoginAt: new Date().toISOString(),
      connectedAccounts: {
        google: true,
        github: true,
        discord: true,
      },
    };
    setUser(demoUser);
    setRoleState(demo.role);
    localStorage.setItem('vanitas_active_user', JSON.stringify(demoUser));
    setIsAuthModalOpen(false);
  };

  const logout = () => {
    // Revoke the server session and clear the stored Bearer token.
    api.logout().catch(() => undefined);
    setUser(null);
    setRoleState('USER');
    localStorage.removeItem('vanitas_active_user');
  };

  const updateUserProfile = (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
      localStorage.setItem('vanitas_active_user', JSON.stringify(updated));
    }
  };

  const executeAgentRun = (_agentType?: string): { success: boolean; message: string } => {
    const quota = calculateQuota();
    if (!quota.canExecute) {
      return {
        success: false,
        message: `Weekly Agent limit reached. Next execution available in ${quota.timeRemainingFormatted}.`,
      };
    }

    const now = Date.now();
    const newState = { lastRunTimestamp: now };
    const userId = user?.id || 'default_user';
    setAgentQuotaState(newState);
    try {
      localStorage.setItem(`vanitas_agent_quota_${userId}`, JSON.stringify(newState));
    } catch {
      // ignore
    }
    setWeeklyAgentQuota(calculateQuota());

    return {
      success: true,
      message: 'Autonomous AI Agent execution initiated successfully (1/1 weekly quota used).',
    };
  };

  const resetAgentQuota = () => {
    const userId = user?.id || 'default_user';
    const newState = { lastRunTimestamp: null };
    setAgentQuotaState(newState);
    try {
      localStorage.removeItem(`vanitas_agent_quota_${userId}`);
    } catch {
      // ignore
    }
    setWeeklyAgentQuota(calculateQuota());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        permissions,
        activeView,
        setActiveView,
        setRole,
        toggleRole,
        loginOAuth,
        completeOAuthLogin,
        loginWithEmail,
        loginLocalSynthetic,
        loginAsDemoAccount,
        logout,
        clientSource,
        setClientSource,
        isAuthModalOpen,
        setIsAuthModalOpen,
        refreshUser,
        updateUserProfile,
        weeklyAgentQuota,
        executeAgentRun,
        resetAgentQuota,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

