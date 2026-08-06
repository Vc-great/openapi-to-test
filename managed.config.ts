import { defineConfig, pluginTSType } from "openapi-to";
export default defineConfig({
  servers: [{
    name: "managed",
    input: { path: "fixtures/multi-target/user.yaml" },
    output: { dir: "acceptance-managed", clean: true },
  }],
  plugins: [pluginTSType()],
});
