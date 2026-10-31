import { profiles } from "../data/org";

export const GET = () => new Response(JSON.stringify(profiles()), { headers: { "Content-Type": "application/json" } });
