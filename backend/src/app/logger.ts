/**
 * Standalone pino logger — replaces @specific-dev/framework's logger.
 *
 * Used during startup before the Fastify instance is created (e.g. by migrations).
 * Once the app is running, prefer app.logger which uses the same Fastify-bound pino instance.
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});
