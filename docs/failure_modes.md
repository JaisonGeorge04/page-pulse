# Failure Mode Analysis (FMA) - Page Pulse

This document outlines the three most likely failure modes at a scale of 10,000+ daily audits (with 500 concurrent request bursts) and the mitigation strategies for each.

---

## Failure Mode 1: Scraper IP Blocks & Target Rate-Limiting
* **Symptom**: Audits return `403 Forbidden` or `429 Too Many Requests` status codes, or hit Cloudflare challenge walls because target hostnames block our auditing server IPs.
* **Risk Level**: High
* **Mitigation Strategy**:
  1. **Proxy Rotation Pools**: Routes all scraper fetches through a proxy rotator (e.g., Luminati/Bright Data, Webshare) featuring residential IP rotation on every request.
  2. **Domain-Specific Throttle Rates**: Implements a Redis lock per target hostname (e.g., `audit:domain-limit:example.com`). If a request for the same domain is received within a 3-second window, it is delayed or enqueued with a dependency deferral.
  3. **Scraper Evasion Signatures**:
     - Automatically alternate request headers (`User-Agent`, `Accept-Language`, `Referer`, `Sec-Ch-Ua`).
     - Honoring HTTP response headers such as `Retry-After`.
     - Read and respect `robots.txt` crawl delay parameters before fetching.

---

## Failure Mode 2: Resource Starvation by Hanging Connections
* **Symptom**: Target sites accept socket connections but stream response bytes extremely slowly, or stream an infinite loop of data (a "decompression bomb" or "infinite body"). This hangs worker threads, fills the thread pool, leaks memory, and halts the queue.
* **Risk Level**: High
* **Mitigation Strategy**:
  1. **Strict Active Timeouts**:
     - Connect Timeout: Limit TCP handshake to 3 seconds.
     - Read Timeout: Abort the stream if no data is received within 3 seconds.
     - Total Fetch Timeout: Force-kill request at 8 seconds.
  2. **Stream Limit Boundaries**: Read incoming response data as a stream. Track the total byte length read. If the body content exceeds 5MB (excessive for basic metadata SEO auditing), destroy the socket connection immediately.
  3. **Queue Isolation**: Maintain two queues: a `fast-queue` (for domains with a history of <1s response time) and a `slow-queue` (for heavy or historically slow domains). Workers are dedicated in a 4:1 ratio to ensure slow domains never starve healthy sites.

---

## Failure Mode 3: Job Broker memory overflow under Bursts
* **Symptom**: A sudden burst of 500 concurrent requests overloads the Redis instances. Memory usage spikes to maximum limits, causing Redis to crash, database connection pool exhaustion, or triggering eviction policies that drop pending jobs.
* **Risk Level**: Medium
* **Mitigation Strategy**:
  1. **Separate Redis Instances**: Isolate the caching layer from the queuing layer. Use a separate Redis instance for BullMQ. For the Cache instance, set `maxmemory-policy allkeys-lru`. For the Queue instance, set `maxmemory-policy noeviction` so pending job entries are never deleted.
  2. **Backpressure (Load Shedding)**: Before placing a job, check the size of the queue. If `waitingCount > 2000`, the API server must immediately skip queue ingestion and return `503 Service Unavailable (Server Busy)` with a `Retry-After` header.
  3. **Auto-Cleanup Rules**: Configure BullMQ to automatically clean up metadata for completed and failed jobs (e.g., `removeOnComplete: 100`, `removeOnFail: 500`) to prevent Redis memory footprint growth.
