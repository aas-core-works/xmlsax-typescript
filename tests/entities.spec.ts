import { describe, expect, it } from "vitest";
import { OpenTagToken, TextToken, XmlSaxError, XmlSaxParser } from "../src/index";
import { getAttrValue } from "./helpers";

function captureError(run: () => void): XmlSaxError {
  try {
    run();
  } catch (err) {
    return err as XmlSaxError;
  }
  throw new Error("Expected XmlSaxError to be thrown");
}

describe("entities", () => {
  it("decodes entities in text and attributes", () => {
    let text = "";
    let attr = "";

    const parser = new XmlSaxParser();

    for (const token of parser.feed("<root a='&lt; &amp; &#x41; &#65;'>&lt;&amp;&#x41;&#65;</root>")) {
      if (token instanceof TextToken) {
        text += token.text;
      }
      if (token instanceof OpenTagToken) {
        attr = getAttrValue(token.tag, "a");
      }
    }
    parser.close();

    expect(text).toBe("<&AA");
    expect(attr).toBe("< & A A");
  });

  it("throws on unknown entity", () => {
    const parser = new XmlSaxParser();

    const error = captureError(() => {
      parser.feed("<root>&bogus;</root>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("throws on invalid numeric entities", () => {
    const outOfRange = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#x110000;</root>");
      parser.close();
    });

    const surrogate = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#xD800;</root>");
      parser.close();
    });

    expect(outOfRange).toBeInstanceOf(XmlSaxError);
    expect(surrogate).toBeInstanceOf(XmlSaxError);
  });

  it("throws on unterminated entities", () => {
    const error = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&amp</root>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("throws on malformed numeric entities", () => {
    const malformedHex = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#xZZ;</root>");
      parser.close();
    });

    const missingDigits = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#;</root>");
      parser.close();
    });

    const missingHexDigits = captureError(() => {
      const parser = new XmlSaxParser();
      parser.feed("<root>&#x;</root>");
      parser.close();
    });

    expect(malformedHex).toBeInstanceOf(XmlSaxError);
    expect(missingDigits).toBeInstanceOf(XmlSaxError);
    expect(missingHexDigits).toBeInstanceOf(XmlSaxError);
  });
});
