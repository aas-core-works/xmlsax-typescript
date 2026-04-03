import { describe, expect, it } from "vitest";
import {
  CdataToken,
  CloseTagToken,
  OpenTagToken,
  ObjectBuilder,
  TextToken,
  XmlSaxParser,
  buildObject,
  buildXmlNode,
  objectToXml,
  parseXmlString,
  resolveName,
  serializeXml,
  stripNamespace
} from "../src/index";

describe("buildObject", () => {
  it("projects attributes and text", () => {
    const root = parseXmlString("<root id='1'>Hello</root>");
    const obj = buildObject(root);

    expect(obj).toEqual({ "@_id": "1", "#text": "Hello" });
  });

  it("coalesces repeated elements into arrays", () => {
    const root = parseXmlString("<root><item>1</item><item>2</item></root>");
    const obj = buildObject(root);

    expect(obj).toEqual({ item: ["1", "2"] });
  });

  it("supports forced array elements", () => {
    const root = parseXmlString("<root><item>1</item></root>");
    const obj = buildObject(root, { arrayElements: new Set(["item"]) });

    expect(obj).toEqual({ item: ["1"] });
  });

  it("supports arrayElements callback with parent path", () => {
    const root = parseXmlString("<root><group><item>1</item></group></root>");
    const seenPaths: string[] = [];
    const obj = buildObject(root, {
      arrayElements: (name, path) => {
        seenPaths.push(`${path.join("/")}->${name}`);
        return path.join("/") === "root/group" && name === "item";
      }
    });

    expect(obj).toEqual({ group: { item: ["1"] } });
    expect(seenPaths).toContain("root/group->item");
  });

  it("handles mixed content and namespaces", () => {
    const xml = "<p:root xmlns:p='urn:p'>Hi <p:child>there</p:child>!</p:root>";
    const root = parseXmlString(xml);
    const obj = buildObject(root, { stripNamespaces: true });

    expect(obj).toEqual({ child: "there", "#text": "Hi !" });
  });
});

describe("ObjectBuilder", () => {
  it("builds the same shape while streaming", () => {
    const builder = new ObjectBuilder();
    const parser = new XmlSaxParser();

    const consume = (token: unknown): void => {
      if (
        token instanceof OpenTagToken ||
        token instanceof TextToken ||
        token instanceof CdataToken ||
        token instanceof CloseTagToken
      ) {
        builder.consume(token);
      }
    };

    for (const token of parser.feed("<root><item>1</item>")) consume(token);
    for (const token of parser.feed("<item>2</item></root>")) consume(token);
    for (const token of parser.close()) consume(token);

    expect(builder.getResult()).toEqual({ item: ["1", "2"] });
    expect(builder.getRootName()).toBe("root");
  });
});

describe("stripNamespace", () => {
  it("returns local names", () => {
    expect(stripNamespace("p:node")).toBe("node");
    expect(stripNamespace("node")).toBe("node");
  });
});

describe("resolveName", () => {
  it("resolves raw names", () => {
    expect(resolveName("p:node")).toEqual({
      name: "p:node",
      localName: "node",
      prefix: "p",
      uri: ""
    });
    expect(resolveName("node")).toEqual({
      name: "node",
      localName: "node",
      prefix: "",
      uri: ""
    });
  });

  it("resolves tag-like values", () => {
    expect(resolveName({ name: "p:node", prefix: "p", local: "node", uri: "urn:p" })).toEqual({
      name: "p:node",
      localName: "node",
      prefix: "p",
      uri: "urn:p"
    });
  });
});

describe("buildXmlNode", () => {
  it("maps attributes and text", () => {
    const node = buildXmlNode({ root: { "@_id": "1", "#text": "Hello" } });

    expect(serializeXml(node)).toBe("<root id=\"1\">Hello</root>");
  });

  it("creates repeated elements from arrays", () => {
    const node = buildXmlNode({ root: { item: ["1", "2"] } });

    expect(serializeXml(node)).toBe("<root><item>1</item><item>2</item></root>");
  });

  it("supports mixed content arrays", () => {
    const node = buildXmlNode({ root: ["Hi ", { child: "there" }, "!"] });

    expect(serializeXml(node)).toBe("<root>Hi <child>there</child>!</root>");
  });

  it("strips namespaces when requested", () => {
    const node = buildXmlNode(
      { "p:root": { "@_p:id": "1", "p:child": "value" } },
      { stripNamespaces: true }
    );

    expect(serializeXml(node)).toBe("<root id=\"1\"><child>value</child></root>");
  });

  it("uses rootName when object has multiple keys", () => {
    const node = buildXmlNode({ a: "1", b: "2" }, { rootName: "root" });

    expect(serializeXml(node)).toBe("<root><a>1</a><b>2</b></root>");
  });
});

describe("objectToXml", () => {
  it("serializes via buildXmlNode", () => {
    const xml = objectToXml({ root: { item: ["1", "2"] } });

    expect(xml).toBe("<root><item>1</item><item>2</item></root>");
  });
});
