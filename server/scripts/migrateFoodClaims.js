import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";

/**
 * One-time migration for installations created with the original Food.claim
 * embedded field and no remainingQuantity/Claim collection.
 *
 * The script works against raw collections so the newer strict Mongoose Food
 * schema does not hide the legacy embedded `claim` field during migration.
 * It is idempotent: existing claim documents are not duplicated.
 */
async function migrate() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI. Configure server/.env first.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  const foodsCollection = db.collection("foods");
  const claimsCollection = db.collection("claims");
  const usersCollection = db.collection("users");

  let updatedFoods = 0;
  let createdClaims = 0;
  let skippedFoods = 0;

  const cursor = foodsCollection.find({});

  for await (const food of cursor) {
    const quantity = Number(food.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      skippedFoods += 1;
      continue;
    }

    const setFields = {};
    if (food.remainingQuantity === undefined || food.remainingQuantity === null) {
      if (food.status === "claimed" || food.status === "completed") {
        setFields.remainingQuantity = 0;
      } else {
        setFields.remainingQuantity = quantity;
      }
    }

    if (!food.status) setFields.status = "available";

    if (Object.keys(setFields).length > 0) {
      await foodsCollection.updateOne({ _id: food._id }, { $set: setFields });
      updatedFoods += 1;
    }

    const legacyClaim = food.claim;
    const recipientId = legacyClaim?.recipient;
    if (!recipientId || !mongoose.isValidObjectId(recipientId)) {
      continue;
    }

    const recipientExists = await usersCollection.findOne(
      { _id: recipientId, role: "recipient" },
      { projection: { _id: 1 } }
    );
    if (!recipientExists) continue;

    const alreadyExists = await claimsCollection.findOne({
      food: food._id,
      recipient: recipientId
    });
    if (alreadyExists) continue;

    const claimedAt = legacyClaim.claimedAt ? new Date(legacyClaim.claimedAt) : new Date();
    const isCompleted = food.status === "completed";

    await claimsCollection.insertOne({
      food: food._id,
      recipient: recipientId,
      quantity,
      status: isCompleted ? "completed" : "reserved",
      claimedAt,
      completedAt: isCompleted ? (claimedAt || new Date()) : null,
      createdAt: claimedAt,
      updatedAt: new Date()
    });
    createdClaims += 1;
  }

  console.log("\nMigration completed.");
  console.log(`Food listings updated: ${updatedFoods}`);
  console.log(`Claims created: ${createdClaims}`);
  console.log(`Food listings skipped: ${skippedFoods}`);
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
