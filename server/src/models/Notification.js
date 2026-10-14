import mongoose from "mongoose";
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  message: { type: String, required: true },
  type: { type: String, default: "info" },
  food: { type: mongoose.Schema.Types.ObjectId, ref: "Food", default: null },
  claim: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", default: null },
  readAt: { type: Date, default: null }
}, { timestamps: true });
export default mongoose.model("Notification", notificationSchema);
