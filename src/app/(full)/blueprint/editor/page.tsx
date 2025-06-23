import BlueprintEditorClientPage from './BlueprintEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blueprint Editor - Weval',
  description: 'Create and configure Weval blueprint YAML files with an easy-to-use, document-style editor.',
};

export default function BlueprintEditorPage() {
  return <BlueprintEditorClientPage />;
} 