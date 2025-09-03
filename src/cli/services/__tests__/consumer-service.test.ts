import { collectConsumerSlices } from '../consumer-service';

jest.mock('../consumer-ui-server', () => ({
  startConsumerUIServer: jest.fn(async ({ onSubmit }: any) => {
    // Immediately simulate submit with two responses
    const xml = `<responses>\n  <response id="p1">A</response>\n  <response id="p2">B</response>\n</responses>`;
    await onSubmit(xml);
    return {
      url: 'http://127.0.0.1:0/',
      close: async () => {}
    };
  })
}));

jest.mock('@/lib/cache-service', () => ({
  getCache: () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) }),
  generateCacheKey: (o: any) => JSON.stringify(o)
}));

describe('consumer-service collectConsumerSlices', () => {
  const logger: any = { info: jest.fn() };
  const config: any = {
    id: 'cfg',
    systems: [null, 'bold'],
    prompts: [
      { id: 'p1', messages: [{ role: 'user', content: 'Hi' }] },
      { id: 'p2', messages: [{ role: 'user', content: 'Bye' }] },
    ],
  };

  it('collects slices per system variant and per consumer', async () => {
    const { slicesByConsumer } = await collectConsumerSlices(config, logger, ['consumer:foo']);
    const perSys = slicesByConsumer.get('consumer:foo');
    expect(perSys?.get(0)?.get('p1')).toBe('A');
    expect(perSys?.get(0)?.get('p2')).toBe('B');
    expect(perSys?.get(1)?.get('p1')).toBe('A');
  });
});


