/**
 * Build script for SSH Chain
 *
 * Outputs:
 * 1. dist/ssh-chain.js - Single JS file (runs with bun or node)
 * 2. dist/ssh-chain - Single binary (bun runtime + code)
 */

import { $ } from 'bun';

const ENTRY_POINT = './index.ts';
const OUT_DIR = './dist';

async function getGitHash(): Promise<string> {
  try {
    const result = await $`git rev-parse --short HEAD`.quiet();
    return result.text().trim();
  } catch {
    return '';
  }
}

async function isGitClean(): Promise<boolean> {
  try {
    const result = await $`git status --porcelain`.quiet();
    return result.text().trim() === '';
  } catch {
    return true; // Assume clean if git not available
  }
}

async function ensureOutDir(): Promise<void> {
  await $`mkdir -p ${OUT_DIR}`.quiet();
}

async function buildJsBundle(
  gitHash: string,
  isDirty: boolean,
): Promise<boolean> {
  console.log('📦 Building JS bundle...');

  const result = await Bun.build({
    entrypoints: [ENTRY_POINT],
    outdir: OUT_DIR,
    target: 'node',
    minify: true,
    sourcemap: 'external',
    define: {
      BUILD_GIT_HASH: JSON.stringify(gitHash),
      BUILD_GIT_DIRTY: JSON.stringify(isDirty),
    },
    naming: 'ssh-chain.js',
  });

  if (!result.success) {
    console.error('❌ JS bundle build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  // Add shebang and make executable
  const outputPath = `${OUT_DIR}/ssh-chain.js`;
  const content = await Bun.file(outputPath).text();
  await Bun.write(outputPath, `#!/usr/bin/env node\n${content}`);
  await $`chmod +x ${outputPath}`.quiet();

  console.log('✅ dist/ssh-chain.js');
  return true;
}

async function buildBinary(
  gitHash: string,
  isDirty: boolean,
): Promise<boolean> {
  console.log('📦 Building binary...');

  const result = await Bun.build({
    entrypoints: [ENTRY_POINT],
    target: 'bun',
    minify: true,
    sourcemap: 'external',
    define: {
      BUILD_GIT_HASH: JSON.stringify(gitHash),
      BUILD_GIT_DIRTY: JSON.stringify(isDirty),
    },
    compile: {
      outfile: `${OUT_DIR}/ssh-chain`,
    },
  });

  if (!result.success) {
    console.error('❌ Binary build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  console.log('✅ dist/ssh-chain');
  return true;
}

async function main(): Promise<void> {
  console.log('🔨 SSH Chain Build\n');

  const gitHash = await getGitHash();
  const isClean = await isGitClean();

  if (gitHash) {
    const cleanStatus = isClean ? 'clean' : 'dirty';
    console.log(`📝 Git hash: ${gitHash} (${cleanStatus})\n`);
  }

  await ensureOutDir();

  const results = await Promise.all([
    buildJsBundle(gitHash, !isClean),
    buildBinary(gitHash, !isClean),
  ]);

  console.log('');

  if (results.every(Boolean)) {
    console.log('🎉 Build complete!\n');
    console.log('Usage:');
    console.log('  Binary:  ./dist/ssh-chain');
    console.log('  Node.js: node dist/ssh-chain.js');
    console.log('  Bun:     bun dist/ssh-chain.js');
  } else {
    console.error('💥 Build failed');
    process.exit(1);
  }
}

main();
