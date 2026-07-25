import dns from 'dns';
import net from 'net';
import { URL } from 'url';
import { SSRFBlockedError, ValidationError } from './errors';
import { logger } from './logger';

/**
 * Checks if a resolved IP address is a private, loopback, or reserved address.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(isNaN)) return true;

    const [o1, o2] = parts;

    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return true;
    // 10.0.0.0/8 (Private Class A)
    if (o1 === 10) return true;
    // 172.16.0.0/12 (Private Class B)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.168.0.0/16 (Private Class C)
    if (o1 === 192 && o2 === 168) return true;
    // 169.254.0.0/16 (Link-Local)
    if (o1 === 169 && o2 === 254) return true;
    // 0.0.0.0 (Unspecified)
    if (ip === '0.0.0.0') return true;

    return false;
  } else if (net.isIPv6(ip)) {
    const canonical = ip.toLowerCase();
    
    // ::1 (Loopback)
    if (canonical === '::1' || canonical === '0:0:0:0:0:0:0:1') return true;
    // :: (Unspecified)
    if (canonical === '::' || canonical === '0:0:0:0:0:0:0:0') return true;
    // fe80::/10 (Link-Local)
    if (canonical.startsWith('fe80:')) return true;
    // fc00::/7 (Unique Local Address)
    if (canonical.startsWith('fc') || canonical.startsWith('fd')) return true;
    // ff00::/8 (Multicast)
    if (canonical.startsWith('ff')) return true;

    return false;
  }
  return true; // If not valid IPv4/IPv6, consider unsafe
}

/**
 * Validates a URL and resolves its hostname to verify it is not pointing to private IPs.
 * Returns the parsed hostname if safe.
 */
export async function validateUrlForSsrf(urlStr: string): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch (error) {
    throw new ValidationError('Invalid URL format');
  }

  const { protocol, hostname } = parsedUrl;

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new ValidationError('Only HTTP and HTTPS protocols are supported');
  }

  // If the hostname is an IP directly, validate it
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SSRFBlockedError(`Access to IP address ${hostname} is forbidden`);
    }
    return hostname;
  }

  // Resolve hostname via DNS
  return new Promise<string>((resolve, reject) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        logger.warn(`DNS lookup failed for hostname: ${hostname}`, { error: err.message });
        return reject(new ValidationError(`Could not resolve hostname: ${hostname}`));
      }

      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          logger.warn(`SSRF Blocked: Hostname ${hostname} resolved to private IP ${addr.address}`);
          return reject(new SSRFBlockedError(`Access to hostname ${hostname} is forbidden`));
        }
      }

      resolve(hostname);
    });
  });
}
