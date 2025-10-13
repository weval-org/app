import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ configId: string }>;
}): Promise<Metadata> {
  const { configId } = await params;

  return {
    title: `${configId} Pairs | Weval`,
    description: `Compare AI model responses for the ${configId} configuration`,
  };
}

export default function ConfigPairsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
