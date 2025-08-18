/* /api-shim.sw.js
   Dev-only API shim for static servers (Live Server).
   Intercepts /api/* and returns stub JSON so the UI doesn't explode.
   Scope: '/' (must be served from site root).
*/
const DEV_HOSTS = new Set(["127.0.0.1", "localhost"]);

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
}

function notFound() {
  return new Response("Not handled by dev shim", { status: 404 });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only shim on localhost/127.0.0.1
  if (!DEV_HOSTS.has(url.hostname)) return;

  // Only intercept /api/*
  if (!url.pathname.startsWith("/api/")) return;

  const { method } = event.request;
  const path = url.pathname;

  // ---- JACKPOT ----
  if (method === "GET" && path === "/api/jackpot") {
    // default AUD floor snapshot; next reset = first of next month
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    event.respondWith(
      json({ ok: true, currency: "AUD", month: now.getMonth() + 1, base: 150, subsCap: 0, amount: 150, nextResetTs: nextReset })
    );
    return;
  }
  if (method === "POST" && path === "/api/jackpot/reset") {
    event.respondWith(json({ ok: true, reset: true }));
    return;
  }

  // ---- AUTH/PLAYER ----
  if (method === "POST" && (path === "/api/auth/login" || path === "/api/login" || path === "/api/users/login" || path === "/api/player/login")) {
    event.respondWith(json({ ok: true }));
    return;
  }
  if (method === "GET" && (path === "/api/me" || path === "/api/users/me" || path === "/api/player/me" || path === "/api/wallet/me")) {
    // We can’t read localStorage in a SW; return a generic user.
    event.respondWith(json({ username: "PLAYER", balance: 0 }));
    return;
  }

  // ---- ADMIN GATE ----
  if (method === "GET" && path === "/api/admin/gate/check") {
    event.respondWith(json({ admin: false }));
    return;
  }
  if (method === "POST" && path === "/api/admin/gate/logout") {
    event.respondWith(json({ ok: true }));
    return;
  }

  // Anything else: let it 404 normally or pass through
  event.respondWith(notFound());
});
