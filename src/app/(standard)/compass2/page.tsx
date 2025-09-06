import Compass2ClientPage from './client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Personality Compass',
};

export default function Compass2Page() {
  return <Compass2ClientPage />;
}
