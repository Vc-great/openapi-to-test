import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "prompt-injection",
    input: { path: "fixtures/acceptance/prompt-injection.yaml" },
    output: { base: "workspace", dir: "scenarios/security/prompt-injection-output", clean: true },
  }],
  plugins: [pluginTSType()],
});
