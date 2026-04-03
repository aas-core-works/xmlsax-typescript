import { isBuildToken } from "./dispatch";
import { XmlSaxBuildError } from "./errors";
import { XmlSaxParser } from "./parser";
import { CdataToken, OpenTagToken, TextToken } from "./tokens";
import type { CloseTagToken } from "./tokens";
import type { ParserOptions, XmlNode } from "./types";

export class TreeBuilder {
  private stack: XmlNode[] = [];
  private root: XmlNode | null = null;

  onOpenTag(tag: { name: string; attributes: Record<string, { value: string } | string> }): void {
    if (this.stack.length === 0 && this.root !== null) {
      throw new XmlSaxBuildError("Multiple root elements are not supported", "tree");
    }

    const node: XmlNode = {
      name: tag.name,
      attributes: Object.fromEntries(
        Object.entries(tag.attributes).map(([key, attr]) => [key, typeof attr === "string" ? attr : attr.value])
      ),
      children: []
    };

    const parent = this.stack[this.stack.length - 1];
    if (parent) {
      parent.children?.push(node);
    } else {
      this.root = node;
    }

    this.stack.push(node);
  }

  onText(text: string): void {
    if (!this.stack.length) {
      return;
    }
    const node = this.stack[this.stack.length - 1];
    if (!node) {
      return;
    }
    const children = node.children ?? [];
    const last = children[children.length - 1];
    if (typeof last === "string") {
      children[children.length - 1] = last + text;
    } else {
      children.push(text);
    }
    node.children = children;
  }

  onCdata(text: string): void {
    this.onText(text);
  }

  onCloseTag(): void {
    if (this.stack.length === 0) {
      throw new XmlSaxBuildError("Closing tag without matching open tag", "tree");
    }
    this.stack.pop();
  }

  consume(token: OpenTagToken | TextToken | CdataToken | CloseTagToken): void {
    if (token instanceof OpenTagToken) {
      this.onOpenTag(token.tag);
      return;
    }
    if (token instanceof TextToken) {
      this.onText(token.text);
      return;
    }
    if (token instanceof CdataToken) {
      this.onCdata(token.text);
      return;
    }
    this.onCloseTag();
  }

  getRoot(): XmlNode {
    if (!this.root) {
      throw new XmlSaxBuildError("No root element found", "tree");
    }
    return this.root;
  }
}

export function parseXmlString(xml: string, options: ParserOptions = {}): XmlNode {
  const builder = new TreeBuilder();
  const parser = new XmlSaxParser(options);
  for (const token of parser.feed(xml)) {
    if (isBuildToken(token)) {
      builder.consume(token);
    }
  }
  for (const token of parser.close()) {
    if (isBuildToken(token)) {
      builder.consume(token);
    }
  }
  return builder.getRoot();
}
