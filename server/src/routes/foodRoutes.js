import { Router } from "express";
import mongoose from "mongoose";
import Food from "../models/Food.js";
import Claim from "../models/Claim.js";
import Notification from "../models/Notification.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";

const router = Router();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}


// Notifications should not break the primary claim/reservation action.
async function createNotification({ user, actor, type, title, message, food, claim }) {
  if (!user) return;
  try {
    await Notification.create({ user, actor: actor || null, type, title, message, food: food || null, claim: claim || null });
  } catch (error) {
    console.error("Could not create notification:", error.message);
  }
}

// GET /api/food
// List food listings, with optional search, category and donor filters.
router.get("/", async (req, res, next) => {
  try {
    const {
      search = "",
      category = "all",
      status = "available",
      mine = "false"
    } = req.query;

    const filter = {};

    if (typeof status === "string" && status !== "all") filter.status = status;
    if (typeof category === "string" && category !== "all") filter.category = category;

    if (typeof search === "string" && search.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: "i" };
      filter.$or = [
        { title: regex },
        { location: regex },
        { description: regex }
      ];
    }

    if (mine === "true") {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;

      if (!token) {
        return res.status(401).json({ message: "Please log in to view your food." });
      }

      const jwt = await import("jsonwebtoken");
      let payload;
      try {
        payload = jwt.default.verify(token, process.env.JWT_SECRET);
      } catch {
        return res.status(401).json({ message: "Session expired or invalid. Please log in again." });
      }

      const donorId = payload.id || payload._id;
      if (!donorId || !mongoose.isValidObjectId(donorId)) {
        return res.status(401).json({ message: "Invalid authentication token." });
      }

      filter.donor = donorId;
    }

    const foods = await Food.find(filter)
      .populate("donor", "name")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ foods });
  } catch (err) {
    next(err);
  }
});

