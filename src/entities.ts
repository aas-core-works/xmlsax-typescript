import { XmlSaxError } from "./errors";

export function decodeEntities(input: string, onError?: (error: Error) => void): string {
  const firstAmp = input.indexOf("&");
  if (firstAmp === -1) {
    return input;
  }

  let result = "";
  let i = 0;

  while (i < input.length) {
    const amp = input.indexOf("&", i);
    if (amp === -1) {
      if (i === 0) {
        return input;
      }
      return i < input.length ? result + input.slice(i) : result;
    }

    if (amp > i) {
      result += input.slice(i, amp);
    }

    const semi = input.indexOf(";", amp + 1);
    if (semi === -1) {
      const err = new XmlSaxError("Unterminated entity", amp, 0, 0);
      onError?.(err);
      throw err;
    }

    let decoded: string | undefined;
    const marker = input[amp + 1];

    if (marker === "#") {
      const numeric = parseNumericEntity(input, amp + 2, semi);
      decoded = numeric === undefined ? undefined : decodeCodePoint(numeric);
    } else {
      decoded = decodeNamedEntity(input, amp + 1, semi);
    }

    if (decoded === undefined) {
      const entity = input.slice(amp + 1, semi);
      const err = new XmlSaxError(`Unknown entity: &${entity};`, amp, 0, 0);
      onError?.(err);
      throw err;
    }

    result += decoded;
    i = semi + 1;
  }

  return result;
}

function decodeNamedEntity(input: string, start: number, end: number): string | undefined {
  const len = end - start;
  if (len === 2) {
    if (input[start] === "l" && input[start + 1] === "t") {
      return "<";
    }
    if (input[start] === "g" && input[start + 1] === "t") {
      return ">";
    }
    return undefined;
  }

  if (len === 3) {
    if (input[start] === "a" && input[start + 1] === "m" && input[start + 2] === "p") {
      return "&";
    }
    return undefined;
  }

  if (len === 4) {
    const maybeQuot =
      input[start] === "q" && input[start + 1] === "u" && input[start + 2] === "o" && input[start + 3] === "t";
    if (maybeQuot) {
      return "\"";
    }

    const maybeApos =
      input[start] === "a" && input[start + 1] === "p" && input[start + 2] === "o" && input[start + 3] === "s";
    if (maybeApos) {
      return "'";
    }
  }

  return undefined;
}

function parseNumericEntity(input: string, start: number, end: number): number | undefined {
  if (start >= end) {
    return undefined;
  }

  let i = start;
  let radix = 10;

  const marker = input[i];
  if (marker === "x" || marker === "X") {
    radix = 16;
    i += 1;
  }

  if (i >= end) {
    return undefined;
  }

  let value = 0;
  for (; i < end; i += 1) {
    const ch = input[i];
    if (ch === undefined) {
      return undefined;
    }

    const digit = radix === 16 ? hexDigit(ch) : decimalDigit(ch);
    if (digit === -1) {
      return undefined;
    }

    value = value * radix + digit;
  }

  return value;
}

function decimalDigit(ch: string): number {
  const code = ch.charCodeAt(0) - 48;
  if (code < 0 || code > 9) {
    return -1;
  }
  return code;
}

function hexDigit(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) {
    return code - 48;
  }
  if (code >= 65 && code <= 70) {
    return code - 55;
  }
  if (code >= 97 && code <= 102) {
    return code - 87;
  }
  return -1;
}

function decodeCodePoint(codePoint: number): string | undefined {
  if (!Number.isFinite(codePoint)) {
    return undefined;
  }
  if (codePoint < 0 || codePoint > 0x10ffff) {
    return undefined;
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return undefined;
  }
  return String.fromCodePoint(codePoint);
}

export function splitTextForEntities(text: string): { emit: string; carry: string } {
  const lastAmp = text.lastIndexOf("&");
  if (lastAmp === -1) {
    return { emit: text, carry: "" };
  }

  if (!text.includes(";", lastAmp + 1)) {
    return {
      emit: text.slice(0, lastAmp),
      carry: text.slice(lastAmp)
    };
  }

  return { emit: text, carry: "" };
}
