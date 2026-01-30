# Release Process

This document outlines the steps required to release a new version of ssh-chain.

## Release Steps

### 1. Version Bump

Update the version number using pnpm:

```bash
pnpm version patch
```

This will:

- Bump the version in `package.json`
- Create a git commit with the version change
- Create a git tag for the new version

Use `minor` or `major` instead of `patch` as appropriate for the type of release.

### 2. Push to GitHub

Push both the commit and the tag to GitHub:

```bash
git push && git push --tags
```

This will trigger the GitHub Actions workflow that automatically creates a GitHub release.

### 3. Publish to npm (Manual)

**Note:** Automatic npm publishing via CI with OIDC has failed, so npm publishing must be done manually.

Ensure you're logged into npm:

```bash
npm login
```

Then publish the package:

```bash
npm publish
```

## Troubleshooting

- If the GitHub release doesn't appear, check the Actions tab in the repository to see if the workflow ran successfully.
- If npm publish fails, verify that you have publishing permissions for the package.
- Make sure you're on the correct git branch before starting the release process.
