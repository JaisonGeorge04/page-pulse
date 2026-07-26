# Technology Decision Record (TDR) - Page Pulse

This document outlines the key technology choices for the high-scale Page Pulse audit service, the alternatives rejected, and the trade-off justifications.

---

## 1. Programming Language & Runtime: Node.js / TypeScript
* **Decision**: Node.js v20+ with TypeScript.
* **Alternative Rejected**: Go (Golang).
* **Reasoning**:
  - *Why Node.js/TypeScript*: URL auditing is highly I/O intensive (resolving DNS, fetching pages, parsing HTML text). Node's single-threaded, event-driven async loop excels at multiplexing thousands of simultaneous socket connections without the memory footprint of system threads. Cheerio and other HTML parsers are extremely optimized and battle-tested in the JavaScript ecosystem. TypeScript gives us compilation safety and clean object interfaces.
  - *Why Go was rejected*: While Go offers superior CPU performance and lower memory usage, it lacks the rich, rapid HTML parsing/scrapping packages present in JS. Furthermore, using a unified language (TypeScript) for both our backend API and our frontend utility logic increases development velocity, sharing interfaces, validation schemas (Zod), and type libraries across components.

---

## 2. Job Queue Broker: Redis + BullMQ
* **Decision**: Redis Cluster acting as the storage engine for BullMQ (Node.js queuing framework).
* **Alternative Rejected**: RabbitMQ / Apache Kafka.
* **Reasoning**:
  - *Why Redis/BullMQ*: BullMQ provides features like delayed jobs (caching window expires), parent-child job dependencies (complex page audits with multiple sub-pages), automatic retries with backoff, concurrency limiting, and rate limiting per-domain built-in. Running on Redis gives us sub-millisecond status latency and high throughput (100,000+ operations/sec per node).
  - *Why RabbitMQ / Kafka was rejected*: RabbitMQ is a general-purpose message broker; it does not support delay scheduling out-of-the-box easily without plugins, nor does it maintain an active database-like query index of job states (active, queued, completed) which is required to query the audit history/status from our API endpoints. Kafka is designed for high-volume stream ingestion and log compaction; it is overly complex for job distribution and introduces high operations overhead.

---

## 3. Distributed Cache & Rate Limiter: Redis Cluster
* **Decision**: Redis Cluster (In-Memory Key-Value store).
* **Alternative Rejected**: Memcached.
* **Reasoning**:
  - *Why Redis*: Redis supports advanced data structures. We use **Redis Hashes** to store audit report structures, **Sorted Sets (ZSET)** to implement sliding-window rate limiters per IP client, and **Pub/Sub** channels to instantly stream completed audit statuses to API servers via WebSockets.
  - *Why Memcached was rejected*: Memcached only supports simple string key-values. It lacks the advanced data structures required to build sliding-window rate limiting algorithms and does not provide native pub/sub capabilities to support real-time WebSocket messaging.

---

## 4. Main Database: PostgreSQL
* **Decision**: PostgreSQL (Relational Database) with Read Replicas.
* **Alternative Rejected**: MongoDB (NoSQL Document Store).
* **Reasoning**:
  - *Why PostgreSQL*: Audits contain structured, highly consistent records (status codes, metadata sizes, link lists) which require strict data types. Postgres provides rich JSONB support, letting us store arbitrary parsed SEO page elements alongside standard relational tables (user credentials, subscription tiers, audit histories). It supports ACID transactions and complex indexing on fields like parsed domains or client account IDs.
  - *Why MongoDB was rejected*: MongoDB's schema-less nature can lead to data integrity drift over time. It has higher memory consumption overhead compared to Postgres and lacks the robust relational query joins needed to generate complex, structured analytical billing or usage reports for client accounts.
