import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();

// Fetch with a timeout so requests do not hang forever
async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// Insert a <base> so relative URLs (CSS/JS/images) load from Yahoo, not your domain
function ensureBaseHref($, origin) {
  const hasBase = $("head base[href]").length > 0;
  if (!hasBase) {
    const baseTag = `<base href="${origin}">`;
    if ($("head").length) $("head").prepend(baseTag);
    else $("html").prepend(`<head>${baseTag}</head>`);
  }
}

// Hide only chart containers via CSS (keep Yahoo’s own CSS/JS intact)
function hideChartsWithCss($) {
  const css = `
    /* Main quote chart */
    section[data-test="qsp-chart"] { display: none !important; }

    /* Common chart wrappers */
    [data-testid="chart-container"] { display: none !important; }

    /* Small sparklines */
    [data-test="sparkline"] { display: none !important; }
    svg[aria-label*="sparkline" i] { display: none !important; }

    /* Any SVG explicitly labeled as a chart (accessibility label) */
    svg[aria-label*="chart" i] { display: none !important; }

    /* Remove extra gap if any after hiding main chart */
    section[data-test="qsp-chart"] + * { margin-top: 0 !important; }
  `.trim();

  const head = $("head");
  if (head.length) head.append(`<style id="study-hide-charts">${css}</style>`);
  else $("body").prepend(`<style id="study-hide-charts">${css}</style>`);
}

const DESKTOP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-User": "?1",
  "Sec-Fetch-Dest": "document",
  "Referer": "https://finance.yahoo.com/",
  "Connection": "keep-alive"
};

app.get("/quote/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const origin = "https://finance.yahoo.com";
  const target = `${origin}/quote/${encodeURIComponent(ticker)}`;

  try {
    const upstream = await fetchWithTimeout(target, { headers: DESKTOP_HEADERS }, 20000);
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error(`Upstream ${upstream.status} for ${target}. Body start:`, body.slice(0, 200));
      return res
        .status(502)
        .type("text/plain")
        .send(`Upstream fetch failed (${upstream.status}). Try again or a different ticker.`);
    }

    const html = await upstream.text();
    const $ = cheerio.load(html);

    // 1) Make relative URLs point to Yahoo (fixes missing CSS/JS/icons)
    ensureBaseHref($, origin);

    // 2) Keep Yahoo’s layout/scripts, just hide charts
    hideChartsWithCss($);

    // Do NOT strip scripts; do NOT set CSP that might block Yahoo assets.
    res.send($.html());
  } catch (e) {
    console.error("Proxy error:", e);
    if (e.name === "AbortError") {
      return res.status(504).type("text/plain").send("Upstream timeout (20s). Try again.");
    }
    res.status(500).type("text/plain").send(`Proxy error: ${e.message}`);
  }
});

app.get("/", (_req, res) => {
  res.type("text/plain").send("OK. Use /quote/TICKER (e.g., /quote/AAPL)");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
