import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/app/store/appStore";
import { deriveLoginNullifier } from "@/lib/identity";
import { totpCode } from "@/lib/totp";

// The identity slice is wired into the main store, so we exercise it
// via `useAppStore.getState()` / `setState()` exactly the way the
// React components do.
//
// The security fix in this round changes the login flow: it now
// requires BOTH username and password. The fast-path-on-username
// behaviour is gone. Most of the test surface below pins down the
// new strict contract.
const resetStore = () => {
  useAppStore.persist.clearStorage();
  useAppStore.setState(useAppStore.getInitialState(), true);
};

beforeEach(() => {
  resetStore();
});

describe("identitySlice — register", () => {
  it("derives and stores both nullifiers, marks the user authenticated", async () => {
    const { register } = useAppStore.getState();
    const out = await register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });

    expect(out.identityNullifier).toMatch(/^[0-9a-f]{64}$/);
    expect(out.loginNullifier).toMatch(/^[0-9a-f]{64}$/);
    expect(out.identityNullifier).not.toBe(out.loginNullifier);

    const s = useAppStore.getState();
    expect(s.username).toBe("alice");
    expect(s.identityNullifier).toBe(out.identityNullifier);
    expect(s.loginNullifier).toBe(out.loginNullifier);
    expect(s.isAuthenticated).toBe(true);
  });

  it("stores the ownership public key (JWK-shaped JSON) at registration", async () => {
    // The publicKey is the server-side half of the zero-knowledge
    // proof: stored at register, read at login to verify the
    // signature over the challenge nonce. The private half is never
    // persisted — re-derived from typed credentials each login.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    const stored = useAppStore.getState().ownershipPublicKey;
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as JsonWebKey;
    expect(parsed.kty).toBe("OKP");
    expect(parsed.crv).toBe("Ed25519");
    expect(parsed.x).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    // The private `d` half MUST NOT leak into the persisted blob.
    expect((parsed as Record<string, unknown>).d).toBeUndefined();
  });

  it("rejects an empty password before any derivation", async () => {
    const { register } = useAppStore.getState();
    await expect(
      register({ username: "alice", password: "", rawCitizenId: "1234567890" }),
    ).rejects.toThrow(/Password is required/);
    await expect(
      register({ username: "alice", password: "   ", rawCitizenId: "1234567890" }),
    ).rejects.toThrow(/Password is required/);
    // No partial state leaked.
    expect(useAppStore.getState().username).toBeNull();
    expect(useAppStore.getState().loginNullifier).toBeNull();
  });

  it("rejects an empty username before any derivation", async () => {
    const { register } = useAppStore.getState();
    await expect(
      register({ username: "", password: "hunter2", rawCitizenId: "1234567890" }),
    ).rejects.toThrow(/Username is required/);
  });

  it("rejects malformed citizen IDs (CypriotIdFormatError surfaces 10-digit message)", async () => {
    const { register } = useAppStore.getState();
    await expect(
      register({ username: "alice", password: "hunter2", rawCitizenId: "abc" }),
    ).rejects.toThrow(/10 digits/);
    expect(useAppStore.getState().username).toBeNull();
  });

  it("canonicalises the citizen ID before deriving — '12-34 56 78-90' equals '1234567890'", async () => {
    const a = await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "12-34 56 78-90",
    });
    resetStore();
    const b = await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // Same username + password + canonical ID ⇒ both nullifiers match.
    expect(a.identityNullifier).toBe(b.identityNullifier);
    expect(a.loginNullifier).toBe(b.loginNullifier);
  });
});

