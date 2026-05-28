// @vitest-environment jsdom
//
// This file exercises devConsoleApi.devAdmin, which calls
// window.location.assign on the way to /admin. The repo-wide default
// vitest environment is "node" (no window), so we opt this file into
// jsdom — which exposes window.location and lets us spy on assign.
// Other devConsole helpers that don't touch the DOM continue to work
// fine in node; only this surface needs the browser-shaped globals.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/app/store/appStore";
import devConsoleApi from "@/app/store/devConsole";

// The dev console is a side-effect module that attaches window.cu and
// logs an info banner at import time. Tests exercise the api object
// directly via the default export — no need to spelunk through window.
const resetStore = () => {
  useAppStore.persist.clearStorage();
  useAppStore.setState(useAppStore.getInitialState(), true);
};

// jsdom makes window.location.assign non-configurable, so vi.spyOn
// can't wrap it directly. Instead we swap window.location out for a
// minimal stand-in around each navigation test, then restore the
// original so the next test sees a clean window. The stand-in only
// needs the surface devAdmin touches (assign + the existence checks
// the guard reads off `typeof window.location`).
const installLocationStub = (assignImpl: (url: string) => void) => {
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      assign: vi.fn(assignImpl),
      // Carry across just enough of the real shape that any defensive
      // typeof checks still pass.
      href: original.href,
      pathname: original.pathname,
    },
  });
  return {
    spy: window.location.assign as ReturnType<typeof vi.fn>,
    restore: () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: original,
      });
    },
  };
};

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cu.devAdmin — one-shot admin bypass + auto-navigate", () => {
  it("flips role to admin and adminVerified to true in a single synchronous call", () => {
    const { restore } = installLocationStub(() => { /* intercept */ });
    try {
      expect(useAppStore.getState().role).toBeNull();
      expect(useAppStore.getState().adminVerified).toBe(false);

      devConsoleApi.devAdmin();

      expect(useAppStore.getState().role).toBe("admin");
      expect(useAppStore.getState().adminVerified).toBe(true);
    } finally {
      restore();
    }
  });

  it("invokes window.location.assign('/admin') so the operator lands directly on the admin surface", () => {
    const { spy, restore } = installLocationStub(() => { /* intercept */ });
    try {
      devConsoleApi.devAdmin();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("/admin");
    } finally {
      restore();
    }
  });

  it("does NOT throw when window.location.assign throws (jsdom navigation guard)", () => {
    // Real jsdom behaviour: window.location.assign throws "Not
    // implemented: navigation". The try/catch inside devAdmin must
    // swallow that so unit tests calling devAdmin don't blow up, AND
    // the state flip must still land — otherwise a navigation failure
    // would leave the operator's session half-promoted.
    const { restore } = installLocationStub(() => {
      throw new Error("simulated jsdom navigation failure");
    });
    try {
      expect(() => devConsoleApi.devAdmin()).not.toThrow();
      expect(useAppStore.getState().role).toBe("admin");
      expect(useAppStore.getState().adminVerified).toBe(true);
    } finally {
      restore();
    }
  });

  it("re-running devAdmin on an already-promoted session is idempotent (state stable, nav fires each time)", () => {
    // Calling devAdmin twice leaves the session in the same post-
    // condition; the SECOND nav call IS issued by design (the operator
    // may want to "re-land" on /admin if they navigated elsewhere).
    // Pin down both halves so a future "don't re-navigate" change is
    // a deliberate edit, not an accidental regression.
    const { spy, restore } = installLocationStub(() => { /* intercept */ });
    try {
      devConsoleApi.devAdmin();
      devConsoleApi.devAdmin();
      expect(useAppStore.getState().role).toBe("admin");
      expect(useAppStore.getState().adminVerified).toBe(true);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });
});
