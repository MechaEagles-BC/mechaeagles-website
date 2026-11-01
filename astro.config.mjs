import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({ site: "https://mechaeagles.com", integrations: [react()], devToolbar: { enabled: false }, prefetch: { prefetchAll: true, defaultStrategy: "hover" } });
