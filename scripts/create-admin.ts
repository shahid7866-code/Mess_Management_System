import "server-only";
import bcrypt from "bcryptjs";
import { connectDB } from "../src/lib/mongodb";
import { Student } from "../src/models/Student";

async function main(): Promise<void> {
  const [studentId, fullName, email] = process.argv.slice(2);
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!studentId || !fullName || !email || !password || password.length < 12) {
    throw new Error(
      "Usage: npm run admin:create -- <student-id> <full-name> <email>; set ADMIN_INITIAL_PASSWORD to at least 12 characters",
    );
  }

  await connectDB();
  const existingAdmin = await Student.exists({ role: "admin" });
  if (existingAdmin) {
    throw new Error("An administrator already exists; use an authorized admin workflow");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Student.create({
    studentId,
    fullName,
    email,
    passwordHash,
    role: "admin",
    status: "active",
  });

  process.stdout.write(`Created administrator ${admin.studentId}\n`);
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown administrator setup error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });