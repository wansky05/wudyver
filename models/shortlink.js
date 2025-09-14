import mongoose from "mongoose";
const ShortLinkSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  url: {
    type: String,
    required: [true, "URL tujuan tidak boleh kosong."]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
export default mongoose.models.ShortLink || mongoose.model("ShortLink", ShortLinkSchema);