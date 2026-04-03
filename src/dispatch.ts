import type { XmlAnyToken } from "./tokens";
import { CdataToken, CloseTagToken, CommentToken, DoctypeToken, EndToken, OpenTagToken, ProcessingInstructionToken, TextToken } from "./tokens";

export type XmlBuildToken = OpenTagToken | CloseTagToken | TextToken | CdataToken;

export interface XmlTokenHandlers<TResult = void> {
  openTag?: (token: OpenTagToken) => TResult;
  closeTag?: (token: CloseTagToken) => TResult;
  text?: (token: TextToken) => TResult;
  cdata?: (token: CdataToken) => TResult;
  comment?: (token: CommentToken) => TResult;
  processingInstruction?: (token: ProcessingInstructionToken) => TResult;
  doctype?: (token: DoctypeToken) => TResult;
  end?: (token: EndToken) => TResult;
  otherwise?: (token: XmlAnyToken) => TResult;
}

export function dispatchToken<TResult = void>(
  token: XmlAnyToken,
  handlers: XmlTokenHandlers<TResult>
): TResult | undefined {
  if (token instanceof OpenTagToken) {
    return handlers.openTag ? handlers.openTag(token) : handlers.otherwise?.(token);
  }
  if (token instanceof CloseTagToken) {
    return handlers.closeTag ? handlers.closeTag(token) : handlers.otherwise?.(token);
  }
  if (token instanceof TextToken) {
    return handlers.text ? handlers.text(token) : handlers.otherwise?.(token);
  }
  if (token instanceof CdataToken) {
    return handlers.cdata ? handlers.cdata(token) : handlers.otherwise?.(token);
  }
  if (token instanceof CommentToken) {
    return handlers.comment ? handlers.comment(token) : handlers.otherwise?.(token);
  }
  if (token instanceof ProcessingInstructionToken) {
    return handlers.processingInstruction
      ? handlers.processingInstruction(token)
      : handlers.otherwise?.(token);
  }
  if (token instanceof DoctypeToken) {
    return handlers.doctype ? handlers.doctype(token) : handlers.otherwise?.(token);
  }
  if (token instanceof EndToken) {
    return handlers.end ? handlers.end(token) : handlers.otherwise?.(token);
  }

  return handlers.otherwise?.(token);
}

export function isBuildToken(token: XmlAnyToken): token is XmlBuildToken {
  switch (token.kind) {
    case "open-tag":
    case "close-tag":
    case "text":
    case "cdata":
      return true;
    default:
      return false;
  }
}
