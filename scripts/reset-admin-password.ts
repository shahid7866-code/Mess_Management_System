import "server-only";
import bcrypt from "bcryptjs";
import { connectDB } from "../src/lib/mongodb";
import { Session } from "../src/models/Session";
import { Student } from "../src/models/Student";

async function main(): Promise<void> {
  const [identifier] = process.argv.slice(2);
  const password = process.env.ADMIN_RESET_PASSWORD;

  if (
    !identifier?.trim() ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error(
      "Usage: set ADMIN_RESET_PASSWORD to 12-72 UTF-8 bytes, then run npm run admin:reset-password -- <student-id-or-email>",
    );
  }

  await connectDB();
  const normalizedIdentifier = identifier.trim();
  const admin = await Student.findOne({
    role: "admin",
    $or: [
      { studentId: normalizedIdentifier.toUpperCase() },
      { email: normalizedIdentifier.toLowerCase() },
    ],
  }).select("_id studentId");

  if (!admin) {
    throw new Error("No administrator account matched that student ID or email");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await Student.updateOne(
    { _id: admin._id, role: "admin" },
    { $set: { passwordHash } },
    { runValidators: true },
  );
  await Session.deleteMany({ student: admin._id });

  process.stdout.write(
    `Reset password for administrator ${admin.studentId} and revoked existing sessions\n`,
  );
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown administrator password reset error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  });