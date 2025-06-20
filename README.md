# Discord Voice Activity Tracker Bot

A self-hosted Discord bot that tracks member voice activity in real-time, logs it locally, and syncs it to Google Sheets. It also takes automatic VC snapshots when voice channels hit high activity.

---

## 🚀 Features

- ⏱ Tracks **lifetime**, **monthly**, and **weekly** voice activity per user
- 📄 Syncs activity **live** to a Google Sheet (auto-creates rows if needed)
- 📸 Takes **automatic VC snapshots** (when 3+ members are in a channel)
- 🧠 Notices users already in VC on startup
- ❌ Applies a **30-minute penalty** for joining blacklisted channels
- 🔄 Supports **resilient local activity saving** (`activity.json`)
- 📁 Caches user avatars for snapshots
- ⚙️ Snapshot channel is **configurable** in `config.json`
- 💡 Logs debug info to console for visibility

---

## 🛠 Setup

### 1. Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or reuse one)
3. Enable **Google Sheets API**
4. Go to **Credentials**:
   - Create a **Service Account**
   - Under “Keys,” add a **JSON key** and download it
5. Rename this file to `credentials.json` and place it in the same folder as the bot
6. Share your Google Sheet with the service account email (read/write access)

---

### 2. Configuration

Create or edit `config.json`:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "sheet_id": "YOUR_GOOGLE_SHEET_ID",
  "guild_id": "YOUR_DISCORD_SERVER_ID",
  "blacklist": ["VOICE_CHANNEL_ID_1", "VOICE_CHANNEL_ID_2"],
  "snapshot_channel_id": "YOUR_LOG_CHANNEL_ID" // leave empty to disable snapshots
}

```

- `token`: Your bot's token from the Discord Developer Portal
- `sheet_id`: Your Google Sheet ID (the long string in the URL)
- `guild_id`: The server (guild) ID the bot will monitor
- `blacklist`: Voice channels to ignore or apply a 30m penalty for (like AFK channels)
- `snapshot_channel_id`: The channel where VC snapshots are sent (leave empty or omit to disable snapshots)

---

### 3. First Run

Get Node.js https://nodejs.org/en/download if you havent yet

1. Make sure all dependencies are installed:

```bash
npm install
```

This bot requires:
- `discord.js`
- `@googleapis/sheets`
- `canvas`
- `sharp`

Or use the included batch file if you're on Windows:

```bat
install_dependencies.bat
```

2. Start the bot:

```bash
node bot.js
```

Or use the included batch file if you're on Windows:

```bat
start_bot.bat
```

---

## 📊 Google Sheet Format

The bot will automatically create or update this format:

| Discord User ID | Display Name | Lifetime (min) | Lifetime (formatted) | This Week (min) | This Week (formatted) | This Month (min) | This Month (formatted) | Last Updated |
|-----------------|--------------|----------------|-----------------------|------------------|------------------------|-------------------|-------------------------|---------------|

---

## 🖼 VC Snapshots

- Snapshots are enabled if snapshot_channel_id is set in config.json
- Every hour, the bot scans all voice channels
- If 3 or more members (non-bots) are in one, it takes a **screenshot-style image**
- Includes avatars and display names
- Auto-posted in the configured channel

---

## 💾 Data Files

- `activity.json`: stores local lifetime, weekly, and monthly stats
- `avatar_cache/`: saves avatar PNGs to reduce API calls

---

## ✅ Notes

- The bot uses local time from the host server to calculate week/month
- Weekly data is stored using ISO format (`2025-W24`)
- If the bot is restarted, users already in VC will continue to be tracked properly

---

## 🔁 Crash Recovery

- Crash recovery is handled automatically in start_bot.bat

---

## 📬 Need Help?

Open an issue.
