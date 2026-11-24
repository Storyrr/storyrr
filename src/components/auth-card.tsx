import type { ReactNode } from "react";

import { Logo } from "#/components/layout/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";

/** Centered card used by the sign-in and setup pages. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-4">
      <Logo className="text-4xl" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
