'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BLUEPRINT_CONFIG_REPO_URL } from "@/lib/configConstants";
import dynamic from "next/dynamic";
import Link from "next/link";

const Github = dynamic(() => import('lucide-react').then(mod => mod.Github));
const Check = dynamic(() => import('lucide-react').then(mod => mod.Check));
const ExternalLink = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink));


const contributingChecklist = [
    { text: 'The prompts are clear, concise, and isolate a specific interesting competency.' },
    { text: 'The should/should_not criteria are clear, concise, and highly specific.' },
    { text: 'The topic aligns with Weval\'s public-interest mission. Ask yourself: "Is this an area of AI deficit that many other people would care about?"' },
];

export function ContributionGuide() {
    return (
        <div className="mt-12 border-t pt-12">
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle>Ready to Contribute?</CardTitle>
                    <CardDescription>
                        Once your blueprint is working well, consider contributing it to the public repository on GitHub. To do this, you'll need to copy and save the YAML text that's been generated.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold mb-3">High-Quality Blueprint Checklist</h4>
                            <ul className="space-y-2">
                                {contributingChecklist.map((item, index) => (
                                    <li key={index} className="flex items-start gap-2">
                                        <Check className="w-4 h-4 mt-1 text-green-500 flex-shrink-0" />
                                        <span className="text-sm text-muted-foreground">{item.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex flex-col items-center justify-center bg-muted/50 rounded-lg p-6 text-center">
                            <Github className="w-10 h-10 mb-4 text-muted-foreground" />
                            <h4 className="font-semibold mb-2">Submit Your Blueprint</h4>
                            <p className="text-sm text-muted-foreground mb-4">
                                Use our templates to open a new issue or pull request in the `weval-org/configs` repository.
                            </p>
                            <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/issues/new/choose`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                                Propose a New Blueprint <ExternalLink className="w-4 h-4 ml-2" />
                            </Link>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
} 