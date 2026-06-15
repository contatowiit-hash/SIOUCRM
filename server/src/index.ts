import 'dotenv/config';
import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`Syntra Food API listening on http://${env.API_HOST}:${env.API_PORT}`);
} catch (error) {
  app.log.error({ err: error }, 'API failed to start');
  process.exit(1);
}
