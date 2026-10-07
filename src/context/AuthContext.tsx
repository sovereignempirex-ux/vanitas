import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, ClientSource, PermissionScope, WeeklyAgentQuota, ProfileLink } from '../types.ts';
import { api } from '../lib/apiClient.ts';
import { getAccounts, upsertAccount, removeAccount, clearAccounts, StoredAccount } from '../lib/accounts.ts';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  /** True while the first server-side /auth/me verification is still running. */
  authLoading: boolean;
  role: UserRole;
  permissions: PermissionScope[];
  activeView: string;
  setActiveView: (view: string) => void;
  loginOAuth: (provider: string) => Promise<void>;
  loginWithEmail: (
    email: string,
    pass: string,
    mode: 'login' | 'register',
    name?: string,
    code?: string,
    invite?: string,
  ) => Promise<{ success: boolean; error?: string; twoFactorRequired?: boolean }>;
  /** Adopt the session token delivered by the OAuth callback (#vnt_oauth=…). */
  completeOAuthLogin: (token: string) => Promise<void>;
  /** Finish an OAuth login paused for a TOTP code (#vnt_2fa=…). */
  completeTwoFactorLogin: (state: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  clientSource: ClientSource;
  setClientSource: (source: ClientSource) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  refreshUser: () => Promise<void>;
  /** Persist profile edits (name + avatar) to the real account server-side. */
  updateUserProfile: (updates: {
    name: string;
    avatarUrl: string;
    username?: string;
    bio?: string;
    accentColor?: string;
    statusLine?: string;
    links?: ProfileLink[];
    location?: string;
    techTags?: string[];
  }) => Promise<{ success: boolean; error?: string }>;
  // Weekly Agent Quota System (1 run / week per account)
  weeklyAgentQuota: WeeklyAgentQuota;
  executeAgentRun: (agentType?: string) => { success: boolean; message: string };
  resetAgentQuota: () => void;
  // Multi-account system — every entry is a real server session.
  /** All accounts ever signed in on this device (with live tokens). */
  accounts: StoredAccount[];
  /** Login as a different account already stored on this device. */
  switchAccount: (id: string) => Promise<{ success: boolean; error?: string }>;
  /** Sign one stored account out (revokes its server session). */
  removeAccount: (id: string) => Promise<void>;
  /** Sign every stored account out on this device. */
  logoutAll: () => void;
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
  // Gate the dashboard until the server confirms (or rejects) the session.
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  // Multi-account registry (localStorage) + which entry owns the token.
  const [accounts, setAccounts] = useState<StoredAccount[]>(() => getAccounts());
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() => {
    try {
      const token = localStorage.getItem('vanitas_auth_token');
      return token ? getAccounts().find((a) => a.token === token)?.id || null : null;
    } catch {
      return null;
    }
  });

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

  /** Adopt a server-verified account: set the token, sync the
   *  registry entry, close any open auth UI. */
  const activateUser = (dataUser: User, token: string, permissions: PermissionScope[]) => {
    api.setAuthToken(token);
    setUser(dataUser);
    setRoleState(dataUser.role);
    setPermissions(permissions || []);
    setActiveAccountId(dataUser.id);
    try {
      localStorage.setItem('vanitas_active_user', JSON.stringify(dataUser));
    } catch {
      // ignore
    }
    setAccounts(upsertAccount(dataUser, token));
    setIsAuthModalOpen(false);
  };

  const refreshUser = async () => {
    try {
      const data = await api.getMe();
      // Server is source of truth — sync role from server, don't trust localStorage.
      if (data.user) {
        setUser(data.user);
        setRoleState(data.user.role);
        setPermissions(data.permissions || []);
        try {
          localStorage.setItem('vanitas_active_user', JSON.stringify(data.user));
        } catch {
          // ignore
        }
        // Keep the device's registry entry fresh (role/avatar/name drift
        // while the account is away is reflected on next activation).
        const token = api.getSessionToken();
        if (token) setAccounts(upsertAccount(data.user, token));
      }
    } catch (err: any) {
      if (err?.status === 401) {
        // The ACTIVE session is dead. Drop only that entry — other
        // stored sessions survive, and the most recent one takes over.
        const deadId = activeAccountId || user?.id;
        const remaining = deadId ? removeAccount(deadId) : getAccounts();
        setAccounts(remaining);
        api.setAuthToken(null);
        try {
          localStorage.removeItem('vanitas_active_user');
        } catch {
          // ignore
        }
        const next = remaining[0];
        if (next) {
          api.setAuthToken(next.token);
          try {
            const data = await api.getMe();
            activateUser(data.user, next.token, data.permissions);
            return;
          } catch {
            // next token also dead — clear fully below
          }
        }
        setUser(null);
        setRoleState('USER');
        setPermissions([]);
        setActiveAccountId(null);
      } else {
        console.warn('Failed fetching me:', err);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    api.setClientSource(clientSource);
    refreshUser();
  }, [clientSource]);

  const setClientSource = (src: ClientSource) => {
    setClientSourceState(src);
    api.setClientSource(src);
  };

  const loginOAuth = async (provider: string) => {
    // REAL social login: same redirect flow as the /login page — the provider
    // callback returns with a session token (#vnt_oauth=…) we then adopt.
    window.location.href = `/api/v1/social/${provider}`;
  };

  /** Complete a real social login: the OAuth callback redirected to the SPA
   *  with a session token in the URL fragment — adopt it and load the user. */
  const completeOAuthLogin = async (token: string) => {
    api.setAuthToken(token);
    const data = await api.getMe();
    activateUser(data.user, token, data.permissions);
    setAuthLoading(false);
  };

  /** Finish an OAuth login that the server paused for a real TOTP code. */
  const completeTwoFactorLogin = async (state: string, code: string) => {
    try {
      const data = await api.completeTwoFactor(state, code);
      activateUser(data.user, data.token, data.permissions);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Two-factor verification failed' };
    }
  };

  const loginWithEmail = async (email: string, password: string, mode: 'login' | 'register', name?: string, code?: string, invite?: string) => {
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
          ? await api.register({
              email: cleanEmail,
              password,
              name: (name || cleanEmail.split('@')[0]).slice(0, 80),
              invite: invite || undefined,
            })
          : await api.login({ email: cleanEmail, password, code });

      // Server is the source of truth for role & permissions.
      activateUser(data.user, data.token, data.permissions);
      return { success: true };
    } catch (err: any) {
      // Server answered (wrong password, duplicate email, 2FA needed, storage
      // down) → show it. Real 2FA: the server asks for the authenticator code.
      if (err?.status) {
        if (err?.body?.twoFactorRequired) {
          return { success: false, twoFactorRequired: true, error: err.message || 'Two-factor code required' };
        }
        return { success: false, error: err.message || 'Authentication failed' };
      }
      // Network/server unreachable → real accounts only: report it, never
      // fabricate a local session.
      console.warn('[auth] server unreachable:', err);
      return { success: false, error: 'Cannot reach the server. Check your connection and try again.' };
    }
  };

  /** Log out of the CURRENT account only. If other stored accounts
   *  remain, the most recently used one takes over seamlessly —
   *  "Log Out of All" is the full sign-out. */
  const logout = () => {
    const currentId = activeAccountId || user?.id;
    api.logout().catch(() => undefined); // revokes the CURRENT session server-side
    const remaining = currentId ? removeAccount(currentId) : getAccounts();
    setAccounts(remaining);
    api.setAuthToken(null);
    try {
      localStorage.removeItem('vanitas_active_user');
    } catch {
      // ignore
    }
    const next = remaining[0];
    if (next) {
      api.setAuthToken(next.token);
      api
        .getMe()
        .then((data) => activateUser(data.user, next.token, data.permissions))
        .catch(() => {
          // The fallback session is dead — clear fully.
          api.setAuthToken(null);
          setUser(null);
          setRoleState('USER');
          setPermissions([]);
          setActiveAccountId(null);
        });
      return;
    }
    setUser(null);
    setRoleState('USER');
    setPermissions([]);
    setActiveAccountId(null);
  };

  /** Sign one stored account out (revokes its server session, drops
   *  its entry). When it is the active one, the next account takes over. */
  const removeAccountById = async (id: string) => {
    const entry = accounts.find((a) => a.id === id);
    if (entry) {
      try {
        await api.revokeToken(entry.token);
      } catch {
        // already gone
      }
    }
    const remaining = removeAccount(id);
    setAccounts(remaining);
    if (id !== activeAccountId) return;
    const next = remaining[0];
    if (next) {
      api.setAuthToken(next.token);
      try {
        const data = await api.getMe();
        activateUser(data.user, next.token, data.permissions);
        return;
      } catch {
        api.setAuthToken(null);
      }
    } else {
      api.setAuthToken(null);
    }
    setUser(null);
    setRoleState('USER');
    setPermissions([]);
    setActiveAccountId(null);
    try {
      localStorage.removeItem('vanitas_active_user');
    } catch {
      // ignore
    }
  };

  /** Switch the active session to another stored account. The
   *  server verifies its token; a dead entry is dropped on 401. */
  const switchAccount = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const target = accounts.find((a) => a.id === id);
    if (!target) return { success: false, error: 'Account no longer on this device' };
    if (id === activeAccountId && user) return { success: true };
    const previousToken = api.getSessionToken();
    const previousActiveId = activeAccountId;
    api.setAuthToken(target.token);
    try {
      const data = await api.getMe();
      activateUser(data.user, target.token, data.permissions);
      return { success: true };
    } catch (err: any) {
      if (err?.status === 401) {
        setAccounts(removeAccount(id));
        // Restore the previous session untouched.
        api.setAuthToken(previousToken);
        setActiveAccountId(previousActiveId);
        return { success: false, error: 'That session expired — sign in to add it again.' };
      }
      api.setAuthToken(previousToken);
      setActiveAccountId(previousActiveId);
      return { success: false, error: err?.message || 'Could not switch account' };
    }
  };

  /** Revoke every stored session on this device and forget them all. */
  const logoutAll = () => {
    const tokens = getAccounts().map((a) => a.token);
    void Promise.allSettled(tokens.map((t) => api.revokeToken(t)));
    clearAccounts();
    setAccounts([]);
    api.setAuthToken(null);
    setUser(null);
    setRoleState('USER');
    setPermissions([]);
    setActiveAccountId(null);
    try {
      localStorage.removeItem('vanitas_active_user');
    } catch {
      // ignore
    }
  };

  const updateUserProfile = async (updates: {
    name: string;
    avatarUrl: string;
    username?: string;
    bio?: string;
    accentColor?: string;
    statusLine?: string;
    links?: ProfileLink[];
    location?: string;
    techTags?: string[];
  }) => {
    // Real accounts: edits are validated and persisted by the server.
    try {
      const data = await api.updateProfile(updates);
      setUser(data.user);
      setRoleState(data.user.role);
      setPermissions(data.permissions || []);
      try {
        localStorage.setItem('vanitas_active_user', JSON.stringify(data.user));
      } catch {
        // ignore
      }
      // Refresh the registry entry too — name/avatar changes show up
      // correctly in the switcher next time.
      const token = api.getSessionToken();
      if (token) setAccounts(upsertAccount(data.user, token));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Profile update failed' };
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
        authLoading,
        role,
        permissions,
        activeView,
        setActiveView,
        loginOAuth,
        completeOAuthLogin,
        completeTwoFactorLogin,
        loginWithEmail,
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
        accounts,
        switchAccount,
        removeAccount: removeAccountById,
        logoutAll,
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

