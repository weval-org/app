import { getConfigRedlinesFeed } from '@/lib/storageService';
import { notFound } from 'next/navigation';

function renderAnnotatedResponse(annotatedResponse: string) {
  if (!annotatedResponse) return null;
  
  // Parse inline XML tags and render with appropriate styling
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  let keyCounter = 0;
  
  // Find all issue tags
  const tagRegex = /<(issue)([^>]*)>(.*?)<\/\1>/gi;
  let match;
  
  while ((match = tagRegex.exec(annotatedResponse)) !== null) {
    const [fullMatch, tagType, attributes, content] = match;
    const startIndex = match.index;
    const endIndex = match.index + fullMatch.length;
    
    // Add text before this tag
    if (startIndex > currentIndex) {
      parts.push(
        <span key={`text-${keyCounter++}`}>
          {annotatedResponse.slice(currentIndex, startIndex)}
        </span>
      );
    }
    
    // Extract point attribute if present
    const pointMatch = attributes.match(/point=["']([^"']*)["']/i);
    const point = pointMatch ? pointMatch[1] : '';
    
    // Style the annotated span
    const className = 'bg-red-500/20 ring-1 ring-red-500/40 rounded px-0.5';
    
    const title = `ISSUE: ${point}`;
    
    parts.push(
      <span key={`tag-${keyCounter++}`} className={className} title={title}>
        {content}
      </span>
    );
    
    currentIndex = endIndex;
  }
  
  // Add remaining text
  if (currentIndex < annotatedResponse.length) {
    parts.push(
      <span key={`text-${keyCounter++}`}>
        {annotatedResponse.slice(currentIndex)}
      </span>
    );
  }
  
  return <div className="whitespace-pre-wrap leading-relaxed">{parts}</div>;
}

export default async function ConfigRedlinesPage({
  params,
}: {
  params: { configId: string };
}) {
  const { configId } = params;
  
  const redlinesFeed = await getConfigRedlinesFeed(configId);
  
  if (!redlinesFeed || !redlinesFeed.items?.length) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-4">
          Redlines for {configId}
        </h1>
        <div className="text-sm text-muted-foreground mb-4">
          {redlinesFeed.items.length} annotations • Last updated: {new Date(redlinesFeed.lastUpdated).toLocaleString()}
        </div>
        <div className="text-sm text-muted-foreground mb-6">
          <span className="bg-red-500/20 ring-1 ring-red-500/40 rounded px-1">Issues</span>
        </div>
      </div>

      <div className="space-y-8">
        {redlinesFeed.items.map((item, idx) => (
          <div key={`${item.configId}-${item.promptId}-${item.modelId}-${idx}`} className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="truncate">
                <div className="font-medium truncate">
                  {item.promptId} / {item.modelId}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.responseHash} / {item.llm?.modelId || 'unknown-annotator'}
                </div>
              </div>
            </div>
            
            <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap leading-relaxed bg-muted rounded p-4">
              {renderAnnotatedResponse(item.annotatedResponse)}
            </div>

            {/* Additional annotations */}
            {(item.additionalIssues?.length) && (
              <div className="border-t pt-3 mt-3">
                <h4 className="font-medium text-sm mb-2">Additional Issues</h4>
                <div className="space-y-2">
                  {item.additionalIssues?.map((issue, pIdx) => (
                    <div key={`issue-${pIdx}`} className="flex gap-2 text-sm">
                      <span className="text-red-600 font-medium">✗</span>
                      <div>
                        <div className="text-red-700 dark:text-red-300">{issue.content}</div>
                        {issue.point && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Point: {issue.point}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rubric points for context */}
            {item.rubricPoints?.length && (
              <div className="border-t pt-3 mt-3">
                <h4 className="font-medium text-sm mb-2">Rubric Points</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {item.rubricPoints.map((point, rIdx) => (
                    <li key={rIdx} className="flex gap-2">
                      <span>•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
