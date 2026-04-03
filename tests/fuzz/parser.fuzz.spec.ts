import * as fc from "fast-check";
import { describe, it } from "vitest";
import { parseXmlString, serializeXml } from "../../src/index";
import type { XmlChild, XmlNode } from "../../src/types";
import { chunkBySizes, collectEvents, collectEventsFromChunks } from "../helpers";

const nameChars = "abcdefghijklmnopqrstuvwxyz".split("");
const textChars = "abcdefghijklmnopqrstuvwxyz0123456789 -_".split("");

const nameArb = fc.string({
  minLength: 1,
  maxLength: 8,
  unit: fc.constantFrom(...nameChars)
});

const textArb = fc.string({
  minLength: 1,
  maxLength: 24,
  unit: fc.constantFrom(...textChars)
});

const attributesArb = fc.dictionary(nameArb, textArb, { maxKeys: 3 });

const nodeArb: fc.Arbitrary<XmlNode> = fc.letrec((tie) => ({
  node: fc
    .record({
      name: nameArb,
      attributes: attributesArb,
      children: fc.array(
        fc.oneof(textArb, tie("node") as fc.Arbitrary<XmlNode>),
        { maxLength: 3 }
      )
    })
    .map((node) => {
      const attributes = Object.keys(node.attributes).length > 0 ? node.attributes : undefined;
      const children = node.children.length > 0 ? (node.children as XmlChild[]) : undefined;
      return { name: node.name, attributes, children };
    })
})).node;

const chunkSizesArb = fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 12 });

describe("fuzz", () => {
  it(
    "round-trips serialize -> parse -> serialize",
    { timeout: 10000 },
    () => {
      fc.assert(
        fc.property(nodeArb, (node) => {
          const xml = serializeXml(node);
          const parsed = parseXmlString(xml);
          return serializeXml(parsed) === xml;
        }),
        { numRuns: 120 }
      );
    }
  );

  it(
    "preserves event sequence under chunking",
    { timeout: 10000 },
    () => {
      fc.assert(
        fc.property(nodeArb, chunkSizesArb, (node, sizes) => {
          const xml = serializeXml(node);
          const single = collectEvents(xml);
          const chunks = chunkBySizes(xml, sizes);
          const chunked = collectEventsFromChunks(chunks);
          return JSON.stringify(single) === JSON.stringify(chunked);
        }),
        { numRuns: 80 }
      );
    }
  );
});
