import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Loading } from './ui';

/** Keeps users inside the area of the app meant for their role. */
export function RoleGuard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { ready, user } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  if (!roles.includes(user.role)) return <Redirect href="/" />;
  return <>{children}</>;
}
