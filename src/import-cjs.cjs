const api = require("openapi-to");

if (
  typeof api.defineConfig !== "function" ||
  typeof api.pluginTSType !== "function" ||
  typeof api.pluginTSRequest !== "function" ||
  typeof api.pluginZod !== "function" ||
  typeof api.pluginSWR !== "function" ||
  typeof api.pluginVueQuery !== "function" ||
  typeof api.pluginMSW !== "function"
) {
  throw new Error("CommonJS aggregate exports are incomplete");
}
