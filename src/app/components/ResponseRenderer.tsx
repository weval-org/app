import React from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';
import { transformHtmlContent } from '@/utils/responseTransformer';

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
  switch (renderAs) {
    case 'html': {
      const transformedContent = transformHtmlContent(content);
      return <SandboxedHtml content={transformedContent} />;
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
