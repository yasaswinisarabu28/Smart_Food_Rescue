import { Router } from "express";
import mongoose from "mongoose";
import Food from "../models/Food.js";
import Claim from "../models/Claim.js";
import Notification from "../models/Notification.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";

const router = Router();
const validId = id => mongoose.isValidObjectId(id);
const safeRegex = value => value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");

async function notify(user, message, type = "info", food = null, claim = null) {
  if (user) await Notification.create({ user, message, type, food, claim });
}
async function refreshFoodStatus(foodId) {
  const food = await Food.findById(foodId);
  if (!food || food.status === "completed" || food.status === "expired") return;
  const active = await Claim.exists({ food: foodId, status: { $in: ["reserved", "confirmed", "picked_up"] } });
  food.status = Number(food.remainingQuantity || 0) > 0 ? "available" : (active ? "claimed" : "available");
  await food.save();
}
const populatedClaims = () => [
  { path: "food", populate: { path: "donor", select: "name email" } },
  { path: "recipient", select: "name email" }
];

router.get("/", async (req, res, next) => {
  try {
    const { search = "", category = "all", status = "available", mine = "false" } = req.query;
    const filter = {};
    if (status !== "all") filter.status = status;
    if (category !== "all") filter.category = category;
    if (search.trim()) {
      const escaped = safeRegex(search.trim());
      filter.$or = [{ title: { $regex: escaped, $options: "i" } }, { location: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }];
    }
    if (mine === "true") {
      if (!req.headers.authorization?.startsWith("Bearer ")) return res.status(401).json({ message: "Please log in to view your donations." });
      // Use the standard auth middleware instead of decoding tokens in this public route.
      const jwt = await import("jsonwebtoken");
      let payload;
      try { payload = jwt.default.verify(req.headers.authorization.slice(7), process.env.JWT_SECRET); }
      catch { return res.status(401).json({ message: "Your session expired. Please log in again." }); }
      filter.donor = payload.id;
    }
    const foods = await Food.find(filter).populate("donor", "name").sort({ createdAt: -1 }).limit(200).lean();
    res.json({ foods });
  } catch (err) { next(err); }
});

router.post("/", requireAuth, allowRoles("donor"), async (req, res, next) => {
  try {
    const { title, description = "", category = "Meals", quantity, unit = "meal boxes", location, pickupDeadline } = req.body;
    if (!String(title || "").trim()) return res.status(400).json({ message: "Food title is required." });
    if (!String(location || "").trim()) return res.status(400).json({ message: "Pickup location is required." });
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: "Quantity must be a whole number of at least 1." });
    const deadline = new Date(pickupDeadline);
    if (!pickupDeadline || Number.isNaN(deadline.getTime()) || deadline <= new Date()) return res.status(400).json({ message: "Pickup deadline must be in the future." });
    const food = await Food.create({ title: String(title).trim(), description, category, quantity: qty, remainingQuantity: qty, unit, location: String(location).trim(), pickupDeadline: deadline, donor: req.user._id });
    await food.populate("donor", "name");
    res.status(201).json({ food });
  } catch (err) { next(err); }
});

router.get("/my-claims", requireAuth, allowRoles("recipient"), async (req, res, next) => {
  try {
    const claims = await Claim.find({ recipient: req.user._id }).populate(populatedClaims()).sort({ createdAt: -1 }).limit(200);
    res.json({ claims });
  } catch (err) { next(err); }
});

router.get("/donor-claims", requireAuth, allowRoles("donor"), async (req, res, next) => {
  try {
    const myFoods = await Food.find({ donor: req.user._id }).select("_id");
    const claims = await Claim.find({ food: { $in: myFoods.map(f => f._id) } }).populate(populatedClaims()).sort({ createdAt: -1 }).limit(200);
    res.json({ claims });
  } catch (err) { next(err); }
});


