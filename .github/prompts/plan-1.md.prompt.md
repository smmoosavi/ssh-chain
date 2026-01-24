# Plan: Config & Proxy Core Implementation

Create the foundation for SSH chain proxy with config loading and working HTTP-to-SOCKS5 proxy forwarding, using simple console.log for output.

## Steps

### 1. Create config file schema and loader in `src/config.ts`
- Define TypeScript interface for config (sshServer, portRange, httpProxyPort, inactivityTimeout)
- Support simple SSH host string (for .ssh/config users) or full connection details
- Load from `config.json` in project root using Bun's file APIs
- Validate required fields and provide sensible defaults

### 2. Create SSH manager in `src/ssh-manager.ts`
- Spawn `ssh -D <port> <host>` using `Bun.spawn()`
- Pick available port from configured range
- Monitor process stdout/stderr and log to console
- Implement `start()`, `stop()`, `restart()` methods
- Track last data activity timestamp for stall detection

### 3. Create HTTP proxy server in `src/proxy-server.ts`
- Use `proxy-chain` package to create HTTP proxy
- Configure upstream to use the SSH SOCKS5 proxy (`socks5://127.0.0.1:<port>`)
- Log each proxied hostname with `console.log()`
- Track bytes transferred per request for future stats

### 4. Wire everything together in `index.ts`
- Load config on startup
- Start SSH manager → wait for SOCKS5 proxy ready
- Start HTTP proxy server pointing to SOCKS5
- Add graceful shutdown on SIGINT/SIGTERM

### 5. Create sample config in `config.json`
- Example with minimal settings (just ssh host)
- Example with full settings commented

## Further Considerations

1. **SSH ready detection**: How to know SSH tunnel is ready? Option A: Wait fixed delay / Option B: Attempt test connection / Option C: Parse ssh output for bind message — recommend Option B with timeout fallback
2. **Config format**: JSON vs YAML vs TOML? Recommend JSON for simplicity with Bun's native JSON support
3. **Port selection**: Random from range vs sequential? Recommend random to avoid conflicts after restart
