import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../server/src/app.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

let appPromise: ReturnType<typeof buildApp> | null = null;

export const normalizeVercelApiUrl = (url?: string) => {
  const parsed = new URL(url ?? '/', 'http://vercel.local');
  const rewrittenPath = parsed.searchParams.get('__path');
  if (!rewrittenPath) return `${parsed.pathname}${parsed.search}`;

  parsed.searchParams.delete('__path');
  const query = parsed.searchParams.toString();
  return `${rewrittenPath}${query ? `?${query}` : ''}`;
};

const getApp = async () => {
  appPromise ??= buildApp();
  const app = await appPromise;
  await app.ready();
  return app;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = normalizeVercelApiUrl(req.url);
  const app = await getApp();
  app.server.emit('request', req, res);
}
