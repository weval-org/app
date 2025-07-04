import SandboxEditorClientPage from './SandboxEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sandbox Studio | Weval',
  description: 'Create, test, and propose a new evaluation blueprint for the Weval community library.',
};

export default function SandboxPage() {
  return (
    <SandboxEditorClientPage />
  );
} 