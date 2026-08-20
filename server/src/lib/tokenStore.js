const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "shopify_token.json");

function readToken() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    return JSON.parse(raw).accessToken || null;
  } catch {
    return null;
  }
}

function writeToken(accessToken) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ accessToken, savedAt: new Date().toISOString() }, null, 2));
}

module.exports = { readToken, writeToken };
