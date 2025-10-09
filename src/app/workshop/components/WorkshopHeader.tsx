'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users, Copy, Check } from 'lucide-react';
import { formatWorkshopId } from '@/lib/workshop-utils';

interface WorkshopHeaderProps {
  workshopId: string;
  rightContent?: React.ReactNode;
}

export function WorkshopHeader({ workshopId, rightContent }: WorkshopHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyWorkshopLink = () => {
    const url = `${window.location.origin}/workshop/${workshopId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t-2 border-t-primary">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Workshop ID Badge - prominent */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 rounded-full">
              <Users className="h-4 w-4 text-primary dark:text-primary" />
              <span className="font-mono text-primary dark:text-primary">
                Weval Workshop ID: <span className="font-semibold">{formatWorkshopId(workshopId)}</span>
              </span>
              <button
                onClick={copyWorkshopLink}
                className="p-1 hover:bg-primary/20 dark:hover:bg-primary/30 rounded transition-colors"
                title={copied ? 'Copied!' : 'Copy workshop link'}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-primary" />
                )}
              </button>
            </div>

            {/* Breadcrumb - secondary */}
            {/* <div className="text-sm text-muted-foreground">
              <a href="/" className="hover:text-foreground transition-colors">
                Weval
              </a>
            </div> */}
          </div>

          {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
        </div>
      </div>
    </div>
  );
}
