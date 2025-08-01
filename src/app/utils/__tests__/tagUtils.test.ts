import { normalizeTag, prettifyTag, normalizeTopicKey } from '../tagUtils';

describe('tagUtils', () => {
  describe('normalizeTag', () => {
    it('should normalize basic tags to kebab-case', () => {
      expect(normalizeTag('Human Rights')).toBe('human-rights');
      expect(normalizeTag('AI Safety & Robustness')).toBe('ai-safety--robustness');
      expect(normalizeTag('Legal Reasoning')).toBe('legal-reasoning');
    });

    it('should handle underscores by converting to hyphens', () => {
      expect(normalizeTag('some_tag_name')).toBe('some-tag-name');
      expect(normalizeTag('mixed_spaces and_underscores')).toBe('mixed-spaces-and-underscores');
    });

    it('should preserve internal tags starting with underscore', () => {
      expect(normalizeTag('_featured')).toBe('_featured');
      expect(normalizeTag('_periodic')).toBe('_periodic');
      expect(normalizeTag('_internal')).toBe('_internal');
    });

    it('should remove special characters except hyphens', () => {
      expect(normalizeTag('tag@with#special$chars')).toBe('tagwithspecialchars');
      expect(normalizeTag('workers\' rights')).toBe('workers-rights');
      expect(normalizeTag('AI/ML & Data')).toBe('aiml--data');
    });

    it('should convert ampersands to double-dashes', () => {
      expect(normalizeTag('Bias & Fairness')).toBe('bias--fairness');
      expect(normalizeTag('Safety & Security')).toBe('safety--security');
      expect(normalizeTag('Privacy & Rights')).toBe('privacy--rights');
    });

    it('should handle empty or whitespace input', () => {
      expect(normalizeTag('')).toBe('');
      expect(normalizeTag('   ')).toBe('');
      expect(normalizeTag('  \t\n  ')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(normalizeTag('  human rights  ')).toBe('human-rights');
      expect(normalizeTag('\tAI Safety\n')).toBe('ai-safety');
    });
  });

  describe('prettifyTag', () => {
    it('should convert kebab-case to title case', () => {
      expect(prettifyTag('human-rights')).toBe('Human Rights');
      expect(prettifyTag('ai-safety')).toBe('Ai Safety');
      expect(prettifyTag('legal-reasoning')).toBe('Legal Reasoning');
    });

    it('should handle internal tags by removing underscore and uppercasing', () => {
      expect(prettifyTag('_featured')).toBe('FEATURED');
      expect(prettifyTag('_periodic')).toBe('PERIODIC');
      expect(prettifyTag('_internal')).toBe('INTERNAL');
    });

    it('should handle single words', () => {
      expect(prettifyTag('reasoning')).toBe('Reasoning');
      expect(prettifyTag('safety')).toBe('Safety');
    });

    it('should handle empty input', () => {
      expect(prettifyTag('')).toBe('');
    });
  });

  describe('normalizeTopicKey', () => {
    it('should convert simple kebab-case to title case', () => {
      expect(normalizeTopicKey('reasoning')).toBe('Reasoning');
      expect(normalizeTopicKey('safety')).toBe('Safety');
      expect(normalizeTopicKey('coding')).toBe('Coding');
    });

    it('should convert kebab-case with hyphens to title case', () => {
      expect(normalizeTopicKey('legal-reasoning')).toBe('Legal Reasoning');
      expect(normalizeTopicKey('public-sector')).toBe('Public Sector');
      expect(normalizeTopicKey('general-knowledge')).toBe('General Knowledge');
    });

    it('should convert double-dash to ampersand for compound topics', () => {
      expect(normalizeTopicKey('instruction-following--prompt-adherence')).toBe('Instruction Following & Prompt Adherence');
      expect(normalizeTopicKey('ai-safety--robustness')).toBe('Ai Safety & Robustness');
      expect(normalizeTopicKey('ai-bias--fairness')).toBe('Ai Bias & Fairness');
      expect(normalizeTopicKey('factual-accuracy--hallucination')).toBe('Factual Accuracy & Hallucination');
    });

    it('should handle complex topic keys with multiple parts', () => {
      expect(normalizeTopicKey('mental-health--crisis-support')).toBe('Mental Health & Crisis Support');
      expect(normalizeTopicKey('child-safety--protection')).toBe('Child Safety & Protection');
      expect(normalizeTopicKey('freedom-of-information--rti')).toBe('Freedom Of Information & Rti');
    });

    it('should handle mixed single and double hyphens', () => {
      expect(normalizeTopicKey('long-form-question--answering')).toBe('Long Form Question & Answering');
      expect(normalizeTopicKey('data-privacy--bodily-autonomy')).toBe('Data Privacy & Bodily Autonomy');
    });

    it('should handle edge cases', () => {
      expect(normalizeTopicKey('')).toBe('');
      expect(normalizeTopicKey('single')).toBe('Single');
      expect(normalizeTopicKey('just--ampersand')).toBe('Just & Ampersand');
    });

    it('should match actual topic keys from the system', () => {
      // Test cases based on actual topic keys we see in the log
      const testCases = [
        ['instruction-following--prompt-adherence', 'Instruction Following & Prompt Adherence'],
        ['tone--style', 'Tone & Style'],
        ['factual-accuracy--hallucination', 'Factual Accuracy & Hallucination'],
        ['long-form-question-answering', 'Long Form Question Answering'],
        ['nuance--depth', 'Nuance & Depth'],
        ['ai-safety--robustness', 'Ai Safety & Robustness'],
        ['gender--sexuality-probes', 'Gender & Sexuality Probes'],
        ['helpfulness--actionability', 'Helpfulness & Actionability'],
        ['clarity--readability', 'Clarity & Readability'],
        ['coherence--conversational-flow', 'Coherence & Conversational Flow'],
        ['empathy--encouragement', 'Empathy & Encouragement'],
        ['persona-steerability', 'Persona Steerability'],
        ['multilingual-reasoning', 'Multilingual Reasoning'],
        ['cultural-competency', 'Cultural Competency'],
        ['science-communication', 'Science Communication'],
        ['public-health-communication', 'Public Health Communication'],
        ['armed-conflict--international-humanitarian-law', 'Armed Conflict & International Humanitarian Law'],
        ['economic-justice--inequality', 'Economic Justice & Inequality'],
        ['data-privacy--bodily-autonomy', 'Data Privacy & Bodily Autonomy'],
        ['healthcare--clinical-scenarios', 'Healthcare & Clinical Scenarios'],
        ['international-law--regional-charters', 'International Law & Regional Charters'],
      ];

      testCases.forEach(([input, expected]) => {
        expect(normalizeTopicKey(input)).toBe(expected);
      });
    });
  });
}); 