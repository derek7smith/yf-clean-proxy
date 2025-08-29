import express from "express";
import fetch from "node-fetch";
import cheerio from "cheerio";

const app = express();

// Remove charts and client scripts so no graph appears and the page does not auto update
function harden($) {
  $('[data-test="qsp-chart"]').remove();
  $('[data-testid="chart-container"]').remove();
  $('[data-test="sparkline"]').remove();
  $('[class*="sparkline"]').remove();
  $('[id*="chart"]').remove();
  $('[class*="chart"]').remove();

  $('svg').each((_, el) => {
    const $el = $(el);
    if ($el.closest('[role="img"], [data-test], [class*="chart"], [id*="chart"]').length) {
      $el.remove();
    }
  });

  $('script').remove();
  $('iframe, embed').remove();
}

app.get("/quote/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const target = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream error fetching ${ticker}`);
      return;
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
    res.status(500).send(`Proxy error: ${e.message}`);
  }
});

app.get("/", (_req, res) => {
  res.type("text/plain").send("OK. Use /quote/TICKER for example /quote/AAPL");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
