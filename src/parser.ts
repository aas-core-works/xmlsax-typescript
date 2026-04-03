import { assert } from "./assert";
import { decodeEntities, splitTextForEntities } from "./entities";
import { XmlSaxError } from "./errors";
import {
  CdataToken,
  CloseTagToken,
  CommentToken,
  DoctypeToken,
  EndToken,
  OpenTagToken,
  ProcessingInstructionToken,
  TextToken,
  type XmlAnyToken
} from "./tokens";
import type {
  CloseTag,
  Doctype,
  OpenTag,
  ParserOptions,
  ProcessingInstruction,
  XmlAttribute,
  XmlPosition
} from "./types";

type NamespaceMap = Record<string, string>;

interface StackEntry {
  rawName: string;
  closeTag: CloseTag;
}

interface RawAttribute {
  name: string;
  value: string;
}

interface ResolvedName {
  name: string;
  prefix: string;
  local: string;
  uri: string;
}

const DEFAULT_OPTIONS: Required<
  Pick<ParserOptions, "xmlns" | "includeNamespaceAttributes" | "allowDoctype" | "coalesceText" | "trackPosition">
> = {
  xmlns: true,
  includeNamespaceAttributes: false,
  allowDoctype: true,
  coalesceText: true,
  trackPosition: true
};

const XML_NAMESPACE_URI = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE_URI = "http://www.w3.org/2000/xmlns/";
const WHITESPACE_RE = /\s/;
const CRLF_RE = /\r\n?/g;

const NAME_START_TABLE = new Uint8Array(128);
const NAME_CHAR_TABLE = new Uint8Array(128);

for (let code = 65; code <= 90; code += 1) {
  NAME_START_TABLE[code] = 1;
  NAME_CHAR_TABLE[code] = 1;
}
for (let code = 97; code <= 122; code += 1) {
  NAME_START_TABLE[code] = 1;
  NAME_CHAR_TABLE[code] = 1;
}
for (let code = 48; code <= 57; code += 1) {
  NAME_CHAR_TABLE[code] = 1;
}
NAME_START_TABLE[95] = 1;
NAME_CHAR_TABLE[95] = 1;
NAME_CHAR_TABLE[58] = 1;
NAME_CHAR_TABLE[45] = 1;
NAME_CHAR_TABLE[46] = 1;

export class XmlSaxParser {
  private readonly xmlns: boolean;
  private readonly includeNamespaceAttributes: boolean;
  private readonly allowDoctype: boolean;
  private readonly coalesceText: boolean;
  private readonly trackPosition: boolean;
  private buffer = "";
  private offset = 0;
  private line = 1;
  private column = 1;
  private readonly pathStack: string[] = [];
  private readonly tokenQueue: XmlAnyToken[] = [];
  private elementStack: StackEntry[] = [];
  private nsStack: NamespaceMap[] = [
    Object.assign(Object.create(null) as NamespaceMap, {
      xml: XML_NAMESPACE_URI,
      xmlns: XMLNS_NAMESPACE_URI
    })
  ];
  private closed = false;
  private pendingCR = false;
  private readonly pendingTextParts: string[] = [];
  private readonly _rawAttrs: RawAttribute[] = [];

  constructor(options: ParserOptions = {}) {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    this.xmlns = resolved.xmlns;
    this.includeNamespaceAttributes = resolved.includeNamespaceAttributes;
    this.allowDoctype = resolved.allowDoctype;
    this.coalesceText = resolved.coalesceText;
    this.trackPosition = resolved.trackPosition;
  }

  feed(chunk: string): XmlAnyToken[] {
    if (this.closed) {
      this._error("Parser is closed");
    }
    this._assertInternalState("before feed");
    if (!chunk) {
      return this.drainTokens();
    }
    this.buffer += chunk;
    this._parseBuffer(false);
    this._assertInternalState("after feed");
    return this.drainTokens();
  }

  close(): XmlAnyToken[] {
    if (this.closed) {
      return this.drainTokens();
    }
    this._parseBuffer(true);
    this._flushPendingCR();
    this._flushTextBuffer();
    this._assertInternalState("before close validation");
    if (this.buffer.length > 0) {
      this._error("Unexpected end of input");
    }
    if (this.elementStack.length > 0) {
      this._error("Unclosed tag(s) remaining");
    }
    this.closed = true;
    this._pushToken(new EndToken(this._position()));
    this._assertInternalState("after close");
    return this.drainTokens();
  }

