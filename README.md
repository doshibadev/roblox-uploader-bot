# Roblox Decal Uploader Discord Bot

This bot lets you upload images from a Discord server directly to your Roblox account as decals.

---
## 1. Prerequisites

### Install Node.js
1. Go to <https://nodejs.org/fr/download>.
2. Download the **LTS** Windows installer (e.g. `node-v20.x.x-lts.msi`).
3. Run the installer → *Next* through all steps (ensure **Add to PATH** is checked).
4. Open **PowerShell** and verify:
   ```powershell
   node -v    # should print a version
   npm -v
   ```

### Create a Discord Test Server
Right-click your server list → **Create My Own** → give it any name.

---
## 2. Create a Discord Application & Bot
1. Go to <https://discord.com/developers/applications> and log in.
2. **New Application** → name it e.g. `RobloxUploader` → *Create*.
3. Left sidebar → **Bot** → *Add Bot* → *Yes, do it!*.
4. Copy the **Token** (you’ll paste it into `config.json`).
5. Back in sidebar → **OAuth2 → General** → copy the **Application ID**.
6. (Optional) Under **Bot** → *Privileged Gateway Intents* keep everything **off** (none needed).

### Invite the Bot to your Server
1. **OAuth2 → URL Generator**:
   * scopes: `bot`, `applications.commands`
   * permissions: `Send Messages`, `Embed Links`, `Attach Files`
2. Copy the generated URL, open it in your browser, pick your test server, *Authorize*.

---
## 3. Download & Configure the Project
1. Download or clone this repository.
2. Open PowerShell in the project folder (Shift + Right-click → **Open PowerShell window here**).
3. Install dependencies:
   ```powershell
   npm install
   ```
4. Open `config.json` and paste your IDs:
   ```json
   {
     "discordToken": "YOUR_DISCORD_BOT_TOKEN",
     "discordClientId": "YOUR_APPLICATION_ID"
   }
   ```

> **Never share your bot token or your Roblox cookie!**

---
## 4. Running the Bot
```powershell
npm start
```
Console shows:
```
Registered /upload command
Bot logged in as RobloxUploader#1234
```
If you see *Missing environment variables*, check `config.json` values.

### Slash-Command Propagation
Global commands can take up to 1 hour to appear. To get them instantly in **one** server:
1. In `bot.js` replace
   ```js
   Routes.applicationCommands(config.discordClientId)
   ```
   with
   ```js
   Routes.applicationGuildCommands(config.discordClientId, "YOUR_GUILD_ID")
   ```
2. Restart the bot – `/upload` appears immediately.

*To get your guild (server) ID: Settings → Advanced → enable **Developer Mode** → right-click server → **Copy ID**.*

---
## 5. Using `/upload`
1. In any channel where the bot has access, type `/upload`.
2. **cookie**: paste your `.ROBLOSECURITY` string (starts with `_|WARNING:`).
3. **image**: attach a `.jpg`, `.png`, `.tga`, or `.bmp` under 20 MB.
4. Send.

The bot responds:
```
🔍 Validating cookie (0%)…
✅ Cookie valid for MyUsername. Downloading image (20%)…
📤 Uploading to Roblox (60%)…
✅ Uploaded! AssetId: 123456789012345 (100%)
```
Check <https://create.roblox.com/creations> → **Decals** – your image is there.

---
## 6. Troubleshooting
| Issue | Fix |
|-------|------|
| Command not showing | Use guild-only registration or wait for global propagation. |
| “Cookie invalid” | Copy the entire `.ROBLOSECURITY` value from browser cookies. |
| 429 rate-limit errors | Bot auto-retries; wait a bit or upload fewer files. |
| 500 “Unknown Error” | Roblox occasionally fails; run again. |

---
## 7. Updating / Customizing
* **Group uploads** – edit `src/roblox/upload.js` → change `creator` object to `{ groupId: GROUP_ID }` and `creatorType` to `Group`.
* **Image name/description** randomness – tweak the generator in `bot.js`.
* **Add logging channels** – replace `logger.info` with `interaction.followUp` to send updates publicly.

Enjoy fast decal uploads right from Discord! 🎉
