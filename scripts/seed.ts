import { PrismaClient } from "@prisma/client";
import {
  createComment,
  createReport,
  createSolution,
  createUser,
  createVoucher,
  acceptSolution,
} from "../src/lib/api";

// Limassol, Cyprus — central reference point for synthetic data.
const LIMASSOL_CENTER = { lat: 34.7071, lng: 33.0226 };

const REPORT_TITLES = [
  "Pothole on the seafront promenade",
  "Broken bench at Molos Park",
  "Overflowing trash bin near the marina",
  "Graffiti on a public wall in Old Town",
  "Cracked sidewalk on Anexartisias",
  "Damaged playground swing",
  "Streetlight out near Heroes Square",
  "Illegal dumping in an empty lot",
  "Missing manhole cover",
  "Faded pedestrian crossing",
  "Vandalised bus stop sign",
  "Blocked storm drain",
  "Fallen tree branch on cycle path",
  "Loose paving stones at the seafront",
  "Damaged guardrail near roundabout",
  "Abandoned shopping cart in canal",
  "Broken glass on public beach",
  "Faulty traffic light",
  "Knocked-over road sign",
  "Leaking water main",
];

const SOLUTION_DESCRIPTIONS = [
  "Cleared the debris and reported the residual damage to the council.",
  "Patched temporarily until municipal crew can complete the repair.",
  "Coordinated with neighbours and resolved over the weekend.",
  "Cleaned the area thoroughly and disposed of waste responsibly.",
  "Repainted using council-approved materials.",
];

const VOUCHER_TITLES = [
  "Cyta 5GB Mobile Data",
  "Pasta House €15",
  "Kavouri Coffee €5",
  "Limassol Bus 1-Day",
  "Mall of Cyprus €25",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNearby(center: { lat: number; lng: number }, radiusKm: number) {
  // Approx random offset within a square; good enough for synthetic seed data.
  const latDelta = (Math.random() * 2 - 1) * (radiusKm / 111);
  const lngDelta =
    (Math.random() * 2 - 1) *
    (radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180)));
  return { lat: center.lat + latDelta, lng: center.lng + lngDelta };
}

function pickStatus(): "pending" | "in-progress" | "solved" {
  const r = Math.random();
  if (r < 0.55) return "pending";
  if (r < 0.85) return "in-progress";
  return "solved";
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // Wipe & reseed for repeatable demo runs.
    await prisma.voucher.deleteMany();
    await prisma.solution.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();

    // ---- Users (50, all centred on Limassol) ----
    const users: { id: number; email: string }[] = [];
    for (let i = 0; i < 50; i++) {
      const u = await createUser(
        {
          email: `citizen${i + 1}@limassol.cy`,
          xp: Math.floor(Math.random() * 1500),
          streak: Math.floor(Math.random() * 30),
          location: randomNearby(LIMASSOL_CENTER, 6),
        },
        { client: prisma },
      );
      users.push({ id: u.id, email: u.email });
    }

    // ---- Reports (100) ----
    const reportIds: number[] = [];
    for (let i = 0; i < 100; i++) {
      const status = pickStatus();
      const author = rand(users);
      const r = await createReport(
        {
          title: rand(REPORT_TITLES),
          geometry: randomNearby(LIMASSOL_CENTER, 8),
          difficulty: 1 + Math.floor(Math.random() * 5),
          createdBy: author.id,
          status,
          photos: [
            "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800",
            "https://images.unsplash.com/photo-1604187351574-c75ca79f5807?w=800",
          ].slice(0, 1 + Math.floor(Math.random() * 2)),
        },
        { client: prisma },
      );
      reportIds.push(r.id);
    }

    // ---- Comments (≈3 per report, with a few nested) ----
    for (const rid of reportIds) {
      const rootIds: number[] = [];
      const rootCount = Math.floor(Math.random() * 4);
      for (let i = 0; i < rootCount; i++) {
        const c = await createComment(
          {
            text: "Glad someone reported this — happens every winter.",
            reportId: rid,
            authorId: rand(users).id,
          },
          { client: prisma },
        );
        rootIds.push(c.id);
      }
      // ~half of root comments get a nested reply.
      for (const root of rootIds) {
        if (Math.random() < 0.5) {
          await createComment(
            {
              text: "Agreed, I almost tripped here last week.",
              reportId: rid,
              authorId: rand(users).id,
              parentId: root,
            },
            { client: prisma },
          );
        }
      }
    }

    // ---- Solutions (≈30% of reports) ----
    for (const rid of reportIds) {
      if (Math.random() < 0.3) {
        await createSolution(
          {
            reportId: rid,
            description: rand(SOLUTION_DESCRIPTIONS),
            proofPhotos: [
              "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800",
            ],
          },
          { client: prisma },
        );
      }
    }

    // ---- Accept ~half of submitted solutions to exercise the XP trigger ----
    const allSolutions = await prisma.solution.findMany({ where: { status: "pending" } });
    for (const sol of allSolutions) {
      if (Math.random() < 0.5) {
        const solver = rand(users);
        await acceptSolution(sol.id, solver.id, { client: prisma });
      }
    }

    // ---- Vouchers (15) ----
    for (let i = 0; i < 15; i++) {
      await createVoucher(
        {
          code: `CUK-${rand(VOUCHER_TITLES).slice(0, 4).toUpperCase().replace(/\s/g, "")}-${1000 + i}`,
          value: rand([5, 10, 15, 25, 50]),
          claimedBy: Math.random() < 0.2 ? rand(users).id : null,
        },
        { client: prisma },
      );
    }

    const counts = {
      users: await prisma.user.count(),
      reports: await prisma.report.count(),
      comments: await prisma.comment.count(),
      solutions: await prisma.solution.count(),
      vouchers: await prisma.voucher.count(),
    };
    console.log("[seed] Limassol dataset ready:", counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
