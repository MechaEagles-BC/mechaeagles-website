/** The list of pages for search engines. New teams join it by themselves. */
import type { APIContext } from "astro";
import { ENGINEERING } from "../data/org";

const PAGES = ["/", "/teams/", ...ENGINEERING.map((t) => `/teams/${t.id}/`), "/people/", "/about/", "/sponsors/", "/legacy/", "/join/"];

export function GET({ site }: APIContext) {
  const urls = PAGES.map((p) => `<url><loc>${new URL(p, site)}</loc></url>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "Content-Type": "application/xml" } });
}