  drainTokens(): XmlAnyToken[] {
    if (this.tokenQueue.length === 0) {
      return [];
    }
    return this.tokenQueue.splice(0, this.tokenQueue.length);
  }

  *[Symbol.iterator](): IterableIterator<XmlAnyToken> {
    while (this.tokenQueue.length > 0) {
      const token = this.tokenQueue.shift();
      if (token) {
        yield token;
      }
    }
  }

  async *iterateChunks(chunks: Iterable<string> | AsyncIterable<string>): AsyncGenerator<XmlAnyToken> {
    for await (const chunk of chunks) {
      for (const token of this.feed(chunk)) {
        yield token;
      }
    }
    for (const token of this.close()) {
      yield token;
    }
  }

  private _parseBuffer(final: boolean): void {
    let i = 0;

    while (i < this.buffer.length) {
      const lt = this.buffer.indexOf("<", i);
      if (lt === -1) {
        const tail = this.buffer.slice(i);
        if (!tail.includes("&")) {
          if (tail.length > 0) {
            this._emitText(tail, true);
            this._advance(tail);
          }
        } else {
          const split = splitTextForEntities(tail);
          if (split.emit.length > 0) {
            this._emitText(split.emit, true);
            this._advance(split.emit);
          }
          this.buffer = split.carry;
          return;
        }
        this.buffer = "";
        return;
      }

      if (lt > i) {
        const text = this.buffer.slice(i, lt);
        if (text.length > 0) {
          this._emitText(text, false);
          this._advance(text);
        }
        i = lt;
      }

      const consumed = this._parseMarkupFrom(lt, final);
      if (consumed === null) {
        break;
      }

      this._advanceSpan(lt, lt + consumed);
      i = lt + consumed;
    }

    this.buffer = this.buffer.slice(i);

    if (final && this.buffer.length > 0) {
      this._error("Unexpected end of input");
    }
  }

  private _parseMarkupFrom(start: number, final: boolean): number | null {
    assert(this.buffer[start] === "<", "Markup must start with '<'");

    if (this.pendingCR) this._flushPendingCR();

    const secondCode = this.buffer.charCodeAt(start + 1);

    if (secondCode === 63) {
      const end = this.buffer.indexOf("?>", start + 2);
      if (end === -1) {
        if (final) {
          this._error("Unterminated processing instruction");
        }
        return null;
      }
      const body = this.buffer.slice(start + 2, end).trim();
      const split = body.search(WHITESPACE_RE);
      const target = split === -1 ? body : body.slice(0, split);
      const data = split === -1 ? "" : body.slice(split).trim();
      const pi: ProcessingInstruction = { target, body: data };
      this._flushTextBuffer();
      this._pushToken(new ProcessingInstructionToken(pi, this._position()));
      return end + 2 - start;
    }

    if (secondCode === 33) {
      const thirdCode = this.buffer.charCodeAt(start + 2);

      if (thirdCode === 45 && this.buffer.charCodeAt(start + 3) === 45) {
        const end = this.buffer.indexOf("-->", start + 4);
        if (end === -1) {
          if (final) {
            this._error("Unterminated comment");
          }
          return null;
        }
        const comment = this.buffer.slice(start + 4, end);
        this._flushTextBuffer();
        this._pushToken(new CommentToken(comment, this._position()));
        return end + 3 - start;
      }

      if (thirdCode === 91 && this.buffer.startsWith("<![CDATA[", start)) {
        const end = this.buffer.indexOf("]]>", start + 9);
        if (end === -1) {
          if (final) {
            this._error("Unterminated CDATA section");
          }
          return null;
        }
        const cdata = this.buffer.slice(start + 9, end);
        const normalized = this._normalizeText(cdata, false);
        if (normalized.length > 0) {
          this._flushTextBuffer();
          this._pushToken(new CdataToken(normalized, this._position()));
        }
        return end + 3 - start;
      }

      if (thirdCode === 68 && this.buffer.startsWith("<!DOCTYPE", start)) {
        const end = this._findDoctypeEnd(start + 9);
        if (end === -1) {
          if (final) {
            this._error("Unterminated doctype declaration");
          }
          return null;
        }
        if (!this.allowDoctype) {
          this._error("Doctype is not allowed");
        }
        const raw = this.buffer.slice(start + 9, end).trim();
        const doctype: Doctype = { raw };
        this._flushTextBuffer();
        this._pushToken(new DoctypeToken(doctype, this._position()));
        return end + 1 - start;
      }
    }

    if (secondCode === 47) {
      const end = this.buffer.indexOf(">", start + 2);
      if (end === -1) {
        if (final) {
          this._error("Unterminated closing tag");
        }
        return null;
      }

      let i = this._skipWhitespace(this.buffer, start + 2, end);
      const parsed = this._parseName(this.buffer, i, end);
      i = this._skipWhitespace(this.buffer, parsed.end, end);
      if (i !== end) {
        this._error("Invalid closing tag");
      }

      this._handleCloseTag(parsed.name, parsed.end);
      return end + 1 - start;
    }

    const tagEnd = this._findTagEnd(start + 1);
    if (tagEnd === -1) {
      if (final) {
        this._error("Unterminated start tag");
      }
      return null;
    }

    this._handleStartTagRange(start + 1, tagEnd);
    return tagEnd + 1 - start;
  }

  private _handleStartTagRange(start: number, end: number): void {
    this._assertInternalState("before start tag");
    this._flushTextBuffer();

    const parsed = this._parseStartTagRange(start, end);
    const selfClosing = parsed.selfClosing;

    if (!this.xmlns) {
      const plainName = parsed.name;
      const attributes: Record<string, XmlAttribute | string> = Object.create(null) as Record<
        string,
        XmlAttribute | string
      >;

      for (const attr of parsed.attributes) {
        attributes[attr.name] = attr.value;
      }

      const tag: OpenTag = {
        name: plainName,
        attributes,
        isSelfClosing: selfClosing
      };

      const openPath = Object.freeze([...this.pathStack, plainName]);
      const depth = openPath.length;
      this._pushToken(new OpenTagToken(tag, depth, openPath, this._position()));

      if (selfClosing) {
        this._pushToken(new CloseTagToken({ name: plainName }, depth, openPath, this._position()));
        return;
      }

      this.elementStack.push({
        rawName: parsed.name,
        closeTag: { name: plainName }
      });
      this.pathStack.push(plainName);
      this._assertInternalState("after start tag (plain mode)");
      return;
    }

    const parentNs = this._currentNs();
    let ns = parentNs;
    for (const attr of parsed.attributes) {
      if (attr.name === "xmlns") {
        if (ns === parentNs) {
          ns = Object.create(parentNs) as NamespaceMap;
        }
        ns[""] = attr.value;
      } else if (attr.name.startsWith("xmlns:")) {
        if (ns === parentNs) {
          ns = Object.create(parentNs) as NamespaceMap;
        }
        ns[attr.name.slice(6)] = attr.value;
      }
    }

    const resolvedName = this._resolveName(parsed.name, ns);
    const attributes: Record<string, XmlAttribute> = Object.create(null) as Record<string, XmlAttribute>;

    for (const attr of parsed.attributes) {
      if (!this.includeNamespaceAttributes) {
        if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) {
          continue;
        }
      }
      const resolvedAttr = this._resolveAttributeName(attr.name, ns);
      attributes[resolvedAttr.name] = {
        name: resolvedAttr.name,
        value: attr.value,
        prefix: resolvedAttr.prefix,
        local: resolvedAttr.local,
        uri: resolvedAttr.uri
      };
    }

    const tag: OpenTag = {
      name: resolvedName.name,
      prefix: resolvedName.prefix,
      local: resolvedName.local,
      uri: resolvedName.uri,
      attributes,
      isSelfClosing: selfClosing
    };

    const openPath = Object.freeze([...this.pathStack, resolvedName.name]);
    const depth = openPath.length;
    this._pushToken(new OpenTagToken(tag, depth, openPath, this._position()));

