import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { ComparisonConfig } from '@/cli/types/comparison_v2';
import { resolveModelsInConfig, SimpleLogger } from '@/lib/config-utils';

// Simple logger for this API route
const logger: SimpleLogger = {
  info: (message: string, ...args: any[]) => console.log('[Admin API - trigger-eval]', message, ...args),
  error: (message: string, ...args: any[]) => console.error('[Admin API - trigger-eval ERROR]', message, ...args),
  warn: (message: string, ...args: any[]) => console.warn('[Admin API - trigger-eval WARN]', message, ...args),
};

export async function POST(request: NextRequest) {
  logger.info('Received trigger request.');
  try {
    const body = await request.json();
    let config = body.config as ComparisonConfig; // Changed to let

    if (!config || typeof config !== 'object' || !config.id) {
      logger.error('Invalid or incomplete configuration data.', body);
      return NextResponse.json({ message: 'Invalid or incomplete configuration data received.' }, { status: 400 });
    }

    logger.info(`Initial config received for id: ${config.id}. Models: [${config.models?.join(', ')}]`);

    if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
      logger.info(`[Admin API - trigger-eval] Models field for ${config.id} is missing, not an array, or empty. Defaulting to ["CORE"].`);
      config.models = ["CORE"];
    }

    const githubToken = process.env.GITHUB_TOKEN; // Use the same GITHUB_TOKEN if available/needed for private model collections
    if (!githubToken) {
        logger.warn('GITHUB_TOKEN not found in environment. Model collection resolution might fail for private repos.');
    }
    
    logger.info(`Attempting to resolve model collections for ${config.id}`);
    config = await resolveModelsInConfig(config, githubToken, logger);
    logger.info(`Config for ${config.id} after model resolution: Models: [${config.models?.join(', ')}] (Count: ${config.models?.length})`);

    // Check if models array is empty after resolution
    if (!config.models || config.models.length === 0) {
      logger.error(`No models found for id: ${config.id} after attempting to resolve collections. Halting trigger.`);
      return NextResponse.json({ message: `No models found for id: ${config.id} after resolving collections. Evaluation cannot proceed.` }, { status: 400 });
    }

    const netlifyFunctionUrl = `${process.env.URL}/.netlify/functions/execute-evaluation-background`;
    logger.info(`Target background function URL: ${netlifyFunctionUrl}`);

    if (!process.env.URL) {
      logger.error('CRITICAL: process.env.URL is not set.');
      return NextResponse.json({ message: 'Server configuration error: URL for Netlify functions not set.' }, { status: 500 });
    }
    
    logger.info(`Attempting to POST to Netlify background function for id: ${config.id}`);

    try {
      const response = await axios.post(netlifyFunctionUrl, { config: config }, { // Pass the MODIFIED config
        timeout: 10000 
      });
      logger.info(`Successfully POSTed to background function. Response status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
    } catch (error: any) {
      logger.error(`CRITICAL ERROR during axios.post to ${netlifyFunctionUrl} for ${config.id}:`);
      if (error.response) {
        logger.error(`Error Response Status: ${error.response.status}`);
        logger.error(`Error Response Data: ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error(`Error Message: ${error.message}`);
      }
      // Optionally, return a 500 error to the client if this critical step fails
      // return NextResponse.json({ message: 'Failed to invoke background evaluation function.', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Evaluation trigger request accepted for background processing.' }, { status: 202 });

  } catch (error: any) {
    logger.error('Outer error in trigger-eval POST handler:', error);
    let errorMessage = 'Internal server error.';
    if (error instanceof SyntaxError) { 
        errorMessage = 'Invalid request body: Could not parse JSON.';
        return NextResponse.json({ message: errorMessage }, { status: 400 });
    }
    return NextResponse.json({ message: errorMessage, details: error.message }, { status: 500 });
  }
} 