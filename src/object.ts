import { XmlSaxBuildError } from "./errors";
import { serializeXml } from "./serializer";
import { CdataToken, OpenTagToken, TextToken } from "./tokens";
import type { CloseTagToken } from "./tokens";
import type {
  ObjectBuilderOptions,
  ObjectToXmlOptions,
  OpenTag,
  XmlAttribute,
  XmlBuilderOptions,
  XmlInputObject,
  XmlInputValue,
  XmlNode,
  XmlObjectMap,
  XmlObjectValue
} from "./types";

interface ElementState {
  name: string;
  attributes: Record<string, string>;
  textParts: string[];
  children: Record<string, XmlObjectValue | XmlObjectValue[]>;
}

const DEFAULT_OBJECT_OPTIONS: Required<Omit<ObjectBuilderOptions, "arrayElements">> = {
  attributePrefix: "@_",
  textKey: "#text",
  stripNamespaces: false,
  coalesceText: true
};

type ObjectBuilderSettings = Required<Omit<ObjectBuilderOptions, "arrayElements">> &
  Pick<ObjectBuilderOptions, "arrayElements">;

type XmlBuilderSettings = Required<Omit<XmlBuilderOptions, "arrayElements" | "rootName">> &
  Pick<XmlBuilderOptions, "arrayElements" | "rootName">;

type ArrayRuleSettings = Pick<ObjectBuilderOptions, "arrayElements">;

export function stripNamespace(name: string): string {
  const index = name.indexOf(":");
  if (index === -1) {
    return name;
  }
  return name.slice(index + 1);
}

export function resolveName(
  value: string | Pick<OpenTag, "name" | "prefix" | "local" | "uri">
): { name: string; localName: string; prefix: string; uri: string } {
  if (typeof value !== "string") {
    const prefix = value.prefix ?? "";
    const local = value.local ?? (prefix ? value.name.slice(prefix.length + 1) : value.name);
    return {
      name: value.name,
      localName: local,
      prefix,
      uri: value.uri ?? ""
    };
  }

  const index = value.indexOf(":");
  if (index === -1) {
    return { name: value, localName: value, prefix: "", uri: "" };
  }

  return {
    name: value,
    localName: value.slice(index + 1),
    prefix: value.slice(0, index),
    uri: ""
  };
}

export function buildObject(root: XmlNode, options: ObjectBuilderOptions = {}): XmlObjectValue {
  const settings = buildSettings(options);
  return buildNode(root, settings, []);
}

export function buildXmlNode(obj: XmlInputValue, options: XmlBuilderOptions = {}): XmlNode {
  const settings = buildXmlSettings(options);
  const root = resolveRoot(obj, settings);
  const rootName = normalizeName(root.name, settings);
  return buildElement(rootName, root.value, settings, []);
}

export function objectToXml(obj: XmlInputValue, options: ObjectToXmlOptions = {}): string {
  const node = buildXmlNode(obj, options);
  return serializeXml(node, options);
}

export class ObjectBuilder {
  private options: ObjectBuilderSettings;
  private stack: ElementState[] = [];
  private root: XmlObjectValue | null = null;
  private rootName: string | null = null;

  constructor(options: ObjectBuilderOptions = {}) {
    this.options = buildSettings(options);
  }

  onOpenTag(tag: OpenTag): void {
    if (this.stack.length === 0 && this.root !== null) {
      throw new XmlSaxBuildError("Multiple root elements are not supported", "object");
    }

    const name = normalizeName(tag.name, this.options);
    const attributes = normalizeAttributes(tag.attributes, this.options);
    const state: ElementState = {
      name,
      attributes,
      textParts: [],
      children: Object.create(null) as Record<string, XmlObjectValue | XmlObjectValue[]>
    };

    this.rootName ??= name;

    this.stack.push(state);
  }

  onText(text: string): void {
    if (!text) {
      return;
    }
    const current = this.stack[this.stack.length - 1];
    if (!current) {
      return;
    }
    current.textParts.push(text);
  }

  onCdata(text: string): void {
    this.onText(text);
  }

