// backend/routes/auth.js
// Minimal auth routes that integrate with wallet.service one-time signup bonus.
// If Mongo is connected (globalThis.__db), users are stored in "users" collection.
// Otherwise users live in memory. Passwords are hashed with bcryptjs.

import express from "express";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import { grantSignupBonusIfNeeded, getWallet } from "../models/wallet/wallet.service.js";

const router = express.Router();

// cookie-parser is usually mounted in your app, but if not:
router.use(cookieParser());

const U = (s) => String(s || "").trim().toUpperCase();

// --- In-memory users fallback (when Mongo absent) ---
const mem = {
  users: new Map(), // key USERNAME -> { username, passHash, createdAt }
};

async function findUser(username) {
  const user = U(username);
  if (globalThis.__db) {
    const col = globalThis.__db.collection("users");
    return await col.findOne({ username: user });
  }
  return mem.users.get(user) || null;
}

async function createUser(username, passHash) {
  const user = U(username);
  const doc = { username: user, passHash, createdAt: new Date() };

  if (globalThis.__db) {
    const col = globalThis.__db.collection("users");
    await col.insertOne(doc);
    return doc;
  }
  mem.users.set(user, doc);
  return doc;
}

function setViewerCookie(res, username) {
  res.cookie("viewer", U(username), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
}

// ---------------------- ROUTES ----------------------

// Register (creates user if not exists) then grants one-time signup bonus
router.post("/api/viewer/register", express.json(), async (req, res) => {
  try {
    const username = U(req.body?.username || req.body?.user);
    const password = String(req.body?.password || "");
    if (!username || !password) return res.status(400).json({ error: "missing_credentials" });

    const existing = await findUser(username);
    if (existing) return res.status(409).json({ error: "user_exists" });

    const passHash = await bcrypt.hash(password, 10);
    const created = await createUser(username, passHash);

    // one-time bonus on first ever account
    await grantSignupBonusIfNeeded(username);

    // set cookie and return wallet
    setViewerCookie(res, username);
    const wallet = await getWallet(username);
    return res.json({ success: true, username, wallet: { balance: wallet.balance } });
  } catch (e) {
    console.error("[auth/register] error", e);
    return res.status(500).json({ error: "server_error" });
  }
});

// Login (does NOT reset wallet); also calls grantSignupBonusIfNeeded in case the
// user was created before this rule existed.
router.post("/api/viewer/login", express.json(), async (req, res) => {
  try {
    const username = U(req.body?.username || req.body?.user);
    const password = String(req.body?.password || "");
    if (!username || !password) return res.status(400).json({ error: "missing_credentials" });

    const user = await findUser(username);
    if (!user) return res.status(401).json({ error: "invalid_login" });

    const ok = await bcrypt.compare(password, user.passHash);
    if (!ok) return res.status(401).json({ error: "invalid_login" });

    // If they never got the bonus (e.g., old accounts), grant once now.
    await grantSignupBonusIfNeeded(username);

    // set cookie and return wallet
    setViewerCookie(res, username);
    const wallet = await getWallet(username);
    return res.json({ success: true, username, wallet: { balance: wallet.balance } });
  } catch (e) {
    console.error("[auth/login] error", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.get("/api/viewer/me", async (req, res) => {
  try {
    const cookieName = U(req.cookies?.viewer);
    const qName = U(req.query.viewer);
    const username = cookieName || qName || "";
    const wallet = await getWallet(username);
    return res.json({
      username,
      anon: !username,
      wallet: { balance: wallet.balance },
    });
  } catch (e) {
    console.error("[auth/me] error", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.post("/api/viewer/logout", (req, res) => {
  res.clearCookie("viewer", { path: "/" });
  res.json({ success: true });
});

export default router;
