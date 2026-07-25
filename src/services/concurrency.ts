import { ConcurrencyLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

interface QueuedTask {
  resolve: () => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export class ConcurrencyController {
  private limit: number;
  private queueTimeoutMs: number;
  private activeCount = 0;
  private queue: QueuedTask[] = [];

  constructor(limit: number, queueTimeoutMs = 10000) {
    this.limit = limit;
    this.queueTimeoutMs = queueTimeoutMs;
    logger.info(`Concurrency controller initialized with limit: ${limit}, queue timeout: ${queueTimeoutMs}ms`);
  }

  /**
   * Run a task (async function returning a promise) within the concurrency limits.
   * If the limit is reached, the task is queued.
   * If the task waits in the queue too long, it is rejected with a ConcurrencyLimitError.
   */
  public async runWithLimit<R>(task: () => Promise<R>): Promise<R> {
    if (this.activeCount < this.limit) {
      return this.executeTask(task);
    }

    logger.warn(`Max concurrency limit (${this.limit}) reached. Enqueuing task. Queue size: ${this.queue.length + 1}`);

    // Wait in queue
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue
        this.queue = this.queue.filter(q => q.resolve !== resolve);
        logger.error(`Queue timeout: Task timed out waiting for concurrency slot.`);
        reject(new ConcurrencyLimitError('Server is busy processing other audit requests.'));
      }, this.queueTimeoutMs);

      this.queue.push({ resolve, reject, timer });
    });

    return this.executeTask(task);
  }

  private async executeTask<R>(task: () => Promise<R>): Promise<R> {
    this.activeCount++;
    logger.debug(`Executing task. Active slots: ${this.activeCount}/${this.limit}`);

    try {
      return await task();
    } finally {
      this.activeCount--;
      logger.debug(`Task finished. Active slots: ${this.activeCount}/${this.limit}`);
      this.dispatchNext();
    }
  }

  private dispatchNext(): void {
    if (this.queue.length > 0 && this.activeCount < this.limit) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        clearTimeout(nextTask.timer);
        logger.debug(`Dispatching next task from queue. Remaining in queue: ${this.queue.length}`);
        nextTask.resolve();
      }
    }
  }

  /**
   * Returns current concurrency metrics
   */
  public getMetrics() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      limit: this.limit
    };
  }
}
