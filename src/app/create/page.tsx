import PlaygroundEditorClientPage from './PlaygroundEditorClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blueprint Playground - Weval',
  description: 'Create, test, and share Weval evaluation blueprints in a simple, powerful editor.',
};

export default function CreateBlueprintPage() {
  return <PlaygroundEditorClientPage />;
}
