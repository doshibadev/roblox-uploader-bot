// A very small logger utility for consistent log messages
const DEBUG_FLAG = process.env.DEBUG_LOG === "1";

module.exports = {
  info: (msg, ...rest) => console.log("[INFO]", msg, ...rest),
  warn: (msg, ...rest) => console.warn("[WARN]", msg, ...rest),
  error: (msg, ...rest) => console.error("[ERROR]", msg, ...rest),
  debug: (msg, ...rest) => {
    if (DEBUG_FLAG) console.log("[DEBUG]", msg, ...rest);
  },
};
