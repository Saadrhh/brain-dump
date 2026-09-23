function env(name) {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function accessCodeExpected() {
  return (
    env("ACCESS_CODE") ||
    env("BRAIN_DUMP_ACCESS_CODE") ||
    env("SITE_ACCESS_CODE") ||
    env("N8N_AUTH_VALUE")
  );
}

function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return {};
}

function getAccessCode(req, body) {
  return String(
    req.headers["x-access-code"] ||
      body.access_code ||
      body.auth ||
      ""
  ).trim();
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Access-Code"
  );
}

async function forwardToN8n(res, { url, payload }) {
  const headerName = env("N8N_AUTH_HEADER") || "X-Brain-Dump-Key";
  const headerValue = env("N8N_AUTH_VALUE") || accessCodeExpected();

  if (!url) {
    return res.status(500).json({
      message: "Server is missing the n8n webhook URL. Check Vercel env vars.",
    });
  }

  if (!headerValue) {
    return res.status(500).json({
      message: "Server is missing N8N_AUTH_VALUE / ACCESS_CODE.",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [headerName]: headerValue,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text || "Empty response from n8n" };
    }

    if (upstream.status === 429) {
      return res.status(429).json({
        message:
          data.message ||
          "You're sending too fast. Wait a minute and try again.",
      });
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return res.status(401).json({
        message: data.message || "Unauthorized. Check n8n Header Auth.",
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
        message:
          data.message ||
          data.error ||
          "n8n returned an error (" + upstream.status + ").",
        digest: data.digest,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    if (err && err.name === "AbortError") {
      return res.status(504).json({
        message: "That took too long. Try again in a moment.",
      });
    }
    return res.status(502).json({
      message: "Couldn't reach n8n. Is the workflow Active?",
    });
  } finally {
    clearTimeout(timer);
  }
}

function requireAccess(req, res, body) {
  const expected = accessCodeExpected();
  if (!expected) {
    res.status(500).json({
      message:
        "Server ACCESS_CODE is not configured. In Vercel: set ACCESS_CODE for Production AND Preview, then Redeploy (without build cache). Check /api/health",
    });
    return false;
  }
  const got = getAccessCode(req, body);
  if (got !== expected) {
    res.status(401).json({ message: "Wrong access code." });
    return false;
  }
  return true;
}

module.exports = {
  env,
  accessCodeExpected,
  readJson,
  setCors,
  forwardToN8n,
  requireAccess,
};
