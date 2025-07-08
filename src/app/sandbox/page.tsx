import React from 'react';
import SandboxClientPage from './components/SandboxClientPage';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sandbox | Weval',
};

export default function SandboxPage() {
  return <SandboxClientPage />;
} 