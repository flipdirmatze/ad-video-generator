import { Suspense } from 'react';
import AuthErrorContent from './ErrorContent';
import ErrorPageLoading from './ErrorPageLoading';

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<ErrorPageLoading />}>
      <AuthErrorContent />
    </Suspense>
  );
} 