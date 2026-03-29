import { createApp } from './app';
import config from './config';
import logger from './utils/logger';
import prisma from './config/prisma';
import { getRedis } from './config/redis';

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (err) {
    logger.error('Failed to connect to database', {
      error: (err as Error).message,
    });
    process.exit(1);
  }

  getRedis();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.env}]`);
    logger.info(`API Docs: http://localhost:${config.port}/docs`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received - shutting down gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
}

start();
