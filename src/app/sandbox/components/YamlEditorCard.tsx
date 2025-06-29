'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

const Wand2 = dynamic(() => import('lucide-react').then(mod => mod.Wand2));
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const ClipboardCopy = dynamic(() => import('lucide-react').then(mod => mod.ClipboardCopy));
const Check = dynamic(() => import('lucide-react').then(mod => mod.Check));

interface YamlEditorCardProps {
    yamlText: string;
    yamlError: string | null;
    onYamlChange: (value: string) => void;
}

export function YamlEditorCard({ yamlText, yamlError, onYamlChange }: YamlEditorCardProps) {
    const { resolvedTheme } = useTheme();
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(yamlText).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [yamlText]);

    return (
        <div className="sticky top-24 h-fit">
             <Card className="bg-slate-900 shadow-2xl shadow-slate-900/20 dark:shadow-sky-900/20 border-slate-700">
                <CardHeader>
                   <CardTitle className="text-slate-100 flex items-center gap-2"><Wand2 className="w-5 h-5 text-sky-400"/>Live YAML Editor</CardTitle>
                   <CardDescription className="text-slate-400">Edit here and see the form update, or vice-versa.</CardDescription>
               </CardHeader>
               <CardContent>
                 <div className="relative">
                     <CodeMirror
                         value={yamlText}
                         height="600px"
                         extensions={[yamlLanguage()]}
                         onChange={onYamlChange}
                         theme={resolvedTheme === 'dark' ? githubDark : githubLight}
                         className="rounded-lg overflow-hidden border border-slate-700 dark:border-slate-800"
                     />
                     {yamlError && (
                         <div className="absolute bottom-0 left-0 right-0 p-2 bg-red-500/90 text-white text-xs font-mono flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <p className="truncate">YAML Error: {yamlError}</p>
                         </div>
                     )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCopy}
                        className="absolute top-3 right-3 z-10"
                        disabled={!!yamlError}
                       >
                         {isCopied ? <Check className="h-4 w-4 mr-2" /> : <ClipboardCopy className="h-4 w-4 mr-2" />}
                         {isCopied ? 'Copied!' : 'Copy'}
                       </Button>
                 </div>
               </CardContent>
             </Card>
        </div>
    );
} 