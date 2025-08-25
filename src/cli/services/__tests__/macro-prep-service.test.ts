import { computeScoreByte } from '@/cli/services/macro-prep-service';

describe('computeScoreByte', () => {
    it('maps coverageExtent to byte correctly (non-inverted)', () => {
        expect(computeScoreByte(0, false)).toBe(0);
        expect(computeScoreByte(0.5, false)).toBe(128);
        expect(computeScoreByte(1, false)).toBe(255);
    });
    it('maps coverageExtent to byte correctly (inverted)', () => {
        expect(computeScoreByte(0, true)).toBe(255);
        expect(computeScoreByte(1, true)).toBe(0);
    });
    it('handles undefined or NaN', () => {
        expect(computeScoreByte(undefined as unknown as number, false)).toBe(0);
        expect(computeScoreByte(Number.NaN as unknown as number, false)).toBe(0);
    });
});


