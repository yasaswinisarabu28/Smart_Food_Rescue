import { Router } from "express";
import mongoose from "mongoose";
import Food from "../models/Food.js";
import Claim from "../models/Claim.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";

const router = Router();

// Escape special characters in search input.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// GET /api/food
// Get food listings with optional search, category and status.
// ============================================================
router.get("/", async (req, res, next) => {
  try {
    const {
      search = "",
      category = "all",
      status = "available",
      mine = "false"
    } = req.query;

    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    if (category !== "all") {
      filter.category = category;
    }

    if (typeof search === "string" && search.trim()) {
      const regex = {
        $regex: escapeRegex(search.trim()),
        $options: "i"
      };

      filter.$or = [
        { title: regex },
        { location: regex },
        { description: regex }
      ];
    }

    // Return only the logged-in donor's listings when mine=true.
    if (mine === "true") {
      const header = req.headers.authorization || "";

      const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : null;

      if (!token) {
        return res.status(401).json({
          message: "Please log in to view your food."
        });
      }

      const jwt = await import("jsonwebtoken");

      const payload = jwt.default.verify(
        token,
        process.env.JWT_SECRET
      );

      const donorId = payload.id || payload._id;

      if (!donorId || !mongoose.isValidObjectId(donorId)) {
        return res.status(401).json({
          message: "Invalid authentication token."
        });
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

// ============================================================
// GET /api/food/my-claims
// Get claims belonging to the logged-in recipient.
// ============================================================
router.get(
  "/my-claims",
  requireAuth,
  allowRoles("recipient"),
  async (req, res, next) => {
    try {
      const claims = await Claim.find({
        recipient: req.user._id
      })
        .populate({
          path: "food",
          populate: {
            path: "donor",
            select: "name"
          }
        })
        .sort({ createdAt: -1 });

      return res.json({ claims });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /api/food
// Create a new food listing. Donors only.
// ============================================================
router.post(
  "/",
  requireAuth,
  allowRoles("donor"),
  async (req, res, next) => {
    try {
      const {
        title,
        description,
        category,
        quantity,
        unit,
        location,
        pickupDeadline
      } = req.body;

      if (!String(title || "").trim()) {
        return res.status(400).json({
          message: "Food title is required."
        });
      }

      if (!String(location || "").trim()) {
        return res.status(400).json({
          message: "Pickup location is required."
        });
      }

      const qty = Number(quantity);

      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({
          message: "Quantity must be a whole number of at least 1."
        });
      }

      const deadline = new Date(pickupDeadline);

      if (
        !pickupDeadline ||
        Number.isNaN(deadline.getTime()) ||
        deadline <= new Date()
      ) {
        return res.status(400).json({
          message: "Pickup deadline must be in the future."
        });
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

// ============================================================
// POST /api/food/:id/claim
// Reserve a specific quantity of food. Recipients only.
// Request body: { "quantity": 2 }
// ============================================================
router.post(
  "/:id/claim",
  requireAuth,
  allowRoles("recipient"),
  async (req, res, next) => {
    let reservedFoodId = null;
    let requestedQuantity = null;

    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid food listing."
        });
      }

      requestedQuantity = Number(req.body.quantity);

      if (
        !Number.isInteger(requestedQuantity) ||
        requestedQuantity < 1
      ) {
        return res.status(400).json({
          message: "Claim quantity must be a whole number of at least 1."
        });
      }

      const now = new Date();

      // Atomically reduce stock to prevent over-reserving.
      const food = await Food.findOneAndUpdate(
        {
          _id: req.params.id,
          status: "available",
          donor: { $ne: req.user._id },
          pickupDeadline: { $gt: now },
          remainingQuantity: { $gte: requestedQuantity }
        },
        {
          $inc: {
            remainingQuantity: -requestedQuantity
          }
        },
        {
          new: true,
          runValidators: true
        }
      );

      if (!food) {
        return res.status(409).json({
          message:
            "The food is unavailable, belongs to you, has expired, or does not have enough quantity remaining."
        });
      }

      reservedFoodId = food._id;

      // If the stock reaches zero, mark the listing as claimed.
      if (food.remainingQuantity === 0) {
        await Food.updateOne(
          {
            _id: food._id,
            remainingQuantity: 0,
            status: "available"
          },
          {
            $set: { status: "claimed" }
          }
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
      } catch (error) {
        // Restore the stock if claim creation fails.
        await Food.updateOne(
          { _id: food._id },
          {
            $inc: {
              remainingQuantity: requestedQuantity
            },
            $set: {
              status: "available"
            }
          }
        );

        reservedFoodId = null;
        throw error;
      }

      await claim.populate("recipient", "name");

      await claim.populate({
        path: "food",
        populate: {
          path: "donor",
          select: "name"
        }
      });

      reservedFoodId = null;

      return res.status(201).json({
        claim,
        message: "Food quantity reserved successfully."
      });
    } catch (err) {
      // Best-effort rollback if an unexpected error occurs
      // after stock was reduced but before a claim was created.
      if (reservedFoodId) {
        await Food.updateOne(
          { _id: reservedFoodId },
          {
            $inc: {
              remainingQuantity: requestedQuantity
            },
            $set: {
              status: "available"
            }
          }
        ).catch(() => {});
      }

      next(err);
    }
  }
);

// ============================================================
// PATCH /api/food/claims/:claimId/cancel
// Cancel a reservation and restore the quantity to stock.
// Recipients can cancel only their own reserved/confirmed claims.
// ============================================================
router.patch(
  "/claims/:claimId/cancel",
  requireAuth,
  allowRoles("recipient"),
  async (req, res, next) => {
    let cancelledClaim = null;
    let previousStatus = null;

    try {
      const { claimId } = req.params;

      if (!mongoose.isValidObjectId(claimId)) {
        return res.status(400).json({
          message: "Invalid claim ID."
        });
      }

      const existingClaim = await Claim.findOne({
        _id: claimId,
        recipient: req.user._id
      });

      if (!existingClaim) {
        return res.status(404).json({
          message: "Claim not found for your account."
        });
      }

      if (!["reserved", "confirmed"].includes(existingClaim.status)) {
        return res.status(409).json({
          message: `This claim cannot be cancelled because its status is "${existingClaim.status}".`
        });
      }

      const food = await Food.findById(existingClaim.food);

      if (!food) {
        return res.status(404).json({
          message: "The associated food listing was not found."
        });
      }

      if (food.status === "completed") {
        return res.status(409).json({
          message: "Food from a completed listing cannot be cancelled."
        });
      }

      previousStatus = existingClaim.status;

      // Change the claim status atomically so it cannot be
      // cancelled twice by simultaneous requests.
      cancelledClaim = await Claim.findOneAndUpdate(
        {
          _id: claimId,
          recipient: req.user._id,
          status: { $in: ["reserved", "confirmed"] }
        },
        {
          $set: {
            status: "cancelled"
          }
        },
        {
          new: true,
          runValidators: true
        }
      );

      if (!cancelledClaim) {
        return res.status(409).json({
          message:
            "This reservation has already been updated. Refresh and try again."
        });
      }

      const now = new Date();

      const listingExpired =
        food.status === "expired" ||
        new Date(food.pickupDeadline) <= now;

      const restoredStatus = listingExpired
        ? "expired"
        : "available";

      let restoredFood;

      try {
        // Restore only if doing so will not exceed the original stock.
        restoredFood = await Food.findOneAndUpdate(
          {
            _id: food._id,
            status: {
              $in: ["available", "claimed", "expired"]
            },
            $expr: {
              $lte: [
                {
                  $add: [
                    { $ifNull: ["$remainingQuantity", 0] },
                    cancelledClaim.quantity
                  ]
                },
                "$quantity"
              ]
            }
          },
          {
            $inc: {
              remainingQuantity: cancelledClaim.quantity
            },
            $set: {
              status: restoredStatus
            }
          },
          {
            new: true,
            runValidators: true
          }
        );
      } catch (stockError) {
        // Revert the cancellation if updating stock throws.
        await Claim.updateOne(
          {
            _id: cancelledClaim._id,
            status: "cancelled"
          },
          {
            $set: {
              status: previousStatus
            }
          }
        );

        throw stockError;
      }

      if (!restoredFood) {
        // Revert the status so the recipient can retry.
        await Claim.updateOne(
          {
            _id: cancelledClaim._id,
            status: "cancelled"
          },
          {
            $set: {
              status: previousStatus
            }
          }
        );

        return res.status(409).json({
          message:
            "Could not restore food stock safely. Refresh and try again."
        });
      }

      return res.json({
        claim: {
          _id: cancelledClaim._id,
          quantity: cancelledClaim.quantity,
          status: "cancelled"
        },
        message:
          "Reservation cancelled and food quantity restored."
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// PATCH /api/food/claims/:claimId/complete
// The donor or the recipient involved can complete a claim.
// ============================================================
router.patch(
  "/claims/:claimId/complete",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.claimId)) {
        return res.status(400).json({
          message: "Invalid claim ID."
        });
      }

      const claim = await Claim.findById(req.params.claimId)
        .populate("food");

      if (!claim || !claim.food) {
        return res.status(404).json({
          message: "Claim or associated food listing not found."
        });
      }

      const isDonor =
        claim.food.donor.toString() === req.user._id.toString();

      const isRecipient =
        claim.recipient.toString() === req.user._id.toString();

      if (!isDonor && !isRecipient) {
        return res.status(403).json({
          message:
            "Only the donor or recipient involved can complete this claim."
        });
      }

      if (
        !["reserved", "confirmed", "picked_up"].includes(claim.status)
      ) {
        return res.status(409).json({
          message:
            "This claim cannot be completed in its current status."
        });
      }

      claim.status = "completed";
      claim.completedAt = new Date();

      await claim.save();

      // Mark the listing completed only when stock is zero
      // and there are no remaining active claims.
      const activeClaims = await Claim.countDocuments({
        food: claim.food._id,
        status: {
          $in: ["reserved", "confirmed", "picked_up"]
        }
      });

      const refreshedFood = await Food.findById(claim.food._id);

      if (
        refreshedFood &&
        refreshedFood.remainingQuantity === 0 &&
        activeClaims === 0
      ) {
        refreshedFood.status = "completed";
        await refreshedFood.save();
      }

      await claim.populate("recipient", "name");

      await claim.populate({
        path: "food",
        populate: {
          path: "donor",
          select: "name"
        }
      });

      return res.json({
        claim,
        message: "Rescue claim marked as completed."
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;