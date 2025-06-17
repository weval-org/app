import BlueprintEditorClientPage from './BlueprintEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blueprint Editor - CivicEval',
  description: 'Create and configure CivicEval blueprint YAML files with an easy-to-use, document-style editor.',
};

export default function BlueprintEditorPage() {
  return <BlueprintEditorClientPage />;
} 