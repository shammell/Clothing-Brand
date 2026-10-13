import * as React from "react";

// Next's bundled React canary ships <ViewTransition>; plain React (used by the
// unit tests) does not, so fall back to rendering children untouched there.
type VT = typeof React.ViewTransition;
const Passthrough = (({ children }: { children?: React.ReactNode }) => <>{children}</>) as unknown as VT;

export const ViewTransition: VT = (React as { ViewTransition?: VT }).ViewTransition ?? Passthrough;
