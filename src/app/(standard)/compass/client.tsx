"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { extractMakerFromModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { MAKER_COLORS } from '@/app/utils/makerColors';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  Lightbulb, 
  AlertTriangle, 
  Sparkles,
  Brain,
  Target,
  Zap,
  Heart,
  Shield,
  Users,
  Compass,
  BarChart3,
  Eye,
  ArrowRight,
  Star,
  Info,
  Wind
} from 'lucide-react';

import TraitSpectrum from './components/TraitSpectrum';
import BehavioralMap from './components/BehavioralMap';
import ExemplarGallery from './components/ExemplarGallery';
import KeyTakeaways from './components/KeyTakeaways';

// More specific types based on our data structure
interface CompassExemplar {
  promptText: string;
  modelId: string;
  modelResponse: string;
  potency?: number;
}

interface CompassComparisonPair {
  promptText: string;
  positiveExemplar: CompassExemplar;
  negativeExemplar: CompassExemplar;
}

interface CompassAxisExemplars {
  comparisonPairs?: CompassComparisonPair[];
}

type CompassIndex = {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id: string; positivePole: string; negativePole: string }>;
  exemplars?: Record<string, CompassAxisExemplars>;
  generatedAt: string;
};

type PersonalityProfile = {
  modelId: string;
  maker: string;
  displayName: string;
  dominantTraits: Array<{ trait: string; score: number; confidence: number }>;
  allTraits: Array<{ trait: string; score: number; confidence: number; runs: number }>;
  overallScore: number;
  dataQuality: 'high' | 'medium' | 'low';
  totalRuns: number;
};

type TraitDefinition = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  examples: { high: string; low: string };
  color: string;
};

const TRAIT_DEFINITIONS: Record<string, TraitDefinition> = {
  'epistemic-humility': {
    id: 'epistemic-humility',
    name: 'Epistemic Humility',
    description: 'How cautious vs. confident a model is when making claims',
    icon: Shield,
    examples: {
      high: '"I think this might be..." - Acknowledges uncertainty',
      low: '"This is definitely..." - States with certainty'
    },
    color: 'hsl(210, 100%, 60%)'
  },
  'risk-level': {
    id: 'risk-level',
    name: 'Risk Appetite',
    description: 'Willingness to take risks vs. preference for safe approaches',
    icon: Zap,
    examples: {
      high: 'Suggests bold, innovative solutions',
      low: 'Recommends proven, conservative approaches'
    },
    color: 'hsl(45, 100%, 60%)'
  },
  'agreeableness': {
    id: 'agreeableness',
    name: 'Agreeableness',
    description: 'Tendency to be cooperative and harmonious vs. challenging',
    icon: Heart,
    examples: {
      high: 'Seeks common ground, validates perspectives',
      low: 'More likely to challenge or debate points'
    },
    color: 'hsl(120, 60%, 60%)'
  },
  'proactivity': {
    id: 'proactivity',
    name: 'Proactivity',
    description: 'Takes initiative and suggests next steps vs. reactive responses',
    icon: Target,
    examples: {
      high: 'Offers additional suggestions and follow-ups',
      low: 'Responds directly to what was asked'
    },
    color: 'hsl(280, 60%, 60%)'
  },
  'abstraction': {
    id: 'abstraction',
    name: 'Abstract Thinking',
    description: 'Uses metaphors and figurative language vs. literal communication',
    icon: Brain,
    examples: {
      high: 'Explains concepts through analogies and metaphors',
      low: 'Uses direct, literal explanations'
    },
    color: 'hsl(340, 60%, 60%)'
  },
  'conscientiousness': {
    id: 'conscientiousness',
    name: 'Conscientiousness',
    description: 'Organized and methodical vs. spontaneous and flexible',
    icon: BarChart3,
    examples: {
      high: 'Provides structured, step-by-step responses',
      low: 'More free-flowing, creative responses'
    },
    color: 'hsl(180, 60%, 60%)'
  },
  'extroversion': {
    id: 'extroversion',
    name: 'Extroversion',
    description: 'Tendency to be outgoing and expressive vs. reserved and introverted',
    icon: Users,
    examples: {
      high: 'Uses conversational, engaging, and expressive language',
      low: 'More direct, concise, and to-the-point'
    },
    color: 'hsl(250, 60%, 60%)'
  },
  'free-thinking': {
    id: 'free-thinking',
    name: 'Free-Thinking',
    description: 'Generates unconventional ideas vs. adhering to established norms',
    icon: Wind,
    examples: {
      high: 'Proposes novel or contrarian viewpoints',
      low: 'Reflects mainstream or conventional perspectives'
    },
    color: 'hsl(300, 60%, 60%)'
  },
  'default-fallback': {
    id: 'default-fallback',
    name: 'Unknown Trait',
    description: 'A trait without a formal definition.',
    icon: Info, // Using Info as a safe fallback
    examples: { high: 'N/A', low: 'N/A' },
    color: 'hsl(0, 0%, 50%)'
  }
};

