import "dotenv/config"; // tsx does NOT auto-load .env the way Next.js does — load it explicitly
import { PrismaClient } from "../lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

console.log("Seed script starting...");

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Make sure a .env file exists in the project root " +
      "and contains DATABASE_URL=... — then re-run this script."
  );
  process.exit(1);
}

console.log("DATABASE_URL found, connecting...");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { email, passwordHash, name, role: "ADMIN" },
  });

  console.log(`Created admin user: ${email} / ${password}`);
  console.log("Log in and change this password by creating a new admin, then removing this one.");
}

main()
  .then(() => {
    console.log("Seed script finished.");
  })
  .catch((e) => {
    console.error("Seed script failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // close the pg pool explicitly, or the process hangs open
  });