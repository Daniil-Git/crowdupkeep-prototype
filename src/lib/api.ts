import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";
import {
  bboxFromCenter,
  haversineKm,
  pointInBBox,
  type BBox,
  type LatLng,
} from "./geo";

// XP rules live in a Prisma-free module so the UI bundle stays clean.
import { XP_PER_DIFFICULTY, xpFor } from "./xp";
export { XP_PER_DIFFICULTY, xpFor };

export type ReportStatus = "pending" | "in-progress" | "solved";
export type SolutionStatus = "pending" | "accepted" | "rejected";

export interface CreateUserInput {
  email: string;
  xp?: number;
  streak?: number;
  location?: LatLng | null;
}

export interface CreateReportInput {
  title: string;
  geometry: LatLng;
  difficulty: number;
  createdBy: number;
  photos?: string[];
  status?: ReportStatus;
}

export interface CreateCommentInput {
  text: string;
  reportId: number;
  authorId: number;
  parentId?: number | null;
}

export interface CreateSolutionInput {
  description: string;
  reportId: number;
  proofPhotos?: string[];
  status?: SolutionStatus;
}

export interface CreateVoucherInput {
  code: string;
  value: number;
  claimedBy?: number | null;
}

export interface ApiOptions {
  client?: PrismaClient;
}

const client = (opts?: ApiOptions): PrismaClient => opts?.client ?? defaultPrisma;

// ---------- Users ----------
export async function createUser(input: CreateUserInput, opts?: ApiOptions) {
  return client(opts).user.create({
    data: {
      email: input.email,
      xp: input.xp ?? 0,
      streak: input.streak ?? 0,
      location: input.location ?? undefined,
    },
  });
}

export async function getUser(id: number, opts?: ApiOptions) {
  return client(opts).user.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string, opts?: ApiOptions) {
  return client(opts).user.findUnique({ where: { email } });
}

export async function listUsers(opts?: ApiOptions) {
  return client(opts).user.findMany({ orderBy: { id: "asc" } });
}

export async function leaderboard(limit = 10, opts?: ApiOptions) {
  return client(opts).user.findMany({
    orderBy: [{ xp: "desc" }, { streak: "desc" }, { id: "asc" }],
    take: limit,
  });
}

// ---------- Reports ----------
export async function createReport(input: CreateReportInput, opts?: ApiOptions) {
  return client(opts).report.create({
    data: {
      title: input.title,
      geometry: input.geometry,
      difficulty: input.difficulty,
      createdBy: input.createdBy,
      photos: input.photos ?? [],
      status: input.status ?? "pending",
    },
  });
}

export async function getReport(id: number, opts?: ApiOptions) {
  return client(opts).report.findUnique({ where: { id } });
}

export async function listReports(opts?: ApiOptions) {
  return client(opts).report.findMany({ orderBy: { id: "desc" } });
}

export async function listReportsByUser(userId: number, opts?: ApiOptions) {
  return client(opts).report.findMany({
    where: { createdBy: userId },
    orderBy: { id: "desc" },
  });
}

export async function updateReportStatus(
  id: number,
  status: ReportStatus,
  opts?: ApiOptions,
) {
  return client(opts).report.update({ where: { id }, data: { status } });
}

// Bounding-box geo query.
//
// SQLite can't filter inside a Json column (no path operators), so we narrow
// numerically when we can and otherwise scan + filter in the app layer. With
// 100s-1000s of reports this is fine; if we ever swap to PostGIS we replace
// the implementation, not the call sites.
export async function listReportsInBBox(bbox: BBox, opts?: ApiOptions) {
  const all = await client(opts).report.findMany();
  return all.filter((r) => {
    const g = r.geometry as unknown as LatLng | null;
    if (!g || typeof g.lat !== "number" || typeof g.lng !== "number") return false;
    return pointInBBox(g, bbox);
  });
}

export async function listReportsNear(
  center: LatLng,
  radiusKm: number,
  opts?: ApiOptions,
) {
  const bbox = bboxFromCenter(center, radiusKm);
  const candidates = await listReportsInBBox(bbox, opts);
  return candidates.filter((r) => {
    const g = r.geometry as unknown as LatLng;
    return haversineKm(center, g) <= radiusKm;
  });
}

