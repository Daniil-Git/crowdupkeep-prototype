import { useAppStore } from "../store/appStore";

export type UsernameVariant = "lowercase" | "titlecase" | "uppercase";

interface UsernameProps {
  // Author string as stored in the data layer. This is always the
  // real username (e.g. "wreakage_fixer", "demo_user", "civic_hero")
  // — never a display alias.
  authorUsername: string;
  // Which casing of the "you" alias to substitute when authorUsername
  // matches the live session username. No effect on other-user
  // rendering.
  variant?: UsernameVariant;
  // Forwarded to the wrapper <span> so call sites can drop typography
  // / layout classes onto the output.
  className?: string;
}

// Pure substitution logic, exported separately so tests don't need
// to mount the component or stub Zustand. The React wrapper below
// is a thin shell over this function.
export function resolveDisplayName(
  authorUsername: string,
  sessionUsername: string | null | undefined,
  variant: UsernameVariant = "lowercase",
): string {
  const isCurrentUser =
    typeof sessionUsername === "string" &&
    sessionUsername.length > 0 &&
    sessionUsername === authorUsername;
  if (!isCurrentUser) return authorUsername;
  if (variant === "uppercase") return "YOU";
  if (variant === "titlecase") return "You";
  return "you";
}

// Display-layer transform for author strings.
//
// THE RULE: this component is the ONLY place in the codebase that
// substitutes "you" / "You" / "YOU" for an author string. The data
// layer (Zustand store, persisted snapshot, seed users[]) never
// carries the literal "you" as a username. Critical views (Profile,
// /admin/database, comment threads, solution lists) must render the
// raw author string directly and must NOT route through this
// component — the affordance it provides (fast self-scanning) is
// orthogonal to the audit property those surfaces need (verifiable
// identity).
export function Username({
  authorUsername,
  variant = "lowercase",
  className,
}: UsernameProps) {
  const sessionUsername = useAppStore((s) => s.username);
  const display = resolveDisplayName(authorUsername, sessionUsername, variant);
  const isCurrentUser = display !== authorUsername;

  return (
    <span className={className} data-current-user={isCurrentUser || undefined}>
      {display}
    </span>
  );
}
