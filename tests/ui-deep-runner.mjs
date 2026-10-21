// Opens the real index.html in headless Chrome with an in-memory Firebase stand-in.
// Chart, PDF, and spreadsheet CDNs are replaced so the page can boot offline.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromeBin = process.env.CHROME_BIN || "/usr/local/bin/google-chrome";
const debugPort = Number(process.env.CHROME_DEEP_PORT || 9334);

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".json")) return "application/json";
  return "text/plain; charset=utf-8";
}

function rewriteIndex(html) {
  let out = html.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js[^"]*"><\/script>\s*/,
    '<script src="/tests/ui-stubs.js"></script>\n',
  );
  out = out.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf[^"]*"><\/script>\s*/g, "");
  out = out.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx[^"]*"><\/script>\s*/g, "");
  out = out.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs[^"]*"><\/script>\s*/g, "");
  out = out.replace(
    '<script src="js/firebase-config.js"></script>',
    '<script src="/tests/fake-browser-firebase.js"></script>\n<script src="js/firebase-config.js"></script>',
  );
  out = out.replace(/<script>\s*if \('serviceWorker'[\s\S]*?<\/script>\s*/, "");
  out = out.replace(
    "</body>",
    '<pre id="zentory-test-result"></pre>\n<script src="/tests/ui-deep.js"></script>\n</body>',
  );
  return out;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/" || urlPath === "/index.html") {
      const html = rewriteIndex(fs.readFileSync(path.join(root, "index.html"), "utf8"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }
    const file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(urlPath);
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitForJson(url) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      last = String(res.status);
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Chrome debugging endpoint did not open (${last})`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const events = [];
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("DevTools socket failed")));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message || "CDP error"));
      else waiter.resolve(msg.result);
      return;
    }
    if (msg.method) events.push(msg);
  });
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  return { ws, opened, send, events };
}

async function main() {
  const server = await startServer();
  const { port } = server.address();
  const userData = `/tmp/zentory-ui-deep-${Date.now()}`;
  const chrome = spawn(chromeBin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ], { stdio: "ignore" });

  let failed = false;
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!page) throw new Error("Chrome did not expose a page target");
    const session = connect(page.webSocketDebuggerUrl);
    await session.opened;
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });

    let payload = null;
    for (let i = 0; i < 240; i++) {
      const evaluated = await session.send("Runtime.evaluate", {
        expression: "document.getElementById('zentory-test-result') && document.getElementById('zentory-test-result').textContent",
        returnByValue: true,
      });
      const text = evaluated.result && evaluated.result.value;
      if (text && text.includes('"done":true')) {
        payload = JSON.parse(text);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!payload) {
      const dump = await session.send("Runtime.evaluate", {
        expression: "document.body ? document.body.innerText.slice(0, 4000) : ''",
        returnByValue: true,
      });
      const errors = session.events
        .filter((e) => e.method === "Runtime.exceptionThrown" || e.method === "Runtime.consoleAPICalled")
        .slice(-12)
        .map((e) => {
          if (e.method === "Runtime.exceptionThrown") return e.params.exceptionDetails && (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || e.params.exceptionDetails.text);
          const args = (e.params.args || []).map((a) => a.value || a.description || "").join(" ");
          return e.params.type + " " + args;
        });
      throw new Error(`Deep UI suite produced no result.\n${(dump.result && dump.result.value) || ""}\n${errors.join("\n")}`);
    }

    const failedCases = payload.results.filter((r) => !r.pass);
    for (const row of payload.results) {
      console.log(`${row.pass ? "ok" : "not ok"} ui-deep ${row.name}`);
      if (!row.pass && row.detail) console.log(row.detail.split("\n").slice(0, 12).join("\n"));
    }
    console.log(`ui-deep ${payload.results.length - failedCases.length}/${payload.results.length} passed`);
    failed = failedCases.length > 0;
    session.ws.close();
  } finally {
    chrome.kill("SIGKILL");
    server.close();
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
