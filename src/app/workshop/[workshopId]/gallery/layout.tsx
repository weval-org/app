import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workshopId: string }>;
}): Promise<Metadata> {
  const { workshopId } = await params;

  return {
    title: `Gallery - ${workshopId} | Workshop | Weval`,
    description: 'Browse published evaluations from this workshop session.',
  };
}

export default function WorkshopGalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
