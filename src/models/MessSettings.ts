import "server-only";
import mongoose, { Schema, type Model } from "mongoose";

export interface MessSettingsFields { key: string; upiId?: string; upiQrStorageKey?: string }
const messSettingsSchema = new Schema<MessSettingsFields>({
  key: { type: String, required: true, unique: true, default: "primary" },
  upiId: { type: String, trim: true, maxlength: 100, validate: { validator: (value?: string) => !value || /^[\w.\-]{2,256}@[\w]{2,64}$/.test(value), message: "Enter a valid UPI ID" } },
  upiQrStorageKey: { type: String, trim: true, maxlength: 80 },
}, { timestamps: true });

const cachedSettingsModel = mongoose.models.MessSettings as Model<MessSettingsFields> | undefined;
// Next.js development keeps Mongoose models alive across hot reloads. Recompile
// this model when that cached schema predates the QR storage reference field.
if (cachedSettingsModel && !cachedSettingsModel.schema.path("upiQrStorageKey")) {
  delete mongoose.models.MessSettings;
}

export const MessSettings: Model<MessSettingsFields> =
  (mongoose.models.MessSettings as Model<MessSettingsFields> | undefined) ??
  mongoose.model<MessSettingsFields>("MessSettings", messSettingsSchema);
