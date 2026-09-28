import type { Metadata } from 'next';
import { LoginRoute } from '../../../client/routes';
import { safeNext } from '../../../lib/routing';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  return <LoginRoute mode="login" next={safeNext(typeof next === 'string' ? next : null)} />;
}
