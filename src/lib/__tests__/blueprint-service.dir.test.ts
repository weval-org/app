import { jest } from '@jest/globals';
import axios from 'axios';
import { fetchBlueprintsInDirectory } from '../blueprint-service';

jest.mock('axios');
const mockedAxios = jest.mocked(axios, { shallow: false });

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('fetchBlueprintsInDirectory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns blueprint contents for files under a directory (yml/yaml/json)', async () => {
    // Mock latest commit
    mockedAxios.get.mockResolvedValueOnce({ data: { sha: 'abc123' } });

    // Mock tree listing
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tree: [
          { type: 'blob', path: 'blueprints/foo/a.yml', url: 'https://blob/a.yml' },
          { type: 'blob', path: 'blueprints/foo/sub/b.yaml', url: 'https://blob/b.yaml' },
          { type: 'blob', path: 'blueprints/foo/ignore.txt', url: 'https://blob/ignore.txt' },
          { type: 'blob', path: 'blueprints/bar/c.yml', url: 'https://blob/c.yml' },
        ],
      },
    });

    // Mock raw blob fetches for two files under foo/**
    mockedAxios.get
      .mockResolvedValueOnce({ status: 200, data: 'file-a-content' })
      .mockResolvedValueOnce({ status: 200, data: 'file-b-content' });

    const results = await fetchBlueprintsInDirectory('foo', undefined, mockLogger);

    expect(results).toHaveLength(2);
    const paths = results.map(r => r.blueprintPath).sort();
    expect(paths).toEqual(['foo/a.yml', 'foo/sub/b.yaml']);
    expect(results[0].commitSha).toBe('abc123');
  });

  it('returns empty array when no files match', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { sha: 'abc123' } });
    mockedAxios.get.mockResolvedValueOnce({ data: { tree: [] } });

    const results = await fetchBlueprintsInDirectory('nonexistent', undefined, mockLogger);
    expect(results).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("No blueprint files found under directory 'nonexistent'"));
  });
});


