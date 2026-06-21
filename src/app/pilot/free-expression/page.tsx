import { Metadata } from 'next';
import { FreeExpressionClient } from './FreeExpressionClient';

export const metadata: Metadata = {
  title: 'Free Expression & AI | Democratic Evaluation of Claude',
  description:
    'Over 2,200 participants across the US, UK, and India collaboratively defined 44 principles for how AI should handle free expression. A three-stage democratic evaluation by the Collective Intelligence Project.',
  openGraph: {
    title: 'Free Expression & AI | Democratic Evaluation of Claude',
    description:
      'Over 2,200 participants across the US, UK, and India collaboratively defined 44 principles for how AI should handle free expression.',
    type: 'article',
    siteName: 'weval',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Expression & AI | Democratic Evaluation of Claude',
    description:
      '2,200+ participants, 3 countries, 44 validated principles for AI and free expression.',
  },
};

export default function FreeExpressionPage() {
  return <FreeExpressionClient />;
}
