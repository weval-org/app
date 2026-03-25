/**
 * Tests that the GitHub OAuth redirect_uri is derived from the incoming
 * request origin rather than from NEXT_PUBLIC_APP_URL, preventing the
 * callback from pointing at localhost in production. (Fixes #4)
 */

// Polyfill Request for jsdom environment (only url is needed by the route)
if (typeof globalThis.Request === 'undefined') {
  (globalThis as any).Request = class Request {
    url: string;
    constructor(url: string) { this.url = url; }
  };
}

// Mock jose to avoid ESM import issues in Jest
jest.mock('jose', () => ({
  EncryptJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    encrypt: jest.fn().mockResolvedValue('mock-encrypted-token'),
  })),
}));

// --- Mocks -----------------------------------------------------------

const mockRedirect = jest.fn((url: string | URL) => ({
  status: 302,
  headers: { location: typeof url === 'string' ? url : url.toString() },
  cookies: { set: jest.fn() },
}));

const mockJson = jest.fn((body: any, init?: { status?: number }) => ({
  status: init?.status ?? 200,
  body,
}));

jest.mock('next/server', () => {
  class NextURL extends URL {
    get origin() { return new URL(this.href).origin; }
  }
  class NextRequest {
    url: string;
    nextUrl: NextURL;
    constructor(url: string) {
      this.url = url;
      this.nextUrl = new NextURL(url);
    }
  }
  return {
    NextRequest,
    NextResponse: {
      redirect: mockRedirect,
      json: mockJson,
    },
  };
});

// --- Tests -----------------------------------------------------------

describe('GitHub OAuth redirect_uri', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockRedirect.mockClear();
    mockJson.mockClear();
    process.env = { ...ORIGINAL_ENV };
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.SESSION_SECRET = 'a]é'.padEnd(32, 'x'); // 32+ chars
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('/api/github/auth/request', () => {
    it('should use the request origin, not NEXT_PUBLIC_APP_URL, for redirect_uri', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:8888';

      const { GET } = await import('../request/route');
      const request = new Request('https://weval.org/api/github/auth/request');
      await GET(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(redirectUrl).toContain('redirect_uri=');
      expect(redirectUrl).toContain(encodeURIComponent('https://weval.org/api/github/auth/callback'));
      expect(redirectUrl).not.toContain('localhost');
    });

    it('should use localhost origin when running locally', async () => {
      const { GET } = await import('../request/route');
      const request = new Request('http://localhost:3000/api/github/auth/request');
      await GET(request);

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(redirectUrl).toContain(encodeURIComponent('http://localhost:3000/api/github/auth/callback'));
    });

    it('should return 500 if GITHUB_CLIENT_ID is missing', async () => {
      delete process.env.GITHUB_CLIENT_ID;

      const { GET } = await import('../request/route');
      const request = new Request('https://weval.org/api/github/auth/request');
      await GET(request);

      expect(mockJson).toHaveBeenCalledTimes(1);
      expect(mockJson.mock.calls[0][1]).toEqual({ status: 500 });
    });
  });

  describe('/api/github/auth/callback', () => {
    it('should use the request origin, not NEXT_PUBLIC_APP_URL, for redirect_uri in token exchange', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:8888';

      const mockTokenResponse = { access_token: 'gho_test_token_123' };
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockTokenResponse),
      });

      const { NextRequest } = await import('next/server');
      const { GET } = await import('../callback/route');
      const req = new NextRequest('https://weval.org/api/github/auth/callback?code=test-code');
      await GET(req as any);

      // Verify the token exchange used the correct origin
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const fetchBody = JSON.parse(fetchCall[1].body);
      expect(fetchBody.redirect_uri).toBe('https://weval.org/api/github/auth/callback');
      expect(fetchBody.redirect_uri).not.toContain('localhost');
    });

    it('should redirect to the request origin after successful login', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:8888';

      const mockTokenResponse = { access_token: 'gho_test_token_123' };
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve(mockTokenResponse),
      });

      const { NextRequest } = await import('next/server');
      const { GET } = await import('../callback/route');
      const req = new NextRequest('https://weval.org/api/github/auth/callback?code=test-code');
      await GET(req as any);

      // The final redirect should go to the request origin, not NEXT_PUBLIC_APP_URL
      const redirectUrl = mockRedirect.mock.calls[0][0];
      const redirectStr = typeof redirectUrl === 'string' ? redirectUrl : redirectUrl.toString();
      expect(redirectStr).toContain('weval.org');
      expect(redirectStr).not.toContain('localhost:8888');
    });
  });
});
