export interface XmlPosition {
  offset: number;
  line: number;
  column: number;
}

export interface XmlAttribute {
  name: string;
  value: string;
  prefix: string;
  local: string;
  uri: string;
}

export interface OpenTag {
  name: string;
  prefix?: string;
  local?: string;
  uri?: string;
  attributes: Record<string, XmlAttribute | string>;
  isSelfClosing: boolean;
}

export interface CloseTag {
  name: string;
  prefix?: string;
  local?: string;
  uri?: string;
}

export interface ProcessingInstruction {
  target: string;
  body: string;
}

export interface Doctype {
  raw: string;
}

export interface ParserOptions {
  xmlns?: boolean;
  includeNamespaceAttributes?: boolean;
  allowDoctype?: boolean;
  coalesceText?: boolean;
  trackPosition?: boolean;
}

export type XmlChunkIterable = Iterable<string> | AsyncIterable<string>;

export type XmlChild = XmlNode | string;

export interface XmlNode {
  name: string;
  attributes?: Record<string, string>;
  children?: XmlChild[];
}

export interface SerializeOptions {
  xmlDeclaration?: boolean;
  pretty?: boolean;
  indent?: string;
  newline?: string;
}

export type ArrayElementSelector = Set<string> | ((name: string, path: string[]) => boolean);

export interface ObjectBuilderOptions {
  attributePrefix?: string;
  textKey?: string;
  stripNamespaces?: boolean;
  arrayElements?: ArrayElementSelector;
  coalesceText?: boolean;
}

export interface XmlBuilderOptions extends ObjectBuilderOptions {
  rootName?: string;
}

export type XmlObjectValue = string | XmlObjectMap | XmlObjectValue[];

export interface XmlObjectMap {
  [key: string]: XmlObjectValue;
}

export type XmlInputValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | XmlInputObject
  | XmlInputValue[];

export interface XmlInputObject {
  [key: string]: XmlInputValue;
}

export interface ObjectToXmlOptions extends XmlBuilderOptions, SerializeOptions {}
