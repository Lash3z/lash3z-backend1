// /assets/js/hydrate-user-balance.js
(() => {
  // Utility: safe text setter
  const setText = (sel, text) => document.querySelectorAll(sel).forEach(el => el.textContent = String(text));

  // Markup hooks you already have / should add:
  // 1) Header pill near the avatar:   <span data-username></span>  <span data-lbx></span>
  // 2) Top-right "LBX n" bubble:      <span data-lbx-bubble></span>
  // 3) Any other spots:                <span data-lbx-any></span> (optional)

  async function loadMe() {
    try {
      // Fetch the session profile. Adjust if your route differs.
      // Expecting: { user: { id, username, lbx } }
      const me = await window.api.get("/api/me");
      if (!me || !me.user) throw new Error("no-session");

      const username = me.user.username || "Guest";
      // Some backends put wallet on a separate route; try /api/wallet/balance if lbx missing.
      let lbx = typeof me.user.lbx === "number" ? me.user.lbx : null;
      if (lbx === null) {
        const w = await window.api.get("/api/wallet/balance");
        lbx = (w && typeof w.balance === "number") ? w.balance : 0;
      }

      // Write username + LBX into both places on Bets page
      setText("[data-username]", username);
      setText("[data-lbx]", lbx);
      setText("[data-lbx-bubble]", lbx);
      setText("[data-lbx-any]", lbx);

      // Optional: show/hide sections based on auth
      document.documentElement.setAttribute("data-auth", "ok");
    } catch (err) {
      console.warn("[hydrate] not logged in or API failed:", err.message || err);
      // Fallback to zero, but don’t crash the page
      setText("[data-lbx]", 0);
      setText("[data-lbx-bubble]", 0);
    }
  }

  // Fire once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadMe);
  } else {
    loadMe();
  }
})();
