import { describe, expect, it } from "vitest";
import { ProcessingInstructionToken, TextToken, XmlSaxParser } from "../../src/index";

function parseText(xml: string): { text: string; pi: string | null } {
  let text = "";
  let pi: string | null = null;
  const parser = new XmlSaxParser();

  for (const token of parser.feed(xml)) {
    if (token instanceof TextToken) {
      text += token.text;
    }
    if (token instanceof ProcessingInstructionToken && token.processingInstruction.target === "xml") {
      pi = token.processingInstruction.body;
    }
  }
  parser.close();

  return { text, pi };
}

describe("xml declaration encoding", () => {
  it("parses xml declaration as processing instruction", () => {
    const xml = "<?xml version='1.0' encoding='UTF-8'?><root>ok</root>";
    const { pi } = parseText(xml);
    expect(pi).toBe("version='1.0' encoding='UTF-8'");
  });

  it("parses UTF-8 decoded content", () => {
    const text = "Gr\u00fc\u00df";
    const xml = `<?xml version='1.0' encoding='UTF-8'?><root>${text}</root>`;
    const { text: parsed } = parseText(xml);
    expect(parsed).toBe(text);
  });

  it("parses ISO-8859-1 decoded content", () => {
    const bytes = Buffer.from([0x47, 0x72, 0xfc, 0xdf]);
    const text = bytes.toString("latin1");
    const xml = `<?xml version='1.0' encoding='ISO-8859-1'?><root>${text}</root>`;
    const { text: parsed } = parseText(xml);
    expect(parsed).toBe(text);
  });
});
