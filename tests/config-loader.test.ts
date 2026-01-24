/**
 * Tests for config loader classes
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import {
  DefaultConfigLoader,
  FileConfigLoader,
  ArgvConfigLoader,
  EnvConfigLoader,
  ConfigManager,
  createConfigManager,
  type PartialConfig,
} from "../src/config-loader.ts";

describe("DefaultConfigLoader", () => {
  test("returns default configuration", async () => {
    const loader = new DefaultConfigLoader();
    const config = await loader.load();

    expect(config.portRange).toEqual({ min: 10000, max: 10100 });
    expect(config.httpProxyHost).toBe("127.0.0.1");
    expect(config.httpProxyPort).toBe(4080);
    expect(config.inactivityTimeout).toBe(60);
    expect(config.healthCheckInterval).toBe(30);
    expect(config.retryAttempts).toBe(3);
    expect(config.logLevel).toBe("info");
    expect(config.directDomains).toEqual([]);
  });

  test("has correct name and priority", () => {
    const loader = new DefaultConfigLoader();
    expect(loader.name).toBe("defaults");
    expect(loader.priority).toBe(0);
  });
});

describe("FileConfigLoader", () => {
  const tempDir = tmpdir();
  let testConfigPath: string;

  beforeEach(() => {
    testConfigPath = join(tempDir, `test-config-${Date.now()}.json`);
  });

  afterEach(async () => {
    try {
      await Bun.file(testConfigPath).exists() &&
        (await Bun.write(testConfigPath, "")); // Clean up
    } catch {
      // Ignore cleanup errors
    }
  });

  test("loads valid JSON config file", async () => {
    const configContent = {
      sshServer: "my-server",
      httpProxyPort: 9090,
      logLevel: "debug",
    };
    await Bun.write(testConfigPath, JSON.stringify(configContent));

    const loader = new FileConfigLoader(testConfigPath);
    const config = await loader.load();

    expect(config.sshServer).toEqual({ host: "my-server" });
    expect(config.httpProxyPort).toBe(9090);
    expect(config.logLevel).toBe("debug");
  });

  test("loads config with sshServer as object", async () => {
    const configContent = {
      sshServer: { host: "my-server", port: 2222, username: "admin" },
    };
    await Bun.write(testConfigPath, JSON.stringify(configContent));

    const loader = new FileConfigLoader(testConfigPath);
    const config = await loader.load();

    expect(config.sshServer).toEqual({
      host: "my-server",
      port: 2222,
      username: "admin",
    });
  });

  test("returns empty config for non-existent optional file", async () => {
    const loader = new FileConfigLoader("/non/existent/path.json", false);
    const config = await loader.load();
    expect(config).toEqual({});
  });

  test("throws for non-existent required file", async () => {
    const loader = new FileConfigLoader("/non/existent/path.json", true);
    await expect(loader.load()).rejects.toThrow("Configuration file not found");
  });

  test("throws for invalid JSON", async () => {
    await Bun.write(testConfigPath, "{ invalid json }");

    const loader = new FileConfigLoader(testConfigPath);
    await expect(loader.load()).rejects.toThrow("Invalid JSON");
  });

  test("parses directDomains array", async () => {
    const configContent = {
      directDomains: ["*.local", "localhost", "*.example.com"],
    };
    await Bun.write(testConfigPath, JSON.stringify(configContent));

    const loader = new FileConfigLoader(testConfigPath);
    const config = await loader.load();

    expect(config.directDomains).toEqual([
      "*.local",
      "localhost",
      "*.example.com",
    ]);
  });

  test("has correct name and priority", () => {
    const loader = new FileConfigLoader("config.json");
    expect(loader.name).toBe("file");
    expect(loader.priority).toBe(10);
  });
});

describe("ArgvConfigLoader", () => {
  test("loads config from parsed args", async () => {
    const loader = new ArgvConfigLoader({
      sshServer: "cli-server",
      httpProxyHost: "0.0.0.0",
      httpProxyPort: 8888,
      logLevel: "debug",
      help: false,
      version: false,
    });

    const config = await loader.load();

    expect(config.sshServer).toEqual({ host: "cli-server" });
    expect(config.httpProxyHost).toBe("0.0.0.0");
    expect(config.httpProxyPort).toBe(8888);
    expect(config.logLevel).toBe("debug");
  });

  test("returns empty values for undefined args", async () => {
    const loader = new ArgvConfigLoader({
      help: false,
      version: false,
    });

    const config = await loader.load();

    expect(config.sshServer).toBeUndefined();
    expect(config.httpProxyHost).toBeUndefined();
    expect(config.httpProxyPort).toBeUndefined();
    expect(config.logLevel).toBeUndefined();
  });

  test("has correct name and priority", () => {
    const loader = new ArgvConfigLoader({ help: false, version: false });
    expect(loader.name).toBe("argv");
    expect(loader.priority).toBe(20);
  });
});

describe("EnvConfigLoader", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith("SSH_CHAIN_") || key.startsWith("TEST_PREFIX_")) {
        delete process.env[key];
      }
    });
  });

  test("loads config from environment variables", async () => {
    process.env.SSH_CHAIN_SSH_SERVER = "env-server";
    process.env.SSH_CHAIN_HTTP_PROXY_HOST = "192.168.1.1";
    process.env.SSH_CHAIN_HTTP_PROXY_PORT = "7777";
    process.env.SSH_CHAIN_LOG_LEVEL = "warn";

    const loader = new EnvConfigLoader();
    const config = await loader.load();

    expect(config.sshServer).toEqual({ host: "env-server" });
    expect(config.httpProxyHost).toBe("192.168.1.1");
    expect(config.httpProxyPort).toBe(7777);
    expect(config.logLevel).toBe("warn");
  });

  test("uses custom prefix", async () => {
    process.env.TEST_PREFIX_SSH_SERVER = "custom-server";
    process.env.TEST_PREFIX_LOG_LEVEL = "error";

    const loader = new EnvConfigLoader("TEST_PREFIX_");
    const config = await loader.load();

    expect(config.sshServer).toEqual({ host: "custom-server" });
    expect(config.logLevel).toBe("error");
  });

  test("ignores invalid log level", async () => {
    process.env.SSH_CHAIN_LOG_LEVEL = "invalid";

    const loader = new EnvConfigLoader();
    const config = await loader.load();

    expect(config.logLevel).toBeUndefined();
  });

  test("has correct name and priority", () => {
    const loader = new EnvConfigLoader();
    expect(loader.name).toBe("env");
    expect(loader.priority).toBe(15);
  });
});

describe("ConfigManager", () => {
  test("merges configs by priority (lower first)", async () => {
    const manager = new ConfigManager();

    // Add loaders in arbitrary order
    manager.addLoader({
      name: "high-priority",
      priority: 100,
      load: async () => ({ httpProxyPort: 9999 }),
    });
    manager.addLoader({
      name: "low-priority",
      priority: 1,
      load: async () => ({
        sshServer: { host: "base-server" },
        httpProxyPort: 1111,
      }),
    });

    const config = await manager.load();

    // High priority should override low priority
    expect(config.httpProxyPort).toBe(9999);
    expect(config.sshServer.host).toBe("base-server");
  });

  test("throws when sshServer is missing", async () => {
    const manager = new ConfigManager();
    manager.addLoader({
      name: "test",
      priority: 1,
      load: async () => ({ httpProxyPort: 8080 }),
    });

    await expect(manager.load()).rejects.toThrow("SSH server is required");
  });

  test("removeLoader removes loader by name", async () => {
    const manager = new ConfigManager();
    manager.addLoader({
      name: "to-remove",
      priority: 100,
      load: async () => ({ httpProxyPort: 9999 }),
    });
    manager.addLoader({
      name: "keep",
      priority: 1,
      load: async () => ({
        sshServer: { host: "server" },
        httpProxyPort: 1111,
      }),
    });

    manager.removeLoader("to-remove");
    const config = await manager.load();

    expect(config.httpProxyPort).toBe(1111);
  });

  test("propagates loader errors with context", async () => {
    const manager = new ConfigManager();
    manager.addLoader({
      name: "failing-loader",
      priority: 1,
      load: async () => {
        throw new Error("Connection failed");
      },
    });

    await expect(manager.load()).rejects.toThrow(
      'Config loader "failing-loader" failed: Connection failed'
    );
  });
});

describe("createConfigManager", () => {
  test("creates manager with default loaders", () => {
    const manager = createConfigManager({ help: false, version: false });
    // Manager should be created without errors
    expect(manager).toBeInstanceOf(ConfigManager);
  });

  test("uses custom config path from args", () => {
    const manager = createConfigManager({
      configPath: "/custom/path.json",
      help: false,
      version: false,
    });
    expect(manager).toBeInstanceOf(ConfigManager);
  });
});
