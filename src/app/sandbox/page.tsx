import SandboxEditorClientPage from './SandboxEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blueprint Sandbox - Weval',
  description: 'Create, test, and share Weval evaluation blueprints in a simple, powerful editor.',
};

export default function CreateBlueprintPage() {
  return <SandboxEditorClientPage />;
}
