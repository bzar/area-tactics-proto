import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "area-tactics": path.resolve(__dirname, "area-tactics/src/index.ts"),
    },
  },
});
