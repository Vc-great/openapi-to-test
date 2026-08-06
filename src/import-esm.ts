import {
  defineConfig,
  pluginMSW,
  pluginSWR,
  pluginTSRequest,
  pluginTSType,
  pluginVueQuery,
  pluginZod,
  type OpenapiToConfig,
} from "openapi-to";

const config: OpenapiToConfig = defineConfig({
  servers: [],
  plugins: [
    pluginTSType(),
    pluginTSRequest(),
    pluginZod(),
    pluginSWR(),
    pluginVueQuery(),
    pluginMSW(),
  ],
});

void config;
