"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

// Cross-fades route content on navigation. Admin and lister screens have their
// own shell and are left alone.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin") || pathname.startsWith("/lister")) return <>{children}</>;
  return <ViewTransition default="page-fade">{children}</ViewTransition>;
}
