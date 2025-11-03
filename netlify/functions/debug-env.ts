import { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';

/**
 * Debug endpoint to check environment variables available to Netlify functions
 */
export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const hasToken = !!process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;
  const tokenLength = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN?.length || 0;
  const tokenPrefix = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN?.substring(0, 10) || 'N/A';

  return {
    statusCode: 200,
    body: JSON.stringify({
      hasToken,
      tokenLength,
      tokenPrefix: hasToken ? tokenPrefix + '...' : 'N/A',
      allEnvVars: Object.keys(process.env).filter(k =>
        k.includes('BACKGROUND') ||
        k.includes('TOKEN') ||
        k.includes('NEXT_PUBLIC') ||
        k.includes('URL')
      ).sort()
    }, null, 2),
    headers: { 'Content-Type': 'application/json' }
  };
};
