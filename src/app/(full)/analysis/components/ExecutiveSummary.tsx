'use client';

import dynamic from 'next/dynamic';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle));
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const remarkGfm = dynamic(() => import('remark-gfm').then(m => m.default as any), { ssr: false });

interface ExecutiveSummaryProps {
    summary: {
        modelId: string;
        content: string;
    }
}

export default function ExecutiveSummary({ summary }: ExecutiveSummaryProps) {
    if (!summary || !summary.content) {
        return null;
    }

    return (
        <Alert variant="default" className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300 font-semibold">AI-Generated Key Learnings</AlertTitle>
            <AlertDescription className="prose prose-sm dark:prose-invert max-w-none text-blue-700 dark:text-blue-300">
                <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                    {summary.content}
                </ReactMarkdown>
            </AlertDescription>
        </Alert>
    );
} 