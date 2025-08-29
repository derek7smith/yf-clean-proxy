import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();

// fetch with a timeout so requests do not hang forever
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

// remove charts and client scripts so the graph cannot appear or rehydrate
function harden($) {
  $('[data-test="qsp-chart"]').remove();           // main quote chart section
  $('[data-testid="chart-container"]').remove();   // generic chart container
  $('[data-test="sparkline"]').remove();           // tiny line charts
  $('[class*="sparkline"]').remove();

  $('[id*="chart"]').remove();                     // fallbacks
  $('[class*="chart"]').remove();

  // remove likely chart SVGs
  $('svg').each((_, el) => {
    const $el = $(el);
    if ($el.closest('[role="img"], [data-test], [class*="chart"], [id*="chart"]').length) {
      $el.remove();
    }
  });

  // stop client-side JS from re-injecting charts or live updates
  $('script').remove();
  $('iframe, embed').remove();
}

app.get("/quote/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const target = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;

  try {
    const upstream = await fetchWithTimeout(
      target,
      {
        headers: {
          // realistic headers reduce anti bot responses
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
        }
      },
      20000
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(`Upstream ${upstream.status} for ${target}. Body start:`, text.slice(0, 200));
      return res
        .status(502)
        .type("text/plain")
        .send(`Upstream fetch failed (${upstream.status}). Try again or a different ticker.`);
    }

    const html = await upstream.text();
    const $ = cheerio.load(html);

    harden($);

    $("body").prepend(`
      <div style="font-family: system-ui, Arial; background:#fffbe6; border-bottom:1px solid #ddd; padding:10px; text-align:center;">
        Charts removed by study configuration. Other information remains available.
      </div>
    `);

    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
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
