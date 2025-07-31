import { WevalResult, ExecutiveSummary } from '@/types/shared';
import { 
    parseStructuredSummary, 
    parseGradeContent, 
    extractScore, 
    GRADE_DIMENSION_PATTERNS,
    createModelAnonymizationMapping,
    deanonymizeModelNamesInText,
    anonymizeWevalResultData,
    ModelAnonymizationMapping,
    AnonymizedModelData
} from '../executive-summary-service';

// Helper function to create a minimal mock mapping for tests
function createMockMapping(): ModelAnonymizationMapping {
    return {
        realToAnonymized: new Map(),
        anonymizedToReal: new Map(),
        makerToReal: new Map(),
        modelToReal: new Map(),
        sysToReal: new Map(),
        tempToReal: new Map()
    };
}

describe('Executive Summary Parsing', () => {
    describe('parseStructuredSummary', () => {

        test('should handle malformed XML gracefully', () => {
            const content = `
<key_finding>Valid finding</key_finding>
<broken_tag>Broken content
<strength>Valid strength</strength>
            `;

            const result = parseStructuredSummary(content, createMockMapping());
            
            expect(result).not.toBeNull();
            expect(result!.keyFindings).toHaveLength(1);
            expect(result!.strengths).toHaveLength(1);
            expect(result!.weaknesses).toHaveLength(0);
        });

        test('should handle dimension name variations with regex patterns', () => {
            const content = `
            <grade maker="MK_5000" model="MD_6000" sys="S_7000" temp="T_8000">
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

            // Create a proper mapping that includes the test model
            const mapping = createMockMapping();
            const anonData: AnonymizedModelData = { 
                realId: 'test-model',
                maker: 'MK_5000', 
                model: 'MD_6000', 
                sys: 'S_7000', 
                temp: 'T_8000' 
            };
            mapping.realToAnonymized.set('test-model', anonData);

            const result = parseStructuredSummary(content, mapping);
            
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