// GET /api/food/my-claims
// Claims belonging to the logged-in recipient.
router.get(
  "/my-claims",
  requireAuth,
  allowRoles("recipient"),
  async (req, res, next) => {
    try {
      const claims = await Claim.find({ recipient: req.user._id })
        .populate({
          path: "food",
          populate: { path: "donor", select: "name" }
        })
        .sort({ createdAt: -1 });

      return res.json({ claims });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/food/donor-claims
// Reservations on the logged-in donor's own food listings.
router.get(
  "/donor-claims",
  requireAuth,
  allowRoles("donor"),
  async (req, res, next) => {
    try {
      const donorFoods = await Food.find({ donor: req.user._id }).select("_id").lean();
      const foodIds = donorFoods.map((food) => food._id);

      if (foodIds.length === 0) {
        return res.json({ claims: [] });
      }

      const claims = await Claim.find({ food: { $in: foodIds } })
        .populate("recipient", "name email")
        .populate({
          path: "food",
          populate: { path: "donor", select: "name" }
        })
        .sort({ createdAt: -1 });

      return res.json({ claims });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/food
// Create a food listing.
router.post(
  "/",
  requireAuth,
  allowRoles("donor"),
  async (req, res, next) => {
    try {
      const {
        title,
        description = "",
        category = "Meals",
        quantity,
        unit = "meal boxes",
        location,
        pickupDeadline
      } = req.body;

      if (!String(title || "").trim()) {
        return res.status(400).json({ message: "Food title is required." });
      }

      if (!String(location || "").trim()) {
        return res.status(400).json({ message: "Pickup location is required." });
      }

      const qty = Number(quantity);
      if (!isValidPositiveInteger(qty)) {
        return res.status(400).json({ message: "Quantity must be a whole number of at least 1." });
      }

      const deadline = new Date(pickupDeadline);
      if (!pickupDeadline || Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
        return res.status(400).json({ message: "Pickup deadline must be in the future." });
      }

      const food = await Food.create({
        title: String(title).trim(),
        description,
        category,
        quantity: qty,
        remainingQuantity: qty,
        unit,
        location: String(location).trim(),
        pickupDeadline: deadline,
        donor: req.user._id,
        status: "available"
      });

      await food.populate("donor", "name");
      return res.status(201).json({ food });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/food/:id/claim
// Reserve a selected quantity. Body: { "quantity": 2 }
router.post(
  "/:id/claim",
  requireAuth,
  allowRoles("recipient"),
  async (req, res, next) => {
    let reservedFoodId = null;
    let requestedQuantity = null;

    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid food listing." });
      }

      requestedQuantity = Number(req.body.quantity);
      if (!isValidPositiveInteger(requestedQuantity)) {
        return res.status(400).json({ message: "Claim quantity must be a whole number of at least 1." });
      }

      const now = new Date();
      const food = await Food.findOneAndUpdate(
        {
          _id: req.params.id,
          status: "available",
          donor: { $ne: req.user._id },
          pickupDeadline: { $gt: now },
          remainingQuantity: { $gte: requestedQuantity }
        },
        { $inc: { remainingQuantity: -requestedQuantity } },
        { new: true, runValidators: true }
      );

      if (!food) {
        return res.status(409).json({
          message: "The food is unavailable, belongs to you, has expired, or does not have enough quantity remaining."
        });
      }

      reservedFoodId = food._id;

      if (food.remainingQuantity === 0) {
        await Food.updateOne(
          { _id: food._id, remainingQuantity: 0, status: "available" },
          { $set: { status: "claimed" } }
        );
      }

      let claim;
      try {
        claim = await Claim.create({
          food: food._id,
          recipient: req.user._id,
          quantity: requestedQuantity,
          status: "reserved",
          claimedAt: now
        });
        // A claim now exists in the database, so a later populate failure
        // must not restore stock and leave the active claim without stock.
        reservedFoodId = null;
      } catch (error) {
        await Food.updateOne(
          { _id: food._id },
          {
            $inc: { remainingQuantity: requestedQuantity },
            $set: { status: "available" }
          }
        );
        reservedFoodId = null;
        throw error;
      }

      await createNotification({
        user: food.donor,
        actor: req.user._id,
        type: "claim_created",
        title: "New food reservation",
        message: `${req.user.name || "A recipient"} reserved ${requestedQuantity} ${food.unit || "items"} of ${food.title}.`,
        food: food._id,
        claim: claim._id
      });

      await claim.populate("recipient", "name email");
      await claim.populate({ path: "food", populate: { path: "donor", select: "name" } });
      reservedFoodId = null;

      return res.status(201).json({ claim, message: "Food quantity reserved successfully." });
    } catch (err) {
      if (reservedFoodId) {
        await Food.updateOne(
          { _id: reservedFoodId },
          {
            $inc: { remainingQuantity: requestedQuantity },
            $set: { status: "available" }
          }
        ).catch(() => {});
      }
      next(err);
    }
  }
);

// PATCH /api/food/claims/:claimId/cancel
// The recipient or the donor who owns the food listing can cancel a
// reservation before pickup. The reserved quantity is restored to stock.
router.patch(
  "/claims/:claimId/cancel",
  requireAuth,
  async (req, res, next) => {
    try {
      const { claimId } = req.params;

      if (!mongoose.isValidObjectId(claimId)) {
        return res.status(400).json({ message: "Invalid claim ID." });
      }

      const existingClaim = await Claim.findById(claimId);
      if (!existingClaim) {
        return res.status(404).json({ message: "Claim not found." });
      }

      const food = await Food.findById(existingClaim.food);
      if (!food) {
        return res.status(404).json({ message: "The associated food listing was not found." });
      }

      const userId = req.user._id.toString();
      const isRecipient = existingClaim.recipient.toString() === userId;
      const isDonor = food.donor.toString() === userId;

      if (!isRecipient && !isDonor) {
        return res.status(403).json({
          message: "Only this reservation's recipient or food donor can cancel it."
        });
      }

      if (!( ["reserved", "confirmed"].includes(existingClaim.status))) {
        return res.status(409).json({
          message: `This claim cannot be cancelled because its status is "${existingClaim.status}". Claims can only be cancelled before pickup.`
        });
      }

      if (food.status === "completed") {
        return res.status(409).json({ message: "Food from a completed listing cannot be cancelled." });
      }

      const previousStatus = existingClaim.status;
      const cancelledByRole = isDonor ? "donor" : "recipient";
      const cancellationDate = new Date();
      const claimFilter = { _id: claimId, status: previousStatus };
      if (isRecipient) claimFilter.recipient = req.user._id;

      const cancelledClaim = await Claim.findOneAndUpdate(
        claimFilter,
        {
          $set: {
            status: "cancelled",
            cancelledBy: req.user._id,
            cancelledByRole,
            cancelledAt: cancellationDate
          }
        },
        { new: true, runValidators: true }
      );

      if (!cancelledClaim) {
        return res.status(409).json({
          message: "This reservation has already been updated. Refresh and try again."
        });
      }

      const expired = food.status === "expired" || new Date(food.pickupDeadline) <= new Date();
      let restoredFood;

      try {
        restoredFood = await Food.findOneAndUpdate(
          {
            _id: food._id,
            status: { $in: ["available", "claimed", "expired"] },
            $expr: {
              $lte: [
                { $add: [{ $ifNull: ["$remainingQuantity", 0] }, cancelledClaim.quantity] },
                "$quantity"
              ]
            }
          },
          {
            $inc: { remainingQuantity: cancelledClaim.quantity },
            $set: { status: expired ? "expired" : "available" }
          },
          { new: true, runValidators: true }
        );
      } catch (error) {
        await Claim.updateOne(
          { _id: cancelledClaim._id, status: "cancelled" },
          { $set: { status: previousStatus, cancelledBy: null, cancelledByRole: null, cancelledAt: null } }
        );
        throw error;
      }

      if (!restoredFood) {
        await Claim.updateOne(
          { _id: cancelledClaim._id, status: "cancelled" },
          { $set: { status: previousStatus, cancelledBy: null, cancelledByRole: null, cancelledAt: null } }
        );
        return res.status(409).json({
          message: "Could not restore food stock safely. Refresh and try again."
        });
      }

      await createNotification({
        user: isDonor ? existingClaim.recipient : food.donor,
        actor: req.user._id,
        type: "claim_cancelled",
        title: "Reservation cancelled",
        message: `${req.user.name || (isDonor ? "The donor" : "The recipient")} cancelled the reservation for ${food.title}.`,
        food: food._id,
        claim: cancelledClaim._id
      });

      return res.json({
        claim: {
          _id: cancelledClaim._id,
          quantity: cancelledClaim.quantity,
          status: "cancelled",
          cancelledBy: req.user._id,
          cancelledByRole,
          cancelledAt: cancellationDate
        },
        message: isDonor
          ? "Reservation cancelled by the donor and food quantity restored."
          : "Reservation cancelled by the recipient and food quantity restored."
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/food/claims/:claimId/status
// Donors can move their claims through reserved -> confirmed -> picked_up.
router.patch(
  "/claims/:claimId/status",
  requireAuth,
  allowRoles("donor"),
  async (req, res, next) => {
    try {
      const { claimId } = req.params;
      const { status: requestedStatus } = req.body;

      if (!mongoose.isValidObjectId(claimId)) {
        return res.status(400).json({ message: "Invalid claim ID." });
      }
      if (!["confirmed", "picked_up"].includes(requestedStatus)) {
        return res.status(400).json({ message: "Supported status updates are confirmed and picked_up." });
      }

      const claim = await Claim.findById(claimId).populate("food");
      if (!claim || !claim.food) {
        return res.status(404).json({ message: "Claim or associated food listing not found." });
      }
      if (claim.food.donor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "You can update claims only for your own food listings." });
      }

      const allowedTransitions = {
        reserved: ["confirmed"],
        confirmed: ["picked_up"]
      };
      if (!allowedTransitions[claim.status]?.includes(requestedStatus)) {
        return res.status(409).json({
          message: `Cannot change a claim from "${claim.status}" to "${requestedStatus}".`
        });
      }

      const updated = await Claim.findOneAndUpdate(
        { _id: claim._id, status: claim.status },
        { $set: { status: requestedStatus } },
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(409).json({ message: "This claim was updated by another request. Refresh and try again." });
      }

      await updated.populate("recipient", "name email");
      await updated.populate({ path: "food", populate: { path: "donor", select: "name" } });

      const message = requestedStatus === "confirmed"
        ? "Reservation confirmed."
        : "Reservation marked as picked up.";

      await createNotification({
        user: claim.recipient,
        actor: req.user._id,
        type: requestedStatus === "confirmed" ? "claim_confirmed" : "claim_picked_up",
        title: requestedStatus === "confirmed" ? "Reservation confirmed" : "Food marked as picked up",
        message: requestedStatus === "confirmed"
          ? `The donor confirmed your reservation for ${claim.food.title}.`
          : `Your reserved food, ${claim.food.title}, has been marked as picked up.`,
        food: claim.food._id,
        claim: updated._id
      });

      return res.json({ claim: updated, message });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/food/claims/:claimId/complete
// The donor or recipient involved can complete a picked-up or active claim.
router.patch(
  "/claims/:claimId/complete",
  requireAuth,
  async (req, res, next) => {
    try {
      const { claimId } = req.params;
      if (!mongoose.isValidObjectId(claimId)) {
        return res.status(400).json({ message: "Invalid claim ID." });
      }

      const claim = await Claim.findById(claimId).populate("food");
      if (!claim || !claim.food) {
        return res.status(404).json({ message: "Claim or associated food listing not found." });
      }

      const isDonor = claim.food.donor.toString() === req.user._id.toString();
      const isRecipient = claim.recipient.toString() === req.user._id.toString();
      if (!isDonor && !isRecipient) {
        return res.status(403).json({ message: "Only the donor or recipient involved can complete this claim." });
      }

      const activeStatuses = ["reserved", "confirmed", "picked_up"];
      if (!activeStatuses.includes(claim.status)) {
        return res.status(409).json({ message: "This claim cannot be completed in its current status." });
      }

      const completedClaim = await Claim.findOneAndUpdate(
        { _id: claim._id, status: { $in: activeStatuses } },
        { $set: { status: "completed", completedAt: new Date() } },
        { new: true, runValidators: true }
      );

      if (!completedClaim) {
        return res.status(409).json({ message: "This claim was updated by another request. Refresh and try again." });
      }

      const activeClaims = await Claim.countDocuments({
        food: claim.food._id,
        status: { $in: activeStatuses }
      });
      const refreshedFood = await Food.findById(claim.food._id);

      if (refreshedFood && refreshedFood.remainingQuantity === 0 && activeClaims === 0) {
        refreshedFood.status = "completed";
        await refreshedFood.save();
      }

      await completedClaim.populate("recipient", "name email");
      await completedClaim.populate({ path: "food", populate: { path: "donor", select: "name" } });

      const notificationTarget = isDonor ? completedClaim.recipient?._id : claim.food.donor;
      await createNotification({
        user: notificationTarget,
        actor: req.user._id,
        type: "claim_completed",
        title: "Rescue completed",
        message: `${req.user.name || (isDonor ? "The donor" : "The recipient")} marked ${claim.food.title} as completed.`,
        food: claim.food._id,
        claim: completedClaim._id
      });

      return res.json({ claim: completedClaim, message: "Rescue claim marked as completed." });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
