# Observability and Rollback Plan - Page Pulse

This document outlines the metrics monitoring, alerts thresholds, and deployment/rollback strategies for Page Pulse in production.

---

## 1. Metrics & Observability Strategy

To guarantee the response-time SLA, we collect three categories of telemetry using **OpenTelemetry** and expose them to **Datadog** (or **Prometheus/Grafana**):

### Key Metrics to Track:
1. **API Layer Telemetry (RED Method)**:
   - **Rate**: HTTP request throughput per second (RPS), segmented by endpoint (`POST /api/audit`, `GET /api/status`).
   - **Errors**: 5xx and 4xx error rate percentages. A spike in 400s indicates input issues; a spike in 429s indicates client-rate limits triggering.
   - **Duration**: P50, P90, and P99 API response latencies.
2. **Worker & Queue Metrics (Queue Telemetry)**:
   - **Queue Depth**: Number of pending jobs waiting in BullMQ.
   - **Processing Latency**: Time spent between a worker pulling a job and completing it.
   - **Wait-In-Queue Latency**: Time a job spends waiting in the queue before a worker processes it (Direct indicator of worker capacity depletion).
   - **Failure Rate**: Percentage of scrape jobs landing in the Dead-Letter Queue (DLQ).
3. **Infrastructure Metrics**:
   - **Redis memory footprint**: Active RAM usage (vital for preventing out-of-memory crashes).
   - **CPU / Memory**: Container resource utilization of web servers and audit workers.
   - **Socket States**: Active open socket descriptors (detects socket leaks early).

### Structured Log Archiving:
- Logs are outputted as structured JSON containing `requestId`, `timestamp`, `level`, `method`, `url`, `durationMs`, and `clientIp`.
- Sent to a log aggregator (e.g. **Elasticsearch / Kibana** or **AWS CloudWatch**).
- Incident responders can query `requestId: "uuid-here"` to view the entire request trace—from ingestion to DNS lookup and scraping outcome.

---

## 2. Alerting Protocols

Alerting thresholds are divided into Severity levels and integrated with **PagerDuty** or **Slack**:

| Alert Identifier | Target Telemetry | Trigger Condition | Severity | Notification Channel | Recovery Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **API-5XX-SPIKE** | API 5xx Rate | > 2% of traffic over 3 min | **P1 (Critical)** | PagerDuty + SMS | Auto-restart unhealthy nodes, page engineer |
| **QUEUE-DELAYED** | Wait-In-Queue | > 15 seconds for 5 consecutive mins | **P2 (Major)** | Slack + AutoScale | Scale up worker container replicas by +50% |
| **REDIS-OOM** | Redis Memory | > 85% of maximum RAM | **P1 (Critical)** | PagerDuty | Clear expired audit cache records, trigger DB archival |
| **PROXY-FAIL** | Proxy Error Rate | Scraper proxy failure rate > 5% | **P2 (Major)** | Slack | Rotate IP proxy pool credentials, request gateway update |

---

## 3. Zero-Downtime Deployment & Rollback Playbook

We use a **Canary Deployment** strategy managed by AWS ECS / Kubernetes:

```
[Incoming Traffic] 
       │
       ├──► [Router / ALB]
               │
               ├──► Version v1.0.0 (Stable Node Pool: 90% traffic)
               └──► Version v1.1.0 (Canary Node: 10% traffic)
```

### Deployment Flow:
1. **Canary Spin-up**: Deploy the new version to 10% of our container tasks.
2. **Automated Health Check Period**: The deployment pipeline monitors the Canary task metrics for 5 minutes.
3. **Success Criteria**: If the Canary container maintains:
   - HTTP 5xx error rate < 0.5%
   - Average response latency < 1.5 seconds
   - No crash-loops or resource spikes
   *Action*: Gradually promote the deployment, shifting traffic (25% -> 50% -> 100%) and terminate old containers.

### Automated Rollback Playbook:
* **Rollback Trigger**: During the Canary phase, if the Canary container triggers an alert (e.g., 5xx rate > 1%, or memory leakage), the orchestrator immediately redirects 100% of traffic back to the stable Node pool.
* **Database Compatibility Rule**: Database migrations must always be backward-compatible (e.g., adding columns is allowed, renaming or deleting columns is prohibited in a live migration). This ensures that if the API server rolls back, the old codebase version continues to operate on the updated schema without crashing.
