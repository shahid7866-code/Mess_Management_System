import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";

export interface DailyMenuFields {
  serviceDate: Date;
  afternoonItems: string[];
  nightItems: string[];
  updatedBy: Types.ObjectId;
}

const dailyMenuSchema = new Schema<DailyMenuFields>(
  {
    serviceDate: {
      type: Date,
      required: true,
    },
    afternoonItems: {
      type: [String],
      default: [],
      validate: {
        validator: (items: string[]) =>
          items.every((item) => item.trim().length > 0 && item.length <= 100),
        message: "Each Afternoon menu item must contain 1 to 100 characters",
      },
    },
    nightItems: {
      type: [String],
      default: [],
      validate: {
        validator: (items: string[]) =>
          items.every((item) => item.trim().length > 0 && item.length <= 100),
        message: "Each Night menu item must contain 1 to 100 characters",
      },
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
  },
  { timestamps: true },
);

dailyMenuSchema.index({ serviceDate: 1 }, { unique: true });

export const DailyMenu: Model<DailyMenuFields> =
  (mongoose.models.DailyMenu as Model<DailyMenuFields> | undefined) ??
  mongoose.model<DailyMenuFields>("DailyMenu", dailyMenuSchema);