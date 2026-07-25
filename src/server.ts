import app from './app';
import { config } from './config/config';
import { logger } from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`===================================================`);
  logger.info(`  Page Pulse Audit Server starting up...`);
  logger.info(`  Environment : ${config.nodeEnv}`);
  logger.info(`  Listening   : http://localhost:${config.port}`);
  logger.info(`===================================================`);
});

// Graceful shutdown handling
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('Closed out remaining connections.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
