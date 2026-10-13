import "server-only";
import mongoose, { Schema, type Model, type Types } from "mongoose";
import type { MealSession } from "./MealSchedule";

export type AttendanceStatus =
  | "present"
  | "absent"
  | "on_leave"
  | "not_marked";

export interface AttendanceChangeFields {
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  changedAt: Date;
  changedBy: Types.ObjectId;
  reason?: string;
}

export interface AttendanceFields {
  student: Types.ObjectId;
  serviceDate: Date;
  meal: MealSession;
  status: AttendanceStatus;
  markedAt: Date;
  markedBy: Types.ObjectId;
  correctionReason?: string;
  correctionHistory: AttendanceChangeFields[];
}

const attendanceChangeSchema = new Schema<AttendanceChangeFields>(
  {
    previousStatus: {
      type: String,
      enum: ["present", "absent", "on_leave", "not_marked"],
      required: true,
    },
    newStatus: {
      type: String,
      enum: ["present", "absent", "on_leave", "not_marked"],
      required: true,
    },
    changedAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const attendanceSchema = new Schema<AttendanceFields>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    serviceDate: {
      type: Date,
      required: true,
    },
    meal: {
      type: String,
      enum: ["afternoon", "night"],
      required: true,
    },
    status: {
      type: String,
      enum: ["present", "absent", "on_leave", "not_marked"],
      required: true,
    },
    markedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    correctionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    correctionHistory: {
      type: [attendanceChangeSchema],
      default: [],
    },
  },
  { timestamps: true },
);

attendanceSchema.index(
  { student: 1, serviceDate: 1, meal: 1 },
  { unique: true },
);
attendanceSchema.index({ serviceDate: 1, meal: 1, status: 1 });

export const Attendance: Model<AttendanceFields> =
  (mongoose.models.Attendance as Model<AttendanceFields> | undefined) ??
  mongoose.model<AttendanceFields>("Attendance", attendanceSchema);