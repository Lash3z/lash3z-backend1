// backend/models/wallet/wallet.service.js
// Works with Mongo if globalThis.__db is present; otherwise uses in-memory store.
// Ensures one-time signup bonus and keeps a simple ledger.

import crypto from "crypto";

// ---- helpers ----
const U = (s) => String(s || "").trim().toUpperCase();
const nowISO = () => new Date().toISOString();
const nextId = (pfx = "txn") => `${pfx}-${crypto.randomBytes(4).toString("hex")}`;

// In-memory fallback store (used when Mongo isn't connected)
const mem = {
  wallets: new Map(), // key: USERNAME, val: { username, balance, signupBonusGrantedAt?, ledger: [] }
};

// Normalize wallet shape
function normalizeWallet(obj = {}) {
  return {
    username: U(obj.username),
    balance: Number(obj.balance || 0),
    signupBonusGrantedAt: obj.signupBonusGrantedAt ? new Date(obj.signupBonusGrantedAt) : undefined,
    ledger: Array.isArray(obj.ledger) ? obj.ledger : [],
  };
}

// ========================== PUBLIC API ==========================

// Get wallet; create empty if missing (no bonus here).
export async function getWallet(username) {
  const user = U(username);
  if (!user) return normalizeWallet({ username: "" });

  if (globalThis.__db) {
    const col = globalThis.__db.collection("wallets");
    const found = await col.findOne({ username: user });
    if (!found) {
      const fresh = normalizeWallet({ username: user, balance: 0, ledger: [] });
      await col.insertOne({ ...fresh });
      return fresh;
    }
    return normalizeWallet(found);
  }

  // memory mode
  if (!mem.wallets.has(user)) {
    mem.wallets.set(user, normalizeWallet({ username: user, balance: 0, ledger: [] }));
  }
  return mem.wallets.get(user);
}

// Credit/debit balance (server-side only)
export async function adjustWallet(username, delta, reason = "adjust") {
  const user = U(username);
  const amount = Number(delta || 0);
  if (!user || !Number.isFinite(amount)) {
    return { ok: false, error: "bad_params" };
  }

  if (globalThis.__db) {
    const col = globalThis.__db.collection("wallets");
    const tx = { ts: nowISO(), delta: amount, reason, ref: nextId() };
    const r = await col.findOneAndUpdate(
      { username: user },
      {
        $inc: { balance: amount },
        $setOnInsert: { username: user, ledger: [], balance: 0 },
        $push: { ledger: tx },
      },
      { upsert: true, returnDocument: "after" }
    );
    return { ok: true, balance: Number(r.value?.balance || 0) };
  }

  // memory mode
  const w = await getWallet(user);
  w.balance = Number(w.balance || 0) + amount;
  w.ledger.push({ ts: nowISO(), delta: amount, reason, ref: nextId() });
  mem.wallets.set(user, w);
  return { ok: true, balance: w.balance };
}

// One-time signup bonus: if wallet has no signupBonusGrantedAt → credit bonus and stamp the date.
export async function grantSignupBonusIfNeeded(username, bonusEnv = process.env.SIGNUP_BONUS) {
  const user = U(username);
  const bonus = Number(bonusEnv || 0);
  if (!user || !bonus) return { ok: true, skipped: true };

  if (globalThis.__db) {
    const col = globalThis.__db.collection("wallets");
    const existing = await col.findOne({ username: user }, { projection: { signupBonusGrantedAt: 1 } });
    if (existing && existing.signupBonusGrantedAt) {
      // already granted
      const got = await col.findOne({ username: user }, { projection: { balance: 1 } });
      return { ok: true, skipped: true, balance: Number(got?.balance || 0) };
    }
    // first time grant (or wallet missing)
    const tx = { ts: nowISO(), delta: bonus, reason: "signup_bonus", ref: nextId() };
    const r = await col.findOneAndUpdate(
      { username: user },
      {
        $setOnInsert: { username: user, balance: 0, ledger: [] },
        $inc: { balance: bonus },
        $set: { signupBonusGrantedAt: new Date() },
        $push: { ledger: tx },
      },
      { upsert: true, returnDocument: "after" }
    );
    return { ok: true, balance: Number(r.value?.balance || 0) };
  }

  // memory mode
  const w = await getWallet(user);
  if (w.signupBonusGrantedAt) {
    return { ok: true, skipped: true, balance: w.balance };
  }
  w.balance = Number(w.balance || 0) + bonus;
  w.signupBonusGrantedAt = new Date();
  w.ledger.push({ ts: nowISO(), delta: bonus, reason: "signup_bonus", ref: nextId() });
  mem.wallets.set(user, w);
  return { ok: true, balance: w.balance };
}
