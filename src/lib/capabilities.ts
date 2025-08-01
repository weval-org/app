import { Topic } from './topics';

export interface CapabilityDimension {
  key:
    | 'adherence'
    | 'clarity'
    | 'tone'
    | 'depth'
    | 'coherence'
    | 'helpfulness'
    | 'credibility'
    | 'empathy'
    | 'creativity'
    | 'safety'
    | 'humility'
    | 'argumentation'
    | 'efficiency';
  weight: number;
}

export interface CapabilityTopic {
  key: Topic;
  weight: number;
}

export interface CapabilityBucket {
  id: string;
  label: string;
  description: string;
  icon: string;
  dimensions: CapabilityDimension[];
  topics: CapabilityTopic[];
}

export const CAPABILITY_BUCKETS: CapabilityBucket[] = [
  {
    id: 'helpfulness-reasoning',
    label: 'Helpfulness & Reasoning',
    description: 'Core ability to understand and execute tasks effectively.',
    icon: 'puzzle',
    dimensions: [
      { key: 'helpfulness', weight: 1.0 },
      { key: 'adherence', weight: 1.0 },
      { key: 'depth', weight: 0.75 },
    ],
    topics: [
      { key: 'Instruction Following & Prompt Adherence', weight: 1.0 },
      { key: 'Reasoning', weight: 1.0 },
      { key: 'Coding', weight: 0.75 },
      { key: 'Summarization', weight: 0.5 },
    ],
  },
  {
    id: 'safety-responsibility',
    label: 'Safety & Responsibility',
    description: 'Avoiding harm and acting with ethical consideration.',
    icon: 'shield',
    dimensions: [{ key: 'safety', weight: 1.0 }],
    topics: [
      { key: 'AI Safety & Robustness', weight: 1.0 },
      { key: 'Jailbreak & Evasion Resistance', weight: 1.0 },
      { key: 'AI Bias & Fairness', weight: 1.0 },
      { key: 'Child Safety & Protection', weight: 1.0 },
      { key: 'Mental Health & Crisis Support', weight: 1.0 },
      { key: 'Safety', weight: 1.0 },
    ],
  },
  {
    id: 'communication-quality',
    label: 'Communication Quality',
    description: 'The clarity, style, and expressiveness of the response.',
    icon: 'message-circle',
    dimensions: [
      { key: 'clarity', weight: 1.0 },
      { key: 'coherence', weight: 1.0 },
      { key: 'empathy', weight: 0.75 },
      { key: 'tone', weight: 0.75 },
      { key: 'creativity', weight: 0.5 },
    ],
    topics: [
      { key: 'Creative Writing', weight: 0.75 },
      { key: 'Humanities', weight: 0.5 },
      { key: 'Role-playing', weight: 0.5 },
    ],
  },
  {
    id: 'trustworthiness-accuracy',
    label: 'Trustworthiness & Accuracy',
    description: 'Providing reliable and factual information.',
    icon: 'check-circle',
    dimensions: [
      { key: 'credibility', weight: 1.0 },
      { key: 'humility', weight: 0.75 },
      { key: 'argumentation', weight: 0.75 },
      { key: 'depth', weight: 0.5 },
    ],
    topics: [
      { key: 'Factual Accuracy & Hallucination', weight: 1.0 },
      { key: 'Misinformation & Disinformation', weight: 1.0 },
      { key: 'Historical Accuracy & Misinformation', weight: 0.75 },
      { key: 'Science Communication', weight: 0.75 },
      { key: 'Causal Reasoning', weight: 0.5 },
    ],
  },
  // {
  //   id: 'civic-legal-rights',
  //   label: 'Civic & Legal Rights',
  //   description:
  //     'Understanding of governance, human rights, and legal frameworks.',
  //   icon: 'scale',
  //   dimensions: [
  //     { key: 'adherence', weight: 1.0 },
  //     { key: 'argumentation', weight: 0.75 },
  //   ],
  //   topics: [
  //     { key: 'Human Rights', weight: 1.0 },
  //     { key: 'Legal Reasoning', weight: 1.0 },
  //     { key: 'Constitutional Law', weight: 1.0 },
  //     { key: 'Public Sector & Governance', weight: 0.75 },
  //     { key: 'International Law & Regional Charters', weight: 0.75 },
  //     { key: 'Freedom of Information', weight: 0.5 },
  //     { key: 'Economic Justice & Inequality', weight: 0.5 },
  //     { key: 'Racial Justice', weight: 0.5 },
  //   ],
  // },
  {
    id: 'global-context-equity',
    label: 'Global Context & Equity',
    description:
      "Competency in non-Western, low-resource, and culturally diverse contexts.",
    icon: 'globe',
    dimensions: [
      { key: 'depth', weight: 1.0 },
      { key: 'empathy', weight: 0.75 },
    ],
    topics: [
      { key: 'Cultural Competency', weight: 1.0 },
      { key: 'Low-Resource Language Proficiency', weight: 1.0 },
      { key: 'Indigenous Peoples\' Rights', weight: 1.0 },
      { key: 'Geographic & Local Knowledge', weight: 0.75 },
      { key: 'Non-Western Philosophical Frameworks', weight: 0.75 },
      { key: 'Traditional & Indigenous Medicine', weight: 0.5 },
      { key: 'Informal Economies & Livelihoods', weight: 0.5 },
      { key: 'Customary & Traditional Law', weight: 0.5 },
    ],
  },
];