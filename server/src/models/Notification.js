import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: {
      type: String,
      enum: ["claim_created", "claim_confirmed", "claim_picked_up", "claim_cancelled", "claim_completed"],
      required: true
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    food: { type: mongoose.Schema.Types.ObjectId, ref: "Food", default: null },
    claim: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", default: null },
    readAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
