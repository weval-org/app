'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { normalizeTag, prettifyTag } from '@/app/utils/tagUtils'; 
import Icon from '@/components/ui/icon';

interface TagInfo {
  name: string;
  count: number;
}

interface TopTagsSectionProps {
  tags: TagInfo[];
  maxTags?: number;
}

export default function TopTagsSection({ tags, maxTags = 10 }: TopTagsSectionProps) {
  const displayTags = tags.slice(0, maxTags);

  if (displayTags.length === 0) {
    return null;
  }

  return (
    <section className="mb-12 md:mb-16">
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground">
          Browse by Category
        </h2>
        <Link 
          href="/tags" 
          className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90 transition-colors"
        >
          View All Tags
          <Icon name="arrow-right" className="ml-1.5 h-4 w-4" />
        </Link>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        {displayTags.map(tag => (
          <Link href={`/tags/${normalizeTag(tag.name)}`} key={tag.name} className="block">
            <Card className="p-4 h-full flex flex-col justify-between hover:bg-muted/50 dark:hover:bg-slate-800/60 transition-colors duration-200 ring-1 ring-border/60 hover:ring-primary/40 dark:ring-slate-700/80 group">
              <div className="flex items-center mb-2">
                <Icon name="tag" className="w-4 h-4 mr-2 text-primary group-hover:text-primary/80" />
                <h3 className="font-medium text-primary group-hover:text-primary/90 truncate">
                  {prettifyTag(tag.name)}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {tag.count} {tag.count === 1 ? 'blueprint' : 'blueprints'}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
} 