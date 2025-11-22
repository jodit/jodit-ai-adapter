import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/run.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	minify: false,
	target: 'node18',
	outDir: 'dist',
	external: ['express', 'ai', 'winston', 'dotenv', '@hapi/boom', 'zod']
});
