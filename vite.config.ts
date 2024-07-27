import { resolve } from 'path';
import { defineConfig, loadEnv, LibraryFormats } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const CJS = env.BUILD_TARGET?.toLocaleLowerCase()?.match('cjs');
  const formats: LibraryFormats[] = CJS ? ['cjs'] : ['es'];

  return {
    build: {
      outDir: CJS ? 'dist/cjs' : 'dist/es',
      sourcemap: true,
      lib: {
        entry: resolve(__dirname, 'src'),
        fileName: `[name]`,
        name: 'suprsend',
        formats,
      },
      rollupOptions: {
        output: {
          exports: 'named', // needed to allow named and default imports in same file
        },
      },
    },
    plugins: [
      dts({
        outDir: 'dist/types',
      }),
    ],
  };
});
