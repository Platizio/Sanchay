import type { Metadata } from 'next';
import { LoginRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Create your account' };

export default function SignupPage() {
  return <LoginRoute mode="signup" next={null} />;
}
