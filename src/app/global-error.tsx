"use client";

/**
 * The last resort: an error thrown by the root layout itself, which replaces the
 * whole document — so this has to bring its own `<html>` and `<body>`, and
 * cannot rely on the fonts, theme attribute or CSS variables the layout would
 * normally have set up. Hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#07070c",
          color: "#e7e7ee",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Trekker could not start</h1>
          <p style={{ marginTop: "0.5rem", color: "#9a9aab", fontSize: "0.875rem" }}>
            Something failed before the page could be built.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              borderRadius: "0.75rem",
              border: 0,
              background: "#7c3aed",
              color: "white",
              padding: "0.65rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", color: "#55555f", fontSize: "0.7rem" }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
