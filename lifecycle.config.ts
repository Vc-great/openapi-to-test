import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "lifecycle",
    input: { path: process.env.LIFECYCLE_INPUT ?? "fixtures/regression/lifecycle-v1.yaml" },
    output: {
      base: "workspace",
      dir: process.env.LIFECYCLE_OUTPUT_DIR ?? "scenarios/generators/lifecycle-output",
      clean: true,
    },
  }],
  plugins: [pluginTSType()],
});
