import "server-only";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-response";
import { connectDB } from "@/lib/mongodb";
import { Student, type StudentStatus } from "@/models/Student";

const visibleStudentFields =
  "studentId fullName email phone role status createdAt updatedAt";

export interface StudentListOptions {
  search?: string;
  status?: StudentStatus;
  page: number;
  limit: number;
}

export interface CreateStudentAccountInput {
  studentId: string;
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
}

export interface UpdateStudentInput {
  fullName?: string;
  email?: string;
  phone?: string;
  status?: StudentStatus;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listStudents(options: StudentListOptions) {
  await connectDB();

  const filter: {
    role: "student";
    status?: StudentStatus;
    $or?: Array<
      | { studentId: RegExp }
      | { fullName: RegExp }
      | { email: RegExp }
      | { phone: RegExp }
    >;
  } = { role: "student" };
  if (options.status) {
    filter.status = options.status;
  }
  if (options.search) {
    const expression = new RegExp(escapeRegex(options.search.trim()), "i");
    filter.$or = [
      { studentId: expression },
      { fullName: expression },
      { email: expression },
      { phone: expression },
    ];
  }

  const [students, total] = await Promise.all([
    Student.find(filter)
      .select(visibleStudentFields)
      .sort({ studentId: 1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    Student.countDocuments(filter),
  ]);

  return {
    students,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  };
}

export async function getStudentById(id: string) {
  await connectDB();
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_ID",
      message: "Student id is invalid",
    });
  }

  const student = await Student.findOne({ _id: id, role: "student" })
    .select(visibleStudentFields)
    .lean();
  if (!student) {
    throw new ApiError({
      status: 404,
      code: "STUDENT_NOT_FOUND",
      message: "Student was not found",
    });
  }

  return student;
}

export async function createStudentAccount(input: CreateStudentAccountInput) {
  await connectDB();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const student = await Student.create({
    studentId: input.studentId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    passwordHash,
    role: "student",
    status: "active",
  });

  return student.toJSON();
}

export async function updateStudentAccount(
  id: string,
  input: UpdateStudentInput,
) {
  await connectDB();
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_ID",
      message: "Student id is invalid",
    });
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};

  if (input.fullName !== undefined) set.fullName = input.fullName;
  if (input.status !== undefined) set.status = input.status;
  if (input.email !== undefined) {
    if (input.email) set.email = input.email;
    else unset.email = "";
  }
  if (input.phone !== undefined) {
    if (input.phone) set.phone = input.phone;
    else unset.phone = "";
  }

  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length > 0) update.$unset = unset;

  const student = await Student.findOneAndUpdate(
    { _id: id, role: "student" },
    update,
    { returnDocument: "after", runValidators: true },
  )
    .select(visibleStudentFields)
    .lean();

  if (!student) {
    throw new ApiError({
      status: 404,
      code: "STUDENT_NOT_FOUND",
      message: "Student was not found",
    });
  }

  return student;
}