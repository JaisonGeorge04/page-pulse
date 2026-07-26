# Page Pulse - Production-Grade URL Audit Service

Page Pulse is a high-performance URL auditing and SEO diagnostic application. It is built to run in production, featuring input validation, SSRF protection, configurable caching, request rate limiting, concurrency queuing, and structured JSON logging.

* **Live Deployment Link**: [page-pulse-1-f32t.onrender.com](https://page-pulse-1-f32t.onrender.com)
* **Built for Digital Heroes Training Task** - [digitalheroesco.com](https://digitalheroesco.com)

---

## Features 

- **Input Validation**: Schema validation using Zod. 
- **SSRF Protection**: Resolves target hostnames and blocks connections pointing to private, loopback, or reserved IP ranges (e.g. `127.0.0.1`, `10.0.0.0/8`, etc.).
- **Response Timeouts**: Restricts slow target fetches to a configurable limit (default: 5 seconds).
- **Concurrency Control**: Limits active outgoing fetches with a queue-backed semaphore.
- **Configurable Caching**: In-memory cache with custom TTLs and detailed cache state headers (`X-Cache: HIT` / `MISS`).
- **Client Rate Limiting**: Limit client request volumes (default: 100 requests per minute).
- **Structured Logging**: JSON logging using Winston, incorporating request contexts (`requestId`) via `AsyncLocalStorage`.
- **Test Suite**: Meaningful unit and integration tests using Jest and Supertest.
- **CI / CD Ready**: Fully configured GitHub Actions workflow that executes tests on every push.

---

## Scale Architecture (Task B)

Detailed design documents for handling 10,000+ daily audits with bursts of 500+ concurrent requests:
1. **[Architecture Document & Diagrams](docs/architecture.md)**
2. **[Technology Decision Record (TDR)](docs/tdr.md)**
3. **[Failure Mode Analysis (FMA)](docs/failure_modes.md)**
4. **[Observability & Rollback Plan](docs/observability_rollback.md)**

---

## API Contract

### 1. Audit URL
Run a diagnostic audit on a target website URL.

* **Endpoint**: `POST /api/audit`
* **Content-Type**: `application/json`
* **Rate Limits**: Configurable (default: 100 requests per minute per IP).

**Request Body**:
```json 
{
  "url": "https://google.com"
}
```

**Response Headers (Relevant)**:
* `X-Cache`: `HIT` or `MISS` (indicates cache status)
* `RateLimit-Limit`: `100`
* `RateLimit-Remaining`: `99`
* `x-request-id`: `f8e3f940-1550-4828-9bf4-1d6e87f8ad88` (unique request ID)

**Response Body (200 OK)**:
```json
{
  "report": {
    "url": "https://google.com/",
    "timestamp": "2026-07-25T11:19:00.000Z",
    "statusCode": 200,
    "statusText": "OK",
    "responseTimeMs": 142,
    "pageSizeBytes": 47212,
    "isHttps": true,
    "contentType": "text/html; charset=UTF-8",
    "seo": {
      "title": {
        "text": "Google",
        "length": 6,
        "status": "WARNING",
        "message": "Title tag is too short (6 chars). Recommend 30-60 characters."
      },
      "description": {
        "text": "",
        "length": 0,
        "status": "ERROR",
        "message": "Missing meta description. Search engines will auto-generate text."
      },
      "h1": {
        "count": 1,
        "items": ["Google"],
        "status": "GOOD",
        "message": "H1 structure is optimal." 
      },
      "images": {
        "total": 1,
        "missingAlt": 0,
        "status": "GOOD",
        "message": "All images have alt tags."
      },
      "links": {
        "total": 18, 
        "internal": 14,
        "external": 4
      }
    }
  },
  "cached": false
} 
```

**Response Body (400 Bad Request / Validation Failure)**:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed for request inputs",
  "requestId": "f8e3f940-1550-4828-9bf4-1d6e87f8ad88",
  "details": [
    {
      "field": "url",
      "message": "URL cannot be empty"
    }
  ]
}
```

**Response Body (400 Bad Request / SSRF Blocked)**:
```json
{
  "error": "SSRF_BLOCKED",
  "message": "Access to hostname localhost is forbidden",
  "requestId": "96e9e494-2d7b-4828-9727-32f9b831d827",
  "details": {
    "reason": "Target URL resolves to a private or restricted IP address."
  }
}
```

**Response Body (429 Too Many Requests / Rate Limit Exceeded)**:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Too many requests.",
  "requestId": "c71b0baf-d494-4b5a-b6ef-e9fe1571a4f0"
}
```

---

### 2. Service Status
Fetch active configuration parameters and queuing loads.

* **Endpoint**: `GET /api/status`
* **Response Body (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-07-25T11:20:00.000Z",
  "config": {
    "port": 3000,
    "nodeEnv": "development",
    "cacheTtlSeconds": 60,
    "concurrencyLimit": 5,
    "rateLimitMax": 100,
    "rateLimitWindowMs": 60000,
    "auditTimeoutMs": 5000
  },
  "concurrency": {
    "activeCount": 0,
    "queueLength": 0,
    "limit": 5
  }
}
```

---

## Local Development Setup

### Prerequisites
- Node.js (version >= 18.0.0)
- npm (version >= 9.0.0)

### 1. Installation
Clone the repository and install all dependencies:
```bash
git clone https://github.com/your-username/page-pulse.git
cd page-pulse
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory (optional, defaults will apply):
```env
PORT=3000
NODE_ENV=development
CACHE_TTL_SECONDS=60
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
CONCURRENCY_LIMIT=5
AUDIT_TIMEOUT_MS=5000
```

### 3. Running the Server
Run in development mode (with hot reloading):
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the frontend.

For production execution:
```bash
npm run build
npm start
```

### 4. Running the Tests
Execute the Jest test suite:
```bash
npm run test
```

---

## AI Tools Usage Declaration
This project utilized **Antigravity** (Google DeepMind's advanced agentic coding assistant) for pair programming support. Antigravity was used to construct the overall system architecture skeleton, implement Zod validation schemas, configure the Winston log structure mapping with `AsyncLocalStorage` for unique Request IDs, write the comprehensive mock integrations in Jest, design the CSS visual styles, and compile the Task B scale architecture documents.
