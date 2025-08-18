// backend/routes/auth.js
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";

const router = express.Router();

// naive demo store — replace with your DB/session store
const SESSIONS = new Map(); // sid -> { userId, username, lbx }

function setSession(res, data) {
  const sid = crypto.randomUUID();
  SESSIONS.set(sid, data);
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,             // keep true on https://LASH3Z.com
    maxAge: 12 * 60 * 60 * 1000
  });
}

// middlewares
router.use(cookieParser());
router.use(express.json());

// POST /api/auth/login  { username, password? }
router.post("/login", (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok:false, error:"Missing username" });

  // TODO: validate password, fetch LBX from DB
  const profile = { userId: "u_" + String(username).toLowerCase(), username, lbx: 500 };
  setSession(res, profile);
  res.json({ ok:true, ...profile });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) SESSIONS.delete(sid);
  res.clearCookie("sid", { sameSite: "Lax", secure: true });
  res.json({ ok:true });
});

// GET /api/auth/session
router.get("/session", (req, res) => {
  const sid = req.cookies?.sid;
  const sess = sid && SESSIONS.get(sid);
  if (!sess) return res.status(401).json({ ok:false });
  res.json(sess); // { userId, username, lbx }
});

export default router;
export { router as authRouter };
