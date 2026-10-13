import "server-only";
import mongoose, { Schema, type Model } from "mongoose";

export type StudentRole = "admin" | "student";
export type StudentStatus = "active" | "inactive";

export interface StudentFields {
  studentId: string;
  fullName: string;
  email?: string;
  phone?: string;
  passwordHash: string;
  role: StudentRole;
  status: StudentStatus;
  subscriptionLockToken?: string;
  subscriptionLockExpiresAt?: Date;
}

const passwordHashPattern =
  /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$|^\$argon2(?:id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function normalizePhone(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/[\s()-]/g, "");
  return normalized || undefined;
}

const studentSchema = new Schema<StudentFields>(
  {
    studentId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 32,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    email: {
      type: String,
      set: normalizeEmail,
      validate: {
        validator: (value: string | undefined) =>
          value === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: "Email address is invalid",
      },
    },
    phone: {
      type: String,
      set: normalizePhone,
      validate: {
        validator: (value: string | undefined) =>
          value === undefined || /^\+?[1-9]\d{7,14}$/.test(value),
        message: "Phone number must use a valid international format",
      },
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
      validate: {
        validator: (value: string) => passwordHashPattern.test(value),
        message: "Password must be stored as a bcrypt or Argon2 hash",
      },
    },
    role: {
      type: String,
      enum: ["admin", "student"],
      default: "student",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
    subscriptionLockToken: {
      type: String,
      select: false,
    },
    subscriptionLockExpiresAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true },
);

studentSchema.index({ studentId: 1 }, { unique: true });
studentSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
  },
);
studentSchema.index({ role: 1, status: 1 });

studentSchema.set("toJSON", {
  transform: (_document, result) => {
    Reflect.deleteProperty(result, "passwordHash");
    Reflect.deleteProperty(result, "subscriptionLockToken");
    Reflect.deleteProperty(result, "subscriptionLockExpiresAt");
    return result;
  },
});

export const Student: Model<StudentFields> =
  (mongoose.models.Student as Model<StudentFields> | undefined) ??
  mongoose.model<StudentFields>("Student", studentSchema);