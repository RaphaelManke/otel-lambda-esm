import { build } from "esbuild";

build({
    entryPoints: ['instrumentation/instrumentation.mts'],
    bundle: false,
    minify: false,
    format: 'esm',
    sourcemap: false,
    // outfile: 'build/layer/instrumentation.js',
    outdir: 'build',
    outExtension: {
        '.js': '.mjs',
    },
    target: ['esnext'],
    platform: 'node',
    mainFields: ['module', 'main'],
    external: [], // Example of excluding dependencies
    banner: {
        js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    }


}).catch(() => process.exit(1))
