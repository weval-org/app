import { getRedlinesFeed } from '@/lib/storageService';

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
  
  return parts;
}

function coerceStringList(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      if (typeof v.point === 'string' && typeof v.rationale === 'string') return `${v.point} — ${v.rationale}`;
      if (typeof v.point === 'string') return v.point;
      if (typeof v.message === 'string') return v.message;
      if (typeof v.reason === 'string') return v.reason;
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  });
}

export default async function RedlinesIndexPage() {
  const feed = await getRedlinesFeed();
  const items = (feed?.items || []);
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Redlines</h1>
      <p className="text-muted-foreground">All span critiques (experimental)</p>
      <div className="space-y-6">
        {(items || []).map((it: any, i: number) => (
          <div key={i} className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="truncate">
                <div className="font-medium truncate">
                  <a 
                    href={`/redlines/${encodeURIComponent(it.configId)}`}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    {it.configId}
                  </a>
                  {' / '}{it.promptId}
                </div>
                <div className="text-xs text-muted-foreground truncate">{it.runLabel} / {it.timestamp} / {it.modelId}</div>
              </div>
            </div>
            <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap leading-relaxed bg-muted rounded p-4">
              {it.annotatedResponse ? (
                renderAnnotatedResponse(it.annotatedResponse)
              ) : (
                <span>{it.responseText}</span>
              )}
            </div>
            {(it.additionalIssues?.length) ? (
              <div className="border rounded p-3">
                <div className="font-semibold mb-1">Additional Issues</div>
                <ul className="list-disc pl-5 space-y-1">
                  {(it.additionalIssues || []).map((d: any, j: number) => (
                    <li key={j} className="text-sm">
                      <div>{d.content}</div>
                      {d.point && <div className="text-xs text-muted-foreground">Point: {d.point}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
