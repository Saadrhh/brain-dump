const { readJson, setCors, requireAccess, forwardToN8n } = require("../lib/proxy");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ message: "POST only" });

  const body = readJson(req);
  if (!requireAccess(req, res, body)) return;

  const session_id =
    typeof body.session_id === "string" ? body.session_id : "";

  return forwardToN8n(res, {
    url: process.env.N8N_DIGEST_URL,
    payload: { session_id },
  });
};
