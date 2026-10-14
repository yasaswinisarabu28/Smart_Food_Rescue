import mongoose from "mongoose";
const claimSchema = new mongoose.Schema({
  food: { type: mongoose.Schema.Types.ObjectId, ref: "Food", required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  quantity: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["reserved", "confirmed", "picked_up", "completed", "cancelled", "expired"], default: "reserved" },
  claimedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
claimSchema.index({ recipient: 1, createdAt: -1 });
export default mongoose.model("Claim", claimSchema);