const SUGGESTED_COMPARISONS = [
  {
    x: 'epistemic-humility',
    y: 'agreeableness',
    title: 'Communication Styles',
    insight: 'Reveals how models balance confidence with cooperation',
    icon: Users
  },
  {
    x: 'risk-level',
    y: 'conscientiousness',
    title: 'Decision Making',
    insight: 'Shows patterns in how models approach problem-solving',
    icon: Target
  },
  {
    x: 'abstraction',
    y: 'proactivity',
    title: 'Creative Problem-Solving',
    insight: 'Indicates innovative thinking and initiative-taking',
    icon: Sparkles
  }
];

export default function Compass2ClientPage() {
  const [compass, setCompass] = React.useState<CompassIndex | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState<string>('');
  const [selectedMakers, setSelectedMakers] = React.useState<string[]>([]);
  const [activeView, setActiveView] = React.useState<'overview' | 'explore' | 'compare'>('overview');
  const [selectedModels, setSelectedModels] = React.useState<string[]>([]);

  // Debounce search query to prevent excessive filtering
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load compass data
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/compass');
        if (mounted) {
          if (res.ok) {
            const json: CompassIndex = await res.json();
            setCompass(json);
          } else {
            setError('Failed to load compass data');
          }
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Process compass data into personality profiles (memoized with proper dependencies)
  const personalityProfiles = React.useMemo<PersonalityProfile[]>(() => {
    if (!compass?.axes || !compass?.axisMetadata) return [];

    const profilesMap = new Map<string, {
        modelId: string;
        maker: string;
        displayName: string;
        traits: Array<{ trait: string; score: number; confidence: number; runs: number }>;
        totalRuns: number;
    }>();

    // Initialize map with all models to ensure every model gets a profile object
    const allModelIds = new Set<string>();
    for (const axisData of Object.values(compass.axes)) {
        for (const modelId of Object.keys(axisData)) {
            allModelIds.add(modelId);
        }
    }

    for (const modelId of allModelIds) {
        profilesMap.set(modelId, {
            modelId,
            maker: extractMakerFromModelId(modelId),
            displayName: getModelDisplayLabel(modelId, { prettifyModelName: true, hideProvider: true }),
            traits: [],
            totalRuns: 0,
        });
    }

    // Populate traits by iterating through axes and their models
    for (const [axisId, axisData] of Object.entries(compass.axes)) {
        if (!compass.axisMetadata[axisId]) continue; // Only process axes with metadata

        for (const [modelId, data] of Object.entries(axisData)) {
            const profile = profilesMap.get(modelId);
            if (profile && data && data.value !== null && (data.runs ?? 0) >= 3) {
                const runs = data.runs;
                profile.traits.push({
                    trait: axisId,
                    score: data.value,
                    confidence: Math.min(runs / 10, 1),
                    runs
                });
                profile.totalRuns += runs;
            }
        }
    }

    return Array.from(profilesMap.values())
        .filter(p => p.traits.length > 0)
        .map(p => {
            const validTraits = p.traits.filter(t => t.confidence > 0.3);
            const overallScore = validTraits.length > 0
                ? validTraits.reduce((sum, t) => sum + t.score, 0) / validTraits.length
                : 0;

            const dataQuality: 'high' | 'medium' | 'low' =
                p.totalRuns >= 30 ? 'high' : p.totalRuns >= 15 ? 'medium' : 'low';
            
            p.traits.sort((a, b) => {
                const aDistance = Math.abs(a.score - 0.5) * a.confidence;
                const bDistance = Math.abs(b.score - 0.5) * b.confidence;
                return bDistance - aDistance;
            });
            const dominantTraits = p.traits.slice(0, 3);

            return {
                modelId: p.modelId,
                maker: p.maker,
                displayName: p.displayName,
                dominantTraits,
                allTraits: p.traits,
                overallScore,
                dataQuality,
                totalRuns: p.totalRuns,
            };
        });
  }, [compass]);

  // Filter profiles based on search and maker selection (optimized with debouncing)
  const filteredProfiles = React.useMemo(() => {
    if (debouncedSearchQuery === '' && selectedMakers.length === 0) {
      return personalityProfiles; // No filtering needed
    }
    
    const lowerSearchQuery = debouncedSearchQuery.toLowerCase();
    const makerSet = new Set(selectedMakers); // O(1) lookup instead of O(n)
    
    return personalityProfiles.filter(profile => {
      const matchesSearch = debouncedSearchQuery === '' || 
        profile.displayName.toLowerCase().includes(lowerSearchQuery) ||
        profile.maker.toLowerCase().includes(lowerSearchQuery);
      
      const matchesMaker = selectedMakers.length === 0 || makerSet.has(profile.maker);
      
      return matchesSearch && matchesMaker;
    });
  }, [personalityProfiles, debouncedSearchQuery, selectedMakers]);

  // Get unique makers for filter
  const availableMakers = React.useMemo(() => {
    return Array.from(new Set(personalityProfiles.map(p => p.maker))).sort();
  }, [personalityProfiles]);

  // Memoize callback functions to prevent unnecessary re-renders
  const handleModelSelect = React.useCallback((modelId: string) => {
    setSelectedModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  }, []);

  const handleModelRemove = React.useCallback((modelId: string) => {
    setSelectedModels(prev => prev.filter(id => id !== modelId));
  }, []);

  const handleMakerToggle = React.useCallback((maker: string) => {
    setSelectedMakers(prev => 
      prev.includes(maker) 
        ? prev.filter(m => m !== maker)
        : [...prev, maker]
    );
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading personality data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Failed to Load Data</h3>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        {/* Hero Section */}
        <div className="container mx-auto px-6 py-12">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h1 className="text-3xl font-semibold text-foreground">
              AI Personality Compass
            </h1>
            <p className="text-lg text-muted-foreground">
              An interactive visualization of model behaviors along key personality axes.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-6 pb-12">
          <div className="space-y-8">
            {/* Key Takeaways */}
            {compass && (
              <KeyTakeaways
                compass={compass}
                traitDefinitions={TRAIT_DEFINITIONS}
                profiles={personalityProfiles}
              />
            )}

            {/* Behavioral Map */}
            {compass && (
              <BehavioralMap 
                compass={compass}
                traitDefinitions={TRAIT_DEFINITIONS}
                profiles={personalityProfiles}
              />
            )}

            {/* Trait Spectrums */}
            {compass && (
              <TraitSpectrum 
                compass={compass}
                traitDefinitions={TRAIT_DEFINITIONS}
                profiles={personalityProfiles}
              />
            )}

            {/* Exemplar Gallery */}
            {compass && (
              <ExemplarGallery compass={compass} />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function TabContentLoader({ section }: { section: string }) {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="text-center space-y-3">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
        <p className="text-muted-foreground">Loading {section}...</p>
      </div>
    </div>
  );
}