router.post("/:id/claim", requireAuth, allowRoles("recipient"), async (req, res, next) => {
  let reservedFoodId = null;
  let reservedQuantity = 0;
  let createdClaimId = null;

  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ message: "Invalid food listing." });
    }

    const qty = Number(req.body.quantity ?? 1);

    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: "Choose a valid quantity." });
    }

    // Atomically reserve only if enough quantity is still available.
    const food = await Food.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: ["available", "claimed"] },
        donor: { $ne: req.user._id },
        pickupDeadline: { $gt: new Date() },
        remainingQuantity: { $gte: qty }
      },
      {
        $inc: { remainingQuantity: -qty }
      },
      { new: true }
    );

    if (!food) {
      return res.status(409).json({
        message: "Not enough food is available, the pickup deadline has passed, or you cannot claim your own donation."
      });
    }

    reservedFoodId = food._id;
    reservedQuantity = qty;

    food.status = food.remainingQuantity === 0 ? "claimed" : "available";
    await food.save();

    const claim = await Claim.create({
      food: food._id,
      recipient: req.user._id,
      quantity: qty
    });

    createdClaimId = claim._id;

    // Notify the donor after the reservation has been created.
    try {
      await notify(
        food.donor,
        `${req.user.name} reserved ${qty} ${food.unit} of ${food.title}.`,
        "claim",
        food._id,
        claim._id
      );
    } catch (notificationError) {
      console.error("Reservation notification failed:", notificationError.message);
    }

    const populatedClaim = await Claim.findById(claim._id).populate(populatedClaims());

    return res.status(201).json({
      claim: populatedClaim,
      message: "Food reserved successfully."
    });
  } catch (err) {
    // Best-effort compensation if creating the claim failed after stock was reserved.
    if (reservedFoodId && reservedQuantity > 0) {
      try {
        if (createdClaimId) {
          await Claim.deleteOne({ _id: createdClaimId });
        }

        await Food.updateOne(
          { _id: reservedFoodId },
          { $inc: { remainingQuantity: reservedQuantity } }
        );

        await refreshFoodStatus(reservedFoodId);
      } catch (rollbackError) {
        console.error(
          "IMPORTANT: Reservation rollback failed:",
          rollbackError.message
        );
      }
    }

    next(err);
  }
});

router.patch("/claims/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid claim." });
    const claim = await Claim.findById(req.params.id).populate("food");
    if (!claim) return res.status(404).json({ message: "Claim not found." });
    const isRecipient = claim.recipient.toString() === req.user._id.toString();
    const isDonor = claim.food.donor.toString() === req.user._id.toString();
    if (!isRecipient && !isDonor) return res.status(403).json({ message: "You cannot cancel this claim." });
    if (!["reserved", "confirmed"].includes(claim.status)) return res.status(409).json({ message: "This claim can no longer be cancelled." });
    claim.status = "cancelled"; await claim.save();
    const food = await Food.findById(claim.food._id);
    if (food && food.status !== "completed" && food.status !== "expired") {
      food.remainingQuantity = Math.min(food.quantity, Number(food.remainingQuantity || 0) + claim.quantity);
      food.status = "available"; await food.save();
    }
    await notify(isRecipient ? claim.food.donor : claim.recipient, `A reservation for ${claim.food.title} was cancelled.`, "claim", claim.food._id, claim._id);
    res.json({ claim, message: "Reservation cancelled and quantity returned to stock." });
  } catch (err) { next(err); }
});

router.patch("/claims/:id/status", requireAuth, allowRoles("donor"), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid claim." });
    const claim = await Claim.findById(req.params.id).populate("food");
    if (!claim) return res.status(404).json({ message: "Claim not found." });
    if (claim.food.donor.toString() !== req.user._id.toString()) return res.status(403).json({ message: "Only the donor can update this claim." });
    const nextStatus = req.body.status;
    if (!["confirmed", "picked_up"].includes(nextStatus)) return res.status(400).json({ message: "Unsupported claim status." });
    const allowed = nextStatus === "confirmed" ? ["reserved"] : ["confirmed"];
    if (!allowed.includes(claim.status)) return res.status(409).json({ message: `Cannot move a ${claim.status} claim to ${nextStatus}.` });
    claim.status = nextStatus; await claim.save();
    await notify(claim.recipient, `Your reservation for ${claim.food.title} is now ${nextStatus.replace("_", " ")}.`, "claim", claim.food._id, claim._id);
    res.json({ claim, message: "Claim status updated successfully." });
  } catch (err) { next(err); }
});

router.patch("/claims/:id/complete", requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid claim." });
    const claim = await Claim.findById(req.params.id).populate("food");
    if (!claim) return res.status(404).json({ message: "Claim not found." });
    const isRecipient = claim.recipient.toString() === req.user._id.toString();
    const isDonor = claim.food.donor.toString() === req.user._id.toString();
    if (!isRecipient && !isDonor) return res.status(403).json({ message: "You cannot complete this claim." });
    if (!["picked_up", "confirmed"].includes(claim.status)) return res.status(409).json({ message: "Confirm or pick up this reservation before completing it." });
    claim.status = "completed"; claim.completedAt = new Date(); await claim.save();
    const active = await Claim.exists({ food: claim.food._id, status: { $in: ["reserved", "confirmed", "picked_up"] } });
    const food = await Food.findById(claim.food._id);
    if (food && !active && food.remainingQuantity === 0) food.status = "completed";
    if (food) await food.save();
    await notify(isDonor ? claim.recipient : claim.food.donor, `The rescue for ${claim.food.title} has been completed.`, "claim", claim.food._id, claim._id);
    res.json({ claim, message: "Rescue marked as completed." });
  } catch (err) { next(err); }
});

export default router;
