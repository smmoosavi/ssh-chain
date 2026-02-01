#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(__dirname, '..');

/**
 * Performs pre-release replacements in CHANGELOG.md
 * @param {string} version - Version number (e.g., "1.0.2")
 * @param {string} tagName - Git tag name (e.g., "v1.0.2")
 * @param {string} date - Release date (e.g., "2026-02-01")
 */
function performPreReleaseReplacements(version, tagName, date) {
  const changelogPath = join(projectRoot, 'CHANGELOG.md');
  let content = readFileSync(changelogPath, 'utf-8');

  // Define replacements
  const replacements = [
    {
      file: 'CHANGELOG.md',
      search: 'Unreleased',
      replace: version,
      exactly: null,
    },
    {
      file: 'CHANGELOG.md',
      search: '...HEAD',
      replace: `...${tagName}`,
      exactly: 1,
    },
    {
      file: 'CHANGELOG.md',
      search: 'ReleaseDate',
      replace: date,
      exactly: null,
    },
    {
      file: 'CHANGELOG.md',
      search: '<!-- next-header -->',
      replace: `<!-- next-header -->\n\n## [Unreleased] - ReleaseDate`,
      exactly: 1,
    },
    {
      file: 'CHANGELOG.md',
      search: '<!-- next-url -->',
      replace: `<!-- next-url -->\n[Unreleased]: https://github.com/smmoosavi/ssh-chain/compare/${tagName}...HEAD`,
      exactly: 1,
    },
  ];

  // Apply each replacement
  for (const { search, replace, exactly } of replacements) {
    if (exactly === 1) {
      // Replace only the first occurrence
      const index = content.indexOf(search);
      if (index === -1) {
        console.warn(`Warning: Could not find "${search}" in CHANGELOG.md`);
        continue;
      }
      content =
        content.substring(0, index) +
        replace +
        content.substring(index + search.length);
    } else {
      // Replace all occurrences
      content = content.replaceAll(search, replace);
    }
  }

  // Write back to file
  writeFileSync(changelogPath, content, 'utf-8');
  console.log('✓ CHANGELOG.md updated');

  // Format with prettier
  const prettierResult = spawnSync(
    'pnpm',
    ['exec', 'prettier', '--write', 'CHANGELOG.md'],
    {
      cwd: projectRoot,
      stdio: 'ignore',
    },
  );
  if (prettierResult.status === 0) {
    console.log('✓ CHANGELOG.md formatted');
  } else {
    console.warn('Warning: Failed to format CHANGELOG.md with prettier');
  }
}

/**
 * Main release function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/release.js <version>

Arguments:
  version     The version to release (e.g., 1.0.2)

Example:
  node scripts/release.js 1.0.2
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const version = args[0];
  const tagName = `v${version}`;
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  console.log(`Preparing release ${tagName} (${date})...`);

  performPreReleaseReplacements(version, tagName, date);

  // Update version in package.json
  console.log('\n✓ Updating version in package.json...');
  const packageJsonPath = join(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  packageJson.version = version;
  writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf-8',
  );
  console.log(`✓ Version updated to ${version}`);

  // Commit the changes
  console.log('\n✓ Committing changes...');
  spawnSync('git', ['add', 'CHANGELOG.md', 'package.json'], {
    cwd: projectRoot,
  });
  spawnSync('git', ['commit', '-m', `release ${tagName}`], {
    cwd: projectRoot,
  });
  console.log('✓ Changes committed');

  // Create a git tag
  console.log('\n✓ Creating git tag...');
  spawnSync('git', ['tag', tagName], { cwd: projectRoot });
  console.log(`✓ Tag ${tagName} created`);

  console.log(`
✅ Release ${tagName} prepared successfully!

Next steps (copy and run these commands):

# Push to GitHub
git push && git push --tags

# Publish to npm
pnpm publish
`);
}

main();
