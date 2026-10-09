import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from './api';
import { useAuth } from './auth';

/**
 * Loads `path` and reloads whenever the screen regains focus. Pass null to skip loading.
 * `intervalMs` keeps the data fresh while the screen is visible (used for live views).
 */
export function useApi<T>(requestedPath: string | null, { intervalMs }: { intervalMs?: number } = {}) {
  // Wait until the saved session is restored, otherwise deep links fire unauthenticated requests.
  const { ready, user } = useAuth();
  const path = ready && user ? requestedPath : null;
  const [state, setState] = useState<{ data: T | null; error: unknown; forPath: string | null }>({ data: null, error: null, forPath: null });
  const [refreshing, setRefreshing] = useState(false);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const load = useCallback(async (p: string | null, mode: 'initial' | 'refresh' | 'silent') => {
    if (!p) return;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await api<T>(p);
      if (pathRef.current === p) setState({ data: res, error: null, forPath: p });
    } catch (e) {
      if (pathRef.current === p) setState((s) => (mode === 'silent' && s.forPath === p ? s : { data: s.forPath === p ? s.data : null, error: e, forPath: p }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(path, 'initial');
  }, [path, load]);

  useFocusEffect(
    useCallback(() => {
      load(pathRef.current, 'silent');
      if (!intervalMs) return undefined;
      const id = setInterval(() => load(pathRef.current, 'silent'), intervalMs);
      return () => clearInterval(id);
    }, [load, intervalMs]),
  );

  const current = state.forPath === path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: Boolean(requestedPath) && (!ready || (Boolean(path) && !current)),
    refreshing,
    reload: () => load(path, 'refresh'),
  };
}
