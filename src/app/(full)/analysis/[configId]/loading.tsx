import dynamic from 'next/dynamic';
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), {
  ssr: true,
});

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-foreground">
      <div className="flex items-center space-x-3 text-xl">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
        <span className="text-muted-foreground">Loading blueprint versions...</span>
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        Please wait while we gather all the unique runs for this blueprint.
      </p>
    </div>
  );
} 