import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import { stopBackgroundTracking } from './backgroundLocation';
import { storage } from './storage';
import type { Company, User } from './types';

type AuthValue = {
  ready: boolean;
  user: User | null;
  company: Company | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = 'tarakhis.token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const clear = useCallback(async () => {
    await stopBackgroundTracking();
    setAuthToken(null);
    setUser(null);
    setCompany(null);
    await storage.remove(TOKEN_KEY);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api<{ user: User; company: Company }>('/auth/me');
    setUser(me.user);
    setCompany(me.company);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    (async () => {
      const token = await storage.get(TOKEN_KEY);
      if (token) {
        setAuthToken(token);
        try {
          await refresh();
        } catch (e: any) {
          // Keep the session when merely offline; drop it if the server rejected it.
          if (e?.status === 401) await clear();
        }
      }
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear, refresh]);

  const start = useCallback(
    async (res: { token: string }) => {
      setAuthToken(res.token);
      await storage.set(TOKEN_KEY, res.token);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      user,
      company,
      refresh,
      logout: clear,
      login: async (phone, password) => start(await api('/auth/login', { method: 'POST', body: { phone, password } })),
      register: async (data) => start(await api('/auth/register', { method: 'POST', body: data })),
    }),
    [ready, user, company, refresh, clear, start],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const isManager = (u?: User | null) => u?.role === 'owner' || u?.role === 'manager';
export const isOffice = (u?: User | null) => isManager(u) || u?.role === 'safety';
