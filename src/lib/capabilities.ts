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
  invert?: boolean;
}

export interface CapabilityTopic {
  key: Topic;
  weight: number;
  invert?: boolean;
}

export interface CapabilityConfig {
  key: string; // Config ID like 'uk-clinical-scenarios'
  weight: number;
  invert?: boolean;
}

export interface CapabilityBucket {
  id: string;
  label: string;
  description: string;
  icon: string;
  dimensions: CapabilityDimension[];
  topics: CapabilityTopic[];
  // Preferred names
  blueprints?: CapabilityConfig[];
  // Back-compat alias for older field name
  configs?: CapabilityConfig[];
}

export const CAPABILITY_BUCKETS: CapabilityBucket[] = [
  {
    id: 'safety-and-integrity',
    label: 'Safety & Integrity',
    description: 'We measure safety and integrity by combining and averaging results across multiple evaluations, including those that measure hallucination, sycophancy, bias, and mental health crisis response.',
    icon: 'shield',
    dimensions: [
      { key: 'safety', weight: 5.0 }
    ],
    topics: [
    ],
    blueprints: [
      { key: 'uk-clinical-scenarios', weight: 0.5 },
      { key: 'stanford-hai-mental-health-safety-eval', weight: 3.0 },
      { key: 'mental-health', weight: 1.0 },
      { key: 'hallucination-probe', weight: 3.0 },
      { key: 'system-prompt-adherence-resilience', weight: 3.0 },
      { key: 'sycophancy-probe', weight: 3.0 },
      { key: 'confidence-high-stakes-domains', weight: 2.0 },
      { key: 'jailbreak-safety-probes', weight: 3.0 },
      { key: 'csr-suicide-response-scenarios', weight: 0.5 },
      { key: 'sydney__original', weight: 1.0 },
      { key: 'compass__cautious', weight: 0.8 },
      { key: 'compass__risk-averse', weight: 0.8 },
      { key: 'compass__confident', weight: 0.6, invert: true },
      { key: 'compass__risk-seeking', weight: 0.8, invert: true }
    ],
  },
  // {
  //   id: 'safety',
  //   label: 'Safety',
  //   description: 'Avoiding harm and protecting users from dangerous or harmful content. Emphasizes proactive safety measures, non-hallucination, and mental health support.',
  //   icon: 'shield',
  //   dimensions: [
  //     // { key: 'safety', weight: 2.0 },
  //     // { key: 'humility', weight: 0.9 },
  //     // { key: 'empathy', weight: 0.8 },
  //     // { key: 'credibility', weight: 0.6 },
  //   ],
  //   topics: [
  //     // { key: 'AI Safety & Robustness', weight: 1.0 },
  //     // { key: 'Mental Health & Crisis Support', weight: 1.0 },
  //     // { key: 'Child Safety & Protection', weight: 1.0 },
  //     // { key: 'Misinformation & Disinformation', weight: 0.9 },
  //     // { key: 'AI Bias & Fairness', weight: 0.9 },
  //     // { key: 'Factual Accuracy & Hallucination', weight: 0.8 },
  //     // { key: 'Jailbreak & Evasion Resistance', weight: 1.2 },
  //     // { key: 'Safety', weight: 10.0 },
  //     // { key: 'Healthcare', weight: 1.0 },
  //     // { key: 'Human Rights', weight: 1.0 }
  //   ],
  //   configs: [
  //     { key: 'uk-clinical-scenarios', weight: 0.5 },
  //     { key: 'stanford-hai-mental-health-safety-eval', weight: 2.0 },
  //     { key: 'mental-health', weight: 2.0 },
  //     { key: 'hallucination-probe', weight: 2.0 },
  //     { key: 'system-prompt-adherence-resilience', weight: 1.0 },
  //     { key: 'sycophancy-probe', weight: 2.0 }
  //   ],
  // },
  // {
  //   id: 'integrity',
  //   label: 'Integrity',
  //   description: 'Being truthful, faithful to instructions, and honest about limitations. Prioritizes factual accuracy, instruction following, and avoiding sycophancy.',
  //   icon: 'compass',
  //   dimensions: [
  //     // { key: 'adherence', weight: 2.0 },
  //     // { key: 'helpfulness', weight: 1.0 },
  //     // { key: 'credibility', weight: 1.0 },
  //     // { key: 'humility', weight: 1.0 },
  //     // { key: 'argumentation', weight: 0.9 },
  //     // { key: 'clarity', weight: 0.7 },
  //     // { key: 'coherence', weight: 0.7 },
  //     // { key: 'safety', weight: 0.8 },
  //   ],
  //   topics: [
  //     // { key: 'Factual Accuracy & Hallucination', weight: 2.0 },
  //     // { key: 'Instruction Following & Prompt Adherence', weight: 2.0 },
  //     // { key: 'Sycophancy & Evasion', weight: 2.0 },
  //     // { key: 'Reasoning', weight: 0.9 },
  //     // { key: 'Logical & Rhetorical Fallacies', weight: 0.9 },
  //     // { key: 'Science Communication', weight: 0.8 },
  //     // { key: 'Coding', weight: 0.8 },
  //     // { key: 'Misinformation & Disinformation', weight: 0.7 },
  //     // { key: 'Summarization', weight: 0.7 },
  //     // { key: 'Sycophancy', weight: 2.0 }
  //   ],
  //   configs: [
  //     { key: 'hallucination-probe', weight: 3.0 },
  //     { key: 'system-prompt-adherence-resilience', weight: 3.0 },
  //     { key: 'sycophancy-probe', weight: 3.0 }
  //   ],
  // },
  {
    id: 'global-fluency',
    label: 'Global Fluency',
    description: 'Global fluency is the combination of results across multiple evaluations measuring cultural competency, non-western everyday perspectives, low-resource languages, and the Global South.',
    icon: 'globe',
    dimensions: [
      // { key: 'empathy', weight: 1.5 },
      // { key: 'depth', weight: 1.0 },
      // { key: 'humility', weight: 0.8 },
      // { key: 'creativity', weight: 0.7 },
    ],
    topics: [
      // { key: 'Cultural Competency', weight: 2.0 },
      // { key: 'Low-Resource Language Proficiency', weight: 2.0 },
      // { key: 'Indigenous Peoples\' Rights', weight: 2.0 },
      // { key: 'Geographic & Local Knowledge', weight: 1.5 },
      // { key: 'Non-Western Philosophical Frameworks', weight: 1.5 },
      // { key: 'AI Bias & Fairness', weight: 1.5 },
      // { key: 'Traditional & Indigenous Medicine', weight: 1.5 },
      // { key: 'Informal Economies & Livelihoods', weight: 2.5 },
      // { key: 'Customary & Traditional Law', weight: 2.0 },
    ],
    configs: [
      { key: 'digigreen-qna-with-vids', weight: 2.0 },
      { key: 'sri-lanka-citizen-compendium-factum', weight: 3.0 },
      { key: 'indian-rti-act', weight: 1.5 },
      { key: 'ipcc-ar6-synthesis-report-spm', weight: 1.5 },
      { key: 'platform-workers-sea-algo-manage', weight: 1.5 },
      { key: 'maternal-health-uttar-pradesh', weight: 2.0 },
      { key: 'jp-clinical-scenarios', weight: 1.0 },
      { key: 'yka-set', weight: 1.5 }
    ],
  },
  {
    id: 'helpfulness-reasoning',
    label: 'Helpfulness & Reasoning',
    description: 'We measure helpfulness and reasoning by combining and averaging results across multiple evaluations and dimensions: factual accuracy, helpfulness, coherence, depth, and argumentation.',
    icon: 'puzzle',
    dimensions: [
      { key: 'helpfulness', weight: 1.0 },
      { key: 'coherence', weight: 1.0 },
      { key: 'depth', weight: 0.75 },
      { key: 'argumentation', weight: 0.75 }
    ],
    topics: [],
    configs: [
      { key: 'homework-int-help-heuristics', weight: 3.0 },
      { key: 'adversarial-legal-reasoning-ca', weight: 2.0 },
      { key: 'system-prompt-adherence-resilience', weight: 2.0 },
      { key: 'geneva-conventions-full-evaluation', weight: 1.0 },
      { key: 'hmt-empire-windrush-comprehensive-eval', weight: 1.0 },
      { key: 'udhr-misattribution-absurd-framing', weight: 1.0 }
    ]
  }
];
