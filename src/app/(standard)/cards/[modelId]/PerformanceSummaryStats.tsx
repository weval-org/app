"use client"

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import Icon from '@/components/ui/icon';

interface Props {
  totalRuns: number;
  totalBlueprints: number;
}

export default function PerformanceSummaryStats({ totalRuns, totalBlueprints }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Icon name="activity" className="h-3.5 w-3.5 text-muted-foreground mr-2" />
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1 text-sm cursor-help underline-offset-4 hover:underline decoration-dotted">
                Runs
                <Icon name="info" className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                Number of times this model was evaluated across all blueprints
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="font-medium">{totalRuns}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Icon name="users" className="h-3.5 w-3.5 text-muted-foreground mr-2" />
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1 text-sm cursor-help underline-offset-4 hover:underline decoration-dotted">
                Blueprints
                <Icon name="info" className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                Distinct evaluation blueprints/configs this model was tested on
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="font-medium">{totalBlueprints}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
