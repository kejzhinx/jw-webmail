import serverless from 'serverless-http';
import app, { initServerPromise } from '../../server.js';

let serverlessHandler: any;

export const handler = async (event: any, context: any) => {
  if (initServerPromise) {
    try {
      await initServerPromise;
    } catch (e) {
      console.error('[Netlify Function] Server init error:', e);
    }
  }

  // Ensure path is normalized to /api/* for Express router
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '/api') || '/api';
  }

  if (!serverlessHandler) {
    serverlessHandler = serverless(app);
  }
  return serverlessHandler(event, context);
};
