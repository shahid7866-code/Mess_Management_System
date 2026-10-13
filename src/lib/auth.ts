import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-response";
import { connectDB } from "@/lib/mongodb";
import { Session } from "@/models/Session";
import { Student, type StudentRole } from "@/models/Student";
import type { AuthenticatedStudent } from "@/lib/auth-service";

const SESSION_COOKIE = "messmate_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(studentId: string): Promise<string> {
  await connectDB();
  const token = randomBytes(32).toString("base64url");
  await Session.create({
    tokenHash: hashToken(token),
    student: new Types.ObjectId(studentId),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  try {
    await revokeSessionToken(token);
  } finally {
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function revokeSessionToken(token?: string): Promise<void> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await connectDB();
  await Session.deleteOne({ tokenHash: hashToken(token) });
}

export async function getCurrentSession(): Promise<AuthenticatedStudent | null> {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  await connectDB();
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).populate({
    path: "student",
    model: Student,
    select: "studentId fullName email role status",
  });

  if (!session || !session.student || session.student instanceof Types.ObjectId) {
    return null;
  }

  const student = session.student as unknown as {
    _id: Types.ObjectId;
    studentId: string;
    fullName: string;
    email?: string;
    role: StudentRole;
    status: string;
  };

  if (student.status !== "active") {
    return null;
  }

  return {
    id: student._id.toString(),
    studentId: student.studentId,
    fullName: student.fullName,
    email: student.email,
    role: student.role,
  };
}

export async function requireSession(
  role?: StudentRole,
): Promise<AuthenticatedStudent> {
  const student = await getCurrentSession();
  if (!student) {
    throw new ApiError({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication is required",
    });
  }

  if (role && student.role !== role) {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "You do not have permission to access this resource",
    });
  }

  return student;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}