  onCloseTag(): void {
    const state = this.stack.pop();
    if (!state) {
      throw new XmlSaxBuildError("Closing tag without matching open tag", "object");
    }

    const value = finalizeElement(state, this.options);
    const parent = this.stack[this.stack.length - 1];

    if (!parent) {
      this.root = value;
      return;
    }

    addChild(parent.children, state.name, value, this.options, () => this.stack.map((entry) => entry.name));
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

  getResult(): XmlObjectValue {
    if (this.root === null) {
      throw new XmlSaxBuildError("No root element found", "object");
    }
    return this.root;
  }

  getRootName(): string {
    if (!this.rootName) {
      throw new XmlSaxBuildError("No root element found", "object");
    }
    return this.rootName;
  }
}

function buildSettings(options: ObjectBuilderOptions): ObjectBuilderSettings {
  return { ...DEFAULT_OBJECT_OPTIONS, ...options };
}

function buildXmlSettings(options: XmlBuilderOptions): XmlBuilderSettings {
  return { ...DEFAULT_OBJECT_OPTIONS, ...options };
}

function buildNode(node: XmlNode, options: ObjectBuilderSettings, path: string[]): XmlObjectValue {
  const name = normalizeName(node.name, options);
  const nextPath = [...path, name];
  const attributes = normalizeAttributeMap(node.attributes ?? {}, options);
  const state: ElementState = {
    name,
    attributes,
    textParts: [],
    children: Object.create(null) as Record<string, XmlObjectValue | XmlObjectValue[]>
  };

  const children = node.children ?? [];
  for (const child of children) {
    if (typeof child === "string") {
      if (child) {
        state.textParts.push(child);
      }
      continue;
    }

    const value = buildNode(child, options, nextPath);
    const childName = normalizeName(child.name, options);
    addChild(state.children, childName, value, options, () => nextPath.slice());
  }

  return finalizeElement(state, options);
}

function normalizeName(name: string, options: ObjectBuilderSettings): string {
  if (options.stripNamespaces) {
    return stripNamespace(name);
  }
  return name;
}

function normalizeXmlName(name: string, options: XmlBuilderSettings): string {
  if (options.stripNamespaces) {
    return stripNamespace(name);
  }
  return name;
}

function normalizeAttributes(
  attributes: Record<string, XmlAttribute | string>,
  options: ObjectBuilderSettings
): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, attr] of Object.entries(attributes)) {
    const name = normalizeName(key, options);
    result[name] = typeof attr === "string" ? attr : attr.value;
  }
  return result;
}

function normalizeAttributeMap(
  attributes: Record<string, string>,
  options: ObjectBuilderSettings
): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(attributes)) {
    const name = normalizeName(key, options);
    result[name] = value;
  }
  return result;
}

function addChild(
  target: Record<string, XmlObjectValue | XmlObjectValue[]>,
  name: string,
  value: XmlObjectValue,
  options: ObjectBuilderSettings,
  path: string[] | (() => string[])
): void {
  const forcedArray = shouldForceArray(name, path, options);
  const existing = target[name];

  if (existing === undefined) {
    target[name] = forcedArray ? [value] : value;
    return;
  }

  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }

  target[name] = [existing, value];
}

function shouldForceArray(
  name: string,
  path: string[] | (() => string[]),
  options: ArrayRuleSettings
): boolean {
  const rule = options.arrayElements;
  if (!rule) {
    return false;
  }
  if (rule instanceof Set) {
    return rule.has(name);
  }
  return rule(name, typeof path === "function" ? path() : path);
}

function resolveRoot(obj: XmlInputValue, options: XmlBuilderSettings): { name: string; value: XmlInputValue } {
  if (isRecord(obj)) {
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const name = keys[0] ?? "";
      return { name, value: obj[name] };
    }
  }

  if (!options.rootName) {
    throw new XmlSaxBuildError("Root element name is required when object has multiple keys", "xml-builder");
  }

  return { name: options.rootName, value: obj };
}

