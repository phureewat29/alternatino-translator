"use client";

import { EmbeddedTweet } from "react-tweet";
import type { Tweet } from "react-tweet/api";
import {
  buildTranslatedTweet,
  getVisibleTweetText,
  stripSelfReplyMarkers,
} from "@/lib/tweet";

type TweetThreadProps = {
  tweets: Tweet[];
  // Keyed by id_str, quoted tweets as `${id_str}:q`. A missing key falls
  // back to rendering that tweet untranslated.
  translations?: Record<string, string | undefined>;
};

export function TweetThread({ tweets, translations }: TweetThreadProps) {
  return (
    <div data-theme="light" className="tweet-embed flex flex-col gap-3 p-6">
      {tweets.map((tweet, index) =>
        translations ? (
          <TranslatedEmbeddedTweet
            key={tweet.id_str}
            tweet={tweet}
            translations={translations}
          />
        ) : (
          <EmbeddedTweet
            key={tweet.id_str}
            tweet={index > 0 ? stripSelfReplyMarkers(tweet) : tweet}
          />
        )
      )}
    </div>
  );
}

function TranslatedEmbeddedTweet({
  tweet,
  translations,
}: {
  tweet: Tweet;
  translations: Record<string, string | undefined>;
}) {
  const visibleText = getVisibleTweetText(tweet);
  if (visibleText.length === 0) {
    // Media-only tweet: nothing to translate, show the original.
    return <EmbeddedTweet tweet={tweet} />;
  }

  const translated = translations[tweet.id_str];
  if (translated === undefined) {
    // No translation available for this tweet: fall back to the original.
    return <EmbeddedTweet tweet={tweet} />;
  }

  const quoted = tweet.quoted_tweet;
  const quotedTranslated =
    quoted && getVisibleTweetText(quoted).length > 0
      ? translations[`${quoted.id_str}:q`]
      : undefined;

  return (
    <EmbeddedTweet
      tweet={buildTranslatedTweet(tweet, translated, quotedTranslated)}
    />
  );
}
