# Tests

Tests are written with Vitest.

- Full suite: `npm test`
- Integration: `npm run test:integration`
- Fuzz: `npm run test:fuzz`

## Coverage Focus

The suite is organized to protect parser correctness while performance work is in progress.

- `tests/parser.spec.ts`: core token stream behavior, chunking, coalescing, self-closing tags, and plain-mode payload shape
- `tests/entities.spec.ts`: named/numeric entities, malformed entities, and error propagation
- `tests/line-endings.spec.ts`: CR/LF normalization behavior for text and attributes
- `tests/namespaces.spec.ts`: namespace resolution, prefix errors, and `xml:*` handling
- `tests/integration/streaming.spec.ts`: chunk-boundary behavior and streaming semantics
- `tests/fuzz/parser.fuzz.spec.ts`: randomized parser robustness checks

Current baseline count: `58` passing tests across all suites.

When updating parser internals for performance, prioritize adding tests that lock down:

- chunk-boundary entities and line endings
- token ordering around self-closing tags and coalesced text
- payload compatibility differences between `xmlns: false` (plain mode) and `xmlns: true` (namespace mode)