function buildElement(
  name: string,
  value: XmlInputValue,
  options: XmlBuilderSettings,
  path: string[]
): XmlNode {
  const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
  const children: (XmlNode | string)[] = [];
  const nextPath = [...path, name];

  if (Array.isArray(value)) {
    for (const item of value) {
      appendContent(children, item, options, nextPath);
    }
    return finalizeNode(name, attributes, children);
  }

  if (isPrimitive(value)) {
    const text = coerceText(value);
    if (text !== null) {
      children.push(text);
    }
    return finalizeNode(name, attributes, children);
  }

  if (isRecord(value)) {
    for (const [key, entryValue] of Object.entries(value)) {
      if (isAttributeKey(key, options)) {
        const attrName = normalizeXmlName(key.slice(options.attributePrefix.length), options);
        const attrValue = coerceText(entryValue);
        if (attrValue !== null) {
          attributes[attrName] = attrValue;
        }
        continue;
      }

      if (key === options.textKey) {
        appendText(children, entryValue, options);
        continue;
      }

      const childName = normalizeXmlName(key, options);
      addChildElements(children, childName, entryValue, options, nextPath);
    }
  }

  return finalizeNode(name, attributes, children);
}

function addChildElements(
  children: (XmlNode | string)[],
  name: string,
  value: XmlInputValue,
  options: XmlBuilderSettings,
  path: string[]
): void {
  shouldForceArray(name, path, options);
  const items = Array.isArray(value) ? value : [value];

  for (const item of items) {
    if (item === undefined || item === null) {
      children.push({ name });
      continue;
    }
    children.push(buildElement(name, item, options, path));
  }
}

function appendContent(
  children: (XmlNode | string)[],
  value: XmlInputValue,
  options: XmlBuilderSettings,
  path: string[]
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendContent(children, item, options, path);
    }
    return;
  }

  if (isPrimitive(value)) {
    const text = coerceText(value);
    if (text !== null) {
      children.push(text);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, entryValue] of Object.entries(value)) {
      const childName = normalizeXmlName(key, options);
      addChildElements(children, childName, entryValue, options, path);
    }
  }
}

function appendText(
  children: (XmlNode | string)[],
  value: XmlInputValue,
  options: XmlBuilderSettings
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => coerceText(item))
      .filter((item): item is string => item !== null);
    if (parts.length === 0) {
      return;
    }
    if (options.coalesceText) {
      children.push(parts.join(""));
      return;
    }
    for (const part of parts) {
      children.push(part);
    }
    return;
  }

  const text = coerceText(value);
  if (text !== null) {
    children.push(text);
  }
}

function finalizeNode(
  name: string,
  attributes: Record<string, string>,
  children: (XmlNode | string)[]
): XmlNode {
  const node: XmlNode = { name };
  if (Object.keys(attributes).length > 0) {
    node.attributes = attributes;
  }
  if (children.length > 0) {
    node.children = children;
  }
  return node;
}

function isAttributeKey(key: string, options: XmlBuilderSettings): boolean {
  if (!options.attributePrefix) {
    return false;
  }
  return key.startsWith(options.attributePrefix) && key.length > options.attributePrefix.length;
}

function isRecord(value: XmlInputValue): value is XmlInputObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: XmlInputValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function coerceText(value: XmlInputValue): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function finalizeElement(state: ElementState, options: ObjectBuilderSettings): XmlObjectValue {
  const hasAttributes = Object.keys(state.attributes).length > 0;
  const hasChildren = Object.keys(state.children).length > 0;
  const hasText = state.textParts.length > 0;

  const textValue = options.coalesceText
    ? state.textParts.join("")
    : state.textParts.length <= 1
      ? state.textParts[0] ?? ""
      : state.textParts.slice();

  if (!hasAttributes && !hasChildren) {
    if (!hasText) {
      return "";
    }
    return textValue as XmlObjectValue;
  }

  const result: XmlObjectMap = Object.create(null) as XmlObjectMap;

  for (const [key, value] of Object.entries(state.attributes)) {
    result[`${options.attributePrefix}${key}`] = value;
  }

  for (const [key, value] of Object.entries(state.children)) {
    result[key] = value;
  }

  if (hasText) {
    result[options.textKey] = textValue as XmlObjectValue;
  }

  return result;
}
