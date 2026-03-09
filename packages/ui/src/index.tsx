/**
 * @twin/ui — shared UI components. Minimal for V1.
 */

import type React from "react";

export function PlaceholderCard({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "4px" }}>
      <h3 style={{ margin: "0 0 0.5rem 0" }}>{title}</h3>
      {children}
    </div>
  );
}
