"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.requestStore = void 0;
const winston_1 = __importDefault(require("winston"));
const async_hooks_1 = require("async_hooks");
// AsyncLocalStorage to hold request context (like requestId)
exports.requestStore = new async_hooks_1.AsyncLocalStorage();
const { combine, timestamp, json, colorize, printf } = winston_1.default.format;
// Formatter for development console logging
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
    const store = exports.requestStore.getStore();
    const requestId = store?.get('requestId') || 'N/A';
    const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
    return `${timestamp} [${requestId}] [${level}]: ${message} ${metaStr}`.trim();
});
// Formatter for production JSON logging
const prodFormat = winston_1.default.format((info) => {
    const store = exports.requestStore.getStore();
    if (store) {
        info.requestId = store.get('requestId');
    }
    return info;
})();
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), process.env.NODE_ENV === 'production'
        ? combine(prodFormat, json())
        : combine(colorize(), devFormat)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
