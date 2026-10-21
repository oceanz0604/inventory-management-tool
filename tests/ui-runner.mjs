// Drives tests/ui-harness.html in headless Chrome over the DevTools protocol.
// The harness loads the real POS, purchase, orders, and parties scripts against
// localStorage. It does not load Firebase.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromeBin = process.env.CHROME_BIN || "/usr/local/bin/google-chrome";
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9333);

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "/tests/ui-harness.html" : urlPath;
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(rel);
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
  const userData = `/tmp/zentory-ui-${Date.now()}`;
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
    await session.send("Page.navigate", { url: `http://127.0.0.1:${port}/tests/ui-harness.html` });

    let payload = null;
    for (let i = 0; i < 50; i++) {
      const evaluated = await session.send("Runtime.evaluate", {
        expression: "document.getElementById('result') && document.getElementById('result').textContent",
        returnByValue: true,
      });
      const text = evaluated.result && evaluated.result.value;
      if (text && text.includes('"done":true')) {
        payload = JSON.parse(text);
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!payload) {
      const dump = await session.send("Runtime.evaluate", {
        expression: "document.body ? document.body.innerText.slice(0, 2000) : ''",
        returnByValue: true,
      });
      const errors = session.events
        .filter((e) => e.method === "Runtime.exceptionThrown")
        .map((e) => e.params.exceptionDetails && e.params.exceptionDetails.text);
      throw new Error(`UI harness produced no result.\n${(dump.result && dump.result.value) || ""}\n${errors.join("\n")}`);
    }

    const failedCases = payload.results.filter((r) => !r.pass);
    for (const row of payload.results) {
      console.log(`${row.pass ? "ok" : "not ok"} ui ${row.name}`);
      if (!row.pass && row.detail) console.log(row.detail.split("\n").slice(0, 8).join("\n"));
    }
    console.log(`ui ${payload.results.length - failedCases.length}/${payload.results.length} passed`);
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
