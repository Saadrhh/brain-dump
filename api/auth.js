const { readJson, setCors, requireAccess } = require("../lib/proxy");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ message: "POST only" });

  const body = readJson(req);
  if (!requireAccess(req, res, body)) return;

  return res.status(200).json({ ok: true });
};
