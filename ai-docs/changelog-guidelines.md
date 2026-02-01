# Changelog Guidelines

- When you write changes, write a changelog for user-facing changes.
- The changelog should be in `CHANGELOG.md` file.
- The changelog should follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.
- The changelog entries should be recorded in the `Unreleased` section before release.

Follow these guidelines to keep release notes consistent and useful for users.

## Viewing changes

To see changes between a released tag (for example `v1.0.1`) and the current `HEAD`, run:

```sh
git log v1.0.1..HEAD
```

Adjust the tag name as needed for your release.
