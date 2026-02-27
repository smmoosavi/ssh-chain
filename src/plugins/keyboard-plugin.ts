/**
 * Keyboard Input Plugin
 * Handles keyboard input for interactive control of SSH connection
 * Press 'r' to manually restart SSH connection
 */

import type { ProxyPlugin, PluginContext } from '../types.ts';
import type { SSHManager } from '../ssh-manager.ts';
import { logger } from '../logger.ts';

export class KeyboardPlugin implements ProxyPlugin {
  readonly name = 'keyboard';
  private sshManager: SSHManager | null = null;
  private isEnabled = false;
  private wasRawMode = false;

  /**
   * Set the SSH manager instance
   */
  setSSHManager(sshManager: SSHManager): void {
    this.sshManager = sshManager;
  }

  /**
   * Enable keyboard input handling
   * Sets stdin to raw mode and starts listening for key presses
   */
  enable(): void {
    if (this.isEnabled || !process.stdin.isTTY) {
      return;
    }

    this.isEnabled = true;

    // Save current raw mode state
    this.wasRawMode = process.stdin.isRaw ?? false;

    // Enable raw mode: read each keypress immediately without waiting for Enter
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Listen for keypresses
    process.stdin.on('data', this.handleKeyPress);

    logger.debug('[Keyboard] Input handler enabled (press "r" to restart SSH)');
  }

  /**
   * Disable keyboard input handling
   * Restores stdin to normal mode
   */
  disable(): void {
    if (!this.isEnabled) {
      return;
    }

    this.isEnabled = false;

    // Remove listener
    process.stdin.off('data', this.handleKeyPress);

    // Restore previous raw mode state
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(this.wasRawMode);
      if (!this.wasRawMode) {
        process.stdin.pause();
      }
    }

    logger.debug('[Keyboard] Input handler disabled');
  }

  /**
   * Handle keyboard input
   */
  private handleKeyPress = async (key: string): Promise<void> => {
    // Handle Ctrl+C (ASCII code 3)
    if (key === '\u0003') {
      // Let Node.js handle Ctrl+C normally (will trigger SIGINT)
      process.emit('SIGINT', 'SIGINT');
      return;
    }

    // Handle 'r' key - restart SSH connection
    if (key === 'r' || key === 'R') {
      if (!this.sshManager) {
        logger.warn('[Keyboard] SSH manager not available');
        return;
      }

      logger.info('[Keyboard] Restart requested by user...');
      try {
        await this.sshManager.restart();
      } catch (error) {
        logger.error(
          `[Keyboard] Failed to restart SSH: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  };

  /**
   * Plugin lifecycle: called when plugin is registered
   */
  onRegister(context: PluginContext): void {
    // Enable keyboard handling when plugin is registered
    this.enable();
  }

  /**
   * Plugin lifecycle: called when plugin is unregistered
   */
  onUnregister(): void {
    // Clean up keyboard handling
    this.disable();
  }
}
