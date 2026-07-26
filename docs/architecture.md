# Scale Architecture Design - Page Pulse

This document outlines the system architecture designed to scale Page Pulse to handle **10,000+ audits per day**, with **bursts of 500 concurrent requests**, while maintaining a strict customer-facing SLA on response times.

---

## 1. System Components

The architecture consists of decoupled, horizontally scalable services, structured as follows:

```mermaid
graph TD
    Client[Client Browser] -->|HTTPS| LB[API Gateway / Load Balancer]
    
    subgraph Web Layer (Stateless Web Nodes)
        LB --> API1[API Instance 1]
        LB --> API2[API Instance N]
    end

    subgraph Caching & Broker Layer
        API1 -->|Rate Limit / Cache Check| RedisCluster[(Redis Cluster: Cache + Limiter)]
        API2 -->|Rate Limit / Cache Check| RedisCluster
        API1 -->|Enqueue Job| BullMQ[Redis BullMQ Job Broker]
        API2 -->|Enqueue Job| BullMQ
    end

    subgraph Async Processing Worker Layer
        BullMQ --> Worker1[Audit Worker 1]
        BullMQ --> Worker2[Audit Worker N]
    end

    subgraph Data & Storage Layer
        Worker1 -->|Write Report| DB[(PostgreSQL Database)]
        Worker2 -->|Write Report| DB
        Worker1 -->|Publish Result / Cache Set| RedisCluster
        Worker2 -->|Publish Result / Cache Set| RedisCluster
    end
```

### Detailed Component Roles:
1. **API Gateway / Load Balancer (NGINX / AWS ALB)**:
   - Terminates TLS/SSL connections.
   - Distributes incoming request traffic evenly across stateless web/API application nodes.
   - Performs basic IP-based rate limiting at the network boundary.
2. **Stateless Web/API Server Instances (Node.js/Express)**:
   - Receives HTTP audit requests.
   - Handles client authentication, request metadata parsing, and input schema validation.
   - Query cache directly from Redis to serve repeat requests immediately (< 5ms response time).
   - Coordinates fast-path execution (sync fetch) vs. background-path queueing based on system load.
3. **Distributed Job Broker & Cache (Redis Cluster)**:
   - **Cache**: Houses audit reports with configurable TTL to avoid redundant third-party network fetches.
   - **Rate Limiter**: Manages sliding-window counters per client IP globally across all API nodes.
   - **Job Broker (BullMQ)**: Implements reliable message queueing. Distributes auditing workloads safely across worker nodes.
4. **Asynchronous Audit Workers (Node.js / Puppeteer-Scraper Pool)**:
   - Pull jobs from the queue.
   - Perform heavy I/O operations (resolving DNS, fetching pages, parsing HTML structures).
   - Write completed reports to the Postgres database and cache results to Redis.
5. **Persistent Storage (PostgreSQL)**:
   - Houses persistent user data, auditing histories, and metrics analytics.
   - Configured with read replicas to handle analytics dashboard workloads without impacting write transactions.

---

## 2. In-Depth Data Flow & SLA Strategy

To enforce the customer-facing SLA (e.g., return results in < 2 seconds) during bursts of 500 concurrent requests, the system implements a **Dual-Mode Request Lifecycle**:

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant LB as Load Balancer
    participant API as API Server
    participant Redis as Redis Cache
    participant Queue as BullMQ Broker
    participant Worker as Audit Worker
    participant DB as Postgres DB

    Client->>LB: POST /api/audit { url }
    LB->>API: Route Request
    API->>Redis: Check Cache (URL key)
    
    alt Cache HIT (SLA < 10ms)
        Redis-->>API: Return Cached Audit Report
        API-->>Client: 200 OK (X-Cache: HIT)
    else Cache MISS
        API->>Redis: Check Worker Concurrency Load
        
        alt Load is LOW (SLA < 1.5s)
            API->>Worker: Run Sync Audit (Direct Fetch)
            Worker-->>API: Return Report
            API->>Redis: Write Cache
            API->>DB: Save Audit History
            API-->>Client: 200 OK (X-Cache: MISS)
        
        else Load is HIGH (Burst of 500 concurrents) (SLA < 100ms Ingestion)
            API->>Queue: Push Audit Job (BullMQ)
            Queue-->>API: Job Enqueued (jobId)
            API-->>Client: 202 Accepted { jobId, status: "queued" }
            
            Note to Client, Worker: Client begins polling GET /api/audit/status/:jobId or listens on WebSocket
            
            Queue->>Worker: Pull Job
            Worker->>Worker: Execute Audit (DNS lookup, HTML scraping)
            Worker->>DB: Save Report
            Worker->>Redis: Write Cache & Publish Event
            
            Client->>API: Poll Status / WebSocket Message
            API->>Redis: Check Job State
            Redis-->>Client: 200 OK { status: "completed", report }
        end
    end
```

---

## 3. Queueing & Backpressure Strategy

At a scale of 500 concurrent requests, executing outbound audits synchronously will lead to **worker starvation, socket leaks, and DNS timeout cascades**. 

### Queuing Implementation (BullMQ):
- **Concurrency Rate Limiting**: The workers use a concurrency token system (e.g., maximum 50 concurrent outgoing page fetches globally across the worker cluster) to prevent getting flagged as a DDoS attacker by target websites.
- **Job Retention**: Failed audit jobs are retried up to 3 times with exponential backoff (`delay = min(10s * 2^attempt, 2m)`).
- **Dead-Letter Queue (DLQ)**: If a job fails after 3 retries (due to persistent DNS failures or blocked hostnames), it is moved to a DLQ for operational review and marked as "FAILED" in the user status check.
- **Worker Backpressure**: If the BullMQ queue size exceeds a safety threshold (e.g., 2,000 pending audits), the API layer automatically sheds load, immediately returning a `429 Too Many Requests / Busy` response to the client. This protects queue memory from growing indefinitely.
