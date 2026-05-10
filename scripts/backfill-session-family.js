const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const result = await prisma.$executeRaw`UPDATE sessions SET "familyId" = id WHERE "familyId" IS NULL`;
  console.log(`Backfilled ${result} rows`);
  await prisma.$disconnect();
})();
