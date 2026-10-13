import "server-only";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import { connectDB } from "@/lib/mongodb";
import { clearLoginAttempts, consumeLoginAttempt } from "@/lib/login-throttle";
import { Student, type StudentRole } from "@/models/Student";

const dummyPasswordHash = bcrypt.hash("invalid-account-password", 12);

export interface AuthenticatedStudent {
  id: string;
  studentId: string;
  fullName: string;
  email?: string;
  role: StudentRole;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.includes("@")
    ? identifier.trim().toLowerCase()
    : identifier.trim().toUpperCase();
}

function throttleKey(identifier: string): string {
  return createHash("sha256").update(normalizeIdentifier(identifier)).digest("hex");
}

export async function authenticateStudent(
  identifier: string,
  password: string,
): Promise<AuthenticatedStudent> {
  await connectDB();

  const key = throttleKey(identifier);
  if (!consumeLoginAttempt(key)) {
    throw new ApiError({
      status: 429,
      code: "LOGIN_RATE_LIMITED",
      message: "Too many login attempts. Try again later.",
    });
  }

  const normalizedIdentifier = normalizeIdentifier(identifier);
  const lookup = identifier.includes("@")
    ? { email: normalizedIdentifier }
    : { studentId: normalizedIdentifier };
  const student = await Student.findOne(lookup).select("+passwordHash");
  const hash = student?.passwordHash ?? (await dummyPasswordHash);
  const validPassword = await bcrypt.compare(password, hash);

  if (!student || !validPassword || student.status !== "active") {
    throw new ApiError({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid identifier or password",
    });
  }

  clearLoginAttempts(key);
  return {
    id: student.id,
    studentId: student.studentId,
    fullName: student.fullName,
    email: student.email,
    role: student.role,
  };
}