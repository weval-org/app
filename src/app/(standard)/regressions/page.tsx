import { Metadata } from 'next';
import { RegressionsPageClient } from './RegressionsPageClient';

export const metadata: Metadata = {
  title: 'Model Regressions - Weval',
  description: 'Track performance regressions across model versions and releases',
};

export default function RegressionsPage() {
  return <RegressionsPageClient />;
}
