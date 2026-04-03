import type { SerializeOptions, XmlChild, XmlNode } from "./types";

const DEFAULT_OPTIONS: Required<Pick<SerializeOptions, "pretty" | "indent" | "newline" | "xmlDeclaration">> = {
  pretty: false,
  indent: "  ",
  newline: "\n",
  xmlDeclaration: false
};

export function serializeXml(node: XmlNode, options: SerializeOptions = {}): string {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  let body = serializeNode(node, settings, 0);
  if (settings.pretty && !body.endsWith(settings.newline)) {
    body = `${body}${settings.newline}`;
  }
  if (!settings.xmlDeclaration) {
    return body;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>${settings.newline}${body}`;
}

function serializeNode(node: XmlNode, options: Required<SerializeOptions>, depth: number): string {
  const attrs = serializeAttributes(node.attributes);
  const tagOpen = `<${node.name}${attrs}>`;
  const tagClose = `</${node.name}>`;

  const children = node.children ?? [];
  if (!children.length) {
    if (!options.pretty) {
      return `<${node.name}${attrs}/>`;
    }
    const indent = options.indent.repeat(depth);
    return `${indent}<${node.name}${attrs}/>`;
  }

  if (!options.pretty) {
    const inner = children.map((child) => serializeChild(child, options, depth + 1)).join("");
    return `${tagOpen}${inner}${tagClose}`;
  }

  const indent = options.indent.repeat(depth);
  const hasOnlyTextChildren = children.every((child) => typeof child === "string");
  if (hasOnlyTextChildren) {
    const inlineText = children.map((child) => escapeText(child)).join("");
    return `${indent}${tagOpen}${inlineText}${tagClose}`;
  }
  const innerIndent = options.indent.repeat(depth + 1);
  const prettyOpen = `${indent}${tagOpen}`;
  const prettyClose = `${indent}${tagClose}`;
  const inner = children
    .map((child) =>
      typeof child === "string"
        ? `${innerIndent}${escapeText(child)}`
        : serializeNode(child, options, depth + 1)
    )
    .join(options.newline);

  return `${prettyOpen}${options.newline}${inner}${options.newline}${prettyClose}`;
}

function serializeChild(child: XmlChild, options: Required<SerializeOptions>, depth: number): string {
  if (typeof child === "string") {
    return escapeText(child);
  }
  return serializeNode(child, options, depth);
}

function serializeAttributes(attrs?: Record<string, string>): string {
  if (!attrs) {
    return "";
  }
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join("");
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
