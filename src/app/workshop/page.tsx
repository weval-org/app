'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { generateWorkshopId, isValidWorkshopId, formatWorkshopId } from '@/lib/workshop-utils';
import { Sparkles, ArrowRight, Users, FileText, PlayCircle } from 'lucide-react';

export default function WorkshopEntryPage() {
  const router = useRouter();
  const [workshopId, setWorkshopId] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = () => {
    const id = generateWorkshopId();
    router.push(`/workshop/${id}`);
  };

  const handleJoin = () => {
    const id = workshopId.trim().toLowerCase();

    if (!id) {
      setError('Please enter a workshop ID');
      return;
    }

    if (!isValidWorkshopId(id)) {
      setError('Invalid workshop ID format. Use format: word-word-###');
      return;
    }

    router.push(`/workshop/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJoin();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 w-full">
        <div className="flex h-16 items-center px-4 md:px-8 w-full">
          <a href="/" className="text-xl font-semibold">
            Weval
          </a>
          <div className="ml-4 text-sm text-muted-foreground">/</div>
          <div className="ml-4 text-sm font-medium">Workshop</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-6">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              Collaborative AI Evaluation
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Build and test AI evaluations together in real-time.
              Perfect for workshops, research teams, and collaborative testing.
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Create New Workshop */}
            <Card className="p-8 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold mb-2">Start New Workshop</h2>
                  <p className="text-muted-foreground">
                    Generate a unique workshop ID and invite others to collaborate
                  </p>
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                size="lg"
                className="w-full"
              >
                Generate Workshop ID
                <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            </Card>

            {/* Join Existing Workshop */}
            <Card className="p-8 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold mb-2">Join Workshop</h2>
                  <p className="text-muted-foreground">
                    Enter your workshop ID to join an ongoing session
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="crimson-elephant-742"
                    value={workshopId}
                    onChange={(e) => {
                      setWorkshopId(e.target.value);
                      setError('');
                    }}
                    onKeyDown={handleKeyDown}
                    className="text-lg"
                  />
                  {error && (
                    <p className="text-sm text-destructive mt-2">{error}</p>
                  )}
                </div>

                <Button
                  onClick={handleJoin}
                  size="lg"
                  className="w-full"
                  disabled={!workshopId.trim()}
                >
                  Join Workshop
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center p-3 bg-muted rounded-full mb-3">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">Build Together</h3>
              <p className="text-sm text-muted-foreground">
                Create evaluation blueprints collaboratively with your team
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center p-3 bg-muted rounded-full mb-3">
                <PlayCircle className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">Test & Share</h3>
              <p className="text-sm text-muted-foreground">
                Run evaluations and share results instantly with participants
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center p-3 bg-muted rounded-full mb-3">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-2">Anonymous & Easy</h3>
              <p className="text-sm text-muted-foreground">
                No account required. Just generate an ID and start collaborating
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>
          Workshop IDs are temporary collaborative spaces.
          Share your workshop ID only with intended participants.
        </p>
      </div>
    </div>
  );
}
