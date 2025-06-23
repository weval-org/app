import type { Metadata, ResolvingMetadata } from 'next';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import BetaComparisonClientPage from './BetaComparisonClientPage';

type ThisPageGenerateMetadataProps = {
  params: Promise<{
    configId: string;
    runLabel: string;
    timestamp: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  props: ThisPageGenerateMetadataProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return generateAnalysisPageMetadata(
    {
      params: props.params,
      searchParams: props.searchParams,
    },
    parent
  );
}

export default function BetaComparisonPage() {
  return <BetaComparisonClientPage />;
}