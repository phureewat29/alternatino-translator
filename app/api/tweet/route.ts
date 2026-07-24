import { unstable_cache } from "next/cache";
import { fetchTweet } from "react-tweet/api";
import type { Tweet } from "react-tweet/api";
import { TWEET_LOAD_ERROR } from "@/lib/tweet";

const MAX_ANCESTORS = 12;

// Revalidates daily; a tweet's content never changes once posted, and this
// also makes revisiting the same id during an ancestor walk free.
const getCachedTweet = unstable_cache((id: string) => fetchTweet(id), ["tweet"], {
  revalidate: 86400,
});

function errorResponse(status: number) {
  return Response.json(
    { error: TWEET_LOAD_ERROR },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^\d{1,25}$/.test(id)) {
    return errorResponse(400);
  }

  let result;
  try {
    result = await getCachedTweet(id);
  } catch {
    return errorResponse(502);
  }

  if (!result.data) {
    return errorResponse(404);
  }

  const tweets: Tweet[] = [result.data];
  let current = result.data;
  let count = 0;
  while (
    current.in_reply_to_status_id_str &&
    current.in_reply_to_user_id_str === current.user.id_str &&
    count < MAX_ANCESTORS
  ) {
    count++;
    let parent;
    try {
      parent = await getCachedTweet(current.in_reply_to_status_id_str);
    } catch {
      break; // Mid-walk failure: keep the partial chain gathered so far.
    }
    if (!parent.data) break;
    tweets.push(parent.data);
    current = parent.data;
  }

  tweets.reverse(); // Oldest first.

  return Response.json({ tweets }, { headers: { "Cache-Control": "no-store" } });
}
