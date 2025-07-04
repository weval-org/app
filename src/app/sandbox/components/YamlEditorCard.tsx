'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const Wand2 = dynamic(() => import('lucide-react').then(mod => mod.Wand2));
const ClipboardCopy = dynamic(() => import('lucide-react').then(mod => mod.ClipboardCopy));
const Check = dynamic(() => import('lucide-react').then(mod => mod.Check));
const Pencil = dynamic(() => import('lucide-react').then(mod => mod.Pencil));
const BookCheck = dynamic(() => import('lucide-react').then(mod => mod.BookCheck));

interface YamlEditorCardProps {
    yamlText: string;
    onYamlChange: (value: string) => void;
    yamlError: string | null;
    readOnly: boolean;
    onToggleEditMode: () => void;
}

export function YamlEditorCard({ yamlText, onYamlChange, yamlError, readOnly, onToggleEditMode }: YamlEditorCardProps) {
    const { resolvedTheme } = useTheme();
    const { toast } = useToast();
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(yamlText);
        setIsCopied(true);
        toast({
            title: 'Copied!',
            description: 'YAML content copied to clipboard.',
        });
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="sticky top-20 h-full flex flex-col">
             <Card className="h-full flex flex-col bg-slate-900 shadow-2xl shadow-slate-900/20 dark:shadow-sky-900/20 border-slate-700">
                <CardHeader className="flex-shrink-0">
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex-grow">
                           <CardTitle className="text-slate-100 flex items-center gap-2"><Wand2 className="w-5 h-5 text-sky-400"/>Live YAML Editor</CardTitle>
                           <CardDescription className="text-slate-400 mt-2">
                               {readOnly
                                    ? "Using form as the source of truth. Click 'Edit YAML' to edit directly."
                                    : "Editing YAML directly. The form on the left is disabled."}
                           </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={onToggleEditMode} className="flex-shrink-0 bg-slate-800 hover:bg-slate-700 border-slate-600 text-white">
                            {readOnly ? (
                                <><Pencil className="w-4 h-4 mr-2" /> Edit YAML</>
                            ) : (
                                <><BookCheck className="w-4 h-4 mr-2" /> Use Form</>
                            )}
                        </Button>
                    </div>
               </CardHeader>
               <CardContent className="flex-grow flex flex-col">
                 <div className="relative flex-grow">
                     <div className="absolute inset-0">
                        <CodeMirror
                            value={yamlText}
                            height="100%"
                            extensions={[yamlLanguage()]}
                            onChange={onYamlChange}
                            theme={resolvedTheme === 'dark' ? githubDark : githubLight}
                            className="rounded-lg overflow-hidden border border-slate-700 dark:border-slate-800 h-full w-full"
                            readOnly={readOnly}
                        />
                     </div>
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
                         {isCopied ? <Check className="h-4 h-4 mr-2" /> : <ClipboardCopy className="h-4 h-4 mr-2" />}
                         {isCopied ? 'Copied!' : 'Copy'}
                       </Button>
                 </div>
               </CardContent>
             </Card>
        </div>
    );
} 