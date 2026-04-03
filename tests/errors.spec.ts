import { describe, expect, it } from "vitest";
import {
  ObjectBuilder,
  TreeBuilder,
  XmlSaxBuildError,
  XmlSaxError,
  XmlSaxLibraryError,
  XmlSaxParser,
  buildXmlNode
} from "../src/index";

function captureError(run: () => void): XmlSaxError {
  try {
    run();
  } catch (err) {
    return err as XmlSaxError;
  }
  throw new Error("Expected XmlSaxError to be thrown");
}

describe("error handling", () => {
  it("reports mismatched closing tag positions", () => {
    const parser = new XmlSaxParser();
    const error = captureError(() => {
      parser.feed("<root>\n</rot>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
    expect(error.line).toBe(2);
    expect(error.column).toBe(1);
    expect(error.offset).toBe(7);
  });

  it("throws on closing tag without a start tag", () => {
    const parser = new XmlSaxParser();
    const error = captureError(() => {
      parser.feed("</root>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("rejects unterminated markup", () => {
    const cases = [
      "<!--",
      "<![CDATA[",
      "<?pi",
      "<!DOCTYPE root",
      "<root"
    ];

    for (const xml of cases) {
      const parser = new XmlSaxParser();
      const error = captureError(() => {
        parser.feed(xml);
        parser.close();
      });
      expect(error).toBeInstanceOf(XmlSaxError);
    }
  });

  it("rejects unquoted attribute values", () => {
    const parser = new XmlSaxParser();
    const error = captureError(() => {
      parser.feed("<root a=1/>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("blocks doctype when disallowed", () => {
    const parser = new XmlSaxParser({ allowDoctype: false });
    const error = captureError(() => {
      parser.feed("<!DOCTYPE root><root/>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
  });

  it("can disable line/column tracking for faster parsing", () => {
    const parser = new XmlSaxParser({ trackPosition: false });
    const error = captureError(() => {
      parser.feed("<root>\n</rot>");
      parser.close();
    });

    expect(error).toBeInstanceOf(XmlSaxError);
    expect(error.offset).toBe(7);
    expect(error.line).toBe(0);
    expect(error.column).toBe(0);
  });

  it("uses structured error type for object builder invalid states", () => {
    const builder = new ObjectBuilder();

    expect(() => builder.getResult()).toThrow(XmlSaxBuildError);
    expect(() => builder.onCloseTag()).toThrow(XmlSaxBuildError);

    try {
      builder.getRootName();
    } catch (error) {
      expect(error).toBeInstanceOf(XmlSaxBuildError);
      expect(error).toBeInstanceOf(XmlSaxLibraryError);
    }
  });

  it("uses structured error type for tree builder invalid states", () => {
    const builder = new TreeBuilder();
    expect(() => builder.getRoot()).toThrow(XmlSaxBuildError);
    expect(() => builder.onCloseTag()).toThrow(XmlSaxBuildError);
  });

  it("uses structured error type for xml builder invalid root state", () => {
    expect(() => buildXmlNode({ a: "1", b: "2" })).toThrow(XmlSaxBuildError);
  });
});
