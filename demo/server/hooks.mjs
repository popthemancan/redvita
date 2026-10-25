const fake = new URL("./fakedb.ts", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("npm:@supabase/supabase-js")) return { url: fake, shortCircuit: true };
  return next(specifier, context);
}
