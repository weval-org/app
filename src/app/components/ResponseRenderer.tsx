import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';
import { transformHtmlContent } from '@/utils/responseTransformer';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';

const SandboxedHtml = ({ content }: { content: string }) => {
    return (
        <iframe
            srcDoc={content}
            sandbox="allow-scripts" // Adjust sandbox rules as needed, but be restrictive.
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Sandboxed HTML Response"
        />
    );
};

export type RenderAsType = 'markdown' | 'html' | 'plaintext';

interface ResponseRendererProps {
  content: string;
  renderAs?: RenderAsType;
}

const ResponseRenderer: React.FC<ResponseRendererProps> = ({ content, renderAs = 'markdown' }) => {
  const [showPlaintext, setShowPlaintext] = useState(false);

  switch (renderAs) {
    case 'html': {
      const transformedContent = transformHtmlContent(content);
      return (
        <div className="relative w-full h-full overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1 right-1 z-10 h-6 px-2 text-xs bg-background/80 backdrop-blur-sm hover:bg-background/95 shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setShowPlaintext(!showPlaintext);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            title={showPlaintext ? 'Show rendered HTML' : 'Show source code'}
          >
            <Icon name={showPlaintext ? 'eye' : 'file-code-2'} className="w-3 h-3" />
          </Button>
          {showPlaintext ? (
            <pre className="whitespace-pre-wrap text-xs p-2 overflow-auto h-full">{content}</pre>
          ) : (
            <SandboxedHtml content={transformedContent} />
          )}
        </div>
      );
    }
    case 'plaintext':
      return <pre className="whitespace-pre-wrap">{content}</pre>;
    case 'markdown':
    default:
      return (
        <div className="prose prose-sm prose-inherit max-w-none prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-xs">
            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                {content}
            </ReactMarkdown>
        </div>
      );
  }
};

export default ResponseRenderer;
