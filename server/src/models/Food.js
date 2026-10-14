import mongoose from "mongoose";

const foodSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: "", maxlength: 600 },
  category: { type: String, enum: ["Meals", "Bakery", "Fruits & Vegetables", "Packaged Food", "Other"], default: "Meals" },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, enum: ["meal boxes", "kg", "items", "servings"], default: "meal boxes" },
  location: { type: String, required: true, trim: true, maxlength: 160 },
  pickupDeadline: { type: Date, required: true },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["available", "claimed", "completed", "expired"], default: "available" },
  claim: {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    recipientName: String,
    claimedAt: Date
  }
}, { timestamps: true });

foodSchema.index({ status: 1, createdAt: -1 });
export default mongoose.model("Food", foodSchema);
