import { WevalResult, ExecutiveSummary } from '@/types/shared';
import { 
    parseStructuredSummary, 
    parseGradeContent, 
    extractScore, 
    GRADE_DIMENSION_PATTERNS 
} from '../executive-summary-service';



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