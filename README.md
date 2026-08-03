# 八代花火大會官網監控 → Telegram 通知

Cloudflare Worker 每小時檢查一次 https://www.8246hanabi.com/。頁面文字有變動時，
會透過 Telegram Bot 發送通知；最後快照與執行狀態儲存在 Cloudflare Workers KV。

## 部署

```bash
npm install
npx wrangler login
npm run deploy
```

首次部署會自動建立並綁定 `STATE` KV namespace。接著設定 Telegram secrets：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

第一次排程執行會把當時的官網內容存成基準快照，不會發送通知；之後偵測到文字變動才會通知。
舊版 Python 快照的格式與 Worker 不同，不要直接寫入 KV，否則可能造成第一次誤報。

Cron 設定在 `wrangler.jsonc`，目前是每小時第 17 分鐘執行。Cloudflare Cron 使用 UTC，
但每小時排程只受分鐘影響。Cron 變更最長可能需要約 15 分鐘才會全球生效。

## 本機驗證

```bash
npm test
npm run dry-run
```

`npm run dev` 可啟動本機 Worker 與 scheduled handler 測試入口。Telegram secrets 請放在
不會 commit 的 `.dev.vars`：

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## 查看狀態

部署後開啟 Wrangler 顯示的 `workers.dev` URL，可查看最近一次檢查結果。也可以執行：

```bash
npx wrangler tail
```

Cloudflare Dashboard 的 **Workers & Pages → hanabi-watch → Triggers → Cron Events** 會顯示
每次排程執行結果。
