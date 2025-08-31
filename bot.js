const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, InteractionType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const os = require("os");
const logger = require("./src/utils/logger");
const { uploadDecal } = require("./src/roblox/upload");
const { validateCookie } = require("./src/roblox/auth");
const puppeteer = require("puppeteer");

// Handle uncaught promise rejections / client errors to prevent crashes
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err);
});

const seenFile = path.join(__dirname, "seen.json");
let seen = new Set();
try {
  if (fs.existsSync(seenFile)) {
    seen = new Set(JSON.parse(fs.readFileSync(seenFile, "utf8")));
  }
} catch {}

function saveSeen() {
  fs.writeFileSync(seenFile, JSON.stringify([...seen]));
}

function buildScrapeEmbed() {
  const embed = {
    title: "Roblox Image Scraper & Uploader",
    description: "Click the button below and provide your .ROBLOSECURITY cookie to start the process.",
    color: 0x2b2d31,
  };
  const button = new ButtonBuilder()
    .setCustomId("scrape_open_modal")
    .setLabel("Start")
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(button);
  return { embeds: [embed], components: [row] };
}

const config = require("./config.json");
const DISCORD_TOKEN = config.discordToken || process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = config.discordClientId || process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error("Missing environment variables: DISCORD_TOKEN, DISCORD_CLIENT_ID");
  process.exit(1);
}

// Upload command removed

const scrapeCommand = new SlashCommandBuilder()
  .setName("scrape")
  .setDescription("Start the scrape & upload flow using a GUI");

// Register both commands
(async () => {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
      body: [scrapeCommand.toJSON()],
    });
    logger.info("Registered /scrape commands");
  } catch (err) {
    console.error(err);
  }
})();

