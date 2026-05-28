import { describe, expect, it } from "vitest";
import { resolveDisplayName } from "@/app/components/Username";

// resolveDisplayName is the pure substitution logic behind the
// <Username /> React component. Testing it directly (no React mount,
// no jsdom, no Zustand stub) follows the same pattern the codebase
// uses for proximityRewardLabel, the component is a thin shell
// over the helper, so pinning the helper's branches pins the
// component's render output as well.

describe("Username, resolveDisplayName (display-layer alias)", () => {
  describe("non-substituting paths", () => {
    it("returns the raw author string when the session is null", () => {
      expect(resolveDisplayName("maria_k", null)).toBe("maria_k");
    });

    it("returns the raw author string when the session is undefined", () => {
      expect(resolveDisplayName("maria_k", undefined)).toBe("maria_k");
    });

    it("returns the raw author string when the session is the empty string", () => {
      // Belt-and-braces, an empty string is falsy but typeof === "string",
      // so the length-zero guard is the load-bearing check here.
      expect(resolveDisplayName("maria_k", "")).toBe("maria_k");
    });

    it("returns the raw author string when the session does not match", () => {
      expect(resolveDisplayName("maria_k", "wreakage_fixer")).toBe("maria_k");
    });

    it("is case-sensitive, capitalisation difference does NOT count as a match", () => {
      // The data layer's usernames are case-sensitive. A registered
      // "wreakage_fixer" should not alias a hypothetical seeded
      // "Wreakage_Fixer", that would be an identity collision the
      // app does not condone.
      expect(resolveDisplayName("Wreakage_Fixer", "wreakage_fixer")).toBe(
        "Wreakage_Fixer",
      );
    });

    it("returns the raw author string for the empty-author edge case", () => {
      // Defensive, author should never be empty in practice (the
      // type is `string` and the data layer doesn't permit it), but
      // an empty input shouldn't surprise downstream rendering.
      expect(resolveDisplayName("", "wreakage_fixer")).toBe("");
    });
  });

  describe("substituting paths (current-user match)", () => {
    it("returns 'you' for the lowercase variant (default)", () => {
      expect(resolveDisplayName("wreakage_fixer", "wreakage_fixer")).toBe("you");
      // explicit lowercase produces the same output as the default
      expect(
        resolveDisplayName("wreakage_fixer", "wreakage_fixer", "lowercase"),
      ).toBe("you");
    });

    it("returns 'You' for the titlecase variant", () => {
      expect(
        resolveDisplayName("wreakage_fixer", "wreakage_fixer", "titlecase"),
      ).toBe("You");
    });

    it("returns 'YOU' for the uppercase variant", () => {
      expect(
        resolveDisplayName("wreakage_fixer", "wreakage_fixer", "uppercase"),
      ).toBe("YOU");
    });

    it("substitutes even when the registered username looks like the placeholder", () => {
      // If for some reason the session were "demo_user" (the seeded
      // placeholder name), the substitution still fires by string
      // equality, but in normal flow that situation does not occur
      // because the demo_user row is only visible to never-registered
      // installs, where the session is null. Pinned here for the
      // explicit semantics.
      expect(resolveDisplayName("demo_user", "demo_user")).toBe("you");
    });

    it("never re-introduces the literal 'you' from a stored session", () => {
      // The v8 migration scrubs the literal "you" out of the data
      // layer; the only way a substitution returns the alias is via
      // the session-equality check. This test pins down that even if
      // an author string happens to contain "you" as a substring, no
      // implicit substitution fires.
      expect(resolveDisplayName("you_can_do_it", "wreakage_fixer")).toBe(
        "you_can_do_it",
      );
      expect(resolveDisplayName("youthful_admin", "wreakage_fixer")).toBe(
        "youthful_admin",
      );
    });
  });
});
