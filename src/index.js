const PAGE_URL = "https://www.8246hanabi.com/";
const SNAPSHOT_KEY = "last_snapshot";
const STATUS_KEY = "last_status";
const MAX_PAGE_BYTES = 2_000_000;

async function readTextWithLimit(response, maxBytes) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    byteCount += value.byteLength;
    if (byteCount > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeds ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

function decodeHtmlEntities(text) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return text.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code) => {
    if (!code.startsWith("#")) {
      return namedEntities[code.toLowerCase()] ?? entity;
    }

    const radix = code[1].toLowerCase() === "x" ? 16 : 10;
    const value = Number.parseInt(code.slice(radix === 16 ? 2 : 1), radix);
    if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
      return entity;
    }
    return String.fromCodePoint(value);
  });
}

export function htmlToText(html) {
  const withoutIgnoredContent = html
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style|noscript)\b[^>]*>[^]*?<\/\1\s*>/gi, "");

  const withLineBreaks = withoutIgnoredContent.replace(
    /<\/?(?:article|br|div|footer|h[1-6]|header|li|main|nav|p|section|tr)\b[^>]*>/gi,
    "\n",
  );
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(withoutTags)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function findAddedLines(previousText, currentText) {
  const previousCounts = new Map();
  for (const line of previousText.split("\n")) {
    previousCounts.set(line, (previousCounts.get(line) ?? 0) + 1);
  }

  const addedLines = [];
  for (const line of currentText.split("\n")) {
    const remaining = previousCounts.get(line) ?? 0;
    if (remaining > 0) {
      previousCounts.set(line, remaining - 1);
    } else if (line) {
      addedLines.push(line);
    }
  }
  return addedLines;
}

function formatJst(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function buildTelegramMessage(previousText, currentText, checkedAt = new Date()) {
  const addedLines = findAddedLines(previousText, currentText);
  const timestamp = `${formatJst(checkedAt)} JST`;

  if (addedLines.length === 0) {
    return `🎆 八代花火大會官網內容有變動！\n(${timestamp})\n\n請前往查看：\n${PAGE_URL}`;
  }

  const preview = addedLines
    .slice(0, 15)
    .map((line) => `・${line}`)
    .join("\n");
  return `🎆 八代花火大會官網有更新！\n(${timestamp})\n\n新增內容：\n${preview}\n\n${PAGE_URL}`;
}

async function fetchPageText(fetchImpl) {
  const response = await fetchImpl(PAGE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; HanabiWatchBot/2.0; personal use, checks hourly)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Website returned HTTP ${response.status}`);
  }

  return htmlToText(await readTextWithLimit(response, MAX_PAGE_BYTES));
}

async function sendTelegram(env, message, fetchImpl) {
  const telegramMessage = message.length > 4000
    ? `${message.slice(0, 3900)}\n...(內容過長，已截斷，請直接開網站查看)`
    : message;
  const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: telegramMessage,
      disable_web_page_preview: "true",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await readTextWithLimit(response, 16_384);
    throw new Error(`Telegram returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function saveStatus(env, result, checkedAt, error) {
  await env.STATE.put(STATUS_KEY, JSON.stringify({
    result,
    checkedAt: checkedAt.toISOString(),
    ...(error ? { error } : {}),
  }));
}

export async function checkWebsite(env, fetchImpl = fetch, checkedAt = new Date()) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    throw new Error("Telegram secrets are not configured");
  }

  const currentText = await fetchPageText(fetchImpl);
  const previousText = await env.STATE.get(SNAPSHOT_KEY);

  if (previousText === null) {
    await env.STATE.put(SNAPSHOT_KEY, currentText);
    await saveStatus(env, "baseline_saved", checkedAt);
    return "baseline_saved";
  }

  if (currentText === previousText) {
    await saveStatus(env, "no_change", checkedAt);
    return "no_change";
  }

  await sendTelegram(env, buildTelegramMessage(previousText, currentText, checkedAt), fetchImpl);
  await env.STATE.put(SNAPSHOT_KEY, currentText);
  await saveStatus(env, "notification_sent", checkedAt);
  return "notification_sent";
}

export default {
  async fetch(_request, env) {
    const status = await env.STATE.get(STATUS_KEY, "json");
    return Response.json({
      service: "hanabi-watch",
      schedule: "hourly at minute 17 UTC",
      status: status ?? { result: "not_run" },
    });
  },

  async scheduled(controller, env) {
    const checkedAt = new Date(controller.scheduledTime);
    try {
      const result = await checkWebsite(env, fetch, checkedAt);
      console.log(JSON.stringify({ event: "hanabi_check", result, checkedAt: checkedAt.toISOString() }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await saveStatus(env, "error", checkedAt, message);
      console.error(JSON.stringify({ event: "hanabi_check", result: "error", error: message }));
      throw error;
    }
  },
};

