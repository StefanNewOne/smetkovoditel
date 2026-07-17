// Vitest stub for Next.js `server-only`. The real package throws when imported outside a React
// Server Component; workflow/service modules guard themselves with it. Integration tests exercise
// those modules directly in Node, so we replace it with a no-op. This changes nothing at runtime
// in the app — Next.js still resolves the real package there.
export {};