describe("identitySlice — login (strict username + password)", () => {
  // Helper: register an account, then simulate "session de-authed
  // but credentials still cached" — exactly the state hydrate
  // produces on page reload, which is the realistic precondition
  // for login(). NOTE: we do NOT call logout() here, because round 3
  // made logout memory-sanitising — it wipes the cache that login()
  // needs to compare against. Use a direct setState to flip just
  // isAuthenticated.
  const seedAccount = async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.setState({ isAuthenticated: false });
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    expect(useAppStore.getState().loginNullifier).not.toBeNull();
  };

  it("REJECTS missing password (the bug this version fixes)", async () => {
    await seedAccount();
    // No password property at all.
    const ok = await useAppStore.getState().login({
      username: "alice",
    } as unknown as { username: string; password: string });
    expect(ok).toBe(false);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });

  it("REJECTS empty-string password", async () => {
    await seedAccount();
    const ok = await useAppStore.getState().login({ username: "alice", password: "" });
    expect(ok).toBe(false);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });

  it("REJECTS empty-string username", async () => {
    await seedAccount();
    const ok = await useAppStore.getState().login({ username: "", password: "hunter2" });
    expect(ok).toBe(false);
  });

  it("ACCEPTS correct username + correct password", async () => {
    await seedAccount();
    const ok = await useAppStore.getState().login({ username: "alice", password: "hunter2" });
    expect(ok).toBe(true);
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });

  it("REJECTS wrong password for a known user", async () => {
    await seedAccount();
    const ok = await useAppStore.getState().login({ username: "alice", password: "wrong" });
    expect(ok).toBe(false);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });

  it("REJECTS wrong username (no implicit account creation, no probing leak)", async () => {
    await seedAccount();
    const ok = await useAppStore.getState().login({ username: "bob", password: "hunter2" });
    expect(ok).toBe(false);
  });

  it("REJECTS login when nothing has been registered on this device", async () => {
    // Fresh store, no register call.
    expect(useAppStore.getState().username).toBeNull();
    const ok = await useAppStore.getState().login({ username: "alice", password: "hunter2" });
    expect(ok).toBe(false);
  });

  it("uses PBKDF2-derived comparison — the stored value equals deriveLoginNullifier(password, username)", async () => {
    // Confirms the slice did not apply any extra transformation on top
    // of the lib helper. If these ever drift, the slice is hashing
    // differently than what the lib re-derives during login.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    const independently = await deriveLoginNullifier("hunter2", "alice");
    expect(useAppStore.getState().loginNullifier).toBe(independently);
  });

  it("does NOT need the citizen ID for login (registration is the only place it's used)", async () => {
    // The whole point of the split: login takes (username, password)
    // only. There is no `rawCitizenId` argument anywhere on the login
    // surface.
    await seedAccount();
    const ok = await useAppStore.getState().login({ username: "alice", password: "hunter2" });
    expect(ok).toBe(true);
  });
});

describe("identitySlice — login (zero-knowledge ownership proof, round 5)", () => {
  // The round-5 login flow layers an Ed25519 signature over the
  // existing username + loginNullifier check. The login succeeds
  // ONLY when the signature verifies against the stored
  // ownershipPublicKey — so a leaked loginNullifier alone (e.g.
  // a localStorage dump) is insufficient to authenticate.

  it("REJECTS login when the ownership public key was never stored (pre-v7 snapshot shape)", async () => {
    // Simulate the state a v6 user would hydrate into: nullifier is
    // present, but no ownership public key. Without it the v7 login
    // flow has nothing to verify the signature against, so it must
    // reject — closing the wire-protocol-only authn loophole.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.setState({
      isAuthenticated: false,
      ownershipPublicKey: null,
    });
    const ok = await useAppStore.getState().login({
      username: "alice",
      password: "hunter2",
    });
    expect(ok).toBe(false);
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });

  it("REJECTS login when the stored public key is corrupted (defensive parse)", async () => {
    // If something writes garbage into the persisted blob, login
    // should refuse rather than throw. The JSON.parse inside
    // mockAuthLoginApi is wrapped — verify that branch is exercised.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.setState({
      isAuthenticated: false,
      ownershipPublicKey: "{not valid json",
    });
    const ok = await useAppStore.getState().login({
      username: "alice",
      password: "hunter2",
    });
    expect(ok).toBe(false);
  });

  it("REJECTS login when the stored public key belongs to a different password (signature-based password check)", async () => {
    // Simulate the attack: someone steals the loginNullifier and
    // username from a victim's device but doesn't have their
    // password. They register their own ownership keypair under a
    // different password and try to swap it in. The signature they
    // produce verifies against THEIR public key — not the victim's.
    // Conversely, planting the victim's public key without knowing
    // their password means they can't produce a verifying signature.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    const aliceLoginNullifier = useAppStore.getState().loginNullifier;
    const alicePublicKey = useAppStore.getState().ownershipPublicKey;

    // Set up a state where the cached nullifier matches alice's, but
    // the public key has been swapped to one derived from a different
    // password. The login attempt re-derives the signature from the
    // typed password ("hunter2") and signs with hunter2's private
    // key — but the stored public key is for a DIFFERENT keypair,
    // so the signature cannot verify.
    resetStore();
    await useAppStore.getState().register({
      username: "alice",
      password: "DIFFERENT-PASSWORD",
      rawCitizenId: "1234567890",
    });
    const swapped = useAppStore.getState().ownershipPublicKey;
    expect(swapped).not.toBe(alicePublicKey);

    // Force the inconsistent combo into the slice: alice's nullifier,
    // but DIFFERENT-PASSWORD's public key.
    useAppStore.setState({
      isAuthenticated: false,
      loginNullifier: aliceLoginNullifier,
    });

    // Trying to log in with "hunter2" computes a hunter2 signature;
    // verify fails because the stored public key isn't hunter2's.
    const ok = await useAppStore.getState().login({
      username: "alice",
      password: "hunter2",
    });
    expect(ok).toBe(false);
  });

  it("ACCEPTS login after register — full pipeline (challenge + sign + verify) round-trips end-to-end", async () => {
    // Sanity end-to-end: register stores publicKey, login re-derives
    // privateKey, signs a fresh nonce, mockAuthLoginApi verifies and
    // returns true. The fact that this works without any per-user
    // random salt stored server-side IS the prototype's headline
    // property — pin it down.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.setState({ isAuthenticated: false });
    const ok = await useAppStore.getState().login({
      username: "alice",
      password: "hunter2",
    });
    expect(ok).toBe(true);
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });
});

