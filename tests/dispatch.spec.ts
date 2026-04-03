import { describe, expect, it } from "vitest";
import { dispatchToken, isBuildToken, tokenizeXml } from "../src/index";

describe("dispatchToken", () => {
  it("dispatches handlers by token kind", () => {
    const calls: string[] = [];
    const tokens = tokenizeXml("<root>hello</root>");

    for (const token of tokens) {
      dispatchToken(token, {
        openTag: (openTagToken) => {
          calls.push(`open:${openTagToken.tag.name}`);
        },
        closeTag: (closeTagToken) => {
          calls.push(`close:${closeTagToken.tag.name}`);
        },
        text: (textToken) => {
          calls.push(`text:${textToken.text}`);
        },
        end: () => {
          calls.push("end");
        }
      });
    }

    expect(calls).toEqual(["open:root", "text:hello", "close:root", "end"]);
  });

  it("falls back to otherwise when a specific handler is missing", () => {
    const calls: string[] = [];
    const tokens = tokenizeXml("<root/>");

    for (const token of tokens) {
      dispatchToken(token, {
        otherwise: (unknownToken) => {
          calls.push(unknownToken.kind);
        }
      });
    }

    expect(calls).toEqual(["open-tag", "close-tag", "end"]);
  });
});

describe("isBuildToken", () => {
  it("identifies structural tokens consumed by builders", () => {
    const kinds = tokenizeXml("<root><!--x--><![CDATA[y]]>z</root>")
      .map((token) => ({ kind: token.kind, build: isBuildToken(token) }));

    expect(kinds).toEqual([
      { kind: "open-tag", build: true },
      { kind: "comment", build: false },
      { kind: "cdata", build: true },
      { kind: "text", build: true },
      { kind: "close-tag", build: true },
      { kind: "end", build: false }
    ]);
  });
});
