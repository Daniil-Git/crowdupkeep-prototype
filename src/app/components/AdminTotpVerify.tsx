// Admin authorisation gate. Renders one of three states:
//
//   1. No secret enrolled yet on this device → "Enrol" button. Clicking
//      generates a secret via the store and shows the otpauth:// URI
//      plus the raw base32 secret for the operator to load into an
//      authenticator app (Google Authenticator, Authy, 1Password,
//      Bitwarden, etc.). All three are equivalent enrolment payloads.
//   2. Secret enrolled → 6-digit code field + Verify button.
//   3. Locked after MAX_ATTEMPTS bad codes, refresh-to-retry.
//
// Nothing in this component holds the typed code anywhere beyond local
// React state; the input is cleared after every attempt so even a
// rejected code doesn't sit in memory waiting for a keylogger to grep
// the DOM.

import { useState } from "react";
import { Shield, AlertCircle, Copy, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useAppStore } from "../store/appStore";

export interface AdminTotpVerifyProps {
  account?: string;            // label shown in the authenticator app
  onVerified: () => void;
  onCancel?: () => void;
}

const MAX_ATTEMPTS = 5;

export function AdminTotpVerify({
  account = "admin",
  onVerified,
  onCancel,
}: AdminTotpVerifyProps) {
  const enrollTotp = useAppStore((s) => s.enrollTotp);
  const verifyAdminTotp = useAppStore((s) => s.verifyAdminTotp);
  const totpSecret = useAppStore((s) => s.totpSecret);

  const [enrolment, setEnrolment] = useState<{ secret: string; uri: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const locked = attempts >= MAX_ATTEMPTS;

  const handleEnrol = async () => {
    setEnrolling(true);
    try {
      const next = await enrollTotp(account);
      setEnrolment(next);
    } finally {
      setEnrolling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || verifying) return;
    setVerifying(true);
    setError(null);
    const trimmed = code.replace(/\s+/g, "");
    const ok = await verifyAdminTotp(trimmed);
    setVerifying(false);
    setCode(""); // wipe the input regardless of outcome
    if (ok) {
      onVerified();
    } else {
      setAttempts((n) => n + 1);
      setError("Code rejected. Check your authenticator's clock or try the next 30-second window.");
    }
  };

  const copy = async (text: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${kind} copied to clipboard`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  // --- ENROL STATE -------------------------------------------------
  if (!totpSecret) {
    return (
      <div className="max-w-sm mx-auto mt-12 p-6 border rounded-lg space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#1976D2]" />
          <h2 className="text-lg">Admin MFA enrolment</h2>
        </div>
        <div className="flex items-start gap-2 text-yellow-700 bg-yellow-50 p-3 rounded">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">
            No TOTP secret is enrolled on this device. Generate one, scan the
            URI with an authenticator app, then come back and enter a code.
          </p>
        </div>
        <Button
          onClick={handleEnrol}
          disabled={enrolling}
          className="w-full bg-[#1976D2] hover:bg-[#1565C0]"
        >
          {enrolling ? "Generating…" : "Enrol this device"}
        </Button>
        {enrolment && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm">otpauth:// URI</Label>
              <div className="flex gap-2 mt-1">
                <Input value={enrolment.uri} readOnly className="text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(enrolment.uri, "URI")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-sm">Base32 secret (manual entry)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={enrolment.secret} readOnly className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(enrolment.secret, "Secret")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Paste the URI into your authenticator's "scan/import" flow, or type
              the base32 secret in manually. Then refresh this view.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setEnrolment(null)}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> I've enrolled. Show verify
            </Button>
          </div>
        )}
        {onCancel && (
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>
    );
  }

  // --- VERIFY STATE ------------------------------------------------
  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-sm mx-auto mt-12 p-6 border rounded-lg space-y-4"
    >
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-[#1976D2]" />
        <h2 className="text-lg">Admin verification</h2>
      </div>
      <p className="text-sm text-gray-600">
        Enter the 6-digit code from your authenticator app.
      </p>
      <div>
        <Label htmlFor="totp-code">Authenticator code</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123 456"
          disabled={locked || verifying}
          autoFocus
          className="font-mono text-lg tracking-widest"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {locked && (
        <p className="text-sm text-red-600">
          Too many failed attempts. Refresh the page to retry.
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1 bg-[#1976D2] hover:bg-[#1565C0]"
          disabled={locked || verifying || code.replace(/\s+/g, "").length !== 6}
        >
          {verifying ? "Verifying…" : "Verify"}
        </Button>
      </div>
    </form>
  );
}
