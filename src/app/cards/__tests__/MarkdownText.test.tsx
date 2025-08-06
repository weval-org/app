import { render } from '@testing-library/react';
import React from 'react';

// Extract the MarkdownText component for testing
function MarkdownText({ text }: { text: string }) {
  // Use a more robust approach to parse markdown links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  // Find all markdown links and split the text accordingly
  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }
    
    // Add the link
    parts.push({
      type: 'link',
      text: match[1],
      url: match[2]
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after the last link
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }
  
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'link') {
          return (
            <a
              key={index}
              href={part.url}
              className="text-primary hover:text-primary/80 underline underline-offset-2"
            >
              {part.text}
            </a>
          );
        } else {
          return <span key={index}>{part.content}</span>;
        }
      })}
    </>
  );
}

describe('MarkdownText', () => {
  test('should render plain text without links', () => {
    const { container } = render(<MarkdownText text="This is plain text without any links." />);
    expect(container.textContent).toBe('This is plain text without any links.');
  });

  test('should render text with a single markdown link', () => {
    const { container } = render(<MarkdownText text="Check out [Google](https://google.com) for more info." />);
    
    expect(container.textContent).toContain('Check out');
    expect(container.textContent).toContain('for more info.');
    
    const link = container.querySelector('a[href="https://google.com"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe('Google');
  });

  test('should render text with multiple markdown links', () => {
    const { container } = render(
      <MarkdownText text="Visit [Google](https://google.com) and [GitHub](https://github.com) for resources." />
    );
    
    expect(container.textContent).toContain('Visit');
    expect(container.textContent).toContain('and');
    expect(container.textContent).toContain('for resources.');
    
    const googleLink = container.querySelector('a[href="https://google.com"]');
    const githubLink = container.querySelector('a[href="https://github.com"]');
    
    expect(googleLink?.textContent).toBe('Google');
    expect(githubLink?.textContent).toBe('GitHub');
  });

  test('should handle complex text with config references without duplication', () => {
    const complexText = 'The model excels in legal information retrieval, achieving top rank in [African Charter](/analysis/banjul-charter) and outperforming peers in [EU AI Act](/analysis/eu-ai-act-202401689).';
    
    const { container } = render(<MarkdownText text={complexText} />);
    
    // Check that links exist with correct hrefs
    const charterLink = container.querySelector('a[href="/analysis/banjul-charter"]');
    const aiActLink = container.querySelector('a[href="/analysis/eu-ai-act-202401689"]');
    
    expect(charterLink?.textContent).toBe('African Charter');
    expect(aiActLink?.textContent).toBe('EU AI Act');
    
    // Ensure no duplicate text by checking total text content
    const fullText = container.textContent;
    expect(fullText).toBe('The model excels in legal information retrieval, achieving top rank in African Charter and outperforming peers in EU AI Act.');
    
    // Count occurrences to ensure no duplication
    const charterCount = (fullText.match(/African Charter/g) || []).length;
    const aiActCount = (fullText.match(/EU AI Act/g) || []).length;
    expect(charterCount).toBe(1);
    expect(aiActCount).toBe(1);
  });

  test('should handle edge cases with no duplication', () => {
    const edgeText = 'Start [link1](url1) middle [link2](url2) end';
    
    const { container } = render(<MarkdownText text={edgeText} />);
    
    // Check overall text content
    expect(container.textContent).toBe('Start link1 middle link2 end');
    
    // Links should exist
    const link1 = container.querySelector('a[href="url1"]');
    const link2 = container.querySelector('a[href="url2"]');
    
    expect(link1?.textContent).toBe('link1');
    expect(link2?.textContent).toBe('link2');
    
    // Ensure link text appears only once each
    const fullText = container.textContent || '';
    const link1Count = (fullText.match(/link1/g) || []).length;
    const link2Count = (fullText.match(/link2/g) || []).length;
    expect(link1Count).toBe(1);
    expect(link2Count).toBe(1);
  });
});