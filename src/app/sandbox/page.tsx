import React, { Suspense } from 'react';
import SandboxClientPage from './components/SandboxClientPage';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sandbox | Weval',
};

export default function SandboxPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SandboxClientPage />
    </Suspense>
  );
} 