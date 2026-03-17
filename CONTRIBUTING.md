# Contributing to Saropa Drift Advisor

Thank you for your interest in contributing! This guide will help you get started.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## How to Contribute

### Reporting Issues

1. Search [existing issues](https://github.com/saropa/saropa_drift_advisor/issues) first
2. Include: Dart/Flutter version, OS, minimal reproduction steps, expected vs actual behavior
3. Use the issue template if available

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the use case, not just the solution
3. Include screenshots or mockups if applicable

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes (see coding standards below)
4. Add or update tests
5. Run `dart analyze` and `dart test`
6. Submit a pull request

## Development Setup

### Dart Package (lib/)

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/saropa_drift_advisor.git
cd saropa_drift_advisor

# Get dependencies
dart pub get

# Run tests
dart test

# Run static analysis (strict mode)
dart analyze

# Check formatting
dart format --set-exit-if-changed .
```

### VS Code Extension (extension/)

```bash
cd extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes during development
npm run watch

# Lint check
npm run lint
```

### Example App (example/)

```bash
cd example

# Get dependencies
flutter pub get

# Run code generation (Drift)
dart run build_runner build

# Run the example app
flutter run
```

## Coding Standards

### Dart Code

- **Formatting**: Use `dart format` (enforced in CI)
- **Linting**: We use [saropa_lints](https://pub.dev/packages/saropa_lints) with strict analysis
  - `strict-casts: true`
  - `strict-inference: true`
  - `strict-raw-types: true`
- **Comments**: Include explanatory comments in code. Comment non-obvious logic, explain "why" not just "what", add doc comments to public APIs, and include inline comments for complex expressions or control flow
- **Dependencies**: Keep `pubspec.yaml` dependencies minimal. This package ships inside consumer apps. Exhaust `dart:*` standard library alternatives before adding a dependency

### TypeScript Code (Extension)

- **Formatting**: Standard TypeScript conventions
- **Compilation**: Must compile cleanly with `tsc --noEmit`
- **Pre-commit hook**: Husky validates TypeScript compilation

### Tests

- Use the `package:test` framework for Dart tests
- Tests should cover both happy paths and error cases
- Use descriptive test names that explain the scenario
- Follow existing test patterns in `test/drift_debug_server_test.dart`
- Always clean up resources in `tearDown` (e.g., `DriftDebugServer.stop()`)

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat: add new SQL validation endpoint
fix: correct CSV parsing for quoted fields
docs: update README with new configuration options
test: add auth handler unit tests
refactor: extract session store from router
```

**Only human authors as contributors.** Do not add `Co-Authored-By` lines that credit tools or AI.

## Pull Request Checklist

- [ ] Code follows the project's coding standards
- [ ] Tests added or updated for new functionality
- [ ] `dart analyze` passes with no issues
- [ ] `dart format --set-exit-if-changed .` passes
- [ ] `dart test` passes
- [ ] Extension compiles: `cd extension && npm run lint`
- [ ] CHANGELOG.md updated (no dates in entries)
- [ ] Documentation updated if public API changed

## Architecture Overview

This is a hybrid Dart/TypeScript project:

| Component | Location | Language | Purpose |
|-----------|----------|----------|---------|
| Core package | `lib/` | Dart | HTTP server, SQL execution, import/export |
| Server handlers | `lib/src/server/` | Dart | Modular request handlers (one per feature) |
| VS Code extension | `extension/` | TypeScript | IDE integration, tree views, commands |
| Example app | `example/` | Dart/Flutter | Working demo of package integration |

### Key Design Principles

- **Minimal dependencies**: Only `crypto` in production deps
- **Callback-based**: Works with Drift or raw SQLite via injectable query callback
- **Debug-only**: Designed for development, not production
- **Read-only by default**: SQL execution validates read-only queries
- **Modular handlers**: Each API feature is a separate handler class

## Questions?

Open an issue or discussion. We're happy to help!

**Email**: [dev@saropa.com](mailto:dev@saropa.com)
