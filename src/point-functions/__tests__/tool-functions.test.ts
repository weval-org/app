import { pointFunctions } from '@/point-functions';

const mkContext = (toolCalls: any[]) => ({
  config: {} as any,
  prompt: { __modelResponse: { toolCalls } } as any,
  modelId: 'm'
});

describe('tool-use point functions', () => {
  it('tool_called', () => {
    const ctx = mkContext([{ name: 'calculator', arguments: { expression: '1+1' } }]);
    const fn = pointFunctions.tool_called;
    expect(fn('', 'calculator', ctx)).toBe(true);
    expect(fn('', 'retrieve', ctx)).toBe(false);
  });

  it('tool_args_match with partial object', () => {
    const ctx = mkContext([{ name: 'retrieve', arguments: { docId: '42', meta: { a: 1 } } }]);
    const fn = pointFunctions.tool_args_match;
    expect(fn('', { name: 'retrieve', where: { docId: '42' } }, ctx)).toBe(true);
    expect(fn('', { name: 'retrieve', where: { docId: '43' } }, ctx)).toBe(false);
  });

  it('tool_call_count_between', () => {
    const ctx = mkContext([
      { name: 'a', arguments: {} },
      { name: 'b', arguments: {} },
      { name: 'a', arguments: {} },
    ]);
    const fn = pointFunctions.tool_call_count_between;
    expect(fn('', [2, 3], ctx)).toBe(true);
    expect(fn('', [1, 1, 'a'], ctx)).toBe(false);
    expect(fn('', [2, 2, 'a'], ctx)).toBe(true);
  });

  it('tool_call_order', () => {
    const ctx = mkContext([
      { name: 'search', arguments: {} },
      { name: 'retrieve', arguments: {} },
      { name: 'answer', arguments: {} },
    ]);
    const fn = pointFunctions.tool_call_order;
    expect(fn('', ['search', 'retrieve'], ctx)).toBe(true);
    expect(fn('', ['retrieve', 'search'], ctx)).toBe(false);
  });
});


