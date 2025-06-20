import BlueprintEditorClientPage from './BlueprintEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blueprint Editor - we-val',
  description: 'Create and configure we-val blueprint YAML files with an easy-to-use, document-style editor.',
};

export default function BlueprintEditorPage() {
  return <BlueprintEditorClientPage />;
} 