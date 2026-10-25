import http from "node:http";
import { register } from "node:module";

const PORT = Number(process.env.DEMO_PORT ?? 8787);
const WATCHDOG_EVERY_MS = 5_000;

Object.assign(process.env, {
  GRACE_MINUTES: process.env.GRACE_MINUTES ?? "1",
  WATCHDOG_SECRET: "demo",
  TWILIO_ACCOUNT_SID: "ACdemo",
  TWILIO_AUTH_TOKEN: "demo",
  TWILIO_FROM: "+17875550100",
});

const handlers = [];
globalThis.Deno = {
  env: { get: (k) => process.env[k] },
  serve: (h) => handlers.push(h),
};

const listeners = new Map();
const backlog = new Map();
const log = [];

function deliver(token, msg) {
  log.push({ at: Date.now(), token, ...msg });
  const set = listeners.get(token);
  if (set && set.size) {
    for (const res of set) res.write(`data: ${JSON.stringify(msg)}\n\n`);
  } else {
    const q = backlog.get(token) ?? [];
    q.push({ at: Date.now(), msg });
    backlog.set(token, q);
  }
}

register("./hooks.mjs", import.meta.url);
const db = await import(new URL("./fakedb.ts", import.meta.url).href);

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://exp.host/")) {
    const messages = JSON.parse(init.body);
    for (const m of messages) deliver(m.to, { kind: "push", ...m });
    return Response.json({ data: messages.map(() => ({ status: "ok" })) });
  }
  if (u.startsWith("https://api.twilio.com/")) {
    const p = new URLSearchParams(init.body);
    const to = p.get("To");
    const contact = db.tables.contacts.find((c) => c.phone === to && c.push_token);
    if (contact) deliver(contact.push_token, { kind: "sms", from: p.get("From"), body: p.get("Body") });
    else log.push({ at: Date.now(), kind: "sms-undelivered", to, body: p.get("Body") });
    return new Response("{}", { status: 201 });
  }
  return realFetch(url, init);
};

await import(new URL("../../supabase/functions/api/index.ts", import.meta.url).href);
await import(new URL("../../supabase/functions/watchdog/index.ts", import.meta.url).href);
const [api, watchdog] = handlers;

setInterval(async () => {
  try {
    const res = await watchdog(new Request("http://local/watchdog", { headers: { "x-watchdog-secret": "demo" } }));
    const out = await res.json();
    if (out.acted) console.log("watchdog acted", out);
  } catch (e) {
    console.error("watchdog error", e);
  }
}, WATCHDOG_EVERY_MS);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const readBody = (req) =>
  new Promise((ok) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => ok(s));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    if (url.pathname === "/api" && req.method === "POST") {
      const body = await readBody(req);
      const out = await api(new Request("http://local/api", { method: "POST", headers: req.headers, body }));
      const text = await out.text();
      const action = (() => {
        try {
          return JSON.parse(body).action;
        } catch {
          return "?";
        }
      })();
      if (action !== "family_status") console.log(action, out.status, text.slice(0, 160));
      res.writeHead(out.status, { ...cors, "content-type": "application/json" }).end(text);
      return;
    }
    if (url.pathname === "/events") {
      const token = url.searchParams.get("token") ?? "";
      res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(": hi\n\n");
      const set = listeners.get(token) ?? new Set();
      set.add(res);
      listeners.set(token, set);
      for (const { at, msg } of backlog.get(token) ?? []) {
        if (Date.now() - at < 120_000) res.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
      backlog.delete(token);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(ping);
        set.delete(res);
      });
      return;
    }
    if (url.pathname === "/reset" && req.method === "POST") {
      db.reset();
      log.length = 0;
      backlog.clear();
      res.writeHead(200, cors).end("ok");
      return;
    }
    if (url.pathname === "/state") {
      res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ tables: db.tables, log }, null, 1));
      return;
    }
    res.writeHead(404, cors).end("not found");
  })
  .listen(PORT, () => console.log(`RedVita demo server on http://localhost:${PORT}`));
