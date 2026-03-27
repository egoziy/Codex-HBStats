const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function groupKey(player) {
  if (player.apiFootballId) {
    return `api:${player.apiFootballId}`;
  }

  return `name:${normalize(player.nameEn).toLowerCase()}`;
}

function scorePlayer(player) {
  let score = 0;
  if (normalize(player.firstNameHe)) score += 4;
  if (normalize(player.lastNameHe)) score += 4;
  if (normalize(player.nameHe) && normalize(player.nameHe) !== normalize(player.nameEn)) score += 2;
  if (player.canonicalPlayerId == null) score += 1;
  return score;
}

async function main() {
  const players = await prisma.player.findMany({
    orderBy: [{ createdAt: 'asc' }],
  });

  const groups = new Map();
  for (const player of players) {
    const key = groupKey(player);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(player);
  }

  for (const group of groups.values()) {
    if (!group.length) continue;

    const sorted = [...group].sort((left, right) => scorePlayer(right) - scorePlayer(left));
    const root = sorted[0];
    const bestNameSource = sorted.find((player) => scorePlayer(player) > 0) || root;

    for (const player of group) {
      await prisma.player.update({
        where: { id: player.id },
        data: {
          canonicalPlayerId: player.id === root.id ? null : root.id,
          nameHe: normalize(bestNameSource.nameHe) || player.nameHe,
          firstNameHe: normalize(bestNameSource.firstNameHe) || null,
          lastNameHe: normalize(bestNameSource.lastNameHe) || null,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
