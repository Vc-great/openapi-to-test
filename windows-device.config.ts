import { defineConfig, pluginTSType } from "openapi-to";
export default defineConfig({
  servers: [{
    name: "windows-device",
    input: { path: "fixtures/multi-target/user.yaml" },
    output: { base: "workspace", dir: "CON", clean: true },
  }],
  plugins: [pluginTSType()],
});
