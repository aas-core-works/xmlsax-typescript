import { describe, expect, it } from "vitest";
import { assert } from "../src/assert";
import { XmlSaxInvariantError } from "../src/errors";

describe("assert", () => {
  it("throws XmlSaxInvariantError on failed invariant in development mode", () => {
    expect(() => assert(false, "test invariant"))
      .toThrow(XmlSaxInvariantError);
  });

  it("does not throw when condition is true", () => {
    expect(() => assert(true, "ok")).not.toThrow();
  });
});
