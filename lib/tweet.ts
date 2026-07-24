import type { Tweet, TweetBase } from "react-tweet/api";

export const TWEET_LOAD_ERROR =
  "Couldn't read that post. It may be private or deleted.";

const TWEET_URL_RE =
  /^https?:\/\/(?:www\.|m\.|mobile\.)?(?:x|twitter)\.com\/(?:\w{1,15}|i\/web|i)\/status(?:es)?\/(\d{1,25})(?:[/?#]\S*)?$/i;

// Matches only when the ENTIRE trimmed input is a status URL — mixed
// text+URL input falls through to the plain-text path.
export function parseTweetUrl(input: string): string | null {
  const match = input.trim().match(TWEET_URL_RE);
  return match ? match[1] : null;
}

function unescapeTweetHtml(s: string): string {
  return s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

export function escapeTweetHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Mirrors react-tweet's internal `fixRange`: text after the leading media
// entity (if any) is never shown, so it must not be sent to the LLM either.
export function getVisibleTweetText(t: TweetBase): string {
  const [start, range1] = t.display_text_range;
  const mediaStart = t.entities?.media?.[0]?.indices[0];
  const end = Math.min(range1, mediaStart ?? Infinity);
  let visible = Array.from(t.text).slice(start, end).join("");
  // Links live in the text as raw t.co URLs; hand the model the readable
  // form X displays instead, so no bare t.co leaks into the translation.
  for (const u of t.entities?.urls ?? []) {
    visible = visible.replace(u.url, u.display_url);
  }
  return unescapeTweetHtml(visible);
}

// react-tweet renders text via dangerouslySetInnerHTML from codepoint-indexed
// entities, so the translated text must carry a matching (empty) entity set
// and a display_text_range computed AFTER escaping.
function applyTranslation(copy: TweetBase, translated: string): void {
  const esc = escapeTweetHtml(translated);
  copy.text = esc;
  copy.display_text_range = [0, Array.from(esc).length];
  copy.entities = { hashtags: [], urls: [], user_mentions: [], symbols: [] };
  delete copy.note_tweet;
}

export function buildTranslatedTweet(
  t: Tweet,
  translated: string,
  quotedTranslated?: string
): Tweet {
  // enrichTweet mutates display_text_range in place — never share objects
  // between the Original and Translation tabs.
  const copy = structuredClone(t);
  applyTranslation(copy, translated);
  if (copy.quoted_tweet && quotedTranslated !== undefined) {
    applyTranslation(copy.quoted_tweet, quotedTranslated);
  }
  return copy;
}

// Kills "Replying to @self" rows in a self-thread; apply to every tweet
// except the oldest.
export function stripSelfReplyMarkers(t: Tweet): Tweet {
  const copy = { ...t };
  delete copy.in_reply_to_screen_name;
  delete copy.in_reply_to_status_id_str;
  delete copy.in_reply_to_user_id_str;
  return copy;
}
