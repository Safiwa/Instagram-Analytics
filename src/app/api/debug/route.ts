import { inspectScraper } from "../../../core/data/public";

export const maxDuration = 60;

export async function GET(request: Request) {
  const handle = new URL(request.url).searchParams.get("handle") ?? "natgeo";
  return Response.json(await inspectScraper(handle));
}
