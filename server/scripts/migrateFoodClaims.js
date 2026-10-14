import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Food from "../src/models/Food.js";
import Claim from "../src/models/Claim.js";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing from server/.env");
await mongoose.connect(process.env.MONGODB_URI);
try {
  const foods = await Food.collection.find({}).toArray();
  let updated = 0, claimsCreated = 0, skipped = 0;
  for (const raw of foods) {
    const update = {};
    if (raw.remainingQuantity === undefined) update.remainingQuantity = raw.quantity ?? 0;
    if (!raw.status) update.status = "available";
    if (Object.keys(update).length) {
      await Food.collection.updateOne({ _id: raw._id }, { $set: update });
      updated++;
    }
    const legacy = raw.claim;
    if (legacy?.recipient && legacy?.claimedAt) {
      const existing = await Claim.findOne({ food: raw._id, recipient: legacy.recipient });
      if (!existing) {
        await Claim.create({ food: raw._id, recipient: legacy.recipient, quantity: Math.max(1, Number(raw.quantity || 1)), status: raw.status === "completed" ? "completed" : "reserved", claimedAt: legacy.claimedAt });
        claimsCreated++;
      } else skipped++;
    }
  }
  console.log("Migration completed.", { updated, claimsCreated, skipped });
} finally {
  await mongoose.disconnect();
}
