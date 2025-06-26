import { Card } from '@/components/ui/card';

function SkeletonTagCard() {
    return (
        <Card className="p-6 h-full flex flex-col justify-between animate-pulse">
            <div className="h-6 bg-muted rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/3"></div>
        </Card>
    );
}

export default function TagsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <div className="h-10 bg-muted rounded w-1/3 mb-8 animate-pulse"></div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <SkeletonTagCard key={i} />
        ))}
      </div>
    </div>
  );
} 