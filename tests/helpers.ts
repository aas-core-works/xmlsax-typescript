import {
  CdataToken,
  CloseTagToken,
  CommentToken,
  DoctypeToken,
  OpenTagToken,
  ProcessingInstructionToken,
  TextToken,
  dispatchToken,
  XmlSaxParser
} from "../src/index";
import type { OpenTag } from "../src/types";

export function getAttrValue(tag: Pick<OpenTag, "attributes">, name: string): string {
  const attr = tag.attributes[name];
  if (attr === undefined) {
    return "";
  }
  return typeof attr === "string" ? attr : attr.value;
}

export function getAttrUri(tag: Pick<OpenTag, "attributes">, name: string): string {
  const attr = tag.attributes[name];
  if (attr === undefined || typeof attr === "string") {
    return "";
  }
  return attr.uri;
}

export function collectEventsFromChunks(chunks: string[]): string[] {
  const events: string[] = [];
  const parser = new XmlSaxParser();

  for (const chunk of chunks) {
    for (const token of parser.feed(chunk)) {
      pushEvent(events, token);
    }
  }
  for (const token of parser.close()) {
    pushEvent(events, token);
  }

  return events;
}

export function collectTokensFromChunks(chunks: string[], xmlns = true): ReturnType<XmlSaxParser["drainTokens"]> {
  const parser = new XmlSaxParser({ xmlns });
  const tokens: ReturnType<XmlSaxParser["drainTokens"]> = [];
  for (const chunk of chunks) {
    tokens.push(...parser.feed(chunk));
  }
  tokens.push(...parser.close());
  return tokens;
}

function pushEvent(events: string[], token: unknown): void {
  if (
    !(token instanceof OpenTagToken) &&
    !(token instanceof CloseTagToken) &&
    !(token instanceof TextToken) &&
    !(token instanceof CdataToken) &&
    !(token instanceof ProcessingInstructionToken) &&
    !(token instanceof DoctypeToken) &&
    !(token instanceof CommentToken)
  ) {
    return;
  }

  dispatchToken(token, {
    openTag: (openTagToken) => {
      events.push(`open:${openTagToken.tag.name}`);
    },
    closeTag: (closeTagToken) => {
      events.push(`close:${closeTagToken.tag.name}`);
    },
    text: (textToken) => {
      const text = textToken.text;
      if (!text) {
        return;
      }
      const last = events[events.length - 1];
      if (last?.startsWith("text:")) {
        events[events.length - 1] = `text:${last.slice(5)}${text}`;
        return;
      }
      events.push(`text:${text}`);
    },
    cdata: (cdataToken) => {
      events.push(`cdata:${cdataToken.text}`);
    },
    processingInstruction: (piToken) => {
      events.push(`pi:${piToken.processingInstruction.target}:${piToken.processingInstruction.body}`);
    },
    doctype: (doctypeToken) => {
      events.push(`doctype:${doctypeToken.doctype.raw}`);
    },
    comment: (commentToken) => {
      events.push(`comment:${commentToken.text}`);
    }
  });
}

export function collectEvents(xml: string, chunkSize?: number): string[] {
  if (!chunkSize || chunkSize <= 0) {
    return collectEventsFromChunks([xml]);
  }

  const chunks: string[] = [];
  for (let i = 0; i < xml.length; i += chunkSize) {
    chunks.push(xml.slice(i, i + chunkSize));
  }

  return collectEventsFromChunks(chunks);
}

export function chunkBySizes(input: string, sizes: number[]): string[] {
  const chunks: string[] = [];
  let offset = 0;

  for (const size of sizes) {
    const safeSize = Math.max(0, size);
    if (safeSize === 0) {
      continue;
    }
    if (offset >= input.length) {
      break;
    }
    chunks.push(input.slice(offset, offset + safeSize));
    offset += safeSize;
  }

  if (offset < input.length) {
    chunks.push(input.slice(offset));
  }

  return chunks;
}
