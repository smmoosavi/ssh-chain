/**
 * File system utilities - Node.js compatible
 * Provides async file operations that work in both Node.js and Bun
 */

import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

/**
 * Check if a file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read file contents as text
 */
export async function readFileText(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}
