import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildObject, objectToXml, parseXmlString } from "../../src/index";
import { collectEvents } from "../helpers";

const fixturesDir = join(process.cwd(), "tests", "fixtures");
const fixtures = ["basic.xml", "namespaces.xml", "mixed.xml", "doctype.xml"];

describe("fixtures", () => {
  it("parses fixtures consistently in one pass", () => {
    for (const file of fixtures) {
      const xml = readFileSync(join(fixturesDir, file), "utf8");
      const single = collectEvents(xml);
      const chunked = collectEvents(xml, 7);
      expect(chunked).toEqual(single);
    }
  });

  it("round-trips object to xml and back", () => {
    const input = {
      "p:root": {
        "@_xmlns:p": "urn:p",
        "@_id": "root-1",
        title: "Catalog",
        section: [
          { "@_name": "intro", "#text": "Hello" },
          {
            "@_name": "body",
            "p:item": [
              { "@_id": "1", "#text": "One" },
              { "@_id": "2", "#text": "Two" }
            ]
          }
        ],
        mixed: { "#text": "Hello ", b: "bold" }
      }
    };

    const xml = objectToXml(input);
    const root = parseXmlString(xml, { includeNamespaceAttributes: true });
    const output = buildObject(root);

    expect(output).toEqual({
      "@_xmlns:p": "urn:p",
      "@_id": "root-1",
      title: "Catalog",
      section: [
        { "@_name": "intro", "#text": "Hello" },
        {
          "@_name": "body",
          "p:item": [
            { "@_id": "1", "#text": "One" },
            { "@_id": "2", "#text": "Two" }
          ]
        }
      ],
      mixed: { "#text": "Hello ", b: "bold" }
    });
  });

  it("round-trips when rootName is required", () => {
    const input = {
      a: "1",
      b: { c: "2" }
    };

    const xml = objectToXml(input, { rootName: "root" });
    const root = parseXmlString(xml);
    const output = buildObject(root);

    expect(output).toEqual({ a: "1", b: { c: "2" } });
  });
});
