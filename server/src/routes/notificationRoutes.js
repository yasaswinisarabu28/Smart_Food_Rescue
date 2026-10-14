import { Router } from "express";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/notifications - notifications for the signed-in user only.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user._id })
        .populate("actor", "name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Notification.countDocuments({ user: req.user._id, readAt: null })
    ]);

    return res.json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/read-all - mark all own notifications as read.
router.patch("/read-all", requireAuth, async (req, res, next) => {
  try {
    const now = new Date();
    await Notification.updateMany(
      { user: req.user._id, readAt: null },
      { $set: { readAt: now } }
    );
    return res.json({ message: "All notifications marked as read.", readAt: now });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read - mark one own notification as read.
router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    ).populate("actor", "name");

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.json({ notification, message: "Notification marked as read." });
  } catch (error) {
    next(error);
  }
});

export default router;
