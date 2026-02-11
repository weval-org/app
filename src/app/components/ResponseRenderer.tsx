"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';
import { transformHtmlContent } from '@/utils/responseTransformer';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { Check, Copy } from 'lucide-react';

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

// Strip HTML tags to get plain text (like innerText)
const htmlToPlainText = (html: string): string => {
    // Create a temporary element to parse HTML and extract text
    if (typeof document !== 'undefined') {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    }
    // Fallback for SSR: basic tag stripping
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
};

const CopyButton = ({ content, className = '', stripHtml = false }: { content: string; className?: string; stripHtml?: boolean }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            const textToCopy = stripHtml ? htmlToPlainText(content) : content;
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 bg-background/80 backdrop-blur-sm hover:bg-background/95 shadow-sm ${className}`}
            onClick={handleCopy}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
            {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
            ) : (
                <Copy className="w-3 h-3 text-muted-foreground" />
            )}
        </Button>
    );
};

export type RenderAsType = 'markdown' | 'html' | 'plaintext';

interface ResponseRendererProps {
  content: string;
  renderAs?: RenderAsType;
  suppressLinks?: boolean;
}

const ResponseRenderer: React.FC<ResponseRendererProps> = ({ content, renderAs = 'markdown', suppressLinks = false }) => {
  const [showPlaintext, setShowPlaintext] = useState(false);

  switch (renderAs) {
    case 'html': {
      const transformedContent = transformHtmlContent(content);
      return (
        <div className="relative w-full h-full overflow-hidden">
          <div className="absolute top-1 right-1 z-10 flex gap-1">
            <CopyButton content={content} stripHtml={true} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 bg-background/80 backdrop-blur-sm hover:bg-background/95 shadow-sm"
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
          </div>
          {showPlaintext ? (
            <pre className="whitespace-pre-wrap text-xs p-2 overflow-auto h-full">{content}</pre>
          ) : (
            <SandboxedHtml content={transformedContent} />
          )}
        </div>
      );
    }
    case 'plaintext':
      return (
        <div className="relative">
          <CopyButton content={content} className="absolute top-1 right-1 z-10" />
          <pre className="whitespace-pre-wrap">{content}</pre>
        </div>
      );
    case 'markdown':
    default:
      return (
        <div className="relative">
          <CopyButton content={content} className="absolute top-1 right-1 z-10" />
          <div className="prose prose-sm prose-inherit max-w-none prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-xs">
              <ReactMarkdown
                  remarkPlugins={[RemarkGfmPlugin as any]}
                  components={suppressLinks ? {
                    a: ({ node, children, ...props }) => <span {...props}>{children}</span>
                  } : undefined}
              >
                  {content}
              </ReactMarkdown>
          </div>
        </div>
      );
  }
};

export default ResponseRenderer;
