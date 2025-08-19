// backend/lib/grantSignupBonus.js
import User from "../models/User.js";

export async function grantSignupBonusIfNeeded(userId) {
  const bonus = Number(process.env.SIGNUP_BONUS || 0);
  if (!bonus) return false;

  // Grant once, atomically, and never overwrite an existing balance.
  const res = await User.updateOne(
    { _id: userId, "meta.signupBonusGranted": { $ne: true } },
    {
      $inc: { "wallet.balance": bonus },
      $set: { "meta.signupBonusGranted": true, "wallet.updatedAt": new Date() }
    }
  );
  return res.modifiedCount > 0; // true means we just granted it now
}
