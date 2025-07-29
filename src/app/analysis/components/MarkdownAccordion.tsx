'use client';

import { useState, useMemo, useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Icon from '@/components/ui/icon';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

interface MarkdownAccordionProps {
  content: string;
}

interface AccordionSection {
  title: string;
  content: string;
}

export const MarkdownAccordion: React.FC<MarkdownAccordionProps> = ({ content }) => {
  // Start with no sections open by default. The effect will set the initial state.
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  const { preamble, sections } = useMemo(() => {
    if (!content) return { preamble: null, sections: [] };
    
    const parsedSections: AccordionSection[] = [];
    // This regex splits the content string by h2 headers, keeping the header in the resulting array.
    const splitRegex = /(?=^## )/m; 
    const rawSections = content.split(splitRegex).filter(s => s.trim() !== '');

    let preambleText: string | null = null;
    let sectionsToProcess = rawSections;

    // Check if the very first chunk of text does not start with a heading. If so, it's a preamble.
    if (rawSections.length > 0 && !rawSections[0].startsWith('##')) {
      preambleText = rawSections[0];
      sectionsToProcess = rawSections.slice(1);
    }
    
    sectionsToProcess.forEach(sectionText => {
        const lines = sectionText.trim().split('\n');
        const firstLine = lines[0].trim();
        
        let title = '';

        if (firstLine.startsWith('## ')) {
            title = firstLine.substring(3);
        }

        const content = lines.slice(1).join('\n').trim();
        // Only add sections that were successfully parsed with a heading
        if (title) {
            parsedSections.push({ title, content });
        }
    });

    return {
        preamble: preambleText,
        sections: parsedSections
    };

  }, [content]);
  
  // Set the initial open state after the sections have been parsed.
  useEffect(() => {
    if (sections.length > 0) {
        const defaultOpen = new Set([0]); // Always open the first section.
        sections.forEach((section, index) => {
            // If a section is empty and it's not the last one, open the next one.
            if (section.content.trim() === '' && index + 1 < sections.length) {
                defaultOpen.add(index + 1);
            }
        });
        setOpenSections(defaultOpen);
    }
  }, [sections]);

  const toggleSection = (index: number) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // If there are no h2 headings, there's nothing to accordion-ize.
  // Just render the original markdown content.
  if (sections.length === 0) {
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{content}</ReactMarkdown>
        </div>
    );
  }

  return (
    <div className="text-sm">
      {preamble && (
                      <div className="pb-4 prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                {preamble}
            </ReactMarkdown>
          </div>
      )}
      {sections.map((section, index) => (
        <Collapsible key={index} open={openSections.has(index)} onOpenChange={() => toggleSection(index)} className="border-t border-border/60">
          <CollapsibleTrigger className="flex items-center w-full text-left py-3 group -mx-3 px-3 hover:bg-muted/50 rounded-md">
            <Icon name="chevron-right" className={`w-4 h-4 mr-2 flex-shrink-0 transform transition-transform text-muted-foreground group-hover:text-primary ${openSections.has(index) ? 'rotate-90' : ''}`} />
            <span className="flex-1 font-semibold group-hover:text-primary text-base">
              {section.title}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pb-4 pt-1 pl-4">
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                    {section.content}
                </ReactMarkdown>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}; 