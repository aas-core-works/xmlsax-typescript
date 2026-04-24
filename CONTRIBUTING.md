# Contributing Guide

## Issues

Please report bugs and feature requests through GitHub issues:
[https://github.com/aas-core-works/xmlsax-typescript/issues](https://github.com/aas-core-works/xmlsax-typescript/issues)

## Before You Code

1. Open an issue to discuss larger changes before implementation.
2. If you work on a branch, prefer descriptive branch names.
3. Keep pull requests focused and small enough for review.

## Local Setup

1. Install dependencies:
   npm ci
2. Run all quality checks:
   npm run verify

## Required Checks Before Pull Request

Run all of the following locally:

1. npm run lint
2. npm run test
3. npm run test:integration
4. npm run test:fuzz
5. npm run build

## Commit Messages

Use concise, imperative commit messages and explain why in the body for non-trivial changes.

## Pull Requests

1. Reference related issues in the pull request description.
2. Include a short change summary and any breaking-change notes.
3. Add or update tests whenever behavior changes.

## Releases

1. Create GitHub releases with v-prefixed semantic version tags only, for example v1.2.3 or v1.2.3-rc.1.
2. The publish workflow derives the package version from the release tag and updates package.json and package-lock.json automatically before publishing to npm.
3. After publish, the workflow commits version updates for package.json and package-lock.json back to main.
