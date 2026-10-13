import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";

export interface SessionFields {
  tokenHash: string;
  student: Types.ObjectId;
  expiresAt: Date;
}

const sessionSchema = new Schema<SessionFields>(
  {
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ student: 1, expiresAt: -1 });

export const Session: Model<SessionFields> =
  (mongoose.models.Session as Model<SessionFields> | undefined) ??
  mongoose.model<SessionFields>("Session", sessionSchema);