# Direct Domains Feature - Implementation Summary

## Overview

Added support for bypassing the proxy for specific domains with wildcard pattern matching.

## Changes Made

### 1. Configuration Schema ([src/config.ts](src/config.ts))

- Added `directDomains` field to `ConfigSchema` and `PartialConfigSchema`
- Type: `string[]` with default value of empty array
- Integrated into config resolution logic

### 2. Proxy Server ([src/proxy-server.ts](src/proxy-server.ts))

- Added `shouldUseDirect()` function with wildcard matching logic
- Modified `prepareRequestFunction` to check domains and bypass proxy when needed
- Direct connections return `upstreamProxyUrl: undefined`
- Added `[DIRECT]` label in logs for bypassed requests
- Only proxied requests notify SSH manager of activity

### 3. Configuration Example ([config.example.json](config.example.json))

- Added `directDomains` example with various wildcard patterns
- Added documentation comments

### 4. Documentation ([README.md](README.md))

- Added "Direct Domains (Bypass Proxy)" section
- Documented all wildcard patterns with examples

### 5. Test Script ([test-direct-domains.ts](test-direct-domains.ts))

- Created comprehensive test suite
- 13 test cases covering all wildcard patterns
- All tests passing ✅

## Wildcard Pattern Support

| Pattern            | Example            | Matches                                                          |
| ------------------ | ------------------ | ---------------------------------------------------------------- |
| Exact domain       | `foo.example.com`  | Only `foo.example.com`                                           |
| Subdomain wildcard | `*.my-company.com` | `api.my-company.com`, `dev.api.my-company.com`, `my-company.com` |
| No TLD             | `foo-bar`          | Only `foo-bar`                                                   |
| TLD wildcard       | `*.us`             | `example.us`, `api.example.us`, etc.                             |

## Usage Example

```json
{
  "sshServer": "my-server",
  "httpProxyPort": 8080,
  "directDomains": [
    "foo.example.com",
    "*.my-company.com",
    "localhost",
    "foo-bar",
    "*.local",
    "*.us"
  ]
}
```

## Log Output

Requests to direct domains are marked with `[DIRECT]` label:

```
[12:34:56] CONNECT api.my-company.com:443 [DIRECT]
[12:34:57] CONNECT external.com:443
```

## Testing

Run the test suite:

```bash
bun test-direct-domains.ts
```

All 13 tests pass successfully.
