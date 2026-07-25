"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config/config");
const logger_1 = require("./utils/logger");
const server = app_1.default.listen(config_1.config.port, () => {
    logger_1.logger.info(`===================================================`);
    logger_1.logger.info(`  Page Pulse Audit Server starting up...`);
    logger_1.logger.info(`  Environment : ${config_1.config.nodeEnv}`);
    logger_1.logger.info(`  Listening   : http://localhost:${config_1.config.port}`);
    logger_1.logger.info(`===================================================`);
});
// Graceful shutdown handling
const shutdown = () => {
    logger_1.logger.info('Shutting down gracefully...');
    server.close(() => {
        logger_1.logger.info('Closed out remaining connections.');
        process.exit(0);
    });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
