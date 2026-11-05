// Public, browser-safe values only. Row-level security in the database is what protects data;
// the publishable key alone can't read anyone's applications.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};

export const isConfigured = () => Boolean(env.supabaseUrl && env.supabaseKey);
