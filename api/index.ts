import type { VercelRequest, VercelResponse } from '@vercel/node';
import app, { initServerPromise } from '../server.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (initServerPromise) {
      await initServerPromise;
    }
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler] Fatal serverless execution error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Vercel serverless error: ' + (err?.message || String(err)),
      });
    }
  }
}

