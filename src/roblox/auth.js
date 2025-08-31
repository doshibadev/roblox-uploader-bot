const axios = require("axios");
const logger = require("../utils/logger");

/**
 * Fetch a fresh X-CSRF-TOKEN using the security cookie.
 * Roblox requires a failed authenticated request to return the token.
 * @param {string} securityCookie _|WARNING:DO NOT SHARE. Roblox security cookie.
 * @returns {Promise<string>} returns X-CSRF token
 */
async function getXsrfToken(securityCookie) {
  try {
    await axios.post("https://auth.roblox.com/v2/logout", null, {
      headers: { Cookie: `.ROBLOSECURITY=${securityCookie}` },
    });
  } catch (err) {
    const token = err?.response?.headers["x-csrf-token"];
    if (!token) {
      throw new Error("Failed to fetch X-CSRF-TOKEN from Roblox.");
    }
    logger.info("Fetched new X-CSRF token");
    return token;
  }
}

/**
 * Validate a Roblox security cookie by hitting the authenticated user endpoint.
 * @param {string} securityCookie
 * @returns {Promise<object>} user object if valid
 */
async function validateCookie(securityCookie) {
  try {
    const res = await axios.get("https://users.roblox.com/v1/users/authenticated", {
      headers: { Cookie: `.ROBLOSECURITY=${securityCookie}` },
    });
    return res.data; // contains id, name, etc.
  } catch (err) {
    throw new Error("Invalid .ROBLOSECURITY cookie or expired session.");
  }
}

module.exports = { getXsrfToken, validateCookie };
