import type { User } from '../types.ts';

// ---------------------------------------------------------------------------
// Multi-account registry. Every account signed in on this device keeps
// a real server session (Bearer token). Only the ACTIVE account's token
// reaches the apiClient; switching swaps which token gets sent.
//
// This NEVER creates local personas: every entry exists because the
// server actually issued a session for that account (login, register,
// OAuth, 2FA or an earlier refresh). Dead sessions are dropped on the
// first 401.
// ---------------------------------------------------------------------------

export interface StoredAccount {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string;
  role: User['role'];
  token: string;
  lastActiveAt: number;
}

const STORE_KEY = 'vanitas_accounts_v1';
const MAX_ACCOUNTS = 8;

export function getAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (a): a is StoredAccount =>
        !!a && typeof a.id === 'string' && typeof a.token === 'string' && typeof a.email === 'string',
    );
  } catch {
    return [];
  }
}

function save(accounts: StoredAccount[]): StoredAccount[] {
  const trimmed = [...accounts].sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, MAX_ACCOUNTS);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full — in-memory list still works for this session
  }
  return trimmed;
}

/** Add/refresh an account after a real login and return the new list. */
export function upsertAccount(user: User, token: string): StoredAccount[] {
  const accounts = getAccounts();
  const entry: StoredAccount = {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role,
    token,
    lastActiveAt: Date.now(),
  };
  const idx = accounts.findIndex((a) => a.id === user.id);
  if (idx === -1) accounts.push(entry);
  else accounts[idx] = entry;
  return save(accounts);
}

export function removeAccount(id: string): StoredAccount[] {
  return save(getAccounts().filter((a) => a.id !== id));
}

export function clearAccounts(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
