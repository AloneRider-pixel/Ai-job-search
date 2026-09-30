import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const config = defineConfig([...nextVitals]);

export default config;
