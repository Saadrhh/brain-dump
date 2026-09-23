function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return {};
}

function getAccessCode(req, body) {
  return (
    req.headers["x-access-code"] ||
    req.headers["X-Access-Code"] ||
    body.access_code ||
    body.auth ||
    ""
  );
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Access-Code"
  );
}

async function forwardToN8n(res, { url, payload }) {
  const headerName = process.env.N8N_AUTH_HEADER || "X-Brain-Dump-Key";
  const headerValue = process.env.N8N_AUTH_VALUE || process.env.ACCESS_CODE;

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
  const expected = process.env.ACCESS_CODE;
  if (!expected) {
    res.status(500).json({
      message: "Server ACCESS_CODE is not configured in Vercel env.",
    });
    return false;
  }
  const got = String(getAccessCode(req, body) || "");
  if (got !== expected) {
    res.status(401).json({ message: "Wrong access code." });
    return false;
  }
  return true;
}

module.exports = {
  readJson,
  setCors,
  forwardToN8n,
  requireAccess,
};
