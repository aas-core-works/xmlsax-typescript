import { describe, expect, it } from "vitest";
import { CloseTagToken, OpenTagToken, TextToken, XmlSaxBuildError, XmlSaxParser, parseXmlString } from "../src/index";
import { collectEvents, collectTokensFromChunks, getAttrUri } from "./helpers";

describe("XmlSaxParser", () => {
  it("parses simple tags", () => {
    expect(collectEvents("<root>Hello</root>")).toEqual(["open:root", "text:Hello", "close:root"]);
  });

  it("handles namespaces and attributes", () => {
    const tokens = collectTokensFromChunks(["<a xmlns='urn:a' xmlns:p='urn:p' p:id='1'><p:b/></a>"]);
    const openTags = tokens.filter((token): token is OpenTagToken => token instanceof OpenTagToken);
    const seen = openTags.map((token) => ({ name: token.tag.name, uri: token.tag.uri ?? "" }));
    const root = openTags[0];
    expect(root).toBeDefined();
    if (root) {
      expect(getAttrUri(root.tag, "p:id")).toBe("urn:p");
    }

    expect(seen).toEqual([
      { name: "a", uri: "urn:a" },
      { name: "p:b", uri: "urn:p" }
    ]);
  });

  it("emits plain-mode attributes as strings", () => {
    const tokens = collectTokensFromChunks(["<a x='1'/>"], false);
    const open = tokens.find((token): token is OpenTagToken => token instanceof OpenTagToken);
    const close = tokens.find((token): token is CloseTagToken => token instanceof CloseTagToken);
    const seenOpen: { attr: string; hasPrefix: boolean; hasLocal: boolean; hasUri: boolean }[] = [];
    const seenClose: { hasPrefix: boolean; hasLocal: boolean; hasUri: boolean }[] = [];

    if (open?.tag.name === "a") {
      seenOpen.push({
        attr: typeof open.tag.attributes.x === "string" ? open.tag.attributes.x : "",
        hasPrefix: "prefix" in open.tag,
        hasLocal: "local" in open.tag,
        hasUri: "uri" in open.tag
      });
    }

    if (close?.tag.name === "a") {
      seenClose.push({
        hasPrefix: "prefix" in close.tag,
        hasLocal: "local" in close.tag,
        hasUri: "uri" in close.tag
      });
    }

    expect(seenOpen).toEqual([{ attr: "1", hasPrefix: false, hasLocal: false, hasUri: false }]);
    expect(seenClose).toEqual([{ hasPrefix: false, hasLocal: false, hasUri: false }]);
  });

  it("parses cdata and entities", () => {
    expect(collectEvents("<root><![CDATA[<x>]]>&lt;</root>")).toEqual(["open:root", "cdata:<x>", "text:<", "close:root"]);
  });

  it("parses doctype and processing instructions", () => {
    const tokens = collectTokensFromChunks(["<?xml version='1.0'?><!DOCTYPE root><root/>"]);
    const firstPi = tokens.find((token) => token.kind === "processing-instruction");
    const firstDoctype = tokens.find((token) => token.kind === "doctype");
    expect(firstPi?.kind).toBe("processing-instruction");
    expect(firstDoctype?.kind).toBe("doctype");
  });

  it("supports streaming chunks", () => {
    expect(collectEvents("<root><a>hi</a></root>", 5)).toEqual(["open:root", "open:a", "text:hi", "close:a", "close:root"]);
  });

  it("coalesces adjacent text by default", () => {
    const parser = new XmlSaxParser();
    const texts: string[] = [];
    for (const token of parser.feed("<root>a")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("b")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("c</root>")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.close()) {
      if (token instanceof TextToken) texts.push(token.text);
    }

    expect(texts).toEqual(["abc"]);
  });

  it("coalesces adjacent text but still flushes at tag boundaries", () => {
    const texts = collectTokensFromChunks(["<root>a<b/>c</root>"])
      .filter((token): token is TextToken => token instanceof TextToken)
      .map((token) => token.text);

    expect(texts).toEqual(["a", "c"]);
  });

  it("supports self-closing tags with surrounding whitespace", () => {
    const tokens = collectTokensFromChunks(["<root><a x='1' /></root>"]);
    const events = tokens.flatMap((token) => {
      if (token instanceof OpenTagToken) {
        return [`open:${token.tag.name}:${String(token.tag.isSelfClosing)}`];
      }
      if (token instanceof CloseTagToken) {
        return [`close:${token.tag.name}`];
      }
      return [];
    });
    expect(events).toEqual(["open:root:false", "open:a:true", "close:a", "close:root"]);
  });

  it("rejects invalid self-closing syntax", () => {
    const parser = new XmlSaxParser();
    expect(() => {
      parser.feed("<root><a / x='1'></a></root>");
      parser.close();
    }).toThrow();
  });
});

describe("parseXmlString", () => {
  it("builds a tree", () => {
    const root = parseXmlString("<root><a>1</a><b/></root>");
    expect(root.name).toBe("root");
    expect(root.children?.length).toBe(2);
  });

  it("rejects multiple top-level roots", () => {
    expect(() => parseXmlString("<a/><b/>"))
      .toThrow(XmlSaxBuildError);
  });
});
