import type { CloseTag, Doctype, OpenTag, ProcessingInstruction, XmlPosition } from "./types";

export type XmlTokenKind =
  | "open-tag"
  | "close-tag"
  | "text"
  | "cdata"
  | "comment"
  | "processing-instruction"
  | "doctype"
  | "end";

export abstract class XmlToken {
  readonly kind: XmlTokenKind;
  readonly position: XmlPosition | undefined;

  protected constructor(kind: XmlTokenKind, position?: XmlPosition) {
    this.kind = kind;
    this.position = position;
  }
}

export class OpenTagToken extends XmlToken {
  readonly tag: OpenTag;
  readonly depth: number;
  readonly path: readonly string[];

  constructor(tag: OpenTag, depth: number, path: readonly string[], position?: XmlPosition) {
    super("open-tag", position);
    this.tag = tag;
    this.depth = depth;
    this.path = path;
  }
}

export class CloseTagToken extends XmlToken {
  readonly tag: CloseTag;
  readonly depth: number;
  readonly path: readonly string[];

  constructor(tag: CloseTag, depth: number, path: readonly string[], position?: XmlPosition) {
    super("close-tag", position);
    this.tag = tag;
    this.depth = depth;
    this.path = path;
  }
}

export class TextToken extends XmlToken {
  readonly text: string;

  constructor(text: string, position?: XmlPosition) {
    super("text", position);
    this.text = text;
  }
}

export class CdataToken extends XmlToken {
  readonly text: string;

  constructor(text: string, position?: XmlPosition) {
    super("cdata", position);
    this.text = text;
  }
}

export class CommentToken extends XmlToken {
  readonly text: string;

  constructor(text: string, position?: XmlPosition) {
    super("comment", position);
    this.text = text;
  }
}

export class ProcessingInstructionToken extends XmlToken {
  readonly processingInstruction: ProcessingInstruction;

  constructor(processingInstruction: ProcessingInstruction, position?: XmlPosition) {
    super("processing-instruction", position);
    this.processingInstruction = processingInstruction;
  }
}

export class DoctypeToken extends XmlToken {
  readonly doctype: Doctype;

  constructor(doctype: Doctype, position?: XmlPosition) {
    super("doctype", position);
    this.doctype = doctype;
  }
}

export class EndToken extends XmlToken {
  constructor(position?: XmlPosition) {
    super("end", position);
  }
}

export type XmlAnyToken =
  | OpenTagToken
  | CloseTagToken
  | TextToken
  | CdataToken
  | CommentToken
  | ProcessingInstructionToken
  | DoctypeToken
  | EndToken;
