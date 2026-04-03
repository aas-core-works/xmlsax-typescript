import { XmlSaxInvariantError } from "./errors";

interface MaybeNodeGlobal {
  process?: { env?: { NODE_ENV?: string } };
}
const DEV = (globalThis as MaybeNodeGlobal).process?.env?.NODE_ENV !== "production";

export function assert(condition: boolean, message: string): void {
  if (!DEV) {
    return;
  }
  if (!condition) {
    throw new XmlSaxInvariantError(`Invariant failed: ${message}`);
  }
}
