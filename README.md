# 八代花火大會官網監控 → Telegram 通知

每天固定 2 次（台灣時間 09:00 / 18:00）自動檢查 https://www.8246hanabi.com/
是否有新內容，有變動就用 Telegram 傳訊息通知你。完全免費，跑在 GitHub Actions
雲端上，不需要自己開電腦。

---

## Step 1：建立 Telegram Bot，取得 Token

1. 打開 Telegram，搜尋 `@BotFather`，點進去對話
2. 傳送 `/newbot`，依照指示取名字（例如 `Hanabi Watch Bot`）
3. 完成後 BotFather 會給你一組 **Token**，長得像：
   `123456789:ABCdefGhIJKlmNoPQRstuVwxYZ`
   → 先記下來，等一下會用到

## Step 2：取得你的 Chat ID

1. 用 Telegram 搜尋剛剛建立的 bot，點進去，按 **Start**（先隨便傳一句話給它）
2. 瀏覽器打開這個網址（把 `<TOKEN>` 換成你的 Token）：
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. 頁面 JSON 裡面找 `"chat":{"id":123456789, ...}`，這個數字就是你的 **Chat ID**

## Step 3：建立 GitHub Repository

1. 到 https://github.com/new 建立一個新的 repository（Public 或 Private 都可以）
2. 把這個資料夾裡的所有檔案上傳上去（可以直接在 GitHub 網頁拖曳上傳，
   或用 git push，結構要維持一樣）：

```
你的repo/
├── .github/workflows/hanabi-watch.yml
├── scripts/check_hanabi.py
├── state/.gitkeep
└── README.md
```

## Step 4：設定 GitHub Secrets

進入你的 repo → **Settings** → **Secrets and variables** → **Actions**
→ **New repository secret**，新增兩筆：

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | 你的 Bot Token |
| `TELEGRAM_CHAT_ID` | 你的 Chat ID |

## Step 5：手動測試一次

1. 進入 repo 的 **Actions** 分頁
2. 左邊選 **Hanabi Website Watch**
3. 點右邊 **Run workflow** → **Run workflow**（綠色按鈕）
4. 等它跑完（約 10-20 秒），第一次執行只會存基準快照，**不會**發通知，
   這是正常的 —— 之後偵測到「跟上次不一樣」才會通知你
5. 之後就會照排程（每天 09:00 / 18:00 台灣時間）自動執行

---

## 之後如何確認有沒有正常運作

- Actions 分頁可以看到每次執行紀錄，綠勾勾代表成功
- 如果想改時間，修改 `.github/workflows/hanabi-watch.yml` 裡的 cron
  設定（cron 是 UTC 時間，台灣時間要 -8 小時換算）
- 如果想改成一天檢查更多次，在 cron 那行用逗號加時間即可，
  例如 `'0 1,6,10 * * *'` 就是一天三次

## 小提醒

- 這個腳本是抓「整個頁面的文字內容」做比對，只要頁面文字有任何變動
  （包含新公告、內容修改）都會觸發通知，訊息裡會列出新增的內容片段，
  但建議收到通知後還是直接點連結進網站確認完整內容
- 每天只檢查 2 次、間隔數小時，對網站伺服器負擔很小，是合理的個人使用方式
- 如果之後想調整成「只監控新着・更新情報那一小塊」而不是整頁，
  把網站上該區塊的 HTML 原始碼貼給我，我可以幫你把腳本改得更精準
# Hanabi-Watch-Bot
