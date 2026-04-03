export class XmlSaxLibraryError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "XmlSaxLibraryError";
    this.code = code;
  }
}

export class XmlSaxError extends Error {
  readonly offset: number;
  readonly line: number;
  readonly column: number;

  constructor(message: string, offset: number, line: number, column: number) {
    super(`${message} at ${line}:${column}`);
    this.name = "XmlSaxError";
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

export class XmlSaxBuildError extends XmlSaxLibraryError {
  readonly phase: "tree" | "object" | "xml-builder";

  constructor(message: string, phase: "tree" | "object" | "xml-builder") {
    super(message, "XMLSAX_BUILD_ERROR");
    this.name = "XmlSaxBuildError";
    this.phase = phase;
  }
}

export class XmlSaxInvariantError extends XmlSaxLibraryError {
  constructor(message: string) {
    super(message, "XMLSAX_INVARIANT_ERROR");
    this.name = "XmlSaxInvariantError";
  }
}
