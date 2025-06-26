import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const ArrowLeft = dynamic(() => import('lucide-react').then(mod => mod.ArrowLeft));

function SkeletonRunCard() {
    return (
        <Card className="bg-card/80 dark:bg-slate-800/60 p-4 animate-pulse">
            <div className="flex justify-between items-start">
                <div className="w-2/3 space-y-2">
                    <div className="h-5 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                </div>
                <div className="flex items-center space-x-6 text-right">
                    <div className="w-16 h-12 bg-muted rounded-sm"></div>
                    <div className="w-24 space-y-2">
                        <div className="h-4 bg-muted rounded w-full"></div>
                        <div className="h-6 bg-muted rounded w-3/4 ml-auto"></div>
                    </div>
                </div>
            </div>
        </Card>
    );
}

export default function LatestPageLoading() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-slate-100" />
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Latest Evaluation Runs</h2>
                    <Button asChild variant="ghost" disabled>
                        <Link href="/">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Home
                        </Link>
                    </Button>
                </div>
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <SkeletonRunCard key={i} />
                    ))}
                </div>
            </main>
        </div>
    );
} 