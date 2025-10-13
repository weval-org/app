import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Comparison Pairs | Weval',
  description: 'Help evaluate AI by comparing model responses side by side',
};

export default function ConfigPairsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
