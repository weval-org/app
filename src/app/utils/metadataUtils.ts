import type { Metadata, ResolvingMetadata } from 'next';
import { fromSafeTimestamp } from './timestampUtils'; // Adjusted import path

// Props type for generateMetadata function - params and searchParams as Promises
export type GenerateMetadataProps = {
  params: Promise<{ [key: string]: string | string[] | undefined }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Generic function to generate metadata for analysis-like pages
export async function generateAnalysisPageMetadata(
  props: GenerateMetadataProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParams = await props.params;
  const resolvedSearchParams = await props.searchParams;

  const configIdParam = resolvedParams.configId;
  const runLabelParam = resolvedParams.runLabel;
  const timestampParam = resolvedParams.timestamp;

  // Type guard: Ensure params are single strings as expected for this logic
  if (
    typeof configIdParam !== 'string' ||
    typeof runLabelParam !== 'string' ||
    typeof timestampParam !== 'string'
  ) {
    console.warn(
      '[metadataUtils] Missing or invalid essential string params from resolved params. Received:',
      {
        configId: typeof configIdParam,
        runLabel: typeof runLabelParam,
        timestamp: typeof timestampParam,
      },
      'Search Params (resolved):', resolvedSearchParams // Log resolved searchParams for debugging if needed
    );
    return {
      title: 'Weval Analysis',
      description: 'Detailed AI model performance analysis by Weval. Parameters missing or invalid.',
    };
  }

  // Now we know they are strings
  const configId: string = configIdParam;
  const runLabel: string = runLabelParam;
  const timestamp: string = timestampParam;
  
  const inferredTitle = configId.replace(/[-_]/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const pageTitle = `Analysis: ${inferredTitle} - Run ${runLabel.substring(0, 7)}...`;
  const description = `Detailed analysis for Blueprint \'${inferredTitle}\' (Version: ${runLabel.substring(0,12)}...), executed on ${new Date(fromSafeTimestamp(timestamp)).toLocaleDateString()}`;
  
  // Consistent appUrl definition
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8888' : 'https://weval.org');
  console.log('[metadataUtils] appUrl for analysis page:', appUrl);

  // Construct image URL carefully, pointing to the opengraph-image route for the specific analysis page.
  const imageUrl = `${appUrl}/analysis/${configId}/${runLabel}/${timestamp}/opengraph-image`; 

  return {
    title: pageTitle,
    description: description,
    openGraph: {
      title: pageTitle,
      description: description,
      url: `${appUrl}/analysis/${configId}/${runLabel}/${timestamp}`,
      siteName: 'Weval',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `Open Graph image for Weval analysis of ${inferredTitle}`,
        },
      ],
      locale: 'en_US',
      type: 'article',
      publishedTime: new Date(fromSafeTimestamp(timestamp)).toISOString(),
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: description,
      images: [imageUrl],
    },
  };
} 