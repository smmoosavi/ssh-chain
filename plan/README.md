# SSH Chain Proxy Manager

## Overview

A smart proxy management tool that automatically maintains an HTTP proxy backed by SSH SOCKS5 tunnels. The tool monitors proxy health, automatically restarts stalled connections, and provides real-time visibility into proxy performance.

## Problem Statement

When using `ssh -D` to create SOCKS5 proxies for tunneling traffic through remote servers, connections occasionally stall and require manual intervention. This project automates the monitoring and recovery process.

## Core Functionality

### Automatic SSH Management

- Spawns and manages `ssh -D` processes to create SOCKS5 proxies
- Monitors data flow through the proxy connection
- Detects stalled connections based on inactivity timeout
- Automatically kills and restarts hung SSH processes
- Handles port allocation from configured range

### HTTP Proxy Server

- Provides an HTTP/HTTPS proxy interface on a configured port
- Forwards all requests to the underlying SOCKS5 proxy
- Maintains connection persistence and proper error handling
- Logs all proxied hostnames in real-time to the terminal
- Tracks and aggregates data usage per hostname

## Configuration

The application reads from a configuration file with the following parameters:

### Required Settings

- **SSH Server**: Hostname/IP and authentication details
  - Host
  - Port (default: 22)
  - Username
  - Authentication method (key/password)
  - SSH options (e.g., KeepAlive, compression)
  - If user has a configured .ssh/config file, it may be a single Host entry without port, user, ... (e.g., myserver)
- **Port Range**: Available ports for dynamic SOCKS5 proxy allocation
  - Min port
  - Max port
- **HTTP Proxy Port**: Port for the HTTP proxy server to listen on
- **Inactivity Timeout**: Duration of no data flow before considering connection stalled (in seconds)

### Optional Settings

- Logging level and output directory
- Retry attempts and backoff strategy
- Health check interval

## User Interface

Interactive terminal UI using Ink (React for CLI) displaying:

### Real-Time Metrics

- **Current Status**: Connection state, uptime, current ports
- **Bandwidth Graph**: Visual chart of data throughput over the last 5-10 minutes
- **Connection Health**: Latency, packet loss, connection quality indicators
- **Total Statistics**:
  - Total data transferred (upload/download)
  - Session count and duration
  - Restart count and reasons
  - Average connection quality

### Additional UI Features

- **Recent Activity Log**: Last 10-20 proxy requests with timestamps
- **Hostname Log Stream**: Real-time display of proxied hostnames as they're accessed
- **Per-Hostname Statistics**: Aggregate data usage breakdown by hostname
  - Data transferred (upload/download) per host
  - Request count per host
  - Sort by usage, frequency, or alphabetically
- **Alert Notifications**: Connection failures, restarts, errors
- **Performance Indicators**: CPU and memory usage of proxy processes
- **Network Quality Score**: Derived from latency, stability, and throughput
- **Quick Actions**: Manual restart, pause/resume, configuration reload

## Technical Stack

- **pnpm**: Package manager
- **Runtime**: Bun
- **UI Framework**: Ink (React for terminal)
- **Proxy Library**: proxy-chain npm package
- **SSH Management**: Node.js child_process for ssh command execution
- **Data Monitoring**: Stream interceptors to track data flow
- **typeScript**: For type safety and maintainability
- **Zod**: For configuration schema validation

## Implementation Phases

1. **Phase 1**: Configuration file parsing and validation
1. **Phase 2**: Basic SSH process management and restart logic
1. **Phase 3**: HTTP to SOCKS5 proxy forwarding
1. **Phase 4**: Terminal UI with basic metrics
1. **Phase 5**: Advanced monitoring and analytics
1. **Phase 6**: Error handling and logging improvements