// ---------- Comments ----------
export async function createComment(input: CreateCommentInput, opts?: ApiOptions) {
  return client(opts).comment.create({
    data: {
      text: input.text,
      reportId: input.reportId,
      authorId: input.authorId,
      parentId: input.parentId ?? null,
    },
  });
}

export interface CommentNode {
  id: number;
  text: string;
  reportId: number;
  parentId: number | null;
  authorId: number;
  replies: CommentNode[];
}

// Builds the recursive reply tree the UI needs in O(n).
export async function listCommentsForReport(
  reportId: number,
  opts?: ApiOptions,
): Promise<CommentNode[]> {
  const flat = await client(opts).comment.findMany({
    where: { reportId },
    orderBy: { id: "asc" },
  });
  const map = new Map<number, CommentNode>();
  flat.forEach((c) =>
    map.set(c.id, {
      id: c.id,
      text: c.text,
      reportId: c.reportId,
      parentId: c.parentId,
      authorId: c.authorId,
      replies: [],
    }),
  );
  const roots: CommentNode[] = [];
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parentId != null && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ---------- Solutions ----------
export async function createSolution(input: CreateSolutionInput, opts?: ApiOptions) {
  return client(opts).solution.create({
    data: {
      description: input.description,
      reportId: input.reportId,
      proofPhotos: input.proofPhotos ?? [],
      status: input.status ?? "pending",
    },
  });
}

export async function listSolutionsForReport(reportId: number, opts?: ApiOptions) {
  return client(opts).solution.findMany({
    where: { reportId },
    orderBy: { id: "asc" },
  });
}

export interface AcceptSolutionResult {
  solutionId: number;
  reportId: number;
  solverId: number;
  xpAwarded: number;
  newXp: number;
}

// Accepting a solution is a single transactional unit: mark it accepted, mark
// the report solved, and award XP to the solver. If anything in here throws
// we rollback so we never end up with XP awarded for a non-accepted solution.
export async function acceptSolution(
  solutionId: number,
  solverId: number,
  opts?: ApiOptions,
): Promise<AcceptSolutionResult> {
  const db = client(opts);
  return db.$transaction(async (tx) => {
    const sol = await tx.solution.findUnique({ where: { id: solutionId } });
    if (!sol) throw new Error(`Solution ${solutionId} not found`);
    const report = await tx.report.findUnique({ where: { id: sol.reportId } });
    if (!report) throw new Error(`Report ${sol.reportId} not found`);

    if (sol.status !== "accepted") {
      await tx.solution.update({
        where: { id: solutionId },
        data: { status: "accepted" },
      });
    }
    if (report.status !== "solved") {
      await tx.report.update({
        where: { id: report.id },
        data: { status: "solved" },
      });
    }

    const xpAwarded = xpFor(report.difficulty);
    const updatedUser = await tx.user.update({
      where: { id: solverId },
      data: { xp: { increment: xpAwarded } },
    });
    return {
      solutionId,
      reportId: report.id,
      solverId,
      xpAwarded,
      newXp: updatedUser.xp,
    };
  });
}

// ---------- Vouchers ----------
export async function createVoucher(input: CreateVoucherInput, opts?: ApiOptions) {
  return client(opts).voucher.create({
    data: {
      code: input.code,
      value: input.value,
      claimedBy: input.claimedBy ?? null,
    },
  });
}

export async function listVouchers(opts?: ApiOptions) {
  return client(opts).voucher.findMany({ orderBy: { id: "asc" } });
}

export async function listAvailableVouchers(opts?: ApiOptions) {
  return client(opts).voucher.findMany({
    where: { claimedBy: null },
    orderBy: { value: "desc" },
  });
}

// Atomic claim: only succeeds while the voucher is still unclaimed. We use
// updateMany + where to avoid a check-then-write race when two users hit the
// redeem button at the same moment.
export async function claimVoucher(
  voucherId: number,
  userId: number,
  opts?: ApiOptions,
) {
  const result = await client(opts).voucher.updateMany({
    where: { id: voucherId, claimedBy: null },
    data: { claimedBy: userId },
  });
  if (result.count === 0) {
    return { ok: false as const, reason: "already-claimed" };
  }
  const voucher = await client(opts).voucher.findUnique({ where: { id: voucherId } });
  return { ok: true as const, voucher };
}

export { bboxFromCenter, pointInBBox, haversineKm };
export type { BBox, LatLng };
