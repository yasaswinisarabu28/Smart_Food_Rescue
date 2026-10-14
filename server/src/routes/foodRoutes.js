import { Router } from "express";
import mongoose from "mongoose";
import Food from "../models/Food.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { search = "", category = "all", status = "available", mine = "false" } = req.query;
    const filter = {};
    if (status !== "all") filter.status = status;
    if (category !== "all") filter.category = category;
    if (search.trim()) {
      filter.$or = [
        { title: { $regex: escapeRegex(search.trim()), $options: "i" } },
        { location: { $regex: escapeRegex(search.trim()), $options: "i" } },
        { description: { $regex: escapeRegex(search.trim()), $options: "i" } }
      ];
    }
    if (mine === "true") {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ message: "Please log in to view your food." });
      const jwt = await import("jsonwebtoken");
      const payload = jwt.default.verify(token, process.env.JWT_SECRET);
      filter.donor = payload.id;
    }
    const foods = await Food.find(filter)
      .populate("donor", "name")
      .populate("claim.recipient", "name")
      .sort({ createdAt: -1 }).limit(200);
    res.json({ foods });
  } catch (err) { next(err); }
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.post("/", requireAuth, allowRoles("donor"), async (req, res, next) => {
  try {
    const { title, description, category, quantity, unit, location, pickupDeadline } = req.body;
    if (!String(title || "").trim()) return res.status(400).json({ message: "Food title is required." });
    if (!String(location || "").trim()) return res.status(400).json({ message: "Pickup location is required." });
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ message: "Quantity must be at least 1." });
    const deadline = new Date(pickupDeadline);
    if (!pickupDeadline || Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
      return res.status(400).json({ message: "Pickup deadline must be in the future." });
    }
    const food = await Food.create({
      title: String(title).trim(), description, category, quantity: qty, unit, location: String(location).trim(),
      pickupDeadline: deadline, donor: req.user._id
    });
    await food.populate("donor", "name");
    res.status(201).json({ food });
  } catch (err) { next(err); }
});

router.post("/:id/claim", requireAuth, allowRoles("recipient"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid food listing." });
    // Atomic condition prevents two recipients from claiming the same listing.
    const food = await Food.findOneAndUpdate(
      { _id: req.params.id, status: "available", donor: { $ne: req.user._id }, pickupDeadline: { $gt: new Date() } },
      { $set: { status: "claimed", "claim.recipient": req.user._id, "claim.recipientName": req.user.name, "claim.claimedAt": new Date() } },
      { new: true, runValidators: true }
    ).populate("donor", "name").populate("claim.recipient", "name");
    if (!food) return res.status(409).json({ message: "This food is no longer available, has expired, or belongs to your donor account." });
    res.json({ food, message: "Food claimed successfully. Contact the donor to coordinate pickup." });
  } catch (err) { next(err); }
});

router.patch("/:id/complete", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid food listing." });
    const food = await Food.findOne({ _id: req.params.id, status: "claimed" });
    if (!food) return res.status(404).json({ message: "Claimed food listing not found." });
    const isDonor = food.donor.toString() === req.user._id.toString();
    const isRecipient = food.claim?.recipient?.toString() === req.user._id.toString();
    if (!isDonor && !isRecipient) return res.status(403).json({ message: "Only the donor or recipient can mark this rescue complete." });
    food.status = "completed";
    await food.save();
    await food.populate("donor", "name");
    await food.populate("claim.recipient", "name");
    res.json({ food, message: "Rescue marked as completed." });
  } catch (err) { next(err); }
});

export default router;
