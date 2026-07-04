const sveltePreprocess = require("svelte-preprocess");
const esbuildSvelte = require("esbuild-svelte");
const esbuild = require("esbuild");
const builtins = require("builtin-modules");

const prod = process.argv[2] === "build";

const opts = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: "injected", dev: !prod },
      preprocess: sveltePreprocess(),
    }),
  ],
};

if (prod) {
  esbuild.build(opts).catch(() => process.exit(1));
} else {
  esbuild.context(opts).then(async (ctx) => {
    await ctx.watch();
  });
}