// Helper that performs the heavy lifting (previously inline in slash command)
async function runScrape(interaction, robloCookie, maxCount = 5) {
  const pool = config.sourceUrls || [];
  if (pool.length === 0) {
    await interaction.editReply("No source URLs configured");
    return;
  }

  let pageUrl = pool[Math.floor(Math.random() * pool.length)];

  await interaction.editReply("🔍 Validating cookie (0%)...");
  let user;
  try {
    user = await validateCookie(robloCookie);
  } catch (e) {
    await interaction.editReply("❌ Invalid cookie");
    return;
  }

  await interaction.editReply("🌐 Fetching page (10%)...");
  let html;
  try {
    const res = await axios.get(pageUrl, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    html = res.data;
  } catch (err) {
    logger.error("Page download failed", err.message);
    await interaction.editReply(`❌ Failed to download page: ${err.message}`);
    return;
  }

  // Use headless browser to get final DOM with JS executed
  await interaction.editReply("🖥️ Rendering page (30%)...");

  let imgUrls = [];
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Handle age-confirm or consent overlay
    try {
      const agreeBtn = await page.waitForSelector(".button-agree", { timeout: 5000 });
      if (agreeBtn) {
        await agreeBtn.click();
        await new Promise((res) => setTimeout(res, 2000));
        logger.debug("Clicked consent button");
      }
    } catch {}

    // Scroll to trigger lazy loading images
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await new Promise((res) => setTimeout(res, 800));
    }

    imgUrls = await page.$$eval("img", (imgs) =>
      imgs
        .filter((el) => {
          const w = el.naturalWidth || 0;
          const h = el.naturalHeight || 0;
          return w > 20 && h > 20; // ignore 1px trackers / tiny icons
        })
        .map((el) => el.getAttribute("src") || el.getAttribute("data-src"))
        .filter(Boolean)
    );
    await browser.close();
  } catch (err) {
    logger.debug("Puppeteer error", err.message);
    await interaction.editReply(`❌ Puppeteer error: ${err.message}`);
    return;
  }

  logger.debug("Total imgs found", imgUrls.length);

  let urlList = imgUrls
    .map((src) => new URL(src, pageUrl).href)
    .filter((u) => {
      if (seen.has(u)) {
        logger.debug("Already seen", u);
        return false;
      }
      return true;
    });

  logger.debug("New imgs to process", urlList.length);

  if (urlList.length === 0) {
    await interaction.editReply("⚠️ No new images found on that page");
    return;
  }

  let uploaded = 0;
  let processed = 0;

  let poolIndex = 0;

  while (uploaded < maxCount && pageUrl) {
    urlList = imgUrls
      .map((src) => new URL(src, pageUrl).href)
      .filter((u) => {
        if (seen.has(u)) return false;
        return true;
      });

    if (urlList.length === 0) {
      // move to next url in pool
      if (poolIndex < pool.length) {
        pageUrl = pool[poolIndex++];
        logger.debug("Switching to next source", pageUrl);
        continue;
      } else {
        break;
      }
    }

    for (const imgUrl of urlList) {
      try {
        await interaction.editReply(`🖼️ Processing ${processed + 1}/${maxCount}...`);

        const res = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 10000 });

        if (res.data.length > 20 * 1024 * 1024) {
          logger.debug("Too large, skipping", imgUrl);
          seen.add(imgUrl);
          continue;
        }

        const ext = path.extname(imgUrl.split("?")[0]).toLowerCase() || ".png";
        if (![".jpg", ".jpeg", ".png", ".bmp", ".tga"].includes(ext)) {
          logger.debug("Unsupported ext, skipping", imgUrl);
          seen.add(imgUrl);
          continue;
        }

        const tempPath = path.join(os.tmpdir(), `${Date.now()}_${path.basename(imgUrl)}`);
        fs.writeFileSync(tempPath, res.data);

        const randomStr = () => Math.random().toString(36).substring(2, 10);
        const name = randomStr();
        const desc = randomStr() + randomStr();

        await interaction.editReply(`📤 Uploading ${processed + 1}/${maxCount}...`);
        try {
          await uploadDecal(tempPath, name, robloCookie, user.id, desc);
          uploaded++;
        } catch (upErr) {
          if (upErr.message === "USER_MODERATED") {
            // Inform user but do not stop; uploadDecal will retry internally
            await interaction.followUp({ content: "⚠️ Account is moderated. Waiting for you to reactivate... bot will keep retrying.", ephemeral: true });
            logger.warn("Account moderated; continuing retries");
            // Re-throw to let uploadDecal outer retry mechanism handle waiting
            fs.unlinkSync(tempPath);
            continue;
          }
          logger.debug("Upload failed", upErr.message);
        }
        fs.unlinkSync(tempPath);
        seen.add(imgUrl);
      } catch (err) {
        logger.debug("Processing error", err.message);
        seen.add(imgUrl);
      }
      processed++;
      if (uploaded >= maxCount) break;
    }
  }

  saveSeen();
  await interaction.editReply(`✅ Uploaded ${uploaded} new images (processed ${processed}).`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("ready", async () => {
  logger.info(`Bot logged in as ${client.user.tag}`);
  // Send scrape embed automatically to configured channel
  const startChannelId = config.startChannelId;
  if (startChannelId) {
    try {
      const channel = await client.channels.fetch(startChannelId);
      if (channel && channel.isTextBased()) {
        await channel.send(buildScrapeEmbed());
        logger.info("Sent scrape embed to start channel");
      } else {
        logger.warn("startChannelId is not a text channel or not found");
      }
    } catch (err) {
      logger.error("Failed to send start embed", err.message);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  // Slash command to (re)send GUI manually if needed
  if (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.commandName === "scrape"
  ) {
    await interaction.reply({ ...buildScrapeEmbed(), ephemeral: true });
    return;
  }

  // Button interaction: show modal
  if (interaction.isButton() && interaction.customId === "scrape_open_modal") {
    try {
      const modal = new ModalBuilder()
        .setCustomId("scrape_modal")
        .setTitle("Start Scraping");

      const cookieInput = new TextInputBuilder()
        .setCustomId("cookie")
        .setLabel(".ROBLOSECURITY Cookie")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const countInput = new TextInputBuilder()
        .setCustomId("count")
        .setLabel("Max images to upload (1-100, default 5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(cookieInput),
        new ActionRowBuilder().addComponents(countInput)
      );

      await interaction.showModal(modal);
    } catch (err) {
      if (err.code === 10062 || err.code === 40060) {
        // Interaction expired or already acknowledged – nothing we can do; just log
        logger.warn(`Interaction error (${err.code}) – likely clicked too late or duplicate`, err);
      } else {
        logger.error("Failed to show modal", err);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "⚠️ Unable to open modal, please try again.", ephemeral: true });
          } else if (interaction.isRepliable()) {
            await interaction.followUp({ content: "⚠️ Something went wrong, please try again.", ephemeral: true });
          }
        } catch (e) {
          logger.debug("Could not send fallback message", e.message);
        }
      }
    }
    return;
  }

  // Modal submit: run scraper
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "scrape_modal") {
    const robloCookie = interaction.fields.getTextInputValue("cookie");
    const countRaw = interaction.fields.getTextInputValue("count");
    const maxCount = Math.min(Math.max(parseInt(countRaw) || 5, 1), 100);

    await interaction.deferReply({ ephemeral: true });
    await runScrape(interaction, robloCookie, maxCount);
    return;
  }
});

client.login(DISCORD_TOKEN);
