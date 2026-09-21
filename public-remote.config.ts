import { defineConfig, pluginTSRequest, pluginTSType, pluginZod } from "openapi-to";

export default defineConfig({
  servers: [{
    name: "public-remote",
    input: { path: "https://petstore.swagger.io/v2/swagger.json" },
    output: { base: "workspace", dir: "scenarios/security/public-remote-output", clean: true },
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
