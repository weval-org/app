import { WevalResult, ExecutiveSummary } from '@/types/shared';

// Mock the functions we're testing - we need to extract them or make them testable
// For now, I'll recreate the parsing logic for testing
function parseStructuredSummary(content: string) {
    try {
        const keyFindings: string[] = [];
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const patterns: string[] = [];
        const grades: any[] = [];

        // Extract key findings
        const keyFindingMatches = content.match(/<key_finding>(.*?)<\/key_finding>/gs);
        if (keyFindingMatches) {
            keyFindingMatches.forEach(match => {
                const finding = match.replace(/<\/?key_finding>/g, '').trim();
                if (finding) keyFindings.push(finding);
            });
        }

        // Extract strengths
        const strengthMatches = content.match(/<strength>(.*?)<\/strength>/gs);
        if (strengthMatches) {
            strengthMatches.forEach(match => {
                const strength = match.replace(/<\/?strength>/g, '').trim();
                if (strength) strengths.push(strength);
            });
        }

        // Extract weaknesses
        const weaknessMatches = content.match(/<weakness>(.*?)<\/weakness>/gs);
        if (weaknessMatches) {
            weaknessMatches.forEach(match => {
                const weakness = match.replace(/<\/?weakness>/g, '').trim();
                if (weakness) weaknesses.push(weakness);
            });
        }

        // Extract patterns
        const patternMatches = content.match(/<pattern>(.*?)<\/pattern>/gs);
        if (patternMatches) {
            patternMatches.forEach(match => {
                const pattern = match.replace(/<\/?pattern>/g, '').trim();
                if (pattern) patterns.push(pattern);
            });
        }

        // Extract grades
        const gradeMatches = content.match(/<grade\s+model="([^"]+)">(.*?)<\/grade>/gs);
        if (gradeMatches) {
            gradeMatches.forEach(match => {
                const modelMatch = match.match(/model="([^"]+)"/);
                const gradeContent = match.replace(/<grade[^>]*>|<\/grade>/g, '').trim();
                
                if (modelMatch && gradeContent) {
                    let modelId = modelMatch[1].trim();
                    
                    // Clean up the model name to handle variations
                    // Remove any provider prefixes that might have crept in
                    if (modelId.includes(':')) {
                        modelId = modelId.split(':').pop() || modelId;
                    }
                    
                    const gradeData = parseGradeContent(gradeContent);
                    if (gradeData) {
                        grades.push({ modelId, grades: gradeData });
                    }
                }
            });
        }

        // Only return structured data if we found at least some content
        if (keyFindings.length > 0 || strengths.length > 0 || weaknesses.length > 0 || patterns.length > 0 || grades.length > 0) {
            return {
                keyFindings,
                strengths,
                weaknesses,
                patterns,
                grades: grades.length > 0 ? grades : undefined
            };
        }

        return null;
    } catch (error) {
        console.error('Error parsing structured summary:', error);
        return null;
    }
}

// Regex patterns to match dimension names to property keys
const GRADE_DIMENSION_PATTERNS = {
    adherence: /adherence|instruction/i,
    clarity: /clarity|readability/i,
    tone: /tone|style/i,
    depth: /depth|nuance/i,
    coherence: /coherence|conversational|flow/i,
    helpfulness: /helpfulness|actionability/i,
    credibility: /credibility|ethos/i,
    empathy: /empathy|pathos/i,
    creativity: /creativity|originality/i,
    safety: /safety|self-awareness/i,
    argumentation: /argumentation|logos|persuasiveness/i,
    efficiency: /efficiency|succinctness/i
} as const;

function parseGradeContent(content: string) {
    try {
        const grades = {
            adherence: 0,
            clarity: 0,
            tone: 0,
            depth: 0,
            coherence: 0,
            helpfulness: 0,
            credibility: 0,
            empathy: 0,
            creativity: 0,
            safety: 0,
            argumentation: 0,
            efficiency: 0
        };

        // Parse grade format like "ADHERENCE: 8/10" or "ADHERENCE: 8"
        const gradeLines = content.split('\n').filter(line => line.trim());
        
        for (const line of gradeLines) {
            // Use regex patterns to match dimensions
            for (const [propertyKey, pattern] of Object.entries(GRADE_DIMENSION_PATTERNS)) {
                if (pattern.test(line)) {
                    const score = extractScore(line);
                    if (score !== null) {
                        grades[propertyKey as keyof typeof grades] = score;
                        break; // Found a match, no need to check other dimensions
                    }
                }
            }
        }

        return grades;
    } catch (error) {
        console.error('Error parsing grade content:', error);
        return null;
    }
}

function extractScore(line: string): number | null {
    // Match patterns like "8/10", "8", "8.5", etc.
    const match = line.match(/(\d+(?:\.\d+)?)(?:\/10)?/);
    if (match) {
        const score = parseFloat(match[1]);
        // Normalize to 0-10 scale
        return score <= 10 ? score : score / 10;
    }
    return null;
}

describe('Executive Summary Parsing', () => {
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

    test('should handle model names with provider prefixes and clean them up', () => {
        const content = `
        <grade model="openai:gpt-4">
        ADHERENCE: 8/10
        CLARITY: 9/10
        </grade>

        <grade model="anthropic:claude-3">
        ADHERENCE: 7/10
        CLARITY: 8/10
        </grade>
        `;

        const result = parseStructuredSummary(content);
        
        expect(result).not.toBeNull();
        expect(result!.grades).toHaveLength(2);
        
        // Should have cleaned up the model names
        const gradedModels = result!.grades!.map(g => g.modelId);
        expect(gradedModels).toContain('gpt-4');
        expect(gradedModels).toContain('claude-3');
        
        // Should not contain provider prefixes
        expect(gradedModels).not.toContain('openai:gpt-4');
        expect(gradedModels).not.toContain('anthropic:claude-3');
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