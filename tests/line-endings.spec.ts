import { describe, expect, it } from "vitest";
import { OpenTagToken, TextToken, XmlSaxParser } from "../src/index";
import { getAttrValue } from "./helpers";

describe("line ending normalization", () => {
  it("normalizes CRLF and CR in text across chunks", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser();

    for (const token of parser.feed("<root>hi\r")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("\nthere\r")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("ok</root>")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.close()) {
      if (token instanceof TextToken) texts.push(token.text);
    }

    expect(texts.join("")).toBe("hi\nthere\nok");
  });

  it("normalizes line endings in attribute values", () => {
    let value = "";
    const parser = new XmlSaxParser();

    for (const token of parser.feed("<root a='x\r\ny\rz'/>")) {
      if (token instanceof OpenTagToken) {
        value = getAttrValue(token.tag, "a");
      }
    }
    parser.close();

    expect(value).toBe("x\ny\nz");
  });

  it("normalizes CRLF and CR with coalesced text", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({ coalesceText: true });

    for (const token of parser.feed("<root>hi\r")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("\nthere\r")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("ok</root>")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.close()) {
      if (token instanceof TextToken) texts.push(token.text);
    }

    expect(texts).toEqual(["hi\nthere\nok"]);
  });
});
