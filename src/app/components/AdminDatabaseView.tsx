// Admin database view. Gated by:
//   1. adminVerified === true  (TOTP MFA in the current session)
//   2. role === "admin"        (account-level role check)
//
// Renders the user registry table with ONLY the four anonymized
// columns: Username, Login Nullifier (hex), Identity Nullifier (hex),
// Role. The projection from UiUser → AnonymizedRegistryRow is the
// single point of truth for what's allowed to leave the data layer;
// PII fields (email, xp, streak, avatar, location) are dropped at
// the projection boundary and are therefore unreachable from this
// surface.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Shield, ShieldOff, ShieldCheck, Copy } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useAppStore } from "../store/appStore";
import { AdminTotpVerify } from "./AdminTotpVerify";
import {
  buildAnonymizedRegistry,
  type AnonymizedRegistryRow,
} from "@/lib/adminRegistry";

export function AdminDatabaseView() {
  const navigate = useNavigate();

  // Selectors — kept narrow so the component only re-renders when a
  // relevant slice changes.
  const users = useAppStore((s) => s.users);
  const sessionUsername = useAppStore((s) => s.username);
  const sessionIdentityNullifier = useAppStore((s) => s.identityNullifier);
  const sessionPreviousIdentityNullifier = useAppStore(
    (s) => s.previousIdentityNullifier,
  );
  const sessionLoginNullifier = useAppStore((s) => s.loginNullifier);
  const sessionRole = useAppStore((s) => s.role);
  const sessionCurrentUserId = useAppStore((s) => s.currentUserId);
  const adminVerified = useAppStore((s) => s.adminVerified);
  const promoteToAdmin = useAppStore((s) => s.promoteToAdmin);
  const demoteFromAdmin = useAppStore((s) => s.demoteFromAdmin);

  // Per-row "in flight" trackers so the same button doesn't fire
  // twice while the mock API call is awaiting.
  const [promotingUsername, setPromotingUsername] = useState<string | null>(null);
  const [demotingUsername, setDemotingUsername] = useState<string | null>(null);

  // Which username represents "this operator" for the highlight + the
  // (you) indicator. The seeded "demo_user" row at id=7 is the
  // placeholder when no session has been registered yet; once
  // registration sets a session username, that one wins (e.g.
  // "wreakage_fixer"). The literal "you" was removed from the data
  // layer — the (you) badge here is a display-layer cue layered on
  // top of the raw username column.
  const effectiveCurrentUsername = sessionUsername ?? "demo_user";

  // When promoteToAdmin returns a freshly-provisioned TOTP enrolment
  // (happens when the operator promotes themselves and didn't have a
  // secret yet), we surface the secret + URI in a modal so the
  // operator can scan it into their authenticator app immediately.
  // Until that modal is dismissed, the secret is visible — that is
  // intentional and is the same trust model as TOTP enrolment
  // anywhere else in the app.
  const [totpEnrolmentModal, setTotpEnrolmentModal] = useState<
    { secret: string; uri: string } | null
  >(null);

  // Build the anonymized rows ONCE per relevant change. The
  // useMemo's dep array is exactly the projection's inputs so the
  // memoisation is correct: any change anywhere else in the store
  // is ignored.
  const rows: AnonymizedRegistryRow[] = useMemo(
    () =>
      buildAnonymizedRegistry(users, {
        username: sessionUsername,
        identityNullifier: sessionIdentityNullifier,
        previousIdentityNullifier: sessionPreviousIdentityNullifier,
        loginNullifier: sessionLoginNullifier,
        role: sessionRole,
        currentUserId: sessionCurrentUserId,
      }),
    [
      users,
      sessionUsername,
      sessionIdentityNullifier,
      sessionPreviousIdentityNullifier,
      sessionLoginNullifier,
      sessionRole,
      sessionCurrentUserId,
    ],
  );

  // Gate 1: TOTP MFA. The TOTP component handles its own enrolment
  // and verification flows; on success it flips `adminVerified` in
  // the store and this component re-renders past the gate.
  if (!adminVerified) {
    return (
      <AdminTotpVerify
        account="admin"
        onVerified={() => { /* state update handled by store */ }}
        onCancel={() => navigate("/dashboard")}
      />
    );
  }

  // Gate 2: account-level role check. Distinct from TOTP — a citizen
  // with their device enrolled in TOTP still cannot see the registry.
  if (sessionRole !== "admin") {
    return (
      <div className="max-w-sm mx-auto mt-12 p-6 border rounded-lg space-y-3">
        <div className="flex items-center gap-2 text-red-600">
          <ShieldOff className="w-5 h-5" />
          <h2 className="text-lg">Access Denied</h2>
        </div>
        <p className="text-sm text-gray-600">
          This view is restricted to accounts with the <code>admin</code> role.
          {sessionUsername
            ? ` Your account "${sessionUsername}" is currently registered as a citizen.`
            : " You are not currently logged in."}
        </p>
        <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Past both gates — render the anonymized registry.
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-purple-700 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/admin")} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Shield className="w-5 h-5" />
        <h1 className="text-lg">User Registry (anonymized)</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 text-sm text-purple-900">
          Showing only the anonymized columns. Email, XP, streak, avatar, and
          location are dropped at the projection boundary in
          <code className="mx-1">lib/adminRegistry.ts</code> and are not
          reachable from this surface.
        </div>

        {/*
          Responsive wrapper: the table needs ~620px of column width
          (username + 2× truncated-hex + role + action button) which
          overflows the typical 360px-ish mobile viewport. `overflow-x-auto`
          gives the user a horizontal scroll on phone widths while letting
          the table render its full layout on desktop. `min-w-full` keeps
          the columns aligned to the wrapper at desktop sizes.
        */}
        <div className="border rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Username</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Login Nullifier (hex)</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Identity Nullifier (hex)</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Prev Identity (hex)</th>
                <th className="text-left px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Role</th>
                <th className="text-right px-3 py-2 font-medium text-gray-700 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isCurrentUser = row.username === effectiveCurrentUsername;
                const isAdminRow = row.role === "admin";
                const isPromoting = promotingUsername === row.username;
                const isDemoting = demotingUsername === row.username;
                return (
                  <tr
                    key={row.username}
                    className={
                      isCurrentUser
                        ? "border-b last:border-0 bg-blue-50 hover:bg-blue-100"
                        : "border-b last:border-0 hover:bg-gray-50"
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {row.id ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.username}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-blue-700 font-medium">(you)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap">
                      {truncateHex(row.loginNullifierHex)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap">
                      {truncateHex(row.identityNullifierHex)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {truncateHex(row.previousIdentityNullifierHex)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={isAdminRow ? "default" : "secondary"}
                        className={isAdminRow ? "bg-purple-600" : ""}
                      >
                        {row.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isAdminRow ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-300 hover:bg-red-50"
                          disabled={isDemoting}
                          onClick={async () => {
                            setDemotingUsername(row.username);
                            try {
                              const result = await demoteFromAdmin(row.username);
                              if (result.alreadyCitizen) {
                                toast.message(`${row.username} is already a citizen.`);
                              } else {
                                toast.success(`Demoted ${row.username} to citizen.`);
                              }
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Demotion failed",
                              );
                            } finally {
                              setDemotingUsername(null);
                            }
                          }}
                        >
                          <ShieldOff className="w-3.5 h-3.5 mr-1" />
                          {isDemoting ? "Demoting…" : "Demote to Citizen"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-purple-700 border-purple-300 hover:bg-purple-50"
                          disabled={isPromoting}
                          onClick={async () => {
                            setPromotingUsername(row.username);
                            try {
                              const result = await promoteToAdmin(row.username);
                              if (result.alreadyAdmin) {
                                toast.message(`${row.username} is already an admin.`);
                              } else {
                                toast.success(`Promoted ${row.username} to admin.`);
                                if (result.totpEnrolment) {
                                  setTotpEnrolmentModal(result.totpEnrolment);
                                }
                              }
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Promotion failed",
                              );
                            } finally {
                              setPromotingUsername(null);
                            }
                          }}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                          {isPromoting ? "Promoting…" : "Promote to Admin"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500">
          Rows: {rows.length}. The session user's nullifiers (if registered)
          replace the synthetic seed values in their row; other rows show
          synthetic placeholders. No raw passwords, citizen IDs, or emails
          ever touch this view.
        </p>
      </div>

      {/*
        TOTP enrolment modal — shown when promoting yourself triggers a
        fresh secret generation. The operator scans the URI (or types
        the base32 secret) into their authenticator app, then dismisses
        the modal and proceeds to the AdminTotpVerify gate as normal.
      */}
      <Dialog
        open={totpEnrolmentModal !== null}
        onOpenChange={(next) => { if (!next) setTotpEnrolmentModal(null); }}
      >
        <DialogContent className="max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Admin TOTP provisioned</DialogTitle>
          </DialogHeader>
          {totpEnrolmentModal && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-gray-600">
                A TOTP secret has been generated for this admin account. Scan
                the URI or paste the base32 secret into your authenticator
                app, then return to the admin dashboard and verify with a
                6-digit code.
              </p>
              <div>
                <Label className="text-sm">otpauth:// URI</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={totpEnrolmentModal.uri} readOnly className="text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(totpEnrolmentModal.uri);
                        toast.success("URI copied");
                      } catch { toast.error("Clipboard unavailable"); }
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm">Base32 secret</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={totpEnrolmentModal.secret} readOnly className="font-mono" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(totpEnrolmentModal.secret);
                        toast.success("Secret copied");
                      } catch { toast.error("Clipboard unavailable"); }
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={() => setTotpEnrolmentModal(null)}
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Hex truncation for table density. Full 64-char strings would
// overflow on phone widths; the prefix is enough to visually
// distinguish rows. Reviewers can pull the full string from
// devtools (`cu.state().users[i].loginNullifierHex`) for spot-checks.
//
// Defensive against undefined/null inputs: the UiUser type marks
// these hex fields as required strings, but persisted users[]
// records from a pre-v7 schema can rehydrate without them — the
// v4→v6 migrations only patch the identity slice and leave the
// users[] array as-stored. Returning a placeholder instead of
// crashing keeps the rest of the table readable in that case.
function truncateHex(hex: string | null | undefined): string {
  if (typeof hex !== "string" || hex.length === 0) return "—";
  if (hex.length <= 18) return hex;
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}