    if (selfClosing) {
      this._pushToken(
        new CloseTagToken(
          {
            name: resolvedName.name,
            prefix: resolvedName.prefix,
            local: resolvedName.local,
            uri: resolvedName.uri
          },
          depth,
          openPath,
          this._position()
        )
      );
      return;
    }

    this.elementStack.push({
      rawName: parsed.name,
      closeTag: {
        name: resolvedName.name,
        prefix: resolvedName.prefix,
        local: resolvedName.local,
        uri: resolvedName.uri
      }
    });
    this.pathStack.push(resolvedName.name);
    this.nsStack.push(ns);
    this._assertInternalState("after start tag");
  }

  private _parseStartTagRange(
    start: number,
    end: number
  ): { name: string; attributes: RawAttribute[]; selfClosing: boolean } {
    let i = this._skipWhitespace(this.buffer, start, end);
    const parsedName = this._parseName(this.buffer, i, end);
    i = parsedName.end;

    const attributes = this._rawAttrs;
    attributes.length = 0;
    let selfClosing = false;

    while (i < end) {
      i = this._skipWhitespace(this.buffer, i, end);
      if (i >= end) {
        break;
      }

      if (this.buffer.charCodeAt(i) === 47) {
        i += 1;
        i = this._skipWhitespace(this.buffer, i, end);
        if (i !== end) {
          this._error("Invalid self-closing tag");
        }
        selfClosing = true;
        break;
      }

      const attrName = this._parseName(this.buffer, i, end);
      i = attrName.end;
      i = this._skipWhitespace(this.buffer, i, end);

      if (this.buffer.charCodeAt(i) !== 61) {
        this._error("Attribute without '='");
      }

      i += 1;
      i = this._skipWhitespace(this.buffer, i, end);

      const quoteCode = this.buffer.charCodeAt(i);
      if (quoteCode !== 34 && quoteCode !== 39) {
        this._error("Attribute value must be quoted");
      }

      const quote = String.fromCharCode(quoteCode);
      i += 1;

      const valueEnd = this.buffer.indexOf(quote, i);
      if (valueEnd === -1 || valueEnd >= end) {
        this._error("Unterminated attribute value");
      }

      const rawValue = this.buffer.slice(i, valueEnd);
      const normalized = rawValue.includes("\r") ? rawValue.replace(CRLF_RE, "\n") : rawValue;
      const value = !normalized.includes("&") ? normalized : decodeEntities(normalized);
      attributes.push({ name: attrName.name, value });
      i = valueEnd + 1;
    }

    return { name: parsedName.name, attributes, selfClosing };
  }

  private _handleCloseTag(rawName: string, _nameEnd?: number): void {
    this._assertInternalState("before close tag");
    this._flushTextBuffer();

    const entry = this.elementStack.pop();
    const ns = this.xmlns ? this.nsStack.pop() : this._currentNs();

    if (!entry || !ns) {
      this._error("Closing tag without matching start tag");
    }

    if (entry.rawName !== rawName) {
      this._error(`Mismatched closing tag: expected </${entry.rawName}>`);
    }

    const closePath = Object.freeze([...this.pathStack]);
    const depth = closePath.length;
    assert(depth > 0, "Path stack cannot be empty when closing a tag");
    assert(closePath[depth - 1] === entry.closeTag.name, "Path stack must match closing tag name");
    if (depth > 0) {
      this.pathStack.pop();
    }
    this._pushToken(new CloseTagToken(entry.closeTag, depth, closePath, this._position()));
    this._assertInternalState("after close tag");
  }

  private _emitText(text: string, allowPendingCR: boolean): void {
    const normalized = this._normalizeText(text, allowPendingCR);
    if (normalized.length === 0) {
      return;
    }

    if (!normalized.includes("&")) {
      this._emitDecodedText(normalized);
      return;
    }

    const decoded = decodeEntities(normalized);
    if (decoded.length > 0) {
      this._emitDecodedText(decoded);
    }
  }

  private _emitDecodedText(text: string): void {
    if (!this.coalesceText) {
      this._pushToken(new TextToken(text, this._position()));
      return;
    }
    this.pendingTextParts.push(text);
  }

  private _flushTextBuffer(): void {
    if (!this.coalesceText || this.pendingTextParts.length === 0) {
      return;
    }
    const first = this.pendingTextParts[0];
    const text = this.pendingTextParts.length === 1 && first !== undefined ? first : this.pendingTextParts.join("");
    this.pendingTextParts.length = 0;
    this._pushToken(new TextToken(text, this._position()));
  }

  private _resolveName(rawName: string, ns: NamespaceMap): ResolvedName {
    if (!this.xmlns) {
      const split = rawName.indexOf(":");
      if (split === -1) {
        return { name: rawName, prefix: "", local: rawName, uri: "" };
      }
      return {
        name: rawName,
        prefix: rawName.slice(0, split),
        local: rawName.slice(split + 1),
        uri: ""
      };
    }

    const split = rawName.indexOf(":");
    if (split === -1) {
      return {
        name: rawName,
        prefix: "",
        local: rawName,
        uri: ns[""] ?? ""
      };
    }

    const prefix = rawName.slice(0, split);
    const local = rawName.slice(split + 1);
    const uri = ns[prefix];
    if (uri === undefined) {
      this._error(`Undeclared namespace prefix: ${prefix}`);
    }
    return {
      name: rawName,
      prefix,
      local,
      uri
    };
  }

  private _resolveAttributeName(rawName: string, ns: NamespaceMap): ResolvedName {
    if (!this.xmlns) {
      return this._resolveName(rawName, ns);
    }

    if (rawName === "xmlns") {
      return {
        name: rawName,
        prefix: "",
        local: rawName,
        uri: ns.xmlns ?? XMLNS_NAMESPACE_URI
      };
    }

    const split = rawName.indexOf(":");
    if (split === -1) {
      return {
        name: rawName,
        prefix: "",
        local: rawName,
        uri: ""
      };
    }

    const prefix = rawName.slice(0, split);
    const local = rawName.slice(split + 1);
    const uri = ns[prefix];
    if (uri === undefined) {
      this._error(`Undeclared namespace prefix: ${prefix}`);
    }

    return {
      name: rawName,
      prefix,
      local,
      uri
    };
  }

  private _findTagEnd(start: number): number {
    const quickEnd = this.buffer.indexOf(">", start);
    if (quickEnd === -1) {
      return -1;
    }

    const firstDoubleQuote = this.buffer.indexOf("\"", start);
    const firstSingleQuote = this.buffer.indexOf("'", start);
    const firstQuote =
      firstDoubleQuote === -1
        ? firstSingleQuote
        : firstSingleQuote === -1
          ? firstDoubleQuote
          : Math.min(firstDoubleQuote, firstSingleQuote);

    if (firstQuote === -1 || firstQuote > quickEnd) {
      return quickEnd;
    }

    let quoteCode = 0;
    for (let i = start; i < this.buffer.length; i += 1) {
      const code = this.buffer.charCodeAt(i);
      if (quoteCode) {
        if (code === quoteCode) {
          quoteCode = 0;
        }
        continue;
      }
      if (code === 34 || code === 39) {
        quoteCode = code;
        continue;
      }
      if (code === 62) {
        return i;
      }
    }
    return -1;
  }

  private _findDoctypeEnd(start: number): number {
    let quoteCode = 0;
    let bracketDepth = 0;

    for (let i = start; i < this.buffer.length; i += 1) {
      const code = this.buffer.charCodeAt(i);
      if (quoteCode) {
        if (code === quoteCode) {
          quoteCode = 0;
        }
        continue;
      }
      if (code === 34 || code === 39) {
        quoteCode = code;
        continue;
      }
      if (code === 91) {
        bracketDepth += 1;
        continue;
      }
      if (code === 93) {
        bracketDepth = Math.max(0, bracketDepth - 1);
        continue;
      }
      if (code === 62 && bracketDepth === 0) {
        return i;
      }
    }

    return -1;
  }

  private _parseName(input: string, start: number, end: number): { name: string; end: number } {
    if (start >= end) {
      this._error("Expected name");
    }

    const firstCode = input.charCodeAt(start);
    if (firstCode >= 128 || NAME_START_TABLE[firstCode] === 0) {
      this._error(`Invalid name start: '${input[start] ?? ""}'`);
    }

    let i = start + 1;
    while (i < end) {
      const code = input.charCodeAt(i);
      if (code >= 128 || NAME_CHAR_TABLE[code] === 0) {
        break;
      }
      i += 1;
    }

    return { name: input.slice(start, i), end: i };
  }

  private _skipWhitespace(input: string, start: number, end: number): number {
    let i = start;
    while (i < end) {
      const code = input.charCodeAt(i);
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
        break;
      }
      i += 1;
    }
    return i;
  }

  private _currentNs(): NamespaceMap {
    return this.nsStack[this.nsStack.length - 1] ?? (Object.create(null) as NamespaceMap);
  }

  private _advance(text: string): void {
    this.offset += text.length;
    if (!this.trackPosition) {
      return;
    }

    let pos = text.indexOf("\n");
    if (pos === -1) {
      this.column += text.length;
      return;
    }

    let newlineCount = 0;
    let lastNewline = -1;
    while (pos !== -1) {
      newlineCount += 1;
      lastNewline = pos;
      pos = text.indexOf("\n", pos + 1);
    }

    this.line += newlineCount;
    this.column = text.length - lastNewline;
  }

  private _normalizeText(text: string, allowPendingCR: boolean): string {
    if (!text) {
      return "";
    }

    // Fast path for common chunks: no CR handling and no pending state.
    if (!this.pendingCR && !text.includes("\r")) {
      return text;
    }

    let value = text;
    let prefix = "";

    if (this.pendingCR) {
      prefix = "\n";
      if (value.charCodeAt(0) === 10) {
        value = value.slice(1);
      }
      this.pendingCR = false;
    }

    if (allowPendingCR && value.charCodeAt(value.length - 1) === 13) {
      this.pendingCR = true;
      value = value.slice(0, -1);
    }

    const normalized = !value.includes("\r") ? value : value.replace(CRLF_RE, "\n");
    return prefix ? `${prefix}${normalized}` : normalized;
  }

  private _advanceSpan(start: number, end: number): void {
    const length = end - start;
    this.offset += length;
    if (!this.trackPosition) {
      return;
    }

    let pos = this.buffer.indexOf("\n", start);
    if (pos === -1 || pos >= end) {
      this.column += length;
      return;
    }

    let newlineCount = 0;
    let lastNewline = -1;
    while (pos !== -1 && pos < end) {
      newlineCount += 1;
      lastNewline = pos;
      pos = this.buffer.indexOf("\n", pos + 1);
    }

    this.line += newlineCount;
    this.column = end - lastNewline;
  }

  private _flushPendingCR(): void {
    if (!this.pendingCR) {
      return;
    }
    this.pendingCR = false;
    this._emitDecodedText("\n");
  }

  private _error(message: string): never {
    const line = this.trackPosition ? this.line : 0;
    const column = this.trackPosition ? this.column : 0;
    const error = new XmlSaxError(message, this.offset, line, column);
    throw error;
  }

  private _position(): XmlPosition {
    return {
      offset: this.offset,
      line: this.trackPosition ? this.line : 0,
      column: this.trackPosition ? this.column : 0
    };
  }

  private _pushToken(token: XmlAnyToken): void {
    this.tokenQueue.push(token);
  }

  private _assertInternalState(stage: string): void {
    assert(this.pathStack.length === this.elementStack.length, `Path and element stack lengths diverged (${stage})`);
    if (!this.xmlns) {
      assert(this.nsStack.length === 1, `Namespace stack must stay at depth 1 in plain mode (${stage})`);
      return;
    }
    assert(
      this.nsStack.length === this.elementStack.length + 1,
      `Namespace stack depth must be element depth + 1 (${stage})`
    );
  }
}

export function tokenizeXml(xml: string, options: ParserOptions = {}): XmlAnyToken[] {
  const parser = new XmlSaxParser(options);
  const tokens = parser.feed(xml);
  return [...tokens, ...parser.close()];
}

export async function* tokenizeXmlAsync(
  chunks: Iterable<string> | AsyncIterable<string>,
  options: ParserOptions = {}
): AsyncGenerator<XmlAnyToken> {
  const parser = new XmlSaxParser(options);
  yield* parser.iterateChunks(chunks);
}
