const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { getXsrfToken } = require("./auth");
const logger = require("../utils/logger");

/**
 * Upload a single image file as a decal to Roblox.
 * @param {string} imagePath Absolute or relative path to image.
 * @param {string} name Name for the decal.
 * @param {string} securityCookie Roblox .ROBLOSECURITY cookie string.
 * @returns {Promise<object>} API response data.
 */
async function uploadDecal(imagePath, name, securityCookie, userId, description = "") {
  const absolutePath = path.resolve(imagePath);
  if (!fs.existsSync(absolutePath)) throw new Error("File not found: " + absolutePath);

  const xsrf = await getXsrfToken(securityCookie);
  const form = new FormData();
  // Build request object exactly like browser payload
  const requestObj = {
    displayName: name,
    description,
    assetType: "Decal",
    creationContext: {
      creator: { userId: Number(userId) },
      expectedPrice: 0,
    },
  };

  form.append("request", JSON.stringify(requestObj));
  form.append("fileContent", fs.createReadStream(absolutePath), path.basename(absolutePath));

  logger.info(`Uploading ${name}...`);
  const maxAttempts = 15;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await axios.post(
        "https://apis.roblox.com/assets/user-auth/v1/assets",
        form,
        {
          headers: {
            ...form.getHeaders(),
            Cookie: `.ROBLOSECURITY=${securityCookie}`,
            "x-csrf-token": xsrf,
          },
          maxBodyLength: Infinity,
          validateStatus: (s) => true, // handle manually
        }
      );

      if (res.status === 429) {
        const retryAfter = Number(res.headers["retry-after"] || 10);
        logger.warn(`Rate limited. Waiting ${retryAfter}s before retry (${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (res.status >= 200 && res.status < 300) {
        logger.info(`Uploaded ${name} successfully`);
        return res.data;
      }

      // Other error status
      logger.error(`${res.status} – ${JSON.stringify(res.data)}`);

      // Detect moderated account error
      if (res.status === 403 && res.data && Array.isArray(res.data.errors)) {
        const moderated = res.data.errors.find((e) =>
          typeof e.message === "string" && e.message.toLowerCase().includes("user is moderated")
        );
        if (moderated) {
          throw new Error("USER_MODERATED");
        }
      }

      throw new Error(`Upload failed with status ${res.status}`);
    } catch (err) {
      if (attempt >= maxAttempts) {
        throw err;
      }
      logger.warn(`Attempt ${attempt} failed. Retrying in 10s...`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

module.exports = { uploadDecal };
