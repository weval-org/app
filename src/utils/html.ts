import { DOMParser } from '@xmldom/xmldom';

// Allowed prose elements that we want to keep
const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'em', 'i', 'strong', 'b',
  'a',
  'br'
]);

/**
 * Cleans HTML content to only include prose-related elements
 * Removes any unwanted tags while preserving the text content
 */
export function cleanHtml(html: string): string {
  // First pass: Convert specific elements we want to preserve
  let cleaned = html
    // Convert divs to paragraphs
    .replace(/<div[^>]*>/g, '<p>')
    .replace(/<\/div>/g, '</p>')
    // Convert spans to their content
    .replace(/<\/?span[^>]*>/g, '')
    // Normalize line breaks
    .replace(/<br\s*\/?>/g, '<br>')
    // Remove WordPress-specific elements
    .replace(/<\/?wp-[^>]*>/g, '')
    // Remove style attributes
    .replace(/\s+style="[^"]*"/g, '')
    // Remove class attributes
    .replace(/\s+class="[^"]*"/g, '');

  // Second pass: Parse and clean HTML
  const parser = new DOMParser();
  let doc: any | null = null;
  try {
    doc = parser.parseFromString(`<body>${cleaned}</body>`, 'text/html');
  } catch (e) {
    console.error('Error parsing HTML', e);
    return cleaned;
  }
  
  function cleanNode(node: Node): string {
    if (node.nodeType === 3) { // TEXT_NODE
      return node.nodeValue || '';
    }
    
    if (node.nodeType === 1) { // ELEMENT_NODE
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      
      // If it's an allowed tag, keep it with its attributes stripped
      if (ALLOWED_TAGS.has(tagName)) {
        const childContent = Array.from(node.childNodes)
          .map(child => cleanNode(child))
          .join('');
          
        // Special handling for links to preserve href
        if (tagName === 'a') {
          const href = element.getAttribute('href');
          return href ? 
            `<a href="${href}">${childContent}</a>` : 
            childContent;
        }
        
        return `<${tagName}>${childContent}</${tagName}>`;
      }
      
      // For non-allowed tags, just keep their text content
      return Array.from(node.childNodes)
        .map(child => cleanNode(child))
        .join('');
    }
    
    return '';
  }

  // Clean the body content
  const cleanedHtml = Array.from(doc.documentElement.childNodes)
    .map((node: any) => cleanNode(node))
    .join('');
  
  // Final pass: Clean up any remaining unwanted patterns
  return cleanedHtml
    // Remove empty paragraphs
    .replace(/<p>\s*<\/p>/g, '')
    // Remove multiple consecutive line breaks
    .replace(/(<br\s*\/?>\s*){3,}/g, '<br><br>')
    // Remove multiple consecutive spaces
    .replace(/\s{2,}/g, ' ')
    // Clean up any remaining WordPress shortcodes
    .replace(/\[[^\]]+\]/g, '')
    .trim();
} 