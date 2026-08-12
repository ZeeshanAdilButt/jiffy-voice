import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // The package and the service subpath build together so the core they
    // share ends up in one chunk rather than duplicated into both.
    entry: ['src/index.ts', 'src/server.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    splitting: true,
    clean: true,
  },
  {
    // The standalone server: only ever run directly with `node dist/main.js`,
    // never imported. CJS output would break its import.meta entry-point
    // check for no benefit, so this is ESM only. clean is off so it does not
    // wipe the output the entry above just produced.
    entry: ['src/main.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
  },
])
