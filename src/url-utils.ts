/**
 * URL and request parsing utilities
 */

/**
 * Extract hostname from URL or request
 * Handles both full URLs and CONNECT-style hostname:port format
 * Strips brackets from IPv6 addresses
 */
export function extractHostname(url: string): string {
  try {
    // Handle CONNECT requests (hostname:port format)
    if (url.includes(':') && !url.includes('://')) {
      // Check for IPv6 address (wrapped in brackets)
      if (url.startsWith('[')) {
        const endBracket = url.indexOf(']');
        if (endBracket !== -1) {
          // Return IPv6 address without brackets
          return url.slice(1, endBracket);
        }
      }
      return url.split(':')[0] ?? url;
    }

    // Handle full URLs
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;

    // Strip brackets from IPv6 addresses
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }

    return hostname;
  } catch {
    return url;
  }
}

/**
 * Extract port from URL or request
 * Returns default port (80 or 443) if not specified
 */
export function extractPort(url: string, isHttps: boolean): number {
  try {
    // Handle CONNECT requests (hostname:port format)
    if (url.includes(':') && !url.includes('://')) {
      // Check for IPv6 address (wrapped in brackets)
      if (url.startsWith('[')) {
        const endBracket = url.indexOf(']');
        if (endBracket !== -1 && url.length > endBracket + 1) {
          // Port is after ']:'
          const portStr = url.slice(endBracket + 2);
          return parseInt(portStr, 10);
        }
        return isHttps ? 443 : 80;
      }
      const parts = url.split(':');
      return parseInt(parts[1] ?? (isHttps ? '443' : '80'), 10);
    }

    // Handle full URLs
    const urlObj = new URL(url);
    return urlObj.port ? parseInt(urlObj.port, 10) : isHttps ? 443 : 80;
  } catch {
    return isHttps ? 443 : 80;
  }
}
