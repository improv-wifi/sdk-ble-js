import { nodeResolve } from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

const config = {
  input: "dist/launch-button.js",
  output: {
    dir: "dist/web",
    format: "module",
  },
  preserveEntrySignatures: false,
  plugins: [nodeResolve()],
};

if (process.env.NODE_ENV === "production") {
  config.plugins.push(
    terser({
      ecma: 2019,
      toplevel: true,
      output: {
        comments: false,
      },
    })
  );
}

export default config;
