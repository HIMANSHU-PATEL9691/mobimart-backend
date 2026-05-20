const fs = require("fs").promises;
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "store.json");

exports.readStore = async () => {
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
};

exports.writeStore = async (store) => {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
};

exports.createId = (prefix) => `${prefix}${Date.now()}`;

exports.today = () => new Date().toISOString().slice(0, 10);
