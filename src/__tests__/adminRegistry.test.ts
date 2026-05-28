import { describe, expect, it } from "vitest";
import {
  buildAnonymizedRegistry,
  type AnonymizedRegistryRow,
  type IdentitySessionInput,
} from "@/lib/adminRegistry";
import type { UiUser } from "@/app/store/appStore";

// Helper: build a UiUser fixture with the PII columns set to something
// distinctive, so we can assert they're DROPPED from the projection.
function makeUser(overrides: Partial<UiUser> & Pick<UiUser, "id" | "username" | "role">): UiUser {
  return {
    email: `${overrides.username}@LEAK.example`,    // must NOT surface
    xp: 99999,                                       // must NOT surface
    streak: 99,                                      // must NOT surface
    avatar: "https://LEAK.example/avatar.png",       // must NOT surface
    location: { lat: 0, lng: 0 },                    // must NOT surface
    identityNullifierHex: "11".repeat(32),
    loginNullifierHex:    "22".repeat(32),
    ...overrides,
  };
}

const emptySession: IdentitySessionInput = {
  username: null,
  identityNullifier: null,
  previousIdentityNullifier: null,
  loginNullifier: null,
  role: null,
  currentUserId: null,
};

describe("buildAnonymizedRegistry, PII firewall", () => {
  it("only ever emits the four anonymized fields per row (drops email/xp/streak/avatar/location)", () => {
    const users = [
      makeUser({ id: 1, username: "alice", role: "citizen" }),
      makeUser({ id: 2, username: "bob",   role: "admin"   }),
    ];
    const rows = buildAnonymizedRegistry(users, emptySession);

    // Every row carries exactly the anonymized columns the table
    // renders, no email/xp/streak/avatar/location leak. The set is:
    // id, username, identity/login nullifier hex, previous identity
    // hex (audit slot), role. Login is not rotated by re-upload so
    // there is no previousLoginNullifierHex counterpart.
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "id",
        "identityNullifierHex",
        "loginNullifierHex",
        "previousIdentityNullifierHex",
        "role",
        "username",
      ]);
    }

    // Sanity: stringifying the rows must never contain the PII strings
    // we put into the input. This is the regression test that prevents
    // a future change from sneaking email/avatar back into the
    // projection.
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain("LEAK.example");
    expect(serialised).not.toContain("99999");
  });
});

describe("buildAnonymizedRegistry, branch 1: no active session", () => {
  it("returns one row per seed user, preserving order", () => {
    const users = [
      makeUser({ id: 1, username: "alice", role: "citizen" }),
      makeUser({ id: 2, username: "bob",   role: "admin"   }),
      makeUser({ id: 3, username: "cara",  role: "citizen" }),
    ];
    const rows = buildAnonymizedRegistry(users, emptySession);
    expect(rows.map((r) => r.username)).toEqual(["alice", "bob", "cara"]);
    expect(rows.map((r) => r.role)).toEqual(["citizen", "admin", "citizen"]);
  });

  it("treats a partially-empty session (some fields null) as 'no session'", () => {
    const users = [makeUser({ id: 1, username: "alice", role: "citizen" })];
    const partial: IdentitySessionInput = {
      username: "alice",
      identityNullifier: null,  // ← partial state, projection must not overlay
      previousIdentityNullifier: null,
      loginNullifier: "33".repeat(32),
      role: "citizen",
      currentUserId: 1,
    };
    const rows = buildAnonymizedRegistry(users, partial);
    // alice's row still has the synthetic seed values, NOT the partial
    // session's loginNullifier.
    expect(rows).toHaveLength(1);
    expect(rows[0].identityNullifierHex).toBe("11".repeat(32));
    expect(rows[0].loginNullifierHex).toBe("22".repeat(32));
  });
});

describe("buildAnonymizedRegistry, branch 2: session overlays existing row", () => {
  it("replaces synthetic nullifiers with real session values when usernames match", () => {
    const users = [
      makeUser({ id: 1, username: "alice", role: "citizen" }),
      makeUser({ id: 2, username: "bob",   role: "admin"   }),
    ];
    const session: IdentitySessionInput = {
      username: "bob",
      identityNullifier: "ff".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier:    "ee".repeat(32),
      role: "admin",
      currentUserId: 2,
    };
    const rows = buildAnonymizedRegistry(users, session);
    expect(rows).toHaveLength(2);

    const aliceRow = rows.find((r) => r.username === "alice")!;
    const bobRow   = rows.find((r) => r.username === "bob")!;

    // Alice unchanged.
    expect(aliceRow.identityNullifierHex).toBe("11".repeat(32));
    expect(aliceRow.loginNullifierHex).toBe("22".repeat(32));
    // Bob's row now carries the real session values.
    expect(bobRow.identityNullifierHex).toBe("ff".repeat(32));
    expect(bobRow.loginNullifierHex).toBe("ee".repeat(32));
  });

  it("preserves the SEED ROLE for the matched user, session.role does NOT promote/demote", () => {
    // Seed says bob is admin. Session lies and claims bob is a
    // citizen. The registry is authoritative, bob stays admin.
    // This pins down that the projection cannot be used to
    // smuggle a role change via the session input.
    const users = [makeUser({ id: 1, username: "bob", role: "admin" })];
    const session: IdentitySessionInput = {
      username: "bob",
      identityNullifier: "ff".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier:    "ee".repeat(32),
      role: "citizen",
      currentUserId: 1,
    };
    const rows = buildAnonymizedRegistry(users, session);
    expect(rows[0].role).toBe("admin");
  });
});

