import fs from 'fs/promises';
import path from 'path';
import { cache } from 'react';

export interface Post {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  categories: string[];
  url: string;
}

let cachedPosts: Post[] | null = null;

export const processXMLData = cache(async (): Promise<Post[]> => {
  // Return cached posts if available
  if (cachedPosts) {
    console.log('Returning cached posts');
    return cachedPosts;
  }

  try {
    const xmlPath = path.join(process.cwd(), 'src/data/stories_2014_2024_staff_picks.xml');
    const xmlData = await fs.readFile(xmlPath, 'utf-8');
    
    console.log('XML File loaded, size:', xmlData.length, 'bytes');

    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    const items = xmlData.match(itemRegex) || [];

    console.log(`Found ${items.length} items using regex`);

    const extractTag = (item: string, tag: string): string => {
      // Special handling for content:encoded tag
      const tagPattern = tag === 'content:encoded' 
        ? 'content:encoded'
        : tag.replace(':', '\\:');

      // More greedy pattern for content
      const patterns = [
        // CDATA pattern - more greedy
        new RegExp(`<${tagPattern}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagPattern}>`, 'i'),
        // Regular pattern - more greedy
        new RegExp(`<${tagPattern}[^>]*>([\\s\\S]*?)</${tagPattern}>`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = item.match(pattern);
        if (match && match[1]) {
          const content = match[1].trim();
          // Debug long content extraction
          if (tag === 'content:encoded' && content.length > 100) {
            // console.log(`Found long content: ${content.length} chars`);
          }
          return content;
        }
      }

      return '';
    };

    const extractTags = (item: string, tag: string): string[] => {
      const results = new Set<string>();
      
      // Extract CDATA categories
      const cdataPattern = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[(.*?)\\]\\]>\\s*</${tag}>`, 'gi');
      const cdataMatches = Array.from(item.matchAll(cdataPattern));
      cdataMatches.forEach(match => {
        if (match[1]) results.add(match[1].trim());
      });

      // Extract regular categories
      const regularPattern = new RegExp(`<${tag}[^>]*>\\s*(.*?)\\s*</${tag}>`, 'gi');
      const regularMatches = Array.from(item.matchAll(regularPattern));
      regularMatches.forEach(match => {
        if (match[1] && !match[1].includes('CDATA')) {
          results.add(match[1].trim());
        }
      });

      return Array.from(results).filter(Boolean);
    };

    const cleanContent = (content: string): string => {
      if (!content) return '';
      
      return content
        // Remove image tags completely
        .replace(/<img src="[^"]*"[^>]*\/?>/g, '')
        // Remove figure tags that might contain images
        .replace(/<figure[^>]*>.*?<\/figure>/g, '')
        // Clean XML/HTML entities
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        // Remove WordPress block comments
        .replace(/<!-- wp:([^\s>]+)(.*?)-->/g, '')
        .replace(/<!-- \/wp:([^\s>]+) -->/g, '')
        // Clean up whitespace
        .replace(/\n\s*\n/g, '\n')
        .trim();
    };

    const formatDate = (dateStr: string): string => {
      try {
        // Always return the date in YYYY-MM-DD format
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
      } catch {
        return '1970-01-01'; // fallback date if parsing fails
      }
    };

    // Generate deterministic IDs
    const generateId = (item: string): string => {
      let hash = 0;
      for (let i = 0; i < item.length; i++) {
        const char = item.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return `post_${Math.abs(hash)}`;
    };

    const formatPreview = (content: string): string => {
      // Remove HTML tags for preview
      const textOnly = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const preview = textOnly.slice(0, 300);
      return preview + (textOnly.length > 300 ? '...' : '');
    };

    const posts = items
      .map((item, index): Post | null => {
        const postType = extractTag(item, 'wp:post_type');
        if (postType && postType !== 'post') return null;

        const title = cleanContent(extractTag(item, 'title'));
        if (!title) return null;

        const rawContent = extractTag(item, 'content:encoded');
        const content = cleanContent(rawContent);
        
        // Debug content extraction
        if (index < 5) {
          console.log('\nProcessing post:', title);
          console.log('Raw content length:', rawContent.length);
          console.log('Cleaned content length:', content.length);
          console.log('Content preview:', formatPreview(content));
        }

        if (!content) return null;

        // Use deterministic ID generation
        const wpPostId = extractTag(item, 'wp:post_id');
        const guid = extractTag(item, 'guid');
        const id = wpPostId || guid || generateId(title + content.slice(0, 100));

        return {
          id,
          title,
          content,
          author: cleanContent(extractTag(item, 'dc:creator')),
          date: formatDate(extractTag(item, 'pubDate')),
          categories: extractTags(item, 'category'),
          url: extractTag(item, 'link') || `#${id}`
        };
      })
      .filter(post => post && post.content.length > 100) as Post[]; // Only keep posts with substantial content

    // Sort posts by date to ensure consistent order
    posts.sort((a, b) => b.date.localeCompare(a.date));

    console.log(`\nExtracted ${posts.length} posts with content`);
    
    // Show detailed samples
    console.log('\nSample posts:');
    posts.slice(0, 3).forEach((post, i) => {
      console.log(`\n--- Post ${i + 1} ---`);
      console.log('Title:', post.title);
      console.log('Date:', post.date);
      console.log('Author:', post.author);
      console.log('Categories:', post.categories.join(', '));
      console.log('Content length:', post.content.length);
      console.log('Preview:', formatPreview(post.content));
    });

    // Content statistics
    const contentLengths = posts.map(p => p.content.length);
    console.log('\nContent Statistics:');
    console.log('Shortest post:', Math.min(...contentLengths), 'chars');
    console.log('Longest post:', Math.max(...contentLengths), 'chars');
    console.log('Average length:', Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length), 'chars');
    console.log('Total posts:', posts.length);

    // Cache the results before returning
    cachedPosts = posts;
    return posts;
  } catch (error) {
    console.error('Error processing XML:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return [];
  }
}); 