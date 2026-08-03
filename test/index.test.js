import assert from "node:assert/strict";
import test from "node:test";

import { buildTelegramMessage, findAddedLines, htmlToText } from "../src/index.js";

test("htmlToText removes ignored tags and normalizes text", () => {
  const html = `
    <html><head><style>.hidden { display: none; }</style></head>
    <body><h1>花火&nbsp;大會</h1><script>alert("ignore")</script>
    <p>最新 &amp; 消息</p><noscript>ignore</noscript></body></html>
  `;

  assert.equal(htmlToText(html), "花火 大會\n最新 & 消息");
});

test("findAddedLines respects duplicate line counts", () => {
  assert.deepEqual(findAddedLines("A\nA\nB", "A\nB\nA\nC"), ["C"]);
  assert.deepEqual(findAddedLines("A\nB", "A"), []);
});

test("buildTelegramMessage includes added content", () => {
  const message = buildTelegramMessage("舊消息", "舊消息\n新消息", new Date("2026-08-03T08:00:00Z"));

  assert.match(message, /八代花火大會官網有更新/);
  assert.match(message, /・新消息/);
  assert.match(message, /2026-08-03 17:00 JST/);
});

