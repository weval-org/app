import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workshopId: string; wevalId: string }>;
}): Promise<Metadata> {
  const { workshopId, wevalId } = await params;

  return {
    title: `Results - ${wevalId} | ${workshopId} | Weval`,
    description: 'View evaluation results and model performance comparisons.',
  };
}

export default function WevalResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
