/**
 * Common types and interfaces for SSH Chain Proxy
 */

import { EventEmitter } from "events";

/**
 * Typed EventEmitter for strong typing on events
 */
export class TypedEventEmitter<TEvents extends { [key: string]: unknown[] }> extends EventEmitter {
  override emit<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    ...args: TEvents[TEventName]
  ): boolean {
    return super.emit(eventName, ...args);
  }

  override on<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (...args: TEvents[TEventName]) => void
  ): this {
    return super.on(eventName, handler as (...args: unknown[]) => void);
  }

  override once<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (...args: TEvents[TEventName]) => void
  ): this {
    return super.once(eventName, handler as (...args: unknown[]) => void);
  }

  override off<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (...args: TEvents[TEventName]) => void
  ): this {
    return super.off(eventName, handler as (...args: unknown[]) => void);
  }
}

/**
 * Request info for proxy events
 */
export interface ProxyRequestInfo {
  hostname: string;
  port: number;
  method: string;
  url: string;
  isHttps: boolean;
  isDirect: boolean;
  timestamp: Date;
}

/**
 * Proxy server events that can be listened to
 */
export type ProxyServerEvents = {
  request: [info: ProxyRequestInfo];
  connect: [hostname: string, port: number];
  error: [error: Error, context?: string];
  started: [port: number, proxyUrl: string];
  stopped: [];
};

/**
 * SSH Manager events
 */
export type SSHManagerEvents = {
  ready: [port: number];
  error: [error: Error];
  exit: [code: number | null];
  data: [bytes: number];
  stdout: [data: string];
  stderr: [data: string];
  restart: [count: number];
  activity: [];
};

/**
 * Plugin interface for extending proxy functionality
 */
export interface ProxyPlugin {
  /** Unique plugin name */
  readonly name: string;
  /** Called when plugin is registered */
  onRegister?(app: PluginContext): void;
  /** Called when plugin is unregistered */
  onUnregister?(): void;
}

/**
 * Context provided to plugins
 */
export interface PluginContext {
  /** Subscribe to proxy events */
  onProxyEvent<K extends keyof ProxyServerEvents>(
    event: K,
    handler: (...args: ProxyServerEvents[K]) => void
  ): void;
  /** Subscribe to SSH events */
  onSSHEvent<K extends keyof SSHManagerEvents>(
    event: K,
    handler: (...args: SSHManagerEvents[K]) => void
  ): void;
  /** Get config */
  getConfig(): unknown;
}
