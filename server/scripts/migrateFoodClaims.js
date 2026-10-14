
import "dotenv/config";
import mongoose from "mongoose";
import Food from "../src/models/Food.js";
import Claim from "../src/models/Claim.js";

async function migrateFoodClaims() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the server/.env file.");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    // Read the original documents directly from MongoDB.
    // This allows us to access the old embedded `claim` field
    // even though the updated Food model no longer defines it.
    const foods = await Food.collection.find({}).toArray();

    let updatedCount = 0;
    let skippedCount = 0;
    let claimsCreated = 0;

    for (const oldFood of foods) {
      // Skip documents that have already been migrated.
      if (
        Number.isFinite(oldFood.remainingQuantity) &&
        !oldFood.claim
      ) {
        skippedCount++;
        continue;
      }

      const totalQuantity = Number(oldFood.quantity);

      if (!Number.isFinite(totalQuantity) || totalQuantity < 1) {
        console.warn(
          `Skipping food ${oldFood._id}: invalid quantity.`
        );
        skippedCount++;
        continue;
      }

      const oldClaim = oldFood.claim;
      const hasRecipient = Boolean(oldClaim?.recipient);

      // Preserve remaining quantity if it already exists.
      let remainingQuantity = Number.isFinite(
        oldFood.remainingQuantity
      )
        ? oldFood.remainingQuantity
        : totalQuantity;

      // Legacy listings marked claimed/completed/expired are
      // treated as having no remaining quantity.
      if (
        !Number.isFinite(oldFood.remainingQuantity) &&
        ["claimed", "completed", "expired"].includes(oldFood.status)
      ) {
        remainingQuantity = 0;
      }

      // Convert an old embedded claim to a separate Claim document.
      if (hasRecipient) {
        const existingClaim = await Claim.findOne({
          food: oldFood._id,
          recipient: oldClaim.recipient
        });

        if (!existingClaim) {
          const claimStatus =
            oldFood.status === "completed"
              ? "completed"
              : oldFood.status === "expired"
                ? "expired"
                : "reserved";

          await Claim.create({
            food: oldFood._id,
            recipient: oldClaim.recipient,
            quantity: totalQuantity,
            status: claimStatus,
            claimedAt:
              oldClaim.claimedAt ||
              oldFood.updatedAt ||
              new Date(),
            completedAt:
              claimStatus === "completed"
                ? oldFood.updatedAt || new Date()
                : null
          });

          claimsCreated++;
        }
      }

      // Update the existing food document without replacing it.
      const updateFields = { remainingQuantity };

      await Food.collection.updateOne(
        { _id: oldFood._id },
        {
          $set: updateFields,
          $unset: { claim: "" }
        }
      );

      updatedCount++;
    }

    console.log("\nMigration completed.");
    console.log(`Food listings updated: ${updatedCount}`);
    console.log(`Claims created: ${claimsCreated}`);
    console.log(`Food listings skipped: ${skippedCount}`);
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

migrateFoodClaims();
