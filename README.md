# ssh-chain

HTTP proxy through SSH SOCKS5 tunnel.

## Installation

```bash
pnpm install
```

## Usage

### Quick start (no config file needed)

```bash
# Connect using ~/.ssh/config host
bun run index.ts my-server

# Connect with user@host
bun run index.ts user@192.168.1.100
```

### With config file

```bash
# Use default config.json
bun run index.ts

# Use custom config file
bun run index.ts -c ./path/to/config.json

# Override sshServer from config file
bun run index.ts other-server -c ./path/to/config.json
```

### Command-line options

```
Usage:
  ssh-chain [options] [ssh-server]

Arguments:
  ssh-server              SSH host (hostname, IP, or ~/.ssh/config Host entry)
                          This overrides sshServer in config file

Options:
  -c, --config <path>     Path to config file (default: ./config.json)
  -p, --port <port>       HTTP proxy port (default: 4080)
  -l, --log-level <level> Log level: debug, info, warn, error (default: info)
  -h, --help              Show help message
  -v, --version           Show version
```

### Examples

```bash
# Simple usage
bun run index.ts my-server

# Custom HTTP proxy port
bun run index.ts my-server -p 8080

# Enable debug logging
bun run index.ts my-server --log-level debug

# Use custom config with server override
bun run index.ts other-server -c ./custom-config.json
```

## Configuration

See [config.example.json](config.example.json) for all available options.

The only required configuration is `sshServer`, which can be provided:
- As a command-line argument
- In the config file

Command-line arguments have higher priority than config file values.

### Direct Domains (Bypass Proxy)

You can configure domains that should bypass the proxy and connect directly. Add them to the `directDomains` array in your config file:

```json
{
  "directDomains": [
    "foo.example.com",
    "*.my-company.com",
    "foo-bar",
    "*.us"
  ]
}
```

**Wildcard Support:**
- **Exact match**: `foo.example.com` - only matches this exact domain
- **Subdomain wildcard**: `*.my-company.com` - matches any subdomain like `api.my-company.com`, `dev.api.my-company.com`, and the apex domain `my-company.com`
- **No TLD**: `foo-bar` - matches simple hostnames without a TLD
- **TLD wildcard**: `*.us` - matches all domains ending in `.us` (e.g., `example.us`, `api.example.us`)

Direct connections are labeled with `[DIRECT]` in the logs.

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
