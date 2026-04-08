import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['assets/web/index.js'],
  outfile: 'assets/web/bundle.js',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  // No minify or sourcemap — matches the current plain-JS setup.
  // Developers read bundle.js directly during debugging.
  minify: false,
  sourcemap: false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await esbuild.build(options);
}
