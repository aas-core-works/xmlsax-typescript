# xmlsax-typescript

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)
[![Coverage Status](https://coveralls.io/repos/github/aas-core-works/xmlsax-typescript/badge.svg?branch=mristin/Add-coveralls)](https://coveralls.io/github/aas-core-works/xmlsax-typescript?branch=mristin/Add-coveralls)

> One-pass, streaming (SAX-style) XML parser for TypeScript — works in Node.js and browsers.

## Highlights

- **Streaming** — feed chunks of XML as they arrive; no need to buffer the whole document
- **Lightweight** — zero runtime dependencies, tree-shakeable ESM + CJS
- **Type-safe** — written in TypeScript with full type exports
- **Namespace-aware** — resolves prefixes, URIs, and local names out of the box
- **Two-way** — parse XML to a tree (`parseXmlString`) or serialize a tree back to XML (`serializeXml`)
- **Design-by-contract** — invariant checks in development, stripped in production

## Install

```bash
npm install xmlsax-typescript
```

## API Selection Guide

- Use `parseXmlString(xml)` when you already have the full XML string and need an `XmlNode` tree.
- Use `tokenizeXml(xml)` for one-shot SAX tokenization of a full string.
- Use `tokenizeXmlAsync(chunks)` for async chunk sources.
- Use `XmlSaxParser` directly when you need fine-grained feed/close control.
- Use `buildObject(root)` to project a parsed tree to a plain object.
- Use `ObjectBuilder` to build objects while streaming tokens without materializing a tree.
- Use `objectToXml(obj, options)` when converting plain objects directly back to XML.

## Quick start

### Token streaming (sync)

```ts
import { XmlSaxParser, dispatchToken } from "xmlsax-typescript";

const parser = new XmlSaxParser();

for (const token of parser.feed("<root>")) {
  dispatchToken(token, {
    openTag: (openTagToken) => {
      console.log("open", openTagToken.tag.name);
    }
  });
}
for (const token of parser.feed("Hello</root>")) {
  dispatchToken(token, {
    text: (textToken) => {
      console.log("text", textToken.text);
    },
    closeTag: (closeTagToken) => {
      console.log("close", closeTagToken.tag.name);
    }
  });
}
parser.close();
```

### Token streaming (async)

```ts
import { OpenTagToken, tokenizeXmlAsync } from "xmlsax-typescript";

async function* chunks(): AsyncGenerator<string> {
  yield "<root><item>1</item>";
  yield "<item>2</item></root>";
}

for await (const token of tokenizeXmlAsync(chunks())) {
  if (token instanceof OpenTagToken) {
    console.log(token.depth, token.path.join("/"));
  }
}
```

### Parse to tree

```ts
import { parseXmlString } from "xmlsax-typescript";

const root = parseXmlString("<root><a>1</a><b/></root>");
console.log(root.name); // "root"
```

### Project to plain objects

```ts
import { buildObject, parseXmlString } from "xmlsax-typescript";

const root = parseXmlString("<root id='1'><item>1</item><item>2</item></root>");
const obj = buildObject(root);
// { "@_id": "1", item: ["1", "2"] }
```

### Streaming object builder

```ts
import { ObjectBuilder, XmlSaxParser, dispatchToken } from "xmlsax-typescript";

const builder = new ObjectBuilder();
const parser = new XmlSaxParser();

const consume = (token: Parameters<typeof dispatchToken>[0]): void => {
  dispatchToken(token, {
    openTag: (openTagToken) => builder.onOpenTag(openTagToken.tag),
    text: (textToken) => builder.onText(textToken.text),
    cdata: (cdataToken) => builder.onCdata(cdataToken.text),
    closeTag: () => builder.onCloseTag()
  });
};

for (const token of parser.feed("<root><item>1</item>")) consume(token);
for (const token of parser.feed("<item>2</item></root>")) consume(token);
for (const token of parser.close()) consume(token);

const obj = builder.getResult();
// { item: ["1", "2"] }
```

### Object to XML

```ts
import { objectToXml } from "xmlsax-typescript";

const xml = objectToXml({
  root: {
    "@_id": "1",
    item: ["1", "2"],
  }
});

// <root id="1"><item>1</item><item>2</item></root>
```

```ts
import { buildObject, objectToXml, parseXmlString } from "xmlsax-typescript";

const root = parseXmlString("<root id='1'><item>1</item></root>");
const obj = buildObject(root);
const xml = objectToXml(obj, { rootName: "root" });

// <root id="1"><item>1</item></root>
```

### Serialize to XML

```ts
import { serializeXml } from "xmlsax-typescript";

const xml = serializeXml(
  {
    name: "root",
    attributes: { id: "1" },
    children: ["Hello", { name: "child", children: ["World"] }],
  },
  { pretty: true, xmlDeclaration: true },
);
// <?xml version="1.0" encoding="UTF-8"?>
// <root id="1">
//   Hello
//   <child>World</child>
// </root>
```

## API

### `XmlSaxParser`

```ts
new XmlSaxParser(options?: ParserOptions)
```

| Method.               | Description                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `feed(chunk)`         | Feed one XML chunk and return parsed tokens for that chunk                                   |
| `close()`             | Finalize parsing, validate state, and return remaining tokens plus `EndToken`                |
| `drainTokens()`       | Return and clear buffered tokens (usually empty if you consume `feed`/`close` return values) |
| `[Symbol.iterator]()` | Iterate currently buffered tokens                                                            |
| `iterateChunks(src)`  | Async iterator over an `Iterable<string>` or `AsyncIterable<string>` chunk source            |

Example for `iterateChunks(src)`:

```ts
import { OpenTagToken, XmlSaxParser } from "xmlsax-typescript";

async function* chunks(): AsyncGenerator<string> {
  yield "<root><item>1</item>";
  yield "<item>2</item></root>";
}

const parser = new XmlSaxParser();
for await (const token of parser.iterateChunks(chunks())) {
  if (token instanceof OpenTagToken) {
    console.log(token.tag.name);
  }
}
```

#### `ParserOptions`

| Option                       | Type      | Default | Description                                    |
| ---------------------------- | --------- | ------- | ---------------------------------------------- |
| `xmlns`                      | `boolean` | `true`  | Enable namespace resolution                    |
| `includeNamespaceAttributes` | `boolean` | `false` | Include `xmlns:*` attributes in tag output     |
| `allowDoctype`               | `boolean` | `true`  | Allow `<!DOCTYPE …>` declarations              |
| `coalesceText`               | `boolean` | `true`  | Merge adjacent text tokens into a single token |
| `trackPosition`              | `boolean` | `true`  | Track line/column; disable for faster parsing  |

By default (`coalesceText: true`), adjacent text chunks are merged and emitted as one `TextToken` per structural boundary. Set `coalesceText: false` to keep chunk-level text tokenization.

`trackPosition` controls line/column tracking for parser errors. When set to `false`, parsing is faster and `XmlSaxError` still reports `offset`, while `line` and `column` are set to `0`.

Token payload note: with `xmlns: false`, `OpenTagToken` and `CloseTagToken` use plain-mode tag shapes aligned with `saxes` performance semantics.

- `OpenTagToken.tag.attributes` values are strings (not `XmlAttribute` objects)
- `OpenTagToken.tag` and `CloseTagToken.tag` omit `prefix`, `local`, and `uri`
- With `xmlns: true`, full namespace metadata remains present

### Tokens

Token classes:

- `OpenTagToken`
- `CloseTagToken`
- `TextToken`
- `CdataToken`
- `CommentToken`
- `ProcessingInstructionToken`
- `DoctypeToken`
- `EndToken`

All token classes derive from `XmlToken` and include:

- `kind`
- `position` (`{ offset, line, column }` when `trackPosition` is enabled)

`OpenTagToken` and `CloseTagToken` also include:

- `depth`
- `path`

### `dispatchToken(token, handlers)`

Typed utility to route any token to kind-specific callbacks without `instanceof` chains.

```ts
import { dispatchToken } from "xmlsax-typescript";

dispatchToken(token, {
  openTag: (openTagToken) => console.log(openTagToken.tag.name),
  text: (textToken) => console.log(textToken.text),
  otherwise: (unknownToken) => console.log(unknownToken.kind)
});
```

### `isBuildToken(token)`

Type guard for structural tokens accepted by `TreeBuilder.consume` and `ObjectBuilder.consume` (`open-tag`, `text`, `cdata`, `close-tag`).

### `tokenizeXml(xml, options?)`

Convenience helper for one-shot tokenization of a complete XML string.

### `tokenizeXmlAsync(chunks, options?)`

Convenience async generator for iterating tokens from an `Iterable<string>` or `AsyncIterable<string>` source.

### `parseXmlString(xml, options?)`

Convenience function that parses a complete XML string into an `XmlNode` tree using `XmlSaxParser` + `TreeBuilder` internally.

### `TreeBuilder`

Low-level tree builder. Consume parser tokens via `consume(token)` and call `getRoot()` to retrieve the resulting `XmlNode`.

### `buildObject(root, options?)`

Projects an `XmlNode` tree into a plain object. Attributes are prefixed (default `@_`), text is stored under `#text`, repeated elements are arrays, and elements with only text return the text directly.

### `ObjectBuilder`

Streaming builder that produces the same object shape as `buildObject` without building a full `XmlNode` tree. Consume parser tokens via `consume(token)`.

Methods:

| Method | Description |
| --- | --- |
| `consume(...)` | Consume token-based events (`OpenTag`, `Text`, `Cdata`, `CloseTag`) |
| `onOpenTag(...)` | Handle an open tag event directly |
| `onText(...)` | Handle a text event directly |
| `onCdata(...)` | Handle a CDATA event directly |
| `onCloseTag()` | Handle a close-tag event directly |
| `getResult()` | Get the built object |
| `getRootName()` | Get the root element name |

#### `ObjectBuilderOptions`

| Option             | Type                                                         | Default   | Description                                    |
| ------------------ | ------------------------------------------------------------ | --------- | ---------------------------------------------- |
| `attributePrefix`  | `string`                                                     | `"@_"`    | Prefix for attribute keys                      |
| `textKey`          | `string`                                                     | `"#text"` | Key used for text nodes                        |
| `stripNamespaces`  | `boolean`                                                    | `false`   | Strip namespace prefixes from names            |
| `arrayElements`    | `Set\<string\> \| (name: string, path: string[]) => boolean` | —         | Force specific elements to always be arrays    |
| `coalesceText`     | `boolean`                                                    | `true`    | Merge adjacent text nodes into a single string |

### `buildXmlNode(obj, options?)`

Converts a plain object into an `XmlNode` tree using the same attribute/text conventions as `buildObject`.

### `objectToXml(obj, options?)`

Builds an `XmlNode` with `buildXmlNode` and serializes it with `serializeXml`.

### `stripNamespace(name)`

Removes namespace prefix from a qualified name.

```ts
stripNamespace("p:item"); // "item"
stripNamespace("item"); // "item"
```

### `resolveName(value)`

Normalizes either a qualified string or a tag-like object into a unified name representation.

```ts
resolveName("p:item");
// { name: "p:item", localName: "item", prefix: "p", uri: "" }

resolveName({ name: "p:item", prefix: "p", local: "item", uri: "urn:p" });
// { name: "p:item", localName: "item", prefix: "p", uri: "urn:p" }
```

#### `XmlBuilderOptions`

| Option             | Type                                                         | Default   | Description                                    |
| ------------------ | ------------------------------------------------------------ | --------- | ---------------------------------------------- |
| `attributePrefix`  | `string`                                                     | `"@_"`    | Prefix for attribute keys                      |
| `textKey`          | `string`                                                     | `"#text"` | Key used for text nodes                        |
| `stripNamespaces`  | `boolean`                                                    | `false`   | Strip namespace prefixes from names            |
| `arrayElements`    | `Set\<string\> \| (name: string, path: string[]) => boolean` | —         | Force specific elements to always be arrays    |
| `rootName`         | `string`                                                     | —         | Root element name when object has multiple keys|

### `serializeXml(node, options?)`

Serializes an `XmlNode` back to an XML string.

#### `SerializeOptions`

| Option            | Type      | Default  | Description                              |
| ----------------- | --------- | -------- | ---------------------------------------- |
| `xmlDeclaration`  | `boolean` | `false`  | Prepend `<?xml …?>` declaration          |
| `pretty`          | `boolean` | `false`  | Enable indented output                   |
| `indent`          | `string`  | `"  "`   | Indentation string (when `pretty`)       |
| `newline`         | `string`  | `"\n"`   | Newline string (when `pretty`)           |

### `XmlSaxError`

Custom error class thrown on parse errors. Includes `offset`, `line`, and `column` properties for precise error location.

### `XmlSaxBuildError`

Structured build-time error thrown by `TreeBuilder`, `ObjectBuilder`, and XML object-to-node conversion helpers when consumed in an invalid state.

### `XmlSaxInvariantError`

Debug-only invariant error thrown when an internal design-by-contract check fails.

### `XmlSaxLibraryError`

Base class for non-parse library errors (`XmlSaxBuildError`, `XmlSaxInvariantError`).

## Error Handling

Typical error handling splits into parser errors and build/usage errors:

```ts
import {
  parseXmlString,
  XmlSaxBuildError,
  XmlSaxError,
  XmlSaxLibraryError
} from "xmlsax-typescript";

try {
  parseXmlString("<root><broken></root>");
} catch (error) {
  if (error instanceof XmlSaxError) {
    console.error(`Parse error at ${error.line}:${error.column} (offset ${error.offset})`);
  } else if (error instanceof XmlSaxBuildError) {
    console.error(`Builder usage error (${error.phase})`);
  } else if (error instanceof XmlSaxLibraryError) {
    console.error(`Library error code: ${error.code}`);
  } else {
    throw error;
  }
}
```

## Compatibility and Security Notes

- Runtime support: Node.js 20+ and modern browsers.
- XML input is parsed from JavaScript strings.
- For untrusted XML input, disable doctype parsing:

```ts
import { parseXmlString } from "xmlsax-typescript";

const root = parseXmlString(inputXml, { allowDoctype: false });
```

- Keep `xmlns: true` when namespace correctness matters.

## Performance Tuning

- Set `trackPosition: false` for faster parse throughput if line/column reporting is not required.
- Keep `coalesceText: true` when you want fewer text-token allocations.
- Use streaming APIs (`XmlSaxParser`, `tokenizeXmlAsync`) for large inputs.
- Run `npm run bench:parser` to compare common parser modes on your machine.

### Exported types

`XmlTokenKind` · `XmlAnyToken` · `XmlBuildToken` · `XmlTokenHandlers` · `OpenTag` · `CloseTag` · `XmlAttribute` · `ProcessingInstruction` · `Doctype` · `XmlNode` · `XmlChild` · `XmlPosition` · `XmlChunkIterable` · `ParserOptions` · `SerializeOptions` · `ObjectBuilderOptions` · `ArrayElementSelector` · `XmlObjectMap` · `XmlObjectValue` · `XmlBuilderOptions` · `XmlInputObject` · `XmlInputValue` · `ObjectToXmlOptions`

## Features

- Namespace resolution (`xmlns`)
- CDATA sections
- Entity decoding (named + numeric)
- Processing instructions
- DOCTYPE handling (parse + emit)
- Comments
- Precise error positions (line, column, offset)
- Pretty-print serialization with XML declaration

## Design-by-contract

Internal invariants are checked during development. Set `NODE_ENV=production` to strip them from production bundles — no runtime overhead.

## Development

```bash
npm install           # install dependencies
npm run build         # build ESM + CJS with tsup
npm test              # run tests with vitest
npm run test:coverage # run tests with coverage report
npm run test:watch    # run tests in watch mode
npm run bench:parser  # run parser throughput benchmark scenarios
npm run lint          # eslint + tsc type check
npm run typecheck     # run TypeScript type-check only
npm run lint:fix      # auto-fix lint issues
npm run verify        # lint + tests + build + package dry-run
```
