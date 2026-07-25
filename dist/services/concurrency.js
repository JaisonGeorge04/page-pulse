"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConcurrencyController = void 0;
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
class ConcurrencyController {
    limit;
    queueTimeoutMs;
    activeCount = 0;
    queue = [];
    constructor(limit, queueTimeoutMs = 10000) {
        this.limit = limit;
        this.queueTimeoutMs = queueTimeoutMs;
        logger_1.logger.info(`Concurrency controller initialized with limit: ${limit}, queue timeout: ${queueTimeoutMs}ms`);
    }
    /**
     * Run a task (async function returning a promise) within the concurrency limits.
     * If the limit is reached, the task is queued.
     * If the task waits in the queue too long, it is rejected with a ConcurrencyLimitError.
     */
    async runWithLimit(task) {
        if (this.activeCount < this.limit) {
            return this.executeTask(task);
        }
        logger_1.logger.warn(`Max concurrency limit (${this.limit}) reached. Enqueuing task. Queue size: ${this.queue.length + 1}`);
        // Wait in queue
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                // Remove from queue
                this.queue = this.queue.filter(q => q.resolve !== resolve);
                logger_1.logger.error(`Queue timeout: Task timed out waiting for concurrency slot.`);
                reject(new errors_1.ConcurrencyLimitError('Server is busy processing other audit requests.'));
            }, this.queueTimeoutMs);
            this.queue.push({ resolve, reject, timer });
        });
        return this.executeTask(task);
    }
    async executeTask(task) {
        this.activeCount++;
        logger_1.logger.debug(`Executing task. Active slots: ${this.activeCount}/${this.limit}`);
        try {
            return await task();
        }
        finally {
            this.activeCount--;
            logger_1.logger.debug(`Task finished. Active slots: ${this.activeCount}/${this.limit}`);
            this.dispatchNext();
        }
    }
    dispatchNext() {
        if (this.queue.length > 0 && this.activeCount < this.limit) {
            const nextTask = this.queue.shift();
            if (nextTask) {
                clearTimeout(nextTask.timer);
                logger_1.logger.debug(`Dispatching next task from queue. Remaining in queue: ${this.queue.length}`);
                nextTask.resolve();
            }
        }
    }
    /**
     * Returns current concurrency metrics
     */
    getMetrics() {
        return {
            activeCount: this.activeCount,
            queueLength: this.queue.length,
            limit: this.limit
        };
    }
}
exports.ConcurrencyController = ConcurrencyController;
