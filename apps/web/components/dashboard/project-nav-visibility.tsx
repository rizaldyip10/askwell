"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// The shell shows a project's nav from the path alone. When that project turns out not to exist
// (or isn't the owner's), the project 404 page renders <HideProjectNav /> to hide it.

type Visibility = { hiddenFor: string | null; hide: (path: string | null) => void };

const ProjectNavVisibility = createContext<Visibility>({ hiddenFor: null, hide: () => {} });

export function ProjectNavVisibilityProvider({ children }: { children: ReactNode }) {
  const [hiddenFor, hide] = useState<string | null>(null);
  return <ProjectNavVisibility value={{ hiddenFor, hide }}>{children}</ProjectNavVisibility>;
}

/** True when the project nav should show on `pathname`. */
export function useProjectNavVisible(pathname: string): boolean {
  return useContext(ProjectNavVisibility).hiddenFor !== pathname;
}

/** Hides the project nav while mounted, for the current path only. */
export function HideProjectNav() {
  const { hide } = useContext(ProjectNavVisibility);
  const pathname = usePathname();
  useEffect(() => {
    hide(pathname);
    return () => hide(null);
  }, [hide, pathname]);
  return null;
}
