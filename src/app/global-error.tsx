"use client";
// Last-resort boundary: an error in the root layout.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
          <h1>EggHub is having a problem</h1>
          <p>We could not load the site. Please try again in a moment.</p>
          <button onClick={reset} style={{ padding: "0.6rem 1rem", cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
