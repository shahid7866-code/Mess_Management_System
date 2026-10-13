import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";

export type MealSession = "afternoon" | "night";

export interface MealScheduleFields {
  meal: MealSession;
  openingTime: string;
  closingTime: string;
  timezone: "Asia/Kolkata";
  updatedBy?: Types.ObjectId;
}

const mealScheduleSchema = new Schema<MealScheduleFields>(
  {
    meal: {
      type: String,
      enum: ["afternoon", "night"],
      required: true,
    },
    openingTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    closingTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    timezone: {
      type: String,
      enum: ["Asia/Kolkata"],
      default: "Asia/Kolkata",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Student",
    },
  },
  { timestamps: true },
);

mealScheduleSchema.pre("validate", function () {
  if (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(this.openingTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(this.closingTime) &&
    this.closingTime <= this.openingTime
  ) {
    this.invalidate("closingTime", "closingTime must be later than openingTime");
  }
});

mealScheduleSchema.index({ meal: 1 }, { unique: true });
export const MealSchedule: Model<MealScheduleFields> =
  (mongoose.models.MealSchedule as Model<MealScheduleFields> | undefined) ??
  mongoose.model<MealScheduleFields>("MealSchedule", mealScheduleSchema);