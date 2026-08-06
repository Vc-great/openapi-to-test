import { defineConfig, pluginTSType } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "remote",
    input: {
      path: process.env.ACCEPTANCE_REMOTE_URL ?? "http://127.0.0.1:9/openapi.yaml",
      remote: {
        allowPrivateNetwork: true,
        allowedHosts: ["127.0.0.1"],
        headers: {
          Authorization: process.env.ACCEPTANCE_REMOTE_SECRET ?? "missing",
          "X-Consumer-Secret": process.env.ACCEPTANCE_REMOTE_SECRET ?? "missing",
        },
      },
    },
    output: { base: "workspace", dir: "scenarios/security/remote-output", clean: true },
  }],
  plugins: [pluginTSType()],
});
