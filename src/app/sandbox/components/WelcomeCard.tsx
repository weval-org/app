'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WelcomeCard() {
    return (
        <Card className="bg-background/50">
            <CardHeader>
                <CardTitle>Welcome to the Sandbox!</CardTitle>
                <CardDescription>Create a simple evaluation blueprint in three steps.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                <ol className="list-decimal list-inside space-y-2">
                    <li>
                        <strong>Write Your Prompts:</strong> Add one or more prompts to test an AI on. Provide an optional "ideal response" for comparison.
                    </li>
                    <li>
                        <strong>Define Your Criteria:</strong> For each prompt, list what a good response SHOULD and SHOULD NOT contain. Be specific and use plain language.
                    </li>
                    <li>
                        <strong>Run & Analyze:</strong> Click "Run Sandbox" to test your blueprint and see the results. This can take a few minutes depending on the number of prompts.
                    </li>
                </ol>
            </CardContent>
        </Card>
    );
} 