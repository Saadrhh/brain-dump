const { setCors, env, accessCodeExpected } = require("../lib/proxy");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  return res.status(200).json({
    ok: true,
    env: {
      ACCESS_CODE: Boolean(env("ACCESS_CODE")),
      BRAIN_DUMP_ACCESS_CODE: Boolean(env("BRAIN_DUMP_ACCESS_CODE")),
      N8N_AUTH_VALUE: Boolean(env("N8N_AUTH_VALUE")),
      N8N_AUTH_HEADER: Boolean(env("N8N_AUTH_HEADER")),
      N8N_BRAIN_DUMP_URL: Boolean(env("N8N_BRAIN_DUMP_URL")),
      N8N_DIGEST_URL: Boolean(env("N8N_DIGEST_URL")),
      resolvedAccessCode: Boolean(accessCodeExpected()),
      vercelEnv: process.env.VERCEL_ENV || null,
    },
  });
};
