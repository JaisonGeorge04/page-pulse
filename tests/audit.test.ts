import request from 'supertest';
import axios from 'axios';
import dns from 'dns';
import app, { cacheService, concurrencyController } from '../src/app';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock dns.lookup
jest.mock('dns', () => {
  const original = jest.requireActual('dns');
  return {
    ...original,
    lookup: jest.fn(),
  };
});
const mockedDnsLookup = dns.lookup as unknown as jest.Mock;

describe('Page Pulse API & Services Audit Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
  });

  describe('POST /api/audit - Input Validation & SSRF Blocker', () => {
    it('should reject requests with missing or empty URL', async () => {
      const res = await request(app)
        .post('/api/audit')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(res.body).toHaveProperty('requestId');
      expect(res.body.details[0].message).toContain('URL is required');
    });

    it('should reject requests with invalid protocols (e.g. ftp://)', async () => {
      const res = await request(app)
        .post('/api/audit')
        .send({ url: 'ftp://example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(res.body.message).toContain('Only HTTP and HTTPS protocols are supported');
    });

    it('should reject target hostname resolving to private IP (SSRF Blocker)', async () => {
      // Mock DNS lookup to return a private IP
      mockedDnsLookup.mockImplementation((hostname, options, callback) => {
        callback(null, [{ address: '127.0.0.1', family: 4 }]);
      });

      const res = await request(app)
        .post('/api/audit')
        .send({ url: 'http://localhost' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'SSRF_BLOCKED');
      expect(res.body.message).toContain('Access to hostname localhost is forbidden');
    });

    it('should reject direct private IP requests (SSRF Blocker)', async () => {
      const res = await request(app)
        .post('/api/audit')
        .send({ url: 'http://192.168.1.1' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'SSRF_BLOCKED');
      expect(res.body.message).toContain('Access to IP address 192.168.1.1 is forbidden');
    });
  });

  describe('POST /api/audit - Auditing Performance & SEO Parsing', () => {
    it('should execute audit and return detailed report on valid inputs', async () => {
      // Mock DNS to resolve to a public IP
      mockedDnsLookup.mockImplementation((hostname, options, callback) => {
        callback(null, [{ address: '8.8.8.8', family: 4 }]);
      });

      // Mock Axios response
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>My Super Title Tag That Is Long Enough</title>
            <meta name="description" content="This is an awesome and fully optimized meta description tag that is designed to be of high quality and fits between 120 and 160 chars.">
          </head>
          <body>
            <h1>Main Title</h1>
            <h2>Sub Title</h2>
            <img src="pic.jpg" alt="A nice picture">
            <img src="pic2.jpg"> <!-- missing alt -->
            <a href="/about">About Us</a>
            <a href="https://google.com">Google</a>
          </body>
        </html>
      `;

      mockedAxios.get.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html; charset=utf-8' },
        data: mockHtml,
      });

      const res = await request(app)
        .post('/api/audit')
        .send({ url: 'https://testsite.com' });

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(res.body).toHaveProperty('cached', false);
      expect(res.body.report).toBeDefined();

      const { report } = res.body;
      expect(report.statusCode).toBe(200);
      expect(report.isHttps).toBe(true);
      expect(report.seo.title.text).toBe('My Super Title Tag That Is Long Enough');
      expect(report.seo.title.status).toBe('GOOD');
      expect(report.seo.description.status).toBe('GOOD');
      expect(report.seo.h1.count).toBe(1);
      expect(report.seo.images.total).toBe(2);
      expect(report.seo.images.missingAlt).toBe(1);
      expect(report.seo.links.total).toBe(2);
      expect(report.seo.links.internal).toBe(1);
      expect(report.seo.links.external).toBe(1);
    });

    it('should report warnings for suboptimal titles and missing headers', async () => {
      mockedDnsLookup.mockImplementation((hostname, options, callback) => {
        callback(null, [{ address: '8.8.8.8', family: 4 }]);
      });

      // Short title, missing description, missing h1, missing image alts
      const mockHtml = `
        <html>
          <head>
            <title>Short</title>
          </head>
          <body>
            <img src="pic.jpg">
          </body>
        </html>
      `;

      mockedAxios.get.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        data: mockHtml,
      });

      const res = await request(app)
        .post('/api/audit')
        .send({ url: 'https://warnsite.com' });

      expect(res.status).toBe(200);
      const { report } = res.body;
      expect(report.seo.title.status).toBe('WARNING');
      expect(report.seo.description.status).toBe('ERROR');
      expect(report.seo.h1.status).toBe('ERROR');
      expect(report.seo.images.missingAlt).toBe(1);
    });
  });

  describe('Caching Mechanics', () => {
    it('should serve repeat request from cache', async () => {
      mockedDnsLookup.mockImplementation((hostname, options, callback) => {
        callback(null, [{ address: '8.8.8.8', family: 4 }]);
      });

      mockedAxios.get.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: '<html><title>Cache Test</title></html>',
      });

      // First Request - Cache MISS
      const res1 = await request(app)
        .post('/api/audit')
        .send({ url: 'https://cacheme.com' });

      expect(res1.status).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');
      expect(res1.body.cached).toBe(false);

      // Second Request - Cache HIT
      const res2 = await request(app)
        .post('/api/audit')
        .send({ url: 'https://cacheme.com' });

      expect(res2.status).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
      expect(res2.body.cached).toBe(true);
      expect(res2.body.remainingTtlSeconds).toBeGreaterThan(0);
      
      // Ensure axios was only called once
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('Concurrency Queuing', () => {
    it('should serialise / limit parallel audits using queue logic', async () => {
      mockedDnsLookup.mockImplementation((hostname, options, callback) => {
        callback(null, [{ address: '8.8.8.8', family: 4 }]);
      });

      // Delay response to simulate long running page load
      mockedAxios.get.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              status: 200,
              headers: {},
              data: '<html></html>',
            });
          }, 100);
        });
      });

      // Launch multiple requests simultaneously
      const reqs = [
        request(app).post('/api/audit').send({ url: 'https://site1.com' }),
        request(app).post('/api/audit').send({ url: 'https://site2.com' }),
        request(app).post('/api/audit').send({ url: 'https://site3.com' }),
      ];

      const results = await Promise.all(reqs);
      
      results.forEach(res => {
        expect(res.status).toBe(200);
      });
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });
  });
});
