# ssh-chain

HTTP proxy through SSH SOCKS5 tunnel.

## Installation

```bash
pnpm install
```

## Building

Build the project (requires Bun for building):

```bash
bun run build
```

This creates:

- `dist/ssh-chain` - Executable that runs with Node.js (recommended)
  - Requires Node.js in runtime
  - Smaller size (~400KB)
  - No known bugs
- `dist/ssh-chain.bun` - Bun-specific binary
  - Standalone binary (no runtime required)
  - Larger size (~100MB)
  - Known bug: [incorrect byte usage display](https://github.com/oven-sh/bun/issues/26553)

**Note:** We recommend using Node.js to run the built binary due to [a Bun issue with memory statistics](https://github.com/oven-sh/bun/issues/26553).

## Usage

### Quick start (no config file needed)

```bash
# Connect using ~/.ssh/config host
./dist/ssh-chain my-server

# Connect with user@host
./dist/ssh-chain user@192.168.1.100

# Or during development (requires Bun)
bun run index.ts my-server
```

### With config file

```bash
# Use default config.json
./dist/ssh-chain

# Use custom config file
./dist/ssh-chain -c ./path/to/config.json

# Override sshServer from config file
./dist/ssh-chain other-server -c ./path/to/config.json
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
./dist/ssh-chain my-server

# Custom HTTP proxy port
./dist/ssh-chain my-server -p 8080

# Enable debug logging
./dist/ssh-chain my-server --log-level debug

# Use custom config with server override
./dist/ssh-chain other-server -c ./custom-config.json
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
  "directDomains": ["foo.example.com", "*.my-company.com", "foo-bar", "*.us"]
}
```

**Wildcard Support:**

- **Exact match**: `foo.example.com` - only matches this exact domain
- **Subdomain wildcard**: `*.my-company.com` - matches any subdomain like `api.my-company.com`, `dev.api.my-company.com`, and the apex domain `my-company.com`
- **No TLD**: `foo-bar` - matches simple hostnames without a TLD
- **TLD wildcard**: `*.us` - matches all domains ending in `.us` (e.g., `example.us`, `api.example.us`)

Direct connections are labeled with `[DIRECT]` in the logs.

## Development

This project requires [Bun](https://bun.sh) for building and development:

```bash
# Install dependencies
pnpm install

# Run in development mode (with auto-reload)
bun run dev

# Run tests
bun test

# Type check
pnpm typecheck

# Build for production
bun run build
```