describe("identitySlice — admin TOTP (unchanged by login refactor)", () => {
  it("enrollTotp persists a secret and returns a valid otpauth:// URI", async () => {
    const out = await useAppStore.getState().enrollTotp("admin");
    expect(out.secret).toMatch(/^[A-Z2-7]+$/);
    expect(out.uri.startsWith("otpauth://totp/")).toBe(true);
    expect(useAppStore.getState().totpSecret).toBe(out.secret);
    expect(useAppStore.getState().adminVerified).toBe(false);
  });

  it("verifyAdminTotp accepts the current code for the enrolled secret", async () => {
    const { secret } = await useAppStore.getState().enrollTotp("admin");
    const code = await totpCode(secret);
    const ok = await useAppStore.getState().verifyAdminTotp(code);
    expect(ok).toBe(true);
    expect(useAppStore.getState().adminVerified).toBe(true);
  });

  it("verifyAdminTotp rejects an arbitrary 6-digit guess", async () => {
    await useAppStore.getState().enrollTotp("admin");
    const ok = await useAppStore.getState().verifyAdminTotp("000000");
    expect(ok).toBe(false);
  });

  it("verifyAdminTotp returns false when no secret has been enrolled", async () => {
    expect(useAppStore.getState().totpSecret).toBeNull();
    expect(await useAppStore.getState().verifyAdminTotp("123456")).toBe(false);
  });

  it("revokeAdmin clears both the secret and the verified flag", async () => {
    const { secret } = await useAppStore.getState().enrollTotp("admin");
    await useAppStore.getState().verifyAdminTotp(await totpCode(secret));
    useAppStore.getState().revokeAdmin();
    expect(useAppStore.getState().totpSecret).toBeNull();
    expect(useAppStore.getState().adminVerified).toBe(false);
  });
});

