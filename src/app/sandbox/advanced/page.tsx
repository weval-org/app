import SandboxEditorClientPage from '../SandboxEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Advanced Sandbox Studio | Weval',
  description: 'Create, test, and propose a new evaluation blueprint for the Weval community library using advanced features.',
};

export default function AdvancedSandboxPage() {
  return (
    <SandboxEditorClientPage />
  );
} 