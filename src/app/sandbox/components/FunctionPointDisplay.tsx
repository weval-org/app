'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Icon from '@/components/ui/icon';
import { PointDefinition } from '@/cli/types/cli_types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface FunctionPointDisplayProps {
    expectation: PointDefinition;
    onRemove: () => void;
    isEditable: boolean;
}

// Helper to detect function type and get display info
function getFunctionInfo(point: any): { type: string; icon: string; label: string; args: any } | null {
    if (typeof point !== 'object' || !point) return null;

    // Check for explicit fn field
    if (point.fn) {
        return {
            type: point.fn,
            icon: 'code',
            label: `Function: ${point.fn}`,
            args: point.fnArgs || point.arg
        };
    }

    // Check for idiomatic $ functions
    const keys = Object.keys(point);
    const fnKey = keys.find(key => key.startsWith('$') && key !== '$ref');

    if (fnKey) {
        const fnName = fnKey.substring(1); // Remove $
        const args = point[fnKey];

        // Special icons for known function types
        const iconMap: Record<string, string> = {
            'js': 'code-2',
            'call': 'globe',
            'factcheck': 'search-check',
            'contains': 'text-search',
            'icontains': 'text-search',
            'matches': 'regex',
            'imatches': 'regex',
            'word_count_between': 'hash',
        };

        return {
            type: fnName,
            icon: iconMap[fnName] || 'cpu',
            label: `$${fnName}`,
            args
        };
    }

    return null;
}

// Format arguments for display
function formatArgs(args: any): string {
    if (args === null || args === undefined) return '';
    if (typeof args === 'string') return args.length > 100 ? args.substring(0, 100) + '...' : args;
    if (typeof args === 'number' || typeof args === 'boolean') return String(args);
    if (Array.isArray(args)) return JSON.stringify(args, null, 2);
    if (typeof args === 'object') return JSON.stringify(args, null, 2);
    return String(args);
}

export function FunctionPointDisplay({ expectation, onRemove, isEditable }: FunctionPointDisplayProps) {
    const functionInfo = getFunctionInfo(expectation);

    if (!functionInfo) {
        // Fallback - shouldn't happen
        return null;
    }

    const formattedArgs = formatArgs(functionInfo.args);
    const isLongContent = formattedArgs.length > 60;

    return (
        <div className="flex items-start gap-2">
            <Card className="flex-1 p-2 bg-muted/30 border-muted">
                <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="flex-shrink-0 gap-1">
                        <Icon name={functionInfo.icon as any} className="w-3 h-3" />
                        {functionInfo.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                        {formattedArgs && (
                            <pre className={`text-xs text-muted-foreground font-mono ${isLongContent ? 'whitespace-pre-wrap' : 'whitespace-pre'} overflow-hidden`}>
                                {formattedArgs}
                            </pre>
                        )}
                    </div>
                </div>
            </Card>
            {isEditable && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" title="Remove Function" aria-label="Remove function">
                            <Icon name="trash" className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Are you sure?</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            Yes, delete function
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
