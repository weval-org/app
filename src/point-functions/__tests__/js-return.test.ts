import { js } from '../js';
import { PointFunctionContext } from '../types';

describe('js point-function extended return', () => {
  const ctx = {} as PointFunctionContext;

  it('accepts object with score and explain', () => {
    const result = js('dummy', "return { score: 0.75, explain: 'custom reflection' };", ctx);
    expect(typeof result).toBe('object');
    const obj = result as any;
    expect(obj.score).toBeCloseTo(0.75);
    expect(obj.explain).toBe('custom reflection');
  });

  it('coerces boolean score', () => {
    const result = js('dummy', "return { score: false };", ctx);
    const obj = result as any;
    expect(obj.score).toBe(0);
  });
});