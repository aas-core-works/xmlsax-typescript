import { describe, expect, it } from "vitest";
import { serializeXml } from "../src/index";

describe("serializeXml", () => {
  it("serializes a simple node", () => {
    const xml = serializeXml({
      name: "root",
      attributes: { id: "1" },
      children: ["Hello", { name: "child", children: ["World"] }]
    });

    expect(xml).toBe("<root id=\"1\">Hello<child>World</child></root>");
  });

  it("supports pretty output", () => {
    const xml = serializeXml(
      {
        name: "root",
        children: [{ name: "child", children: ["Text"] }]
      },
      { pretty: true, indent: "  ", newline: "\n" }
    );

    expect(xml).toBe("<root>\n  <child>Text</child>\n</root>\n");
  });

  it("adds a trailing newline when pretty printing", () => {
    const xml = serializeXml(
      {
        name: "root",
        children: [{ name: "child", children: ["Text"] }]
      },
      { pretty: true, indent: "  ", newline: "\n" }
    );

    expect(xml.endsWith("\n")).toBe(true);
  });
});
