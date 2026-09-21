import { defineConfig, pluginTSRequest, pluginTSType, pluginZod } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "controlled-remote",
    input: {
      path: process.env.ACCEPTANCE_CONTROLLED_REMOTE_URL ?? "http://127.0.0.1:9/openapi.yaml",
      remote: {
        allowPrivateNetwork: true,
        allowedHosts: ["127.0.0.1"],
      },
    },
    output: { base: "workspace", dir: "scenarios/security/controlled-remote-output", clean: true },
  }],
  plugins: [
    pluginZod(),
    pluginTSType(),
    pluginTSRequest({
      requestImportDeclaration: { moduleSpecifier: "@/utils/request" },
      requestConfigTypeImportDeclaration: {
        namedImports: ["AxiosRequestConfig"],
        moduleSpecifier: "axios",
      },
    }),
  ],
});
