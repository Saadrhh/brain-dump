const { readJson, setCors, requireAccess, forwardToN8n } = require("../lib/proxy");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ message: "POST only" });

  const body = readJson(req);
  if (!requireAccess(req, res, body)) return;

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const session_id =
    typeof body.session_id === "string" ? body.session_id : "";

  if (!text) {
    return res.status(400).json({ message: "Type something before sending." });
  }

  return forwardToN8n(res, {
    url: process.env.N8N_BRAIN_DUMP_URL,
    payload: { text, session_id },
  });
};
