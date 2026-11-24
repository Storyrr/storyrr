import { Link } from "@tanstack/react-router";

import { UserAvatar } from "#/components/layout/user-avatar";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import type { SessionUser } from "#/functions/auth.functions";
import { formatDate } from "#/lib/format";
import { m } from "#/paraglide/messages.js";

/** Avatar, name, email and membership, with a link to the other profile page. */
export function ProfileHeader({
  user,
  createdAt,
  link,
}: {
  user: SessionUser;
  createdAt: Date | string;
  link: { to: "/profile" | "/profile/settings"; label: string; icon: React.ReactNode };
}) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <UserAvatar name={user.name} className="size-20 text-2xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-3xl font-semibold text-primary">{user.name}</h1>
          <span className="truncate text-muted-foreground">({user.email})</span>
          <Badge variant={user.isAdmin ? "default" : "secondary"}>
            {user.isAdmin ? m.role_admin() : m.role_user()}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {m.profile_member_since({ date: formatDate(new Date(createdAt), { dateStyle: "long" }) })}
        </p>
      </div>
      <Link to={link.to} className={buttonVariants({ variant: "outline" })}>
        {link.icon}
        {link.label}
      </Link>
    </div>
  );
}
