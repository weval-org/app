import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Workshop | Weval',
  description: 'Build and test AI evaluations together in real-time. Perfect for workshops, research teams, and collaborative testing.',
};

export default function WorkshopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
