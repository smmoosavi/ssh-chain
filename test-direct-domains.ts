/**
 * Test script for direct domains wildcard matching
 * Run with: bun test-direct-domains.ts
 */

function shouldUseDirect(hostname: string, directDomains: string[]): boolean {
  if (directDomains.length === 0) {
    return false;
  }

  for (const pattern of directDomains) {
    // Exact match
    if (pattern === hostname) {
      return true;
    }

    // Wildcard pattern
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // Remove * but keep the dot
      // Match if hostname ends with the suffix (e.g., .example.com)
      if (hostname.endsWith(suffix)) {
        return true;
      }
      // Also match the domain itself without subdomain (e.g., example.com for *.example.com)
      if (hostname === suffix.slice(1)) {
        return true;
      }
    } else if (pattern.startsWith("*")) {
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

// Test cases
const directDomains = [
  "foo.example.com",
  "*.my-company.com",
  "foo-bar",
  "*.us",
];

const testCases = [
  // Exact domain match
  { hostname: "foo.example.com", expected: true, reason: "exact match" },
  { hostname: "bar.example.com", expected: false, reason: "different subdomain" },
  
  // Wildcard subdomain match
  { hostname: "api.my-company.com", expected: true, reason: "subdomain of *.my-company.com" },
  { hostname: "dev.api.my-company.com", expected: true, reason: "nested subdomain of *.my-company.com" },
  { hostname: "my-company.com", expected: true, reason: "apex domain of *.my-company.com" },
  { hostname: "other-company.com", expected: false, reason: "different domain" },
  
  // No TLD match
  { hostname: "foo-bar", expected: true, reason: "exact match (no TLD)" },
  { hostname: "foo-baz", expected: false, reason: "different hostname" },
  
  // TLD wildcard match
  { hostname: "example.us", expected: true, reason: "*.us TLD match" },
  { hostname: "api.example.us", expected: true, reason: "*.us TLD match with subdomain" },
  { hostname: "example.uk", expected: false, reason: "different TLD" },
  
  // Edge cases
  { hostname: "localhost", expected: false, reason: "not in list" },
  { hostname: "my-company.com.attacker.com", expected: false, reason: "suffix but not valid match" },
];

console.log("Testing direct domains wildcard matching:\n");
console.log("Direct domains:", directDomains, "\n");

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = shouldUseDirect(test.hostname, directDomains);
  const status = result === test.expected ? "✅ PASS" : "❌ FAIL";
  
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} - ${test.hostname}`);
  console.log(`  Expected: ${test.expected}, Got: ${result}`);
  console.log(`  Reason: ${test.reason}\n`);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
