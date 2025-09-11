import type { Metadata } from 'next';
import StoryPageClient from './StoryPageClient';

export const metadata: Metadata = {
  title: 'Weval - Tell Your Story, Create Your Evaluation',
  description: 'Tell Your Story, Create Your Evaluation',
};

export default function StoryPage() {
  return <StoryPageClient />;
}


