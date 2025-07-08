import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Metadata } from 'next';
import { getTags } from '@/lib/tag-service';
import { prettifyTag } from '@/app/utils/tagUtils';
import { SiteHeader } from '@/app/components/SiteHeader';

export const metadata: Metadata = {
  title: 'All Tags - Weval',
  description: 'Browse all evaluation categories and tags used across Weval blueprints.',
};

export default async function TagsPage() {
  const tags = await getTags();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-8">
        Browse by Tag
      </h1>

      {tags.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tags.map(tag => (
            <Link href={`/tags/${encodeURIComponent(tag.name)}`} key={tag.name} passHref>
              <Card className="p-6 h-full flex flex-col justify-between hover:bg-muted/50 dark:hover:bg-slate-800/60 transition-colors duration-200 ring-1 ring-border/60 hover:ring-primary/40 dark:ring-slate-700/80">
                <h2 className="text-lg font-semibold text-primary">{prettifyTag(tag.name)}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {tag.count} {tag.count === 1 ? 'blueprint' : 'blueprints'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-muted-foreground">No tags found.</h2>
          <p className="mt-2 text-muted-foreground">Evaluation blueprints have not been tagged yet.</p>
        </div>
      )}
    </div>
  );
} 