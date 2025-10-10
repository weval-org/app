import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workshopId: string }>;
}): Promise<Metadata> {
  const { workshopId } = await params;

  return {
    title: `${workshopId} | Workshop | Weval`,
    description: 'Collaborative AI evaluation builder - create and test evaluations with your team.',
  };
}

export default function WorkshopIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
