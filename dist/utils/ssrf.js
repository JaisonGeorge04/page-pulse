"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrivateIp = isPrivateIp;
exports.validateUrlForSsrf = validateUrlForSsrf;
const dns_1 = __importDefault(require("dns"));
const net_1 = __importDefault(require("net"));
const url_1 = require("url");
const errors_1 = require("./errors");
const logger_1 = require("./logger");
/**
 * Checks if a resolved IP address is a private, loopback, or reserved address.
 */
function isPrivateIp(ip) {
    if (net_1.default.isIPv4(ip)) {
        const parts = ip.split('.').map((p) => parseInt(p, 10));
        if (parts.length !== 4 || parts.some(isNaN))
            return true;
        const [o1, o2] = parts;
        // 127.0.0.0/8 (Loopback)
        if (o1 === 127)
            return true;
        // 10.0.0.0/8 (Private Class A)
        if (o1 === 10)
            return true;
        // 172.16.0.0/12 (Private Class B)
        if (o1 === 172 && o2 >= 16 && o2 <= 31)
            return true;
        // 192.168.0.0/16 (Private Class C)
        if (o1 === 192 && o2 === 168)
            return true;
        // 169.254.0.0/16 (Link-Local)
        if (o1 === 169 && o2 === 254)
            return true;
        // 0.0.0.0 (Unspecified)
        if (ip === '0.0.0.0')
            return true;
        return false;
    }
    else if (net_1.default.isIPv6(ip)) {
        const canonical = ip.toLowerCase();
        // ::1 (Loopback)
        if (canonical === '::1' || canonical === '0:0:0:0:0:0:0:1')
            return true;
        // :: (Unspecified)
        if (canonical === '::' || canonical === '0:0:0:0:0:0:0:0')
            return true;
        // fe80::/10 (Link-Local)
        if (canonical.startsWith('fe80:'))
            return true;
        // fc00::/7 (Unique Local Address)
        if (canonical.startsWith('fc') || canonical.startsWith('fd'))
            return true;
        // ff00::/8 (Multicast)
        if (canonical.startsWith('ff'))
            return true;
        return false;
    }
    return true; // If not valid IPv4/IPv6, consider unsafe
}
/**
 * Validates a URL and resolves its hostname to verify it is not pointing to private IPs.
 * Returns the parsed hostname if safe.
 */
async function validateUrlForSsrf(urlStr) {
    let parsedUrl;
    try {
        parsedUrl = new url_1.URL(urlStr);
    }
    catch (error) {
        throw new errors_1.ValidationError('Invalid URL format');
    }
    const { protocol, hostname } = parsedUrl;
    if (protocol !== 'http:' && protocol !== 'https:') {
        throw new errors_1.ValidationError('Only HTTP and HTTPS protocols are supported');
    }
    // If the hostname is an IP directly, validate it
    if (net_1.default.isIP(hostname)) {
        if (isPrivateIp(hostname)) {
            throw new errors_1.SSRFBlockedError(`Access to IP address ${hostname} is forbidden`);
        }
        return hostname;
    }
    // Resolve hostname via DNS
    return new Promise((resolve, reject) => {
        dns_1.default.lookup(hostname, { all: true }, (err, addresses) => {
            if (err) {
                logger_1.logger.warn(`DNS lookup failed for hostname: ${hostname}`, { error: err.message });
                return reject(new errors_1.ValidationError(`Could not resolve hostname: ${hostname}`));
            }
            for (const addr of addresses) {
                if (isPrivateIp(addr.address)) {
                    logger_1.logger.warn(`SSRF Blocked: Hostname ${hostname} resolved to private IP ${addr.address}`);
                    return reject(new errors_1.SSRFBlockedError(`Access to hostname ${hostname} is forbidden`));
                }
            }
            resolve(hostname);
        });
    });
}
