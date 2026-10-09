import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * API base URL:
 * 1. EXPO_PUBLIC_API_URL if set (production / staging)
 * 2. web served by the Tarakhis server: same origin as the page
 * 3. web on the Expo dev server (port 8081): same host, port 4000
 * 4. phone in development: the dev machine's LAN IP (from the Expo dev server), port 4000
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    if (window.location.port !== '8081') return window.location.origin;
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:4000`;
}

export const API_URL = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** Turns a server-relative path (e.g. a signed file URL) into an absolute URL. */
export function absoluteUrl(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

export type UploadFile = { uri: string; name: string; type: string; file?: File | Blob };

type Options = {
  method?: string;
  body?: unknown;
  form?: Record<string, string | number | null | undefined | UploadFile>;
};

export async function api<T = any>(path: string, { method = 'GET', body, form }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const sentToken = authToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let payload: any;
  if (form) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(form)) {
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'object') {
        // Web pickers give a File/Blob; native expects { uri, name, type }.
        if (value.file) fd.append(key, value.file, value.name);
        else fd.append(key, { uri: value.uri, name: value.name, type: value.type } as any);
      } else {
        fd.append(key, String(value));
      }
    }
    payload = fd;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    // Only sign out when the current session itself was rejected (not a stale or tokenless request).
    if (res.status === 401 && sentToken && sentToken === authToken) onUnauthorized?.();
    throw new ApiError(res.status, data?.error || 'ERROR', data?.message || 'Request failed', data?.details);
  }
  return data as T;
}
