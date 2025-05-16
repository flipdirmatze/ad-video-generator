import { Suspense } from 'react';
import SigninContent from './SigninContent';
import SigninPageLoading from './SigninPageLoading';

export default function SigninPage() {
  return (
    <Suspense fallback={<SigninPageLoading />}>
      <SigninContent />
    </Suspense>
  );
} 