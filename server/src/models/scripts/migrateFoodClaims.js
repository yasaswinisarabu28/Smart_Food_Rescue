
import "dotenv/config";
import mongoose from "mongoose";
import Food from "../src/models/Food.js";
import Claim from "../src/models/Claim.js";

async function migrateFoodClaims() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const collection = Food.collection;
    const oldFoods = await collection.find({}).toArray();

    let migrated = 0;

    for (const oldFood of oldFoods) {
      const total = Number(oldFood.quantity || 0);

      // Already migrated: do not process this listing again.
      if (Number.isFinite(oldFood.remainingQuantity)) {
        continue;
      }

      const oldClaim = oldFood.claim;
      const hasRecipient = Boolean(oldClaim?.recipient);

      let remainingQuantity = total;

      if (
        oldFood.status === "claimed" ||
        oldFood.status === "completed" ||
        oldFood.status === "expired"
      ) {
        remainingQuantity = 0;
      }

      // Preserve the existing single-recipient claim, if one exists.
      if (hasRecipient) {
        const existingClaim = await Claim.findOne({
          food: oldFood._id,
          recipient: oldClaim.recipient
        });

        if (!existingClaim) {
          await Claim.create({
            food: oldFood._id,
            recipient: oldClaim.recipient,
            quantity: total,
            status:
              oldFood.status === "completed"
                ? "completed"
                : oldFood.status === "expired"
                  ? "expired"
                  : "reserved",
            claimedAt: oldClaim.claimedAt || oldFood.updatedAt || new Date(),
            completedAt:
              oldFood.status === "completed"
                ? oldFood.updatedAt || new Date()
                : null
          });
        }
      }

      await collection.updateOne(
        { _id: oldFood._id },
        {
          $set: { remainingQuantity },
          $unset: { claim: "" }
        }
      );

      migrated++;
    }

    console.log(`Migration finished. Updated ${migrated} food listing(s).`);
  } catch (error) {
    console.error("Food migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrateFoodClaims();
