import { performance } from "node:perf_hooks";

import {
  parseXmlString,
  tokenizeXml,
  XmlSaxParser
} from "../dist/index.js";

function buildFixture(repetitions) {
  const parts = ["<root>"];
  for (let i = 0; i < repetitions; i += 1) {
    parts.push(`<item id="${i}"><name>name-${i}</name><value>${i}</value></item>`);
  }
  parts.push("</root>");
  return parts.join("");
}

function chunk(input, size) {
  const chunks = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

function measure(name, rounds, fn) {
  let best = Number.POSITIVE_INFINITY;
  let total = 0;

  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    total += elapsed;
    if (elapsed < best) {
      best = elapsed;
    }
  }

  const average = total / rounds;
  return { name, best, average };
}

function formatRow(result) {
  return `${result.name.padEnd(30)} avg=${result.average.toFixed(2).padStart(8)} ms  best=${result.best
    .toFixed(2)
    .padStart(8)} ms`;
}

const xml = buildFixture(8000);
const chunks = chunk(xml, 1024);
const rounds = 12;

const scenarios = [
  measure("tokenizeXml(default)", rounds, () => {
    tokenizeXml(xml);
  }),
  measure("tokenizeXml(no positions)", rounds, () => {
    tokenizeXml(xml, { trackPosition: false });
  }),
  measure("parseXmlString(default)", rounds, () => {
    parseXmlString(xml);
  }),
  measure("stream feed/close", rounds, () => {
    const parser = new XmlSaxParser();
    for (const chunkText of chunks) {
      parser.feed(chunkText);
    }
    parser.close();
  })
];

console.log("xmlsax-typescript parser benchmark");
console.log(`input size: ${(xml.length / 1024).toFixed(1)} KiB, rounds: ${rounds}`);
console.log("");
for (const scenario of scenarios) {
  console.log(formatRow(scenario));
}