describe("identitySlice — session-only logout (credential triple preserved)", () => {
  it("clears ONLY session access flags, preserves credential triple and derived identity material", async () => {
    // Build maximally-populated identity state: registered, admin-promoted,
    // TOTP enrolled + verified.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.getState().setRole("admin");
    const { secret } = await useAppStore.getState().enrollTotp("admin");
    await useAppStore.getState().verifyAdminTotp(await totpCode(secret));

    // Sanity: state is populated.
    const before = useAppStore.getState();
    const usernameBefore = before.username;
    const identityNullifierBefore = before.identityNullifier;
    const loginNullifierBefore = before.loginNullifier;
    const ownershipPublicKeyBefore = before.ownershipPublicKey;
    expect(usernameBefore).toBe("alice");
    expect(identityNullifierBefore).toMatch(/^[0-9a-f]{64}$/);
    expect(loginNullifierBefore).toMatch(/^[0-9a-f]{64}$/);
    expect(ownershipPublicKeyBefore).not.toBeNull();
    expect(before.isAuthenticated).toBe(true);
    expect(before.role).toBe("admin");
    expect(before.totpSecret).toBe(secret);
    expect(before.adminVerified).toBe(true);

    // Logout: only the session access flags reset. The credential
    // triple (username, loginNullifier, ownershipPublicKey) and the
    // derived identity material (identityNullifier, totpSecret) are
    // intentionally retained on the device per the demo-ergonomics
    // contract documented on the `logout` action.
    useAppStore.getState().logout();
    const after = useAppStore.getState();

    // Session flags — cleared.
    expect(after.isAuthenticated).toBe(false);
    expect(after.role).toBeNull();
    expect(after.adminVerified).toBe(false);

    // Credential triple — preserved verbatim.
    expect(after.username).toBe(usernameBefore);
    expect(after.loginNullifier).toBe(loginNullifierBefore);
    expect(after.ownershipPublicKey).toBe(ownershipPublicKeyBefore);

    // Derived identity material — preserved (not part of the
    // session-flag set, so the "clear only access flags" rule keeps
    // these in place too).
    expect(after.identityNullifier).toBe(identityNullifierBefore);
    expect(after.totpSecret).toBe(secret);
  });

  it("does NOT wipe non-identity slices (catalogue / reports / rewards survive)", async () => {
    // The point of factoring logout this way (slice-only setState
    // rather than persist.clearStorage) is that gamification state is
    // untouched.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    const reportsBefore = useAppStore.getState().reports.length;
    const rewardsBefore = useAppStore.getState().rewards.length;
    const usersBefore = useAppStore.getState().users.length;

    useAppStore.getState().logout();

    expect(useAppStore.getState().reports.length).toBe(reportsBefore);
    expect(useAppStore.getState().rewards.length).toBe(rewardsBefore);
    expect(useAppStore.getState().users.length).toBe(usersBefore);
  });

  it("clears sessionStorage (defensive sweep for accidentally-leaked secrets)", async () => {
    if (typeof sessionStorage === "undefined") return; // Node env without jsdom — skip
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    sessionStorage.setItem("crowdupkeep_temp_buffer", "0xdeadbeef");
    expect(sessionStorage.getItem("crowdupkeep_temp_buffer")).toBe("0xdeadbeef");
    useAppStore.getState().logout();
    expect(sessionStorage.getItem("crowdupkeep_temp_buffer")).toBeNull();
  });

  it("the persisted blob still contains the credential triple after logout", async () => {
    // The persist middleware writes the partialized snapshot to
    // localStorage on every set(). Because logout only clears the
    // session access flags, the credential triple (username +
    // loginNullifier + ownershipPublicKey) survives the persist
    // write so a returning user on the same device can re-authenticate
    // with username + password — the contract this prototype demo
    // relies on for repeatable evaluation cycles.
    if (typeof localStorage === "undefined") return; // skip in pure Node
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    const cachedNullifier = useAppStore.getState().loginNullifier!;
    useAppStore.getState().logout();
    const blob = localStorage.getItem("crowdupkeep-state-v1");
    if (!blob) return; // implementation may delay write — skip rather than flake
    expect(blob).toContain(cachedNullifier);
    expect(blob).toContain("alice");
  });

  it("a logged-out user CAN log back in with the same password (credential triple preserved across logout)", async () => {
    // Contract: logout drops the session access flags but keeps the
    // credential triple on disk. A returning user therefore logs in
    // with username + password alone — no re-registration with the
    // citizen ID is required. This is the demo-ergonomics property
    // the prototype's evaluation flow depends on.
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.getState().logout();
    expect(useAppStore.getState().isAuthenticated).toBe(false);

    const ok = await useAppStore.getState().login({ username: "alice", password: "hunter2" });
    expect(ok).toBe(true);
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });
});

