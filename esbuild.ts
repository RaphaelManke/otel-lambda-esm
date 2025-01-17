import { build } from "esbuild";

build({
    entryPoints: ['instrumentation/instrumentation.mts'],
    bundle: true,
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
    external: [
        "import-in-the-middle",
    ], // Example of excluding dependencies
    banner: {
        js: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
    }


}).catch(() => process.exit(1))
