// Mock next/server for route handler tests so importing it doesn't require Next's runtime
(() => {
  try {
    const g: any = globalThis as any;
    // eslint-disable-next-line no-undef
    jest.mock('next/server', () => {
      class SimpleHeaders {
        private map: Record<string,string>;
        constructor(init: any = {}) {
          this.map = {};
          if (init) {
            for (const [k, v] of Object.entries(init)) {
              this.map[String(k).toLowerCase()] = String(v);
            }
          }
        }
        get(name: string): string | null { return this.map[String(name).toLowerCase()] ?? null; }
      }
      class NextRequest {
        url: string;
        method: string;
        headers: any;
        private _body?: string;
        constructor(url: string, init: any = {}) {
          this.url = url;
          this.method = init.method || 'GET';
          this.headers = new SimpleHeaders(init.headers || {});
          this._body = init.body;
        }
        async text() { return this._body ?? ''; }
        async json() { return JSON.parse(this._body ?? ''); }
      }
      const NextResponse = {
        json(body: any, init?: { status?: number; headers?: any }) {
          const status = init?.status ?? 200;
          const headers = { 'content-type': 'application/json', ...(init?.headers || {}) };
          return { status, headers, async json() { return body; } } as any;
        },
      };
      return { NextRequest, NextResponse };
    });
  } catch {}
})();

// Polyfill URL and URLPattern if needed (Next 15 may require)
if (typeof (globalThis as any).URLPattern === 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { URLPattern } = require('urlpattern-polyfill');
    (globalThis as any).URLPattern = URLPattern;
  } catch {}
}


