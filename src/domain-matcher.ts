/**
 * Domain matching utilities for direct connection bypass
 */

/**
 * Check if a domain matches any pattern in the direct domains list
 * Supports wildcards:
 * - *.example.com matches any subdomain of example.com
 * - foo-bar matches exact hostname (no TLD required)
 * - *.us matches all domains ending in .us TLD
 * - foo.example.com matches exact domain
 */
export function shouldUseDirect(
  hostname: string,
  directDomains: string[],
): boolean {
  if (directDomains.length === 0) {
    return false;
  }

  for (const pattern of directDomains) {
    // Exact match
    if (pattern === hostname) {
      return true;
    }

    // Wildcard pattern
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // Remove * but keep the dot
      // Match if hostname ends with the suffix (e.g., .example.com)
      if (hostname.endsWith(suffix)) {
        return true;
      }
      // Also match the domain itself without subdomain (e.g., example.com for *.example.com)
      if (hostname === suffix.slice(1)) {
        return true;
      }
    } else if (pattern.startsWith('*')) {
      // Handle patterns like *.us (without dot after *)
      const suffix = pattern.slice(1);
      if (hostname.endsWith(suffix)) {
        return true;
      }
    } else {
      // For patterns without wildcards, also match if it's a simple hostname (no dots)
      // This handles cases like "foo-bar" which should only match "foo-bar"
      if (pattern === hostname) {
        return true;
      }
    }
  }

  return false;
}
