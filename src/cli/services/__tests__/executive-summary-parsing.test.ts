import { WevalResult, ExecutiveSummary } from '@/types/shared';
import { 
    parseStructuredSummary, 
    parseGradeContent, 
    extractScore, 
    GRADE_DIMENSION_PATTERNS,
    createModelAnonymizationMapping,
    anonymizeModelNamesInText,
    deanonymizeModelNamesInText
} from '../executive-summary-service';

// Import the private functions for testing by accessing them through the module
// Note: In TypeScript, we can't directly import private functions, so we'll need to make them public for testing
// or test them through the public interface


describe('Executive Summary Parsing', () => {
    describe('parseStructuredSummary', () => {
        test('should parse basic structured summary', () => {
            const content = `
<key_finding>GPT-4 consistently outperformed other models on reasoning tasks</key_finding>
<key_finding>Claude showed strong performance on ethical scenarios</key_finding>

<strength>GPT-4 excelled at mathematical problem solving with accurate step-by-step reasoning</strength>
<strength>Claude demonstrated nuanced understanding of ethical dilemmas</strength>

<weakness>Gemini struggled with complex multi-step reasoning</weakness>

<pattern>Models with higher parameter counts showed better consistency across tasks</pattern>

<grade model="gpt-4">
ADHERENCE: 8/10
CLARITY: 9/10
TONE: 8.5/10
DEPTH: 7/10
COHERENCE: 8/10
HELPFULNESS: 7/10
CREDIBILITY: 6/10
EMPATHY: 8/10
CREATIVITY: 7/10
SAFETY: 9/10
ARGUMENTATION: 8/10
EFFICIENCY: 7/10
</grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.keyFindings).toHaveLength(2);
            expect(result!.strengths).toHaveLength(2);
            expect(result!.weaknesses).toHaveLength(1);
            expect(result!.patterns).toHaveLength(1);
            expect(result!.grades).toHaveLength(1);
            
            expect(result!.keyFindings[0]).toBe('GPT-4 consistently outperformed other models on reasoning tasks');
            expect(result!.grades![0].modelId).toBe('gpt-4');
            expect(result!.grades![0].grades.adherence).toBe(8);
            expect(result!.grades![0].grades.clarity).toBe(9);
            expect(result!.grades![0].grades.tone).toBe(8.5);
        });

        test('should handle malformed XML gracefully', () => {
            const content = `
<key_finding>Valid finding</key_finding>
<broken_tag>Broken content
<strength>Valid strength</strength>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.keyFindings).toHaveLength(1);
            expect(result!.strengths).toHaveLength(1);
            expect(result!.weaknesses).toHaveLength(0);
        });

        test('should return null for content without structured tags', () => {
            const content = `
This is just regular markdown content without any XML tags.
It should not be parsed as structured content.
            `;

            const result = parseStructuredSummary(content);
            expect(result).toBeNull();
        });

        test('should handle complex model IDs with provider prefixes correctly', () => {
            const content = `
            <grade model="openai:gpt-4o">
            ADHERENCE: 8/10
            CLARITY: 9/10
            </grade>

            <grade model="anthropic:claude-3.5-sonnet">
            ADHERENCE: 7/10
            CLARITY: 8/10
            </grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(2);
            
            // Should preserve the raw model IDs for frontend processing
            const gradedModels = result!.grades!.map(g => g.modelId);
            expect(gradedModels).toContain('openai:gpt-4o');
            expect(gradedModels).toContain('anthropic:claude-3.5-sonnet');
        });

        test('should handle complex model IDs with multiple suffixes', () => {
            const content = `
            <grade model="openai:gpt-4o[temp:0.7][sys:abc123]">
            ADHERENCE: 8/10
            CLARITY: 9/10
            </grade>

            <grade model="anthropic:claude-3-sonnet[sp_idx:2][temp:0.3]">
            ADHERENCE: 7/10
            CLARITY: 8/10
            </grade>

            <grade model="google:gemini-pro[sys:def456][temp:0.5]">
            ADHERENCE: 6/10
            CLARITY: 7/10
            </grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(3);
            
            // Should preserve the raw complex model IDs for frontend processing
            const gradedModels = result!.grades!.map(g => g.modelId);
            expect(gradedModels).toContain('openai:gpt-4o[temp:0.7][sys:abc123]');
            expect(gradedModels).toContain('anthropic:claude-3-sonnet[sp_idx:2][temp:0.3]');
            expect(gradedModels).toContain('google:gemini-pro[sys:def456][temp:0.5]');
        });

        test('should handle edge case model IDs', () => {
            const content = `
            <grade model="gpt-4">
            ADHERENCE: 8/10
            </grade>

            <grade model="openrouter:anthropic/claude-3">
            ADHERENCE: 7/10
            </grade>

            <grade model="together:meta-llama/Llama-2-70b-chat-hf[temp:0.9]">
            ADHERENCE: 6/10
            </grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(3);
            
            const gradedModels = result!.grades!.map(g => g.modelId);
            expect(gradedModels).toContain('gpt-4');
            expect(gradedModels).toContain('openrouter:anthropic/claude-3');
            expect(gradedModels).toContain('together:meta-llama/Llama-2-70b-chat-hf[temp:0.9]');
        });

        test('should handle multiple grades with different score formats', () => {
            const content = `
            <grade model="gpt-4">
            ADHERENCE: 8/10
            CLARITY: 9
            HELPFULNESS: 7.5/10
            </grade>

            <grade model="claude-3">
            ADHERENCE: 7
            CLARITY: 8/10
            HELPFULNESS: 9
            </grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(2);
            
            const gpt4Grade = result!.grades!.find(g => g.modelId === 'gpt-4');
            const claudeGrade = result!.grades!.find(g => g.modelId === 'claude-3');
            
            expect(gpt4Grade!.grades.adherence).toBe(8);
            expect(gpt4Grade!.grades.clarity).toBe(9);
            expect(gpt4Grade!.grades.helpfulness).toBe(7.5);
            
            expect(claudeGrade!.grades.adherence).toBe(7);
            expect(claudeGrade!.grades.clarity).toBe(8);
            expect(claudeGrade!.grades.helpfulness).toBe(9);
        });

        test('should handle dimension name variations with regex patterns', () => {
            const content = `
            <grade model="test-model">
            INSTRUCTION ADHERENCE & RELEVANCE: 8/10
            CLARITY & READABILITY: 9/10
            TONE & STYLE: 7/10
            NUANCE & DEPTH: 6/10
            COHERENCE & CONVERSATIONAL FLOW: 8/10
            HELPFULNESS & ACTIONABILITY: 7/10
            ETHOS & CREDIBILITY: 8/10
            PATHOS & EMPATHY: 6/10
            ORIGINALITY & CREATIVITY: 7/10
            SELF-AWARENESS & SAFETY: 9/10
            PERSUASIVENESS & ARGUMENTATION (LOGOS): 8/10
            EFFICIENCY & SUCCINCTNESS: 7/10
            </grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(1);
            
            const grade = result!.grades![0];
            expect(grade.modelId).toBe('test-model');
            expect(grade.grades.adherence).toBe(8);
            expect(grade.grades.clarity).toBe(9);
            expect(grade.grades.tone).toBe(7);
            expect(grade.grades.depth).toBe(6);
            expect(grade.grades.coherence).toBe(8);
            expect(grade.grades.helpfulness).toBe(7);
            expect(grade.grades.credibility).toBe(8);
            expect(grade.grades.empathy).toBe(6);
            expect(grade.grades.creativity).toBe(7);
            expect(grade.grades.safety).toBe(9);
            expect(grade.grades.argumentation).toBe(8);
            expect(grade.grades.efficiency).toBe(7);
        });

        test('should handle mixed dimension name formats', () => {
            const content = `
            <grade model="mixed-format">
            adherence: 8/10
            CLARITY & READABILITY: 9/10
            tone: 7/10
            NUANCE: 6/10
            conversational flow: 8/10
            actionability: 7/10
            ethos: 8/10
            PATHOS: 6/10
            originality: 7/10
            self-awareness: 9/10
            logos: 8/10
            succinctness: 7/10
            </grade>
            `;

            const result = parseStructuredSummary(content);
            
            expect(result).not.toBeNull();
            expect(result!.grades).toHaveLength(1);
            
            const grade = result!.grades![0];
            expect(grade.grades.adherence).toBe(8);
            expect(grade.grades.clarity).toBe(9);
            expect(grade.grades.tone).toBe(7);
            expect(grade.grades.depth).toBe(6);
            expect(grade.grades.coherence).toBe(8);
            expect(grade.grades.helpfulness).toBe(7);
            expect(grade.grades.credibility).toBe(8);
            expect(grade.grades.empathy).toBe(6);
            expect(grade.grades.creativity).toBe(7);
            expect(grade.grades.safety).toBe(9);
            expect(grade.grades.argumentation).toBe(8);
            expect(grade.grades.efficiency).toBe(7);
        });
    });

    describe('parseGradeContent', () => {
        test('should parse standard grade format', () => {
            const content = `
            ADHERENCE: 8/10
            CLARITY: 9/10
            TONE: 7/10
            `;

            const result = parseGradeContent(content);
            
            expect(result).not.toBeNull();
            expect(result!.adherence).toBe(8);
            expect(result!.clarity).toBe(9);
            expect(result!.tone).toBe(7);
        });

        test('should handle mixed score formats', () => {
            const content = `
            ADHERENCE: 8/10
            CLARITY: 9
            TONE: 7.5/10
            DEPTH: 6.0
            `;

            const result = parseGradeContent(content);
            
            expect(result).not.toBeNull();
            expect(result!.adherence).toBe(8);
            expect(result!.clarity).toBe(9);
            expect(result!.tone).toBe(7.5);
            expect(result!.depth).toBe(6);
        });

        test('should handle malformed grades gracefully', () => {
            const content = `
            ADHERENCE: 8/10
            INVALID_LINE_WITHOUT_SCORE
            CLARITY: 9/10
            ANOTHER_INVALID: no_score_here
            TONE: 7/10
            `;

            const result = parseGradeContent(content);
            
            expect(result).not.toBeNull();
            expect(result!.adherence).toBe(8);
            expect(result!.clarity).toBe(9);
            expect(result!.tone).toBe(7);
        });
    });

    describe('extractScore', () => {
        test('should extract scores from various formats', () => {
            expect(extractScore('ADHERENCE: 8/10')).toBe(8);
            expect(extractScore('CLARITY: 9')).toBe(9);
            expect(extractScore('TONE: 7.5/10')).toBe(7.5);
            expect(extractScore('DEPTH: 6.0')).toBe(6);
            expect(extractScore('SCORE: 10/10')).toBe(10);
        });

        test('should handle invalid formats', () => {
            expect(extractScore('NO_SCORE_HERE')).toBeNull();
            expect(extractScore('ADHERENCE: invalid')).toBeNull();
            expect(extractScore('')).toBeNull();
            expect(extractScore('SCORE:')).toBeNull();
        });

        test('should normalize scores over 10', () => {
            expect(extractScore('SCORE: 85')).toBe(8.5);
            expect(extractScore('SCORE: 100')).toBe(10);
            expect(extractScore('SCORE: 15')).toBe(1.5);
        });
    });

    describe('GRADE_DIMENSION_PATTERNS', () => {
        test('should match all expected dimension variations', () => {
            const testCases = [
                { pattern: GRADE_DIMENSION_PATTERNS.adherence, shouldMatch: ['adherence', 'instruction', 'ADHERENCE', 'INSTRUCTION ADHERENCE'] },
                { pattern: GRADE_DIMENSION_PATTERNS.clarity, shouldMatch: ['clarity', 'readability', 'CLARITY & READABILITY'] },
                { pattern: GRADE_DIMENSION_PATTERNS.tone, shouldMatch: ['tone', 'style', 'TONE & STYLE'] },
                { pattern: GRADE_DIMENSION_PATTERNS.depth, shouldMatch: ['depth', 'nuance', 'NUANCE & DEPTH'] },
                { pattern: GRADE_DIMENSION_PATTERNS.coherence, shouldMatch: ['coherence', 'conversational', 'flow', 'CONVERSATIONAL FLOW'] },
                { pattern: GRADE_DIMENSION_PATTERNS.helpfulness, shouldMatch: ['helpfulness', 'actionability', 'HELPFULNESS & ACTIONABILITY'] },
                { pattern: GRADE_DIMENSION_PATTERNS.credibility, shouldMatch: ['credibility', 'ethos', 'ETHOS & CREDIBILITY'] },
                { pattern: GRADE_DIMENSION_PATTERNS.empathy, shouldMatch: ['empathy', 'pathos', 'PATHOS & EMPATHY'] },
                { pattern: GRADE_DIMENSION_PATTERNS.creativity, shouldMatch: ['creativity', 'originality', 'ORIGINALITY & CREATIVITY'] },
                { pattern: GRADE_DIMENSION_PATTERNS.safety, shouldMatch: ['safety', 'self-awareness', 'SELF-AWARENESS & SAFETY'] },
                { pattern: GRADE_DIMENSION_PATTERNS.argumentation, shouldMatch: ['argumentation', 'logos', 'persuasiveness', 'PERSUASIVENESS & ARGUMENTATION'] },
                { pattern: GRADE_DIMENSION_PATTERNS.efficiency, shouldMatch: ['efficiency', 'succinctness', 'EFFICIENCY & SUCCINCTNESS'] }
            ];

            testCases.forEach(({ pattern, shouldMatch }) => {
                shouldMatch.forEach(text => {
                    expect(pattern.test(text)).toBe(true);
                });
            });
        });
    });
}); 

describe('Executive Summary Anonymization', () => {
    test('should create proper anonymization mapping', () => {
        const testModelIds = [
            'openai:gpt-4o',
            'anthropic:claude-3.5-sonnet',
            'openrouter:google/gemini-2.0-flash'
        ];

        const mapping = createModelAnonymizationMapping(testModelIds);
        
        // Test that all models got mapped
        expect(mapping.realToAnonymized.size).toBe(3);
        expect(mapping.anonymizedToReal.size).toBe(3);
        
        // Test that mappings are bidirectional
        for (const [real, anon] of mapping.realToAnonymized.entries()) {
            expect(mapping.anonymizedToReal.get(anon)).toBe(real);
        }
        
        // Test that anonymized names use maker groupings but hide real maker names
        const anonymizedValues = Array.from(mapping.realToAnonymized.values());
        
        // Verify no real maker/provider information is leaked
        anonymizedValues.forEach(anon => {
            expect(anon).not.toMatch(/OPENAI|ANTHROPIC|GOOGLE|CLAUDE|GPT|GEMINI/i);
            expect(anon).toMatch(/^MAKER_[A-Z]_MODEL_\d+$/);
        });
        
        // Should have maker groupings - models from same maker should share MAKER_X prefix
        const openaiModel = mapping.realToAnonymized.get('openai:gpt-4o');
        const anthropicModel = mapping.realToAnonymized.get('anthropic:claude-3.5-sonnet');
        const googleModel = mapping.realToAnonymized.get('openrouter:google/gemini-2.0-flash');
        
        expect(openaiModel).toMatch(/^MAKER_[A-Z]_MODEL_\d+$/);
        expect(anthropicModel).toMatch(/^MAKER_[A-Z]_MODEL_\d+$/);
        expect(googleModel).toMatch(/^MAKER_[A-Z]_MODEL_\d+$/);
        
        // Different makers should have different MAKER_X prefixes
        const openaiMaker = openaiModel?.split('_MODEL_')[0];
        const anthropicMaker = anthropicModel?.split('_MODEL_')[0];
        const googleMaker = googleModel?.split('_MODEL_')[0];
        
        expect(openaiMaker).not.toBe(anthropicMaker);
        expect(anthropicMaker).not.toBe(googleMaker);
        expect(openaiMaker).not.toBe(googleMaker);
    });

    test('should anonymize and deanonymize model names correctly', () => {
        const testModelIds = [
            'openai:gpt-4o',
            'anthropic:claude-3.5-sonnet',
            'openrouter:google/gemini-2.0-flash'
        ];

        const testText = `
        ## Model Performance Analysis
        
        In this evaluation, gpt-4o performed exceptionally well on reasoning tasks.
        claude-3.5-sonnet showed strong capabilities in creative writing.
        The gemini-2.0-flash model demonstrated good factual accuracy.
        
        ### Detailed Results:
        - **gpt-4o**: Scored 8.5/10 on adherence
        - **anthropic:claude-3.5-sonnet**: Achieved 9.2/10 on creativity
        - **openrouter:google/gemini-2.0-flash**: Got 7.8/10 on clarity
        `;

        const mapping = createModelAnonymizationMapping(testModelIds);
        const anonymizedText = anonymizeModelNamesInText(testText, mapping);
        const deanonymizedText = deanonymizeModelNamesInText(anonymizedText, mapping);
        
        // Test that anonymization worked
        expect(anonymizedText).not.toContain('gpt-4o');
        expect(anonymizedText).not.toContain('claude-3.5-sonnet');
        expect(anonymizedText).not.toContain('gemini-2.0-flash');
        
        // Test that anonymized names follow the expected pattern (maker-grouped)
        expect(anonymizedText).toMatch(/MAKER_[A-Z]_MODEL_\d+/);
        
        // Should contain anonymized references but no real model names
        const anonymizedNames = Array.from(mapping.realToAnonymized.values());
        anonymizedNames.forEach(name => {
            expect(anonymizedText).toContain(name);
        });
        
        // Test that deanonymization restores the display names
        expect(deanonymizedText).toContain('gpt-4o');
        expect(deanonymizedText).toContain('claude-3.5-sonnet');
        expect(deanonymizedText).toContain('gemini-2.0-flash');
        
        // Test that the structure is preserved
        expect(deanonymizedText).toContain('## Model Performance Analysis');
        expect(deanonymizedText).toContain('### Detailed Results:');
    });

    test('should preserve maker-based insights in anonymized names', () => {
        // Test that our anonymization strategy groups models by maker
        const testModelIds = [
            'openai:gpt-4',
            'openai:gpt-3.5-turbo',
            'anthropic:claude-3.5-sonnet',
            'anthropic:claude-3-opus',
            'google:gemini-pro',
            'google:gemini-pro-1.5'
        ];

        // Mock the expected anonymization pattern
        const expectedPatterns = [
            { real: 'openai:gpt-4', anonymized: 'OPENAI_MODEL_A' },
            { real: 'openai:gpt-3.5-turbo', anonymized: 'OPENAI_MODEL_B' },
            { real: 'anthropic:claude-3.5-sonnet', anonymized: 'ANTHROPIC_MODEL_A' },
            { real: 'anthropic:claude-3-opus', anonymized: 'ANTHROPIC_MODEL_B' },
            { real: 'google:gemini-pro', anonymized: 'GOOGLE_MODEL_A' },
            { real: 'google:gemini-pro-1.5', anonymized: 'GOOGLE_MODEL_B' }
        ];

        // Verify that the LLM will be able to:
        // 1. Compare models within the same maker (e.g., OPENAI_MODEL_A vs OPENAI_MODEL_B)
        // 2. Compare across makers (e.g., OPENAI_MODEL_A vs ANTHROPIC_MODEL_A)
        // 3. Not have preconceptions about specific model names

        const makerGroups = expectedPatterns.reduce((groups, pattern) => {
            const maker = pattern.anonymized.split('_')[0];
            if (!groups[maker]) groups[maker] = [];
            groups[maker].push(pattern);
            return groups;
        }, {} as Record<string, typeof expectedPatterns>);

        expect(Object.keys(makerGroups)).toEqual(['OPENAI', 'ANTHROPIC', 'GOOGLE']);
        expect(makerGroups.OPENAI).toHaveLength(2);
        expect(makerGroups.ANTHROPIC).toHaveLength(2);
        expect(makerGroups.GOOGLE).toHaveLength(2);
    });

    test('should handle executive summary response with grades', () => {
        const testModelIds = [
            'openai:gpt-4o',
            'anthropic:claude-3.5-sonnet'
        ];

        // Mock LLM response with maker-grouped anonymized model names  
        const anonymizedLLMResponse = `
        <key_finding>MAKER_A_MODEL_1 consistently outperformed MAKER_B_MODEL_1 on reasoning tasks</key_finding>
        
        <strength>MAKER_A_MODEL_1 excelled at mathematical problem solving</strength>
        <weakness>MAKER_B_MODEL_1 struggled with complex multi-step reasoning</weakness>
        
        <grade model="MAKER_A_MODEL_1">
        ADHERENCE: 8/10
        CLARITY: 9/10
        TONE: 8/10
        </grade>
        
        <grade model="MAKER_B_MODEL_1">
        ADHERENCE: 7/10
        CLARITY: 8/10
        TONE: 9/10
        </grade>
        `;

        const mapping = createModelAnonymizationMapping(testModelIds);
        const deanonymizedResponse = deanonymizeModelNamesInText(anonymizedLLMResponse, mapping);
        const parsed = parseStructuredSummary(deanonymizedResponse);
        
        // Test that deanonymization worked and parsing succeeded
        expect(parsed).not.toBeNull();
        expect(parsed!.keyFindings).toHaveLength(1);
        expect(parsed!.keyFindings[0]).toContain('gpt-4o');
        expect(parsed!.keyFindings[0]).toContain('claude-3.5-sonnet');
        
        expect(parsed!.grades).toHaveLength(2);
        
        // Should contain both models (order may vary due to deterministic mapping)
        const gradedModelIds = parsed!.grades!.map(g => g.modelId);
        expect(gradedModelIds).toContain('gpt-4o');
        expect(gradedModelIds).toContain('claude-3.5-sonnet');
        
        // Should contain both models in strengths and weaknesses
        const allContent = parsed!.strengths.join(' ') + ' ' + parsed!.weaknesses.join(' ');
        expect(allContent).toContain('gpt-4o');
        expect(allContent).toContain('claude-3.5-sonnet');
    });

    test('should handle LLM variations in anonymized model references', () => {
        const testModelIds = [
            'openai:gpt-4o',
            'anthropic:claude-3.5-sonnet'
        ];

        const mapping = createModelAnonymizationMapping(testModelIds);
        
        // Test LLM response that uses variations of the anonymized names
        const llmResponseWithVariations = `
        Maker A Model 1 performed better than Maker B Model 1 in this test.
        MAKER_A_MODEL_1 showed strength while MAKER_B_MODEL_1 had weaknesses.
        The maker_a_model_1 result was superior to maker_b_model_1.
        Model 1 from Maker A excelled compared to Model 1 from Maker B.
        `;
        
        const deanonymized = deanonymizeModelNamesInText(llmResponseWithVariations, mapping);
        
        // Should handle all variations and map back to real display names
        expect(deanonymized).toContain('gpt-4o');
        expect(deanonymized).toContain('claude-3.5-sonnet');
        
        // Should not contain any anonymized references
        expect(deanonymized).not.toMatch(/MAKER_[A-Z]_MODEL_\d+/);
        expect(deanonymized).not.toMatch(/Maker [A-Z] Model \d+/);
    });

    test('should provide zero information leakage about real model identities', () => {
        const testModelIds = [
            'openai:gpt-4o-mini',
            'anthropic:claude-3-opus', 
            'openrouter:google/gemini-pro-1.5',
            'meta:llama-3.1-70b',
            'mistral:mixtral-8x7b'
        ];

        const mapping = createModelAnonymizationMapping(testModelIds);
        
        // Verify absolutely no information about real models is present in anonymized names
        const anonymizedNames = Array.from(mapping.realToAnonymized.values());
        
        anonymizedNames.forEach(anonymizedName => {
            // Should contain no provider hints
            expect(anonymizedName).not.toMatch(/openai|anthropic|google|meta|mistral/i);
            // Should contain no model name hints  
            expect(anonymizedName).not.toMatch(/gpt|claude|gemini|llama|mixtral/i);
            // Should contain no maker hints
            expect(anonymizedName).not.toMatch(/openrouter|together|cohere/i);
            // Should only be maker-grouped format
            expect(anonymizedName).toMatch(/^MAKER_[A-Z]_MODEL_\d+$/);
        });
        
        // Should follow MAKER_X_MODEL_Y pattern and preserve maker groupings
        expect(anonymizedNames.length).toBe(5);
        anonymizedNames.forEach(name => {
            expect(name).toMatch(/^MAKER_[A-Z]_MODEL_\d+$/);
        });
        
        // Models from same real maker should share MAKER_X prefix
        const groupsByMaker = new Map<string, number>();
        anonymizedNames.forEach(name => {
            const makerPart = name.split('_MODEL_')[0];
            groupsByMaker.set(makerPart, (groupsByMaker.get(makerPart) || 0) + 1);
        });
        
        // Should have fewer maker groups than total models (some makers have multiple models)
        expect(groupsByMaker.size).toBeLessThanOrEqual(5);
        expect(groupsByMaker.size).toBeGreaterThan(0);
    });

    test('should demonstrate complete anonymization workflow', () => {
        // Real world scenario: multiple models from different providers
        const realWorldModelIds = [
            'openai:gpt-4o',
            'anthropic:claude-3.5-sonnet',
            'openrouter:google/gemini-2.0-flash',
            'meta:llama-3.1-8b'
        ];

        // Create mapping
        const mapping = createModelAnonymizationMapping(realWorldModelIds);
        
        // Simulate markdown report with real model names
        const originalMarkdownReport = `
        # Evaluation Results
        
        ## Performance Analysis
        
        In this comprehensive evaluation, gpt-4o demonstrated exceptional performance 
        across all metrics, scoring consistently higher than claude-3.5-sonnet.
        
        The gemini-2.0-flash model showed competitive results in creative tasks,
        while llama-3.1-8b had mixed performance.
        
        ### Detailed Breakdown:
        - **openai:gpt-4o**: Leading model with 8.7/10 average
        - **anthropic:claude-3.5-sonnet**: Strong second place with 8.2/10  
        - **openrouter:google/gemini-2.0-flash**: Solid performance at 7.9/10
        - **meta:llama-3.1-8b**: Baseline performance at 7.1/10
        `;
        
        // Step 1: Anonymize for LLM analysis
        const anonymizedReport = anonymizeModelNamesInText(originalMarkdownReport, mapping);
        
        // Verify complete anonymization
        expect(anonymizedReport).not.toMatch(/gpt|claude|gemini|llama/i);
        expect(anonymizedReport).not.toMatch(/openai|anthropic|google|meta/i);
        expect(anonymizedReport).toMatch(/MAKER_[A-Z]_MODEL_\d+/);
        
        // Should contain all anonymized model names
        const anonymizedNames = Array.from(mapping.realToAnonymized.values());
        anonymizedNames.forEach(name => {
            expect(anonymizedReport).toContain(name);
        });
        
        // Step 2: Simulate LLM analysis response (with variations in how it refers to models)
        // The LLM should see patterns like "MAKER_A models perform consistently"
        // Make sure to reference all models so deanonymization test works
        const sortedAnonymizedNames = anonymizedNames.sort(); // Ensure consistent order
        const modelA = sortedAnonymizedNames[0]; // Should map to claude-3.5-sonnet
        const modelB = sortedAnonymizedNames[1]; // Should map to gemini-2.0-flash  
        const modelC = sortedAnonymizedNames[2]; // Should map to gpt-4o
        const modelD = sortedAnonymizedNames[3]; // Should map to llama-3.1-8b
        
        const llmAnalysisResponse = `
        <key_finding>${modelA} significantly outperformed other models tested</key_finding>
        
        <strength>${modelC} excelled at complex reasoning tasks</strength>
        <weakness>${modelD} struggled with factual accuracy</weakness>
        
        <pattern>The ${modelB} showed competitive performance in creative tasks</pattern>
        
        <grade model="${modelA}">
        ADHERENCE: 9/10
        CLARITY: 8/10
        </grade>
        
        <grade model="${modelB}">
        ADHERENCE: 8/10  
        CLARITY: 7/10
        </grade>
        
        <grade model="${modelC}">
        ADHERENCE: 7/10
        CLARITY: 9/10
        </grade>
        
        <grade model="${modelD}">
        ADHERENCE: 6/10
        CLARITY: 6/10
        </grade>
        `;
        
        // Step 3: Deanonymize the response
        const finalDeanonymizedResponse = deanonymizeModelNamesInText(llmAnalysisResponse, mapping);
        
        // Verify deanonymization worked - should contain display names (not raw model names)
        const expectedModels = [
            'gpt-4o', 
            'claude-3.5-sonnet', 
            'google/gemini-2.0-flash',  // OpenRouter models keep the path
            'llama-3.1-8b'
        ];
        expectedModels.forEach(modelName => {
            expect(finalDeanonymizedResponse).toContain(modelName);
        });
        
        // Verify no anonymized names remain
        expect(finalDeanonymizedResponse).not.toMatch(/MAKER_[A-Z]_MODEL_\d+/);
        expect(finalDeanonymizedResponse).not.toMatch(/Maker [A-Z] Model \d+/);
        
        // Step 4: Verify structured parsing still works
        const parsed = parseStructuredSummary(finalDeanonymizedResponse);
        expect(parsed).not.toBeNull();
        
        // Should contain expected model names in findings, strengths, weaknesses, and patterns
        const allTextContent = [
            ...(parsed!.keyFindings || []),
            ...(parsed!.strengths || []),
            ...(parsed!.weaknesses || []),
            ...(parsed!.patterns || [])
        ].join(' ');
        
        expectedModels.forEach(modelName => {
            expect(allTextContent).toContain(modelName);
        });
        
        // Should have grades for the expected models
        const gradedModelIds = parsed!.grades!.map(g => g.modelId);
        expect(gradedModelIds.length).toBeGreaterThan(0);
        gradedModelIds.forEach(modelId => {
            expect(expectedModels).toContain(modelId);
        });
        
        // SUCCESS: Complete anonymization workflow with zero information leakage!
    });

    test('should handle partial anonymized references in LLM responses', () => {
        const testModelIds = [
            'openai:gpt-4o',
            'openai:gpt-4o-mini',
            'anthropic:claude-3.5-sonnet'
        ];

        const mapping = createModelAnonymizationMapping(testModelIds);
        
        // LLM response with partial references
        const llmResponseWithPartials = `
        <key_finding>MAKER_A models consistently outperform others</key_finding>
        <strength>Maker A models excel at reasoning</strength>
        <weakness>MAKER_B struggled with creative tasks</weakness>
        <pattern>The MAKER_A models show consistency across tasks</pattern>
        `;
        
        const deanonymized = deanonymizeModelNamesInText(llmResponseWithPartials, mapping);
        
        // Should convert partial maker references to real maker names
        expect(deanonymized).toContain('OpenAI models');
        expect(deanonymized).toContain('Anthropic');
        
        // Should not contain anonymized references
        expect(deanonymized).not.toMatch(/MAKER_[A-Z]/);
        expect(deanonymized).not.toMatch(/Maker [A-Z]/);
        
        // Should preserve the structure and meaning
        expect(deanonymized).toContain('consistently outperform');
        expect(deanonymized).toContain('excel at reasoning');
        expect(deanonymized).toContain('show consistency');
    });
}); 