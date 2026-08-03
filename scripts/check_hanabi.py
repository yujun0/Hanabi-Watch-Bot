"""
八代花火大會官網監控腳本

功能：
1. 抓取 https://www.8246hanabi.com/ 的頁面文字內容
2. 與上一次儲存的快照 (state/last_snapshot.txt) 比對
3. 若有變動，透過 Telegram Bot 發送通知，並更新快照

需要的環境變數：
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
"""

import os
import sys
import difflib
from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

URL = "https://www.8246hanabi.com/"
STATE_FILE = "state/last_snapshot.txt"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; HanabiWatchBot/1.0; personal use, checks twice daily)"
}


def fetch_page_text() -> str:
    resp = requests.get(URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding
    soup = BeautifulSoup(resp.text, "html.parser")

    # 移除不影響內容判讀的標籤
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    return "\n".join(lines)


def send_telegram(message: str) -> None:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    api_url = f"https://api.telegram.org/bot{token}/sendMessage"

    if len(message) > 4000:
        message = message[:4000] + "\n...(內容過長，已截斷，請直接開網站查看)"

    resp = requests.post(
        api_url,
        data={
            "chat_id": chat_id,
            "text": message,
            "disable_web_page_preview": True,
        },
        timeout=30,
    )
    resp.raise_for_status()


def main() -> None:
    current_text = fetch_page_text()
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)

    if not os.path.exists(STATE_FILE):
        # 第一次執行，只存基準快照，不發通知
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            f.write(current_text)
        print("First run - baseline snapshot saved, no notification sent.")
        return

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        previous_text = f.read()

    if current_text == previous_text:
        print("No change detected.")
        return

    diff = list(
        difflib.unified_diff(
            previous_text.splitlines(),
            current_text.splitlines(),
            lineterm="",
        )
    )
    added_lines = [
        line[1:].strip()
        for line in diff
        if line.startswith("+") and not line.startswith("+++")
    ]
    added_lines = [line for line in added_lines if line]

    jst = timezone(timedelta(hours=9))
    now_str = datetime.now(jst).strftime("%Y-%m-%d %H:%M JST")

    if added_lines:
        preview = "\n".join(f"・{line}" for line in added_lines[:15])
        message = (
            f"🎆 八代花火大會官網有更新！\n({now_str})\n\n"
            f"新增內容：\n{preview}\n\n{URL}"
        )
    else:
        message = f"🎆 八代花火大會官網內容有變動！\n({now_str})\n\n請前往查看：\n{URL}"

    send_telegram(message)
    print("Change detected, notification sent.")

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        f.write(current_text)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
