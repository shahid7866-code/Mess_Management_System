import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";

export interface MessHolidayFields {
  serviceDate: Date;
  reason: string;
  attendanceExceptionAllowed: boolean;
  exceptionReason?: string;
  createdBy: Types.ObjectId;
}

const messHolidaySchema = new Schema<MessHolidayFields>(
  {
    serviceDate: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 240,
    },
    attendanceExceptionAllowed: {
      type: Boolean,
      default: false,
      required: true,
    },
    exceptionReason: {
      type: String,
      trim: true,
      maxlength: 240,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
  },
  { timestamps: true },
);

messHolidaySchema.pre("validate", function () {
  if (
    this.attendanceExceptionAllowed &&
    (!this.exceptionReason || this.exceptionReason.trim().length < 8)
  ) {
    this.invalidate(
      "exceptionReason",
      "An attendance exception requires a reason of at least 8 characters",
    );
  }
});

messHolidaySchema.index({ serviceDate: 1 }, { unique: true });

export const MessHoliday: Model<MessHolidayFields> =
  (mongoose.models.MessHoliday as Model<MessHolidayFields> | undefined) ??
  mongoose.model<MessHolidayFields>("MessHoliday", messHolidaySchema);