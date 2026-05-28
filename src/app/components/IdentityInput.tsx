// Unified citizen-ID input. Two UX surfaces, ONE cryptographic path.
//
// Modes:
//   - "text"  , just the 10-digit text field.
//   - "image" , file preview + a MANDATORY text-confirmation field
//                below it. The image's bytes are never read, hashed,
//                or stored beyond a transient blob URL used only to
//                render the preview. The text field underneath is
//                what canonicalises and feeds the parent.
//
// Either mode produces the same `canonical: string` (10 digits) when
// valid, and only that string ever leaves this component. The parent
// hands it to the store's `register`/`login` action, which derives
// the nullifiers via PBKDF2 and discards the canonical input on the
// next tick.
//
// The image preview URL is released via `URL.revokeObjectURL` on
// replace and on unmount so blob references don't pile up in memory.

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileImage, Type } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { canonicalize, isValidCypriotId } from "@/lib/cypriotId";

export interface IdentityInputProps {
  onCanonicalReady: (canonical: string) => void;
  onCanonicalCleared?: () => void;
  disabled?: boolean;
  label?: string;
}

type Mode = "text" | "image";

export function IdentityInput({
  onCanonicalReady,
  onCanonicalCleared,
  disabled = false,
  label = "Cypriot National ID",
}: IdentityInputProps) {
  const [mode, setMode] = useState<Mode>("text");
  const [typed, setTyped] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousPreviewRef = useRef<string | null>(null);

  const canonical = useMemo(() => canonicalize(typed), [typed]);
  const isValid = isValidCypriotId(canonical);

  // Notify the parent exactly once per (in)valid transition so it
  // doesn't get a flood of identical onChange calls per keystroke.
  const lastNotified = useRef<string | null>(null);
  useEffect(() => {
    if (disabled) return;
    if (isValid) {
      if (lastNotified.current !== canonical) {
        lastNotified.current = canonical;
        onCanonicalReady(canonical);
      }
    } else if (lastNotified.current !== null) {
      lastNotified.current = null;
      onCanonicalCleared?.();
    }
  }, [canonical, isValid, disabled, onCanonicalReady, onCanonicalCleared]);

  // Release the blob URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (previousPreviewRef.current) {
        URL.revokeObjectURL(previousPreviewRef.current);
        previousPreviewRef.current = null;
      }
    };
  }, []);

  const handleFile = (file: File | null) => {
    if (previousPreviewRef.current) {
      URL.revokeObjectURL(previousPreviewRef.current);
      previousPreviewRef.current = null;
    }
    if (!file) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    previousPreviewRef.current = url;
    setImagePreview(url);
    // No `file.arrayBuffer()`, no `FileReader`, no fetch. The bytes
    // are walled off behind the blob URL for visual confirmation only.
  };

  const showInvalidHint = typed.length > 0 && !isValid;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Tabs value={mode} onValueChange={(m) => setMode(m as Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="text" className="flex-1">
            <Type className="w-4 h-4 mr-2" /> Type ID
          </TabsTrigger>
          <TabsTrigger value="image" className="flex-1">
            <FileImage className="w-4 h-4 mr-2" /> Photo + Type
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="space-y-2 mt-3">
          <Input
            inputMode="numeric"
            maxLength={20}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="10-digit Cypriot national ID"
            disabled={disabled}
          />
        </TabsContent>

        <TabsContent value="image" className="space-y-3 mt-3">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="ID preview, for your eyes only; never hashed or transmitted"
                className="w-full max-h-48 object-contain rounded"
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-400">
                <Camera className="w-12 h-12" />
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Camera className="w-4 h-4 mr-2" />
              {imagePreview ? "Replace photo" : "Take or upload photo"}
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="id-confirm" className="text-sm">
              Type the 10-digit ID shown on the photo
            </Label>
            <Input
              id="id-confirm"
              inputMode="numeric"
              maxLength={20}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="e.g. 1234567890"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500">
              The photo is shown for your reference only, never sent to the server,
              never used for the security hash.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {showInvalidHint && (
        <p className="text-xs text-red-500">
          Need exactly 10 digits (spaces and dashes are OK and will be stripped).
        </p>
      )}
    </div>
  );
}
