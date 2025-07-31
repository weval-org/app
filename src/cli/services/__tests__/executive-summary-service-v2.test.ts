import { WevalResult, ExecutiveSummary } from '@/types/shared';
import { 
    createModelAnonymizationMappingV2, 
    anonymizeWevalResultDataV2,
    deanonymizeModelNamesInTextV2,
    parseStructuredSummaryV2,
    generateExecutiveSummaryV2,
    ModelAnonymizationMappingV2,
    AnonymizedModelData
} from '../executive-summary-service-v2';

describe('Executive Summary Service V2 - Opaque ID System', () => {
    
    describe('createModelAnonymizationMappingV2', () => {
        test('should create opaque, deterministic IDs for makers, models, systems, and temperatures', () => {
            const modelIds = [
                'openai:gpt-4o',
                'anthropic:claude-3-sonnet[sys:0]',
                'anthropic:claude-3-sonnet[sys:1]',
                'google:gemini-pro[sys:0][temp:0.7]',
                'openai:gpt-4o-mini[temp:0.3]'
            ];
            
            const mapping = createModelAnonymizationMappingV2(modelIds);
            
            // Should have generated mappings for all real IDs
            expect(mapping.realToAnonymized.size).toBe(5);
            expect(mapping.anonymizedToReal.size).toBe(5);
            
            // All generated IDs should be opaque (high numbers, not sequential from 1)
            const anonIds = Array.from(mapping.realToAnonymized.values());
            anonIds.forEach((anon: AnonymizedModelData) => {
                expect(anon.maker).toMatch(/^MK_\d{4,}$/);
                expect(anon.model).toMatch(/^MD_\d{4,}$/);
                if (anon.sys) expect(anon.sys).toMatch(/^S_\d{4,}$/);
                if (anon.temp) expect(anon.temp).toMatch(/^T_\d{4,}$/);
            });
            
            // Same makers should get the same maker ID
            const openaiGpt4o = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const openaiGpt4oMini = mapping.realToAnonymized.get('openai:gpt-4o-mini[temp:0.3]')!;
            expect(openaiGpt4o.maker).toBe(openaiGpt4oMini.maker);
            
            // Same sys content should get the same sys ID
            const claudeSys0 = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
            const geminiSys0 = mapping.realToAnonymized.get('google:gemini-pro[sys:0][temp:0.7]')!;
            expect(claudeSys0.sys).toBe(geminiSys0.sys);
        });

        test('should be deterministic across multiple calls', () => {
            const modelIds = ['openai:gpt-4o', 'anthropic:claude-3-sonnet[sys:1][temp:0.5]'];
            
            const mapping1 = createModelAnonymizationMappingV2(modelIds);
            const mapping2 = createModelAnonymizationMappingV2(modelIds);
            
            expect(mapping1.realToAnonymized.get('openai:gpt-4o')).toEqual(
                mapping2.realToAnonymized.get('openai:gpt-4o')
            );
            expect(mapping1.realToAnonymized.get('anthropic:claude-3-sonnet[sys:1][temp:0.5]')).toEqual(
                mapping2.realToAnonymized.get('anthropic:claude-3-sonnet[sys:1][temp:0.5]')
            );
        });

        test('should handle edge case model formats', () => {
            const modelIds = [
                'gpt-4', // No provider
                'openrouter:anthropic/claude-3',
                'together:meta-llama/Llama-2-70b-chat-hf[temp:0.9]',
                'xai:grok-beta[sys:2][temp:1.0]'
            ];
            
            const mapping = createModelAnonymizationMappingV2(modelIds);
            
            expect(mapping.realToAnonymized.size).toBe(4);
            
            // All should have valid opaque IDs
            modelIds.forEach(modelId => {
                const anon = mapping.realToAnonymized.get(modelId);
                expect(anon).toBeDefined();
                expect(anon!.maker).toMatch(/^MK_\d{4,}$/);
                expect(anon!.model).toMatch(/^MD_\d{4,}$/);
            });
        });
    });

    describe('deanonymizeModelNamesInTextV2', () => {
        let mapping: ModelAnonymizationMappingV2;
        
        beforeEach(() => {
            const modelIds = [
                'openai:gpt-4o',
                'anthropic:claude-3-sonnet[sys:0]',
                'google:gemini-pro[sys:1][temp:0.7]'
            ];
            mapping = createModelAnonymizationMappingV2(modelIds);
        });

        test('should convert maker-only ref tags to human-readable text', () => {
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const text = `Models from <ref maker="${openaiAnon.maker}" /> performed well.`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toBe('Models from OpenAI performed well.');
        });

        test('should convert base model ref tags to markdown links', () => {
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const text = `The standout was <ref maker="${openaiAnon.maker}" model="${openaiAnon.model}" />.`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toBe('The standout was [gpt-4o](#model-perf:openai:gpt-4o).');
        });

        test('should convert full variant ref tags to descriptive markdown links', () => {
            const geminiAnon = mapping.realToAnonymized.get('google:gemini-pro[sys:1][temp:0.7]')!;
            const text = `However, <ref maker="${geminiAnon.maker}" model="${geminiAnon.model}" sys="${geminiAnon.sys}" temp="${geminiAnon.temp}" /> struggled.`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toContain('[Gemini Pro (sys:1, temp:0.7)](#model-perf:google:gemini-pro[sys:1][temp:0.7])');
        });

        test('should handle mixed ref tags in same text', () => {
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const claudeAnon = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
            
            const text = `<ref maker="${openaiAnon.maker}" /> models outperformed <ref maker="${claudeAnon.maker}" model="${claudeAnon.model}" sys="${claudeAnon.sys}" />.`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toContain('OpenAI models');
            expect(result).toContain('[Claude 3 Sonnet (sys:0)](#model-perf:anthropic:claude-3-sonnet[sys:0])');
        });

        test('should handle system-only and temp-only ref tags', () => {
            const claudeAnon = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
            const geminiAnon = mapping.realToAnonymized.get('google:gemini-pro[sys:1][temp:0.7]')!;
            
            const text = `The <ref sys="${claudeAnon.sys}" /> system prompt worked well, but <ref temp="${geminiAnon.temp}" /> was too creative.`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toContain('sys:0 system prompt');
            expect(result).toContain('temp:0.7 was too creative');
        });

        test('should leave unrecognized ref tags unchanged', () => {
            const text = `<ref maker="MK_9999" /> is not in our mapping.`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toBe(text); // Should be unchanged
        });

        test('should handle malformed ref tags gracefully', () => {
            const text = `<ref maker="unclosed" model="also_unclosed"`;
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            
            expect(result).toBe(text); // Should be unchanged
        });
    });

    describe('parseStructuredSummaryV2', () => {
        let mapping: ModelAnonymizationMappingV2;
        
        beforeEach(() => {
            const modelIds = [
                'openai:gpt-4o',
                'anthropic:claude-3-sonnet[sys:0]',
                'google:gemini-pro[sys:1][temp:0.7]'
            ];
            mapping = createModelAnonymizationMappingV2(modelIds);
        });

        test('should parse content with new ref tags in qualitative sections', () => {
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const claudeAnon = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
            
            const content = `
<key_finding><ref maker="${openaiAnon.maker}" /> consistently outperformed others</key_finding>
<strength><ref maker="${claudeAnon.maker}" model="${claudeAnon.model}" sys="${claudeAnon.sys}" /> excelled at nuanced tasks</strength>
<weakness>Models struggled with temperature sensitivity</weakness>

<grade maker="${openaiAnon.maker}" model="${openaiAnon.model}">
ADHERENCE: 8/10
CLARITY: 9/10
</grade>

<grade maker="${claudeAnon.maker}" model="${claudeAnon.model}" sys="${claudeAnon.sys}">
ADHERENCE: 7/10
CLARITY: 8/10
</grade>
            `;

            const result = parseStructuredSummaryV2(content, mapping);
            
            expect(result).not.toBeNull();
            expect(result!.keyFindings).toHaveLength(1);
            expect(result!.keyFindings[0]).toContain('OpenAI consistently outperformed');
            
            expect(result!.strengths).toHaveLength(1);
            expect(result!.strengths[0]).toContain('[Claude 3 Sonnet (sys:0)](#model-perf:anthropic:claude-3-sonnet[sys:0])');
            
            expect(result!.grades).toHaveLength(2);
            expect(result!.grades![0].modelId).toBe('openai:gpt-4o');
            expect(result!.grades![1].modelId).toBe('anthropic:claude-3-sonnet[sys:0]');
        });

        test('should handle grade tags with all variant attributes', () => {
            const geminiAnon = mapping.realToAnonymized.get('google:gemini-pro[sys:1][temp:0.7]')!;
            
            const content = `
<grade maker="${geminiAnon.maker}" model="${geminiAnon.model}" sys="${geminiAnon.sys}" temp="${geminiAnon.temp}">
ADHERENCE: 6/10
CLARITY: 7/10
</grade>
            `;

            const result = parseStructuredSummaryV2(content, mapping);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(1);
            expect(result!.grades![0].modelId).toBe('google:gemini-pro[sys:1][temp:0.7]');
            expect(result!.grades![0].grades.adherence).toBe(6);
            expect(result!.grades![0].grades.clarity).toBe(7);
        });

        test('should ignore grade tags with unrecognized IDs', () => {
            const content = `
<grade maker="MK_9999" model="MD_8888">
ADHERENCE: 8/10
</grade>
            `;

            const result = parseStructuredSummaryV2(content, mapping);
            
            expect(result).not.toBeNull();
            expect(result!.grades || []).toHaveLength(0);
        });

        test('should handle partial attribute matches in grade tags', () => {
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            
            const content = `
<grade maker="${openaiAnon.maker}">
ADHERENCE: 8/10
</grade>
            `;

            const result = parseStructuredSummaryV2(content, mapping);
            
            expect(result).not.toBeNull();
            // Should not match because we need at least maker + model for a grade
            expect(result!.grades || []).toHaveLength(0);
        });
    });

    describe('anonymizeWevalResultDataV2', () => {
        test('should replace model IDs in WevalResult with opaque IDs', () => {
            const mockResultData: Partial<WevalResult> = {
                effectiveModels: ['openai:gpt-4o', 'anthropic:claude-3-sonnet[sys:0]'],
                allFinalAssistantResponses: {
                    'p1': {
                        'openai:gpt-4o': 'response from gpt-4o',
                        'anthropic:claude-3-sonnet[sys:0]': 'response from claude'
                    }
                },
                evaluationResults: {
                    llmCoverageScores: {},
                    perPromptSimilarities: {}
                }
            };

            const mapping = createModelAnonymizationMappingV2(['openai:gpt-4o', 'anthropic:claude-3-sonnet[sys:0]']);
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const claudeAnon = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
            
            const result = anonymizeWevalResultDataV2(mockResultData as WevalResult, mapping);
            
            const expectedOpenaiId = `${openaiAnon.maker}_${openaiAnon.model}`;
            const expectedClaudeId = `${claudeAnon.maker}_${claudeAnon.model}_${claudeAnon.sys}`;
            
            expect(result.effectiveModels).toContain(expectedOpenaiId);
            expect(result.effectiveModels).toContain(expectedClaudeId);
            expect(result.allFinalAssistantResponses!['p1'][expectedOpenaiId]).toBe('response from gpt-4o');
            expect(result.allFinalAssistantResponses!['p1'][expectedClaudeId]).toBe('response from claude');
        });
    });

    describe('Integration: Full Round-trip', () => {
        test('should handle complete anonymization -> LLM response -> deanonymization cycle', () => {
            const modelIds = [
                'openai:gpt-4o',
                'anthropic:claude-3-sonnet[sys:0]',
                'google:gemini-pro[sys:1][temp:0.7]'
            ];
            
            const mapping = createModelAnonymizationMappingV2(modelIds);
            const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
            const claudeAnon = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
            const geminiAnon = mapping.realToAnonymized.get('google:gemini-pro[sys:1][temp:0.7]')!;
            
            // Simulate LLM response using the opaque IDs
            const llmResponse = `
<key_finding>Models from <ref maker="${openaiAnon.maker}" /> showed strong performance across all tasks</key_finding>

<strength><ref maker="${claudeAnon.maker}" model="${claudeAnon.model}" sys="${claudeAnon.sys}" /> excelled at creative tasks with nuanced understanding</strength>

<weakness><ref maker="${geminiAnon.maker}" model="${geminiAnon.model}" sys="${geminiAnon.sys}" temp="${geminiAnon.temp}" /> was inconsistent due to high temperature</weakness>

<pattern>System prompt <ref sys="${claudeAnon.sys}" /> generally improved performance across makers</pattern>

<grade maker="${openaiAnon.maker}" model="${openaiAnon.model}">
ADHERENCE: 8/10
CLARITY: 9/10
TONE: 8/10
</grade>

<grade maker="${claudeAnon.maker}" model="${claudeAnon.model}" sys="${claudeAnon.sys}">
ADHERENCE: 7/10
CLARITY: 8/10
TONE: 9/10
</grade>

<grade maker="${geminiAnon.maker}" model="${geminiAnon.model}" sys="${geminiAnon.sys}" temp="${geminiAnon.temp}">
ADHERENCE: 6/10
CLARITY: 7/10
TONE: 6/10
</grade>
            `;
            
            const parsed = parseStructuredSummaryV2(llmResponse, mapping);
            
            expect(parsed).not.toBeNull();
            
            // Check that qualitative content was properly deanonymized
            expect(parsed!.keyFindings[0]).toContain('OpenAI showed strong performance');
            expect(parsed!.strengths[0]).toContain('[Claude 3 Sonnet (sys:0)](#model-perf:anthropic:claude-3-sonnet[sys:0])');
            expect(parsed!.weaknesses[0]).toContain('[Gemini Pro (sys:1, temp:0.7)](#model-perf:google:gemini-pro[sys:1][temp:0.7])');
            expect(parsed!.patterns[0]).toContain('sys:0 generally improved');
            
            // Check that grades were properly mapped back to real IDs
            expect(parsed!.grades).toHaveLength(3);
            
            const openaiGrade = parsed!.grades!.find((g: any) => g.modelId === 'openai:gpt-4o');
            const claudeGrade = parsed!.grades!.find((g: any) => g.modelId === 'anthropic:claude-3-sonnet[sys:0]');
            const geminiGrade = parsed!.grades!.find((g: any) => g.modelId === 'google:gemini-pro[sys:1][temp:0.7]');
            
            expect(openaiGrade).toBeDefined();
            expect(openaiGrade!.grades.adherence).toBe(8);
            expect(openaiGrade!.grades.clarity).toBe(9);
            
            expect(claudeGrade).toBeDefined();
            expect(claudeGrade!.grades.adherence).toBe(7);
            
            expect(geminiGrade).toBeDefined();
            expect(geminiGrade!.grades.adherence).toBe(6);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle empty model list gracefully', () => {
            const mapping = createModelAnonymizationMappingV2([]);
            expect(mapping.realToAnonymized.size).toBe(0);
            expect(mapping.anonymizedToReal.size).toBe(0);
        });

        test('should handle malformed model IDs without crashing', () => {
            const modelIds = ['', 'just-a-name', ':::invalid:::'];
            const mapping = createModelAnonymizationMappingV2(modelIds);
            
            // Should create mappings even for weird inputs
            expect(mapping.realToAnonymized.size).toBe(3);
        });

        test('should handle text with no ref tags', () => {
            const mapping = createModelAnonymizationMappingV2(['openai:gpt-4o']);
            const text = 'This text has no model references.';
            
            const result = deanonymizeModelNamesInTextV2(text, mapping);
            expect(result).toBe(text);
        });

        test('should handle nested or malformed XML gracefully', () => {
            const mapping = createModelAnonymizationMappingV2(['openai:gpt-4o']);
            const text = '<key_finding><ref broken<strength>nested</strength></key_finding>';
            
            const result = parseStructuredSummaryV2(text, mapping);
            expect(result).not.toBeNull();
            // Should extract what it can
        });
    });
}); 