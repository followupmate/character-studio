// Env access with a readable failure. `process.env.X!` crashes only at first use
// with a cryptic message; requireEnv names the missing variable and where to set it.

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local (dev) or Vercel → Settings → Environment Variables. See .env.local.example.`
    );
  }
  return v;
}
