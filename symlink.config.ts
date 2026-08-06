import { defineConfig, pluginTSType } from "openapi-to";
export default defineConfig({
  servers: [{
    name: "symlink",
    input: { path: "fixtures/multi-target/user.yaml" },
    output: { base: "workspace", dir: ".tmp/symlink-output/generated", clean: true },
  }],
  plugins: [pluginTSType()],
});
