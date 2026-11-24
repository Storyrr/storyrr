import { Avatar, AvatarFallback } from "#/components/ui/avatar";

/** The user's initials (no picture upload yet). */
export function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <Avatar className={className}>
      <AvatarFallback>{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}
