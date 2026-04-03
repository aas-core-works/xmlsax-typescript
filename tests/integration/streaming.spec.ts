import { describe, expect, it } from "vitest";
import {
  CdataToken,
  CloseTagToken,
  CommentToken,
  DoctypeToken,
  OpenTagToken,
  ProcessingInstructionToken,
  TextToken,
  XmlSaxParser
} from "../../src/index";
import { collectEvents } from "../helpers";

describe("streaming behavior", () => {
  it("emits events during feed", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser();

    for (const token of parser.feed("<root><a>")) {
      if (token instanceof OpenTagToken) {
        events.push(`open:${token.tag.name}`);
      }
      if (token instanceof CloseTagToken) {
        events.push(`close:${token.tag.name}`);
      }
    }
    expect(events).toEqual(["open:root", "open:a"]);

    parser.feed("ok</a></root>");
    parser.close();
  });

  it("handles entities across chunk boundaries", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser();

    for (const token of parser.feed("<root>Hi &amp")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("; there</root>")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.close()) {
      if (token instanceof TextToken) texts.push(token.text);
    }

    expect(texts.join("")).toBe("Hi & there");
  });

  it("can coalesce chunked text events", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({ coalesceText: true });

    for (const token of parser.feed("<root>Hi &amp")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("; there</root>")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.close()) {
      if (token instanceof TextToken) texts.push(token.text);
    }

    expect(texts).toEqual(["Hi & there"]);
  });

  it("keeps chunked text split when coalescing is disabled", () => {
    const texts: string[] = [];
    const parser = new XmlSaxParser({ coalesceText: false });

    for (const token of parser.feed("<root>Hi &amp")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.feed("; there</root>")) {
      if (token instanceof TextToken) texts.push(token.text);
    }
    for (const token of parser.close()) {
      if (token instanceof TextToken) texts.push(token.text);
    }

    expect(texts).toEqual(["Hi ", "& there"]);
  });

  it("matches single-feed events at byte boundaries", () => {
    const xml = "<root><a>ok</a><b/></root>";
    const single = collectEvents(xml);
    const boundary = collectEvents(xml, 1);
    expect(boundary).toEqual(single);
  });

  it("handles chunked markup sections", () => {
    const events: string[] = [];
    const parser = new XmlSaxParser();

    const chunks = [
      "<?",
      "xml version='1.0'?>",
      "<!DOC",
      "TYPE root>",
      "<root><!--co",
      "mment--><![CDATA[te",
      "xt]]><?pi data?></root>"
    ];

    for (const chunk of chunks) {
      for (const token of parser.feed(chunk)) {
        if (token instanceof CommentToken) events.push(`comment:${token.text}`);
        if (token instanceof CdataToken) events.push(`cdata:${token.text}`);
        if (token instanceof ProcessingInstructionToken) {
          events.push(`pi:${token.processingInstruction.target}:${token.processingInstruction.body}`);
        }
        if (token instanceof DoctypeToken) events.push(`doctype:${token.doctype.raw}`);
        if (token instanceof OpenTagToken) events.push(`open:${token.tag.name}`);
        if (token instanceof CloseTagToken) events.push(`close:${token.tag.name}`);
      }
    }
    parser.close();

    expect(events).toEqual([
      "pi:xml:version='1.0'",
      "doctype:root",
      "open:root",
      "comment:comment",
      "cdata:text",
      "pi:pi:data",
      "close:root"
    ]);
  });

  it("iterateChunks yields the same events as feed and close", async () => {
    const parser = new XmlSaxParser();
    const events: string[] = [];

    function* source(): IterableIterator<string> {
      yield "<root><item>";
      yield "1</item><item>2";
      yield "</item></root>";
    }

    for await (const token of parser.iterateChunks(source())) {
      if (token instanceof OpenTagToken) events.push(`open:${token.tag.name}`);
      if (token instanceof CloseTagToken) events.push(`close:${token.tag.name}`);
      if (token instanceof TextToken) events.push(`text:${token.text}`);
    }

    expect(events).toEqual(["open:root", "open:item", "text:1", "close:item", "open:item", "text:2", "close:item", "close:root"]);
  });
});
