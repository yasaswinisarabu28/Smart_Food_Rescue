import { Router } from "express";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";
const router = Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ notifications });
  } catch (err) { next(err); }
});
router.patch("/read-all", async (req, res, next) => {
  try {
    const readAt = new Date();
    await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt } });
    res.json({ readAt, message: "All notifications marked as read." });
  } catch (err) { next(err); }
});
router.patch("/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } }, { new: true });
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    res.json({ notification });
  } catch (err) { next(err); }
});
export default router;
