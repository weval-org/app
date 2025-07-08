'use client';

import { SandboxRunStatus, RunResult } from '../hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import ClientDateTime from '@/app/components/ClientDateTime';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import dynamic from 'next/dynamic';

const X = dynamic(() => import('lucide-react').then(mod => mod.X));
const History = dynamic(() => import('lucide-react').then(mod => mod.History));
const ExternalLink = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink));
const HardDriveDownload = dynamic(() => import('lucide-react').then(mod => mod.HardDriveDownload));

interface RunsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  runStatus: SandboxRunStatus;
  runHistory: RunResult[];
  activeBlueprintName: string | null;
}

function RunStatusDisplay({ status, blueprintName }: { status: SandboxRunStatus; blueprintName: string | null }) {
    const inProgress = ['pending', 'generating_responses', 'evaluating', 'saving'].includes(status.status);

    if (status.status === 'idle' && !inProgress) {
        return <div className="text-sm text-muted-foreground text-center py-2">No active run.</div>;
    }

    const title = blueprintName || "Evaluation";
    
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <div className="w-0 flex-1">
                    <h4 className="font-semibold truncate" title={title || ''}>{title}</h4>
                </div>
                <Badge variant={status.status === 'error' ? 'destructive' : 'default'} className="capitalize flex-shrink-0">
                    {status.status.replace(/_/g, ' ')}
                </Badge>
            </div>
            {inProgress && (
                <>
                    <p className="text-sm text-muted-foreground">{status.message}</p>
                    {status.progress && (
                        <Progress value={(status.progress.completed / status.progress.total) * 100} />
                    )}
                </>
            )}
            {status.status === 'complete' && status.resultUrl && (
                <Button asChild size="sm" className="w-full">
                    <Link href={status.resultUrl} target="_blank">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View Final Results
                    </Link>
                </Button>
            )}
             {status.status === 'error' && (
                <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">{status.message}</p>
            )}
        </div>
    );
}


export function RunsSidebar({ isOpen, onClose, runStatus, runHistory, activeBlueprintName }: RunsSidebarProps) {
  if (!isOpen) return null;

  const inProgress = ['pending', 'generating_responses', 'evaluating', 'saving'].includes(runStatus.status);

  return (
    <div className="fixed top-0 right-0 h-full w-96 bg-background border-l z-50 flex flex-col shadow-lg animate-in slide-in-from-right-24 duration-300 ease-in-out">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Runs</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </header>
      
      {inProgress && (
        <div className="p-4 border-b bg-muted/20">
            <RunStatusDisplay status={runStatus} blueprintName={activeBlueprintName} />
        </div>
      )}

      <ScrollArea className="flex-grow">
        <div className="p-4 space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Past Runs</h4>
            {runHistory.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                    <HardDriveDownload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No past runs found.</p>
                    <p className="text-xs">Completed runs will appear here.</p>
                </div>
            )}
            {runHistory.map((run) => (
                <div key={run.runId} className="p-3 border rounded-lg transition-colors hover:border-primary/50">
                    <div className="flex items-start gap-3">
                        <div className="w-0 flex-1">
                            <p className="font-semibold text-sm truncate" title={run.blueprintName}>{run.blueprintName}</p>
                            <p className="text-xs text-muted-foreground">
                                <ClientDateTime timestamp={run.completedAt} />
                            </p>
                        </div>
                        <Button asChild size="sm" variant="ghost" className="flex-shrink-0">
                            <Link href={run.resultUrl} target="_blank">
                                View
                                <ExternalLink className="w-3 h-3 ml-1.5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
} 