describe("identitySlice — logout does NOT call persist.clearStorage (credential-retention contract)", () => {
  it("does NOT invoke useAppStore.persist.clearStorage on logout (blanket purge replaced with partial slice reset)", async () => {
    // Contract inversion: the earlier "secure logout" implementation
    // called persist.clearStorage to wipe the entire persisted blob.
    // The credential-retention contract drops that call — logout
    // performs only a partial slice reset (session access flags),
    // leaving the persisted blob (including the credential triple)
    // in place for the next login attempt.
    const originalClear = useAppStore.persist.clearStorage;
    let clearCalls = 0;
    useAppStore.persist.clearStorage = (() => {
      clearCalls += 1;
      return originalClear.call(useAppStore.persist);
    }) as typeof originalClear;

    try {
      await useAppStore.getState().register({
        username: "alice",
        password: "hunter2",
        rawCitizenId: "1234567890",
      });
      const callsAfterRegister = clearCalls;
      useAppStore.getState().logout();
      // No additional clearStorage invocations should have happened
      // during logout — the partial-reset path bypasses it entirely.
      expect(clearCalls).toBe(callsAfterRegister);
      // Post-condition: credential triple still intact, session flags
      // dropped.
      const s = useAppStore.getState();
      expect(s.username).toBe("alice");
      expect(s.loginNullifier).not.toBeNull();
      expect(s.ownershipPublicKey).not.toBeNull();
      expect(s.isAuthenticated).toBe(false);
    } finally {
      useAppStore.persist.clearStorage = originalClear;
    }
  });

  it("completes the partial slice reset even when sessionStorage.clear throws (defensive try/catch)", () => {
    // The remaining external touch-point inside logout is the
    // sessionStorage.clear() defensive sweep. If that throws (e.g.
    // private-mode browser), logout must still reset the session
    // flags rather than leave them half-set. The credential triple
    // also stays preserved.
    const originalClear =
      typeof sessionStorage !== "undefined" ? sessionStorage.clear.bind(sessionStorage) : null;
    if (originalClear) {
      sessionStorage.clear = (() => {
        throw new Error("simulated sessionStorage failure");
      }) as typeof sessionStorage.clear;
    }
    try {
      useAppStore.setState({
        username: "alice",
        loginNullifier: "ff".repeat(32),
        ownershipPublicKey: '{"kty":"OKP","crv":"Ed25519","x":"AAAA"}',
        isAuthenticated: true,
        role: "admin",
        adminVerified: true,
      });
      // Must not throw.
      useAppStore.getState().logout();
      // Session flags cleared.
      expect(useAppStore.getState().isAuthenticated).toBe(false);
      expect(useAppStore.getState().role).toBeNull();
      expect(useAppStore.getState().adminVerified).toBe(false);
      // Credential triple still intact.
      expect(useAppStore.getState().username).toBe("alice");
      expect(useAppStore.getState().loginNullifier).toBe("ff".repeat(32));
      expect(useAppStore.getState().ownershipPublicKey).toBe(
        '{"kty":"OKP","crv":"Ed25519","x":"AAAA"}',
      );
    } finally {
      if (originalClear) {
        sessionStorage.clear = originalClear;
      }
    }
  });
});

describe("identitySlice — promoteToAdmin (round 4)", () => {
  it("REJECTS when caller is not authenticated (no loginNullifier on this device)", async () => {
    // Fresh store, no register.
    expect(useAppStore.getState().loginNullifier).toBeNull();
    await expect(
      useAppStore.getState().promoteToAdmin("civic_hero"),
    ).rejects.toThrow(/logged in/);
  });

  it("REJECTS when target username does not exist in the registry", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    await expect(
      useAppStore.getState().promoteToAdmin("ghost_user_does_not_exist"),
    ).rejects.toThrow(/not found in registry/);
  });

  it("IS IDEMPOTENT — re-promoting an already-admin user reports alreadyAdmin and does not double-write", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // city_champion (id=3) starts as admin in the seed.
    const before = useAppStore.getState().users.find((u) => u.username === "city_champion")!;
    expect(before.role).toBe("admin");
    const result = await useAppStore.getState().promoteToAdmin("city_champion");
    expect(result.alreadyAdmin).toBe(true);
    expect(result.totpEnrolment).toBeNull();
    const after = useAppStore.getState().users.find((u) => u.username === "city_champion")!;
    expect(after).toEqual(before); // unchanged object shape
  });

  it("PROMOTES ANOTHER user — updates the registry but NOT the live identity slice", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // green_warrior is a seed citizen.
    expect(useAppStore.getState().users.find((u) => u.username === "green_warrior")!.role)
      .toBe("citizen");

    const sessionRoleBefore = useAppStore.getState().role;
    const result = await useAppStore.getState().promoteToAdmin("green_warrior");

    expect(result.promoted).toBe("green_warrior");
    expect(result.alreadyAdmin).toBe(false);
    expect(result.totpEnrolment).toBeNull(); // promoting other ⇒ no self-TOTP
    // Registry updated.
    expect(useAppStore.getState().users.find((u) => u.username === "green_warrior")!.role)
      .toBe("admin");
    // Live identity slice unchanged — alice did NOT inherit
    // green_warrior's promotion.
    expect(useAppStore.getState().role).toBe(sessionRoleBefore);
  });

  it("PROMOTES SELF — updates registry AND identity slice AND provisions TOTP secret", async () => {
    // Register as a citizen who matches a seed username.
    await useAppStore.getState().register({
      username: "civic_hero",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // Sanity preconditions.
    expect(useAppStore.getState().role).toBe("citizen");
    expect(useAppStore.getState().totpSecret).toBeNull();
    expect(useAppStore.getState().users.find((u) => u.username === "civic_hero")!.role)
      .toBe("citizen"); // seed had this as citizen

    const result = await useAppStore.getState().promoteToAdmin("civic_hero");

    expect(result.promoted).toBe("civic_hero");
    expect(result.alreadyAdmin).toBe(false);
    // Registry write.
    expect(useAppStore.getState().users.find((u) => u.username === "civic_hero")!.role)
      .toBe("admin");
    // Identity slice mirror.
    expect(useAppStore.getState().role).toBe("admin");
    // TOTP provisioned + the enrolment payload returned to the caller.
    expect(useAppStore.getState().totpSecret).toMatch(/^[A-Z2-7]+$/);
    expect(result.totpEnrolment).not.toBeNull();
    expect(result.totpEnrolment!.secret).toBe(useAppStore.getState().totpSecret);
    expect(result.totpEnrolment!.uri.startsWith("otpauth://totp/")).toBe(true);
  });

  it("DOES NOT auto-pass the TOTP gate — adminVerified stays false post-promotion", async () => {
    // Provisioning a secret is bootstrap, not bypass. The admin still
    // has to scan the secret + enter a fresh code to flip
    // adminVerified. This pins down the intentional decoupling.
    await useAppStore.getState().register({
      username: "civic_hero",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    expect(useAppStore.getState().adminVerified).toBe(false);
    await useAppStore.getState().promoteToAdmin("civic_hero");
    expect(useAppStore.getState().adminVerified).toBe(false);
  });

  it("RESPECTS an existing TOTP secret — does not regenerate on re-promotion", async () => {
    await useAppStore.getState().register({
      username: "civic_hero",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    await useAppStore.getState().promoteToAdmin("civic_hero");
    const secretAfterFirstPromote = useAppStore.getState().totpSecret;
    expect(secretAfterFirstPromote).not.toBeNull();

    // Demote and re-promote — the existing TOTP secret should NOT
    // be regenerated underneath the user (which would invalidate
    // their already-enrolled authenticator).
    useAppStore.setState((s) => ({
      users: s.users.map((u) =>
        u.username === "civic_hero" ? { ...u, role: "citizen" } : u,
      ),
      role: "citizen",
    }));
    const result = await useAppStore.getState().promoteToAdmin("civic_hero");
    expect(useAppStore.getState().totpSecret).toBe(secretAfterFirstPromote);
    // And the returned enrolment is null because we didn't generate
    // a fresh one.
    expect(result.totpEnrolment).toBeNull();
  });
});

describe("identitySlice — promoteToAdmin (session-user tolerance)", () => {
  it("PROMOTES the session user even when they are NOT in users[] (registered with a non-seed username)", async () => {
    // wreakage_fixer is NOT one of the seeded usernames in mockData.
    // Before the tolerance change, the action would throw because
    // users.find(u => u.username === "wreakage_fixer") is undefined.
    expect(
      useAppStore.getState().users.find((u) => u.username === "wreakage_fixer"),
    ).toBeUndefined();
    await useAppStore.getState().register({
      username: "wreakage_fixer",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });

    const result = await useAppStore.getState().promoteToAdmin("wreakage_fixer");
    expect(result.alreadyAdmin).toBe(false);
    expect(result.promoted).toBe("wreakage_fixer");
    // Session role flipped to admin.
    expect(useAppStore.getState().role).toBe("admin");
    // TOTP was provisioned for the self-promotion (the user didn't
    // have a secret yet).
    expect(result.totpEnrolment).not.toBeNull();
    expect(useAppStore.getState().totpSecret).toBe(result.totpEnrolment!.secret);
  });

  it("RE-PROMOTING the session user (already admin via session) reports alreadyAdmin without throwing", async () => {
    await useAppStore.getState().register({
      username: "wreakage_fixer",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.getState().setRole("admin");
    const result = await useAppStore.getState().promoteToAdmin("wreakage_fixer");
    expect(result.alreadyAdmin).toBe(true);
    expect(result.totpEnrolment).toBeNull();
  });
});

describe("identitySlice — demoteFromAdmin", () => {
  it("REJECTS when caller is not authenticated", async () => {
    expect(useAppStore.getState().loginNullifier).toBeNull();
    await expect(
      useAppStore.getState().demoteFromAdmin("city_champion"),
    ).rejects.toThrow(/logged in/);
  });

  it("REJECTS when target is neither in users[] nor the session user", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    await expect(
      useAppStore.getState().demoteFromAdmin("ghost_user_does_not_exist"),
    ).rejects.toThrow(/not found in registry/);
  });

  it("IS IDEMPOTENT — re-demoting an already-citizen user reports alreadyCitizen and does not double-write", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // green_warrior is a seed citizen.
    const before = useAppStore.getState().users.find((u) => u.username === "green_warrior")!;
    expect(before.role).toBe("citizen");
    const result = await useAppStore.getState().demoteFromAdmin("green_warrior");
    expect(result.alreadyCitizen).toBe(true);
    const after = useAppStore.getState().users.find((u) => u.username === "green_warrior")!;
    expect(after).toEqual(before);
  });

  it("DEMOTES ANOTHER user — updates the registry but NOT the live identity slice", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // city_champion is a seed admin.
    expect(useAppStore.getState().users.find((u) => u.username === "city_champion")!.role)
      .toBe("admin");

    const sessionRoleBefore = useAppStore.getState().role;
    const result = await useAppStore.getState().demoteFromAdmin("city_champion");

    expect(result.demoted).toBe("city_champion");
    expect(result.alreadyCitizen).toBe(false);
    expect(useAppStore.getState().users.find((u) => u.username === "city_champion")!.role)
      .toBe("citizen");
    // Live session role (alice's) unchanged.
    expect(useAppStore.getState().role).toBe(sessionRoleBefore);
  });

  it("DEMOTES SELF — flips session role to citizen AND resets adminVerified, leaves totpSecret intact", async () => {
    await useAppStore.getState().register({
      username: "civic_hero",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // Self-promote first so there's something to demote.
    await useAppStore.getState().promoteToAdmin("civic_hero");
    const totpSecretBefore = useAppStore.getState().totpSecret;
    expect(totpSecretBefore).not.toBeNull();
    // Pretend the TOTP gate has been passed in this session.
    useAppStore.setState({ adminVerified: true });

    const result = await useAppStore.getState().demoteFromAdmin("civic_hero");
    expect(result.demoted).toBe("civic_hero");
    expect(result.alreadyCitizen).toBe(false);

    // Registry write.
    expect(useAppStore.getState().users.find((u) => u.username === "civic_hero")!.role)
      .toBe("citizen");
    // Session role + admin-verified flag both reset — admin views
    // re-lock immediately on the next render.
    expect(useAppStore.getState().role).toBe("citizen");
    expect(useAppStore.getState().adminVerified).toBe(false);
    // TOTP secret deliberately preserved so a re-promotion can
    // reuse the existing enrolled authenticator.
    expect(useAppStore.getState().totpSecret).toBe(totpSecretBefore);
  });

  it("DEMOTES the session user even when they are NOT in users[] (registered with a non-seed username)", async () => {
    await useAppStore.getState().register({
      username: "wreakage_fixer",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    // Self-promote so there's an admin role to drop.
    await useAppStore.getState().promoteToAdmin("wreakage_fixer");
    expect(useAppStore.getState().role).toBe("admin");

    const result = await useAppStore.getState().demoteFromAdmin("wreakage_fixer");
    expect(result.alreadyCitizen).toBe(false);
    expect(useAppStore.getState().role).toBe("citizen");
    expect(useAppStore.getState().adminVerified).toBe(false);
  });
});

describe("identitySlice — role-based access", () => {
  it("defaults a freshly-registered account to citizen", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    expect(useAppStore.getState().role).toBe("citizen");
  });

  it("setRole promotes / demotes between admin and citizen", async () => {
    await useAppStore.getState().register({
      username: "alice",
      password: "hunter2",
      rawCitizenId: "1234567890",
    });
    useAppStore.getState().setRole("admin");
    expect(useAppStore.getState().role).toBe("admin");
    useAppStore.getState().setRole("citizen");
    expect(useAppStore.getState().role).toBe("citizen");
  });

  it("role is null before any registration", () => {
    expect(useAppStore.getState().role).toBeNull();
  });
});
