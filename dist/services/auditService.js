"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const ssrf_1 = require("../utils/ssrf");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const config_1 = require("../config/config");
class AuditService {
    /**
     * Performs an audit on the given URL.
     */
    async audit(urlStr) {
        // 1. URL parsing & input validation
        let parsedUrl;
        try {
            // Normalize URL (e.g. add protocol if missing, default to https)
            let normalizedUrlStr = urlStr.trim();
            if (!/^https?:\/\//i.test(normalizedUrlStr)) {
                normalizedUrlStr = 'https://' + normalizedUrlStr;
            }
            parsedUrl = new URL(normalizedUrlStr);
        }
        catch (error) {
            throw new errors_1.ValidationError('Invalid URL format');
        }
        const targetUrl = parsedUrl.toString();
        // 2. SSRF Check
        await (0, ssrf_1.validateUrlForSsrf)(targetUrl);
        // 3. Fetch URL content with timeout
        logger_1.logger.info(`Fetching URL for audit: ${targetUrl}`);
        const startTime = process.hrtime();
        try {
            const response = await axios_1.default.get(targetUrl, {
                timeout: config_1.config.auditTimeoutMs,
                headers: {
                    'User-Agent': 'PagePulse/1.0.0 (Production URL Auditer; digitalheroesco.com)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                maxRedirects: 5,
                responseType: 'text',
                // Don't reject for non-2xx status codes; we want to audit bad pages too
                validateStatus: () => true,
            });
            const diff = process.hrtime(startTime);
            const responseTimeMs = Math.round(diff[0] * 1e3 + diff[1] * 1e-6);
            const htmlContent = typeof response.data === 'string' ? response.data : '';
            const pageSizeBytes = Buffer.byteLength(htmlContent, 'utf8');
            const isHttps = parsedUrl.protocol === 'https:';
            const rawContentType = response.headers['content-type'];
            const contentType = typeof rawContentType === 'string' ? rawContentType : String(rawContentType || 'text/html');
            // 4. Parse content using Cheerio
            const $ = cheerio.load(htmlContent);
            // --- Title Audit ---
            const titleText = $('title').first().text().trim() || '';
            const titleLength = titleText.length;
            let titleStatus = 'GOOD';
            let titleMessage = 'Title tag is well optimized.';
            if (titleLength === 0) {
                titleStatus = 'ERROR';
                titleMessage = 'Missing title tag. This is critical for SEO.';
            }
            else if (titleLength < 30) {
                titleStatus = 'WARNING';
                titleMessage = `Title tag is too short (${titleLength} chars). Recommend 30-60 characters.`;
            }
            else if (titleLength > 60) {
                titleStatus = 'WARNING';
                titleMessage = `Title tag is too long (${titleLength} chars). Recommend 30-60 characters to avoid truncation.`;
            }
            // --- Description Audit ---
            const descText = $('meta[name="description"]').first().attr('content')?.trim() || '';
            const descLength = descText.length;
            let descStatus = 'GOOD';
            let descMessage = 'Meta description is well optimized.';
            if (descLength === 0) {
                descStatus = 'ERROR';
                descMessage = 'Missing meta description. Search engines will auto-generate text.';
            }
            else if (descLength < 120) {
                descStatus = 'WARNING';
                descMessage = `Meta description is too short (${descLength} chars). Recommend 120-160 characters.`;
            }
            else if (descLength > 160) {
                descStatus = 'WARNING';
                descMessage = `Meta description is too long (${descLength} chars). Recommend 120-160 characters to avoid truncation.`;
            }
            // --- H1 Audit ---
            const h1s = [];
            $('h1').each((_, el) => {
                h1s.push($(el).text().trim());
            });
            const h1Count = h1s.length;
            let h1Status = 'GOOD';
            let h1Message = 'H1 structure is optimal.';
            if (h1Count === 0) {
                h1Status = 'ERROR';
                h1Message = 'Missing H1 tag. A page should have exactly one main heading.';
            }
            else if (h1Count > 1) {
                h1Status = 'WARNING';
                h1Message = `Multiple H1 tags found (${h1Count}). It is best practice to use only one H1 tag per page.`;
            }
            // --- Images Audit ---
            let totalImages = 0;
            let missingAlt = 0;
            $('img').each((_, el) => {
                totalImages++;
                const alt = $(el).attr('alt');
                if (alt === undefined || alt === null || alt.trim() === '') {
                    missingAlt++;
                }
            });
            let imgStatus = 'GOOD';
            let imgMessage = 'All images have alt tags.';
            if (missingAlt > 0) {
                imgStatus = 'WARNING';
                imgMessage = `${missingAlt} of ${totalImages} image(s) are missing alt attributes.`;
            }
            // --- Links Audit ---
            let totalLinks = 0;
            let internalLinks = 0;
            let externalLinks = 0;
            $('a').each((_, el) => {
                const href = $(el).attr('href')?.trim();
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
                    return;
                }
                totalLinks++;
                try {
                    if (href.startsWith('//') || href.startsWith('http://') || href.startsWith('https://')) {
                        const linkUrl = new URL(href.startsWith('//') ? `https:${href}` : href);
                        if (linkUrl.hostname === parsedUrl.hostname) {
                            internalLinks++;
                        }
                        else {
                            externalLinks++;
                        }
                    }
                    else {
                        // Relative URL is internal
                        internalLinks++;
                    }
                }
                catch (e) {
                    // If URL parse fails, treat as external just in case
                    externalLinks++;
                }
            });
            return {
                url: targetUrl,
                timestamp: new Date().toISOString(),
                statusCode: response.status,
                statusText: response.statusText || 'OK',
                responseTimeMs,
                pageSizeBytes,
                isHttps,
                contentType,
                seo: {
                    title: { text: titleText, length: titleLength, status: titleStatus, message: titleMessage },
                    description: { text: descText, length: descLength, status: descStatus, message: descMessage },
                    h1: { count: h1Count, items: h1s, status: h1Status, message: h1Message },
                    images: { total: totalImages, missingAlt, status: imgStatus, message: imgMessage },
                    links: { total: totalLinks, internal: internalLinks, external: externalLinks }
                }
            };
        }
        catch (error) {
            logger_1.logger.error(`HTTP request failed during audit for ${targetUrl}`, { error: error.message });
            let failReason = 'Unknown network error';
            if (error.code === 'ECONNABORTED') {
                failReason = `Request timed out (limit: ${config_1.config.auditTimeoutMs}ms)`;
            }
            else if (error.code === 'ENOTFOUND') {
                failReason = 'DNS resolution failed or site is offline';
            }
            else if (error.response) {
                failReason = `HTTP Error: ${error.response.status} ${error.response.statusText}`;
            }
            else if (error.message) {
                failReason = error.message;
            }
            throw new errors_1.AuditFailedError(`Failed to fetch and analyze the target URL: ${failReason}`, {
                url: targetUrl,
                reason: failReason,
                code: error.code,
            });
        }
    }
}
exports.AuditService = AuditService;