describe("buildAnonymizedRegistry, branch 3: session appends a new row", () => {
  it("appends a new row when the session username is not in the seed list", () => {
    const users = [makeUser({ id: 1, username: "alice", role: "citizen" })];
    const session: IdentitySessionInput = {
      username: "carol",
      identityNullifier: "ff".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier:    "ee".repeat(32),
      role: "citizen",
      currentUserId: 7,
    };
    const rows = buildAnonymizedRegistry(users, session);
    expect(rows).toHaveLength(2);
    expect(rows[1].id).toBe(7);
    expect(rows[1].username).toBe("carol");
    expect(rows[1].identityNullifierHex).toBe("ff".repeat(32));
    expect(rows[1].loginNullifierHex).toBe("ee".repeat(32));
    expect(rows[1].role).toBe("citizen");
  });

  it("the appended row carries the session's role (admin propagates correctly)", () => {
    const users: UiUser[] = [];
    const session: IdentitySessionInput = {
      username: "fresh_admin",
      identityNullifier: "ab".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier:    "cd".repeat(32),
      role: "admin",
      currentUserId: 7,
    };
    const rows = buildAnonymizedRegistry(users, session);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });

  it("defaults the appended row to citizen if session.role is null (defensive)", () => {
    const users: UiUser[] = [];
    const session: IdentitySessionInput = {
      username: "fresh",
      identityNullifier: "ab".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier:    "cd".repeat(32),
      role: null,
      currentUserId: 7,
    };
    const rows = buildAnonymizedRegistry(users, session);
    expect(rows[0].role).toBe("citizen");
  });
});

describe("buildAnonymizedRegistry, id column + previous-binding columns", () => {
  it("carries UiUser.id verbatim onto each projected row", () => {
    const users = [
      makeUser({ id: 1, username: "alice", role: "citizen" }),
      makeUser({ id: 42, username: "bob", role: "admin" }),
    ];
    const rows = buildAnonymizedRegistry(users, emptySession);
    expect(rows.map((r) => r.id)).toEqual([1, 42]);
  });

  it("uses session.currentUserId for the appended-row branch (no seed match)", () => {
    const session: IdentitySessionInput = {
      username: "wreakage_fixer",
      identityNullifier: "ff".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier: "ee".repeat(32),
      role: "citizen",
      currentUserId: 99,
    };
    const rows = buildAnonymizedRegistry([], session);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(99);
  });

  it("appended row's id is null when session.currentUserId is null", () => {
    const session: IdentitySessionInput = {
      username: "wreakage_fixer",
      identityNullifier: "ff".repeat(32),
      previousIdentityNullifier: null,
      loginNullifier: "ee".repeat(32),
      role: "citizen",
      currentUserId: null,
    };
    const rows = buildAnonymizedRegistry([], session);
    expect(rows[0].id).toBeNull();
  });

  it("OVERLAYS previousIdentityNullifierHex from the session onto the matched seed row", () => {
    // The slice is the live source of truth for the most-recent prior
    // identity nullifier. The seed row's stored column (if any) is
    // overlaid by the session value when usernames match.
    const users = [makeUser({ id: 1, username: "alice", role: "citizen" })];
    const session: IdentitySessionInput = {
      username: "alice",
      identityNullifier: "ff".repeat(32),
      previousIdentityNullifier: "aa".repeat(32),
      loginNullifier: "ee".repeat(32),
      role: "citizen",
      currentUserId: 1,
    };
    const rows = buildAnonymizedRegistry(users, session);
    expect(rows[0].previousIdentityNullifierHex).toBe("aa".repeat(32));
  });

  it("PRESERVES previousIdentityNullifierHex from UiUser when no session is active", () => {
    // The seed/persisted UiUser holds its own previous-hex column; the
    // projection must surface that verbatim on the no-session branch.
    const users = [
      makeUser({
        id: 1,
        username: "alice",
        role: "citizen",
        previousIdentityNullifierHex: "bb".repeat(32),
      }),
    ];
    const rows = buildAnonymizedRegistry(users, emptySession);
    expect(rows[0].previousIdentityNullifierHex).toBe("bb".repeat(32));
  });

  it("renders previousIdentityNullifierHex as null on rows that never re-uploaded", () => {
    const users = [makeUser({ id: 1, username: "alice", role: "citizen" })];
    const rows = buildAnonymizedRegistry(users, emptySession);
    // The placeholder UI converts null → "—". Pin down the data-layer
    // shape: it is exactly null, not undefined or "".
    expect(rows[0].previousIdentityNullifierHex).toBeNull();
  });
});
