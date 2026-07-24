"use client";

import { useEffect, useRef, useState } from "react";
import type { Tweet } from "react-tweet/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TweetThread } from "@/components/tweet-thread";
import { TWEET_LOAD_ERROR, getVisibleTweetText, parseTweetUrl } from "@/lib/tweet";
import { cn } from "@/lib/utils";

const MAX_INPUT_LENGTH = 4000;
const GENERIC_ERROR = "Something got lost in translation. Try again.";
const TWEET_DEBOUNCE_MS = 400;

const WAITING_LINES = [
  "Reading between the lines…",
  "Extracting attached feelings…",
  "Scanning for suppressed resentment…",
  "Quantifying passive aggression…",
  "Detecting forced pleasantries…",
  "Isolating genuine sentiment…",
  "Cross-referencing what was said with what was meant…",
  "Recovering deleted honesty…",
  "Measuring sincerity levels…",
  "Consulting the sender's true intentions…",
];

type Tab = "original" | "translation";
type Status = "idle" | "translating" | "error";
type TweetData = { status: "loading" | "ready" | "error"; tweets: Tweet[] };
type TranslationTask = { key: string; text: string };

async function fetchTweetThread(
  id: string,
  signal: AbortSignal
): Promise<{ ok: true; tweets: Tweet[] } | { ok: false }> {
  try {
    const res = await fetch(`/api/tweet?id=${id}`, { signal });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data?.tweets) || data.tweets.length === 0) {
      return { ok: false };
    }
    return { ok: true, tweets: data.tweets };
  } catch {
    return { ok: false };
  }
}

// One task per translatable piece of text: the thread posts themselves plus
// any quoted post, keyed the same way `TweetThread` expects.
function buildTranslationTasks(tweets: Tweet[]): TranslationTask[] {
  const tasks: TranslationTask[] = [];
  for (const tweet of tweets) {
    const text = getVisibleTweetText(tweet);
    if (text.length > 0) tasks.push({ key: tweet.id_str, text });

    const quoted = tweet.quoted_tweet;
    const quotedText = quoted ? getVisibleTweetText(quoted) : "";
    if (quoted && quotedText.length > 0) {
      tasks.push({ key: `${quoted.id_str}:q`, text: quotedText });
    }
  }
  return tasks;
}

function buildThreadContext(tasks: TranslationTask[]): string {
  return tasks.map((task, i) => `${i + 1}. ${task.text}`).join("\n");
}

function joinTweetTranslations(
  tweets: Tweet[],
  translations: Record<string, string>
): string {
  return tweets
    .map((t) => translations[t.id_str])
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join("\n\n");
}

function tweetCountLabel(tweetData: TweetData): string {
  return tweetData.tweets.length > 1
    ? `Thread · ${tweetData.tweets.length} posts`
    : "X post";
}

function TabButton({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [tab, setTab] = useState<Tab>("original");
  const [copied, setCopied] = useState(false);
  const [waitLine, setWaitLine] = useState(0);
  const [tweetData, setTweetData] = useState<TweetData | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>(
    {}
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translating = status === "translating";
  const hasTranslation = tweetData
    ? Object.keys(translations).length > 0
    : output.length > 0;

  // A pasted X post URL replaces the whole input; anything else (including
  // text+URL) takes the plain-text path.
  const tweetId = parseTweetUrl(text);

  // Reset tweet/translation state during render when the detected id
  // changes, following React's documented pattern for adjusting state as a
  // derived value changes (rather than setState-in-effect, which cascades
  // an extra render).
  const [prevTweetId, setPrevTweetId] = useState(tweetId);
  if (tweetId !== prevTweetId) {
    setPrevTweetId(tweetId);
    setTweetData(tweetId ? { status: "loading", tweets: [] } : null);
    setTranslations({});
    if (tweetId) setOutput("");
  }

  useEffect(() => {
    if (!translating) return;
    const id = setInterval(() => {
      setWaitLine((i) => {
        const next = Math.floor(Math.random() * WAITING_LINES.length);
        return next === i ? (next + 1) % WAITING_LINES.length : next;
      });
    }, 1800);
    return () => clearInterval(id);
  }, [translating]);

  // Debounced fetch of the post (and its self-reply ancestors) once an id
  // is detected. The AbortController doubles as the staleness check: if a
  // newer id superseded this effect, its cleanup already aborted `signal`.
  useEffect(() => {
    if (!tweetId) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchTweetThread(tweetId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setTweetData(
          result.ok
            ? { status: "ready", tweets: result.tweets }
            : { status: "error", tweets: [] }
        );
      });
    }, TWEET_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tweetId]);

  function copyText(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    });
  }

  async function streamTranslation(
    key: string,
    taskText: string,
    context: string
  ): Promise<boolean> {
    setTranslations((prev) => ({ ...prev, [key]: "" }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: taskText, mode: "post", context }),
      });
      if (!res.ok || !res.body) throw new Error();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Accumulate locally and paint once at the end — the Translation tab
      // only ever shows the finished thread, never a partial stream.
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
      }
      full += decoder.decode();
      if (full.trim().length === 0) throw new Error();

      setTranslations((prev) => ({ ...prev, [key]: full }));
      return true;
    } catch {
      return false;
    }
  }

  async function translateTweets(tweets: Tweet[]) {
    const tasks = buildTranslationTasks(tweets);
    if (tasks.length === 0) {
      setStatus("error");
      setTab("original");
      return;
    }
    const context = buildThreadContext(tasks);

    setStatus("translating");
    setTranslations({});
    setCopied(false);
    setWaitLine(Math.floor(Math.random() * WAITING_LINES.length));
    setTab("translation");

    const results = await Promise.all(
      tasks.map((task) => streamTranslation(task.key, task.text, context))
    );

    if (results.every(Boolean)) {
      setStatus("idle");
    } else {
      // A half-translated set must never become viewable via the
      // Translation tab, so clear it before flipping back.
      setTranslations({});
      setStatus("error");
      setTab("original");
    }
  }

  async function translate() {
    if (translating || text.trim().length === 0) return;

    if (tweetData) {
      if (tweetData.status !== "ready") return;
      await translateTweets(tweetData.tweets);
      return;
    }

    setStatus("translating");
    setOutput("");
    setCopied(false);
    setWaitLine(Math.floor(Math.random() * WAITING_LINES.length));
    setTab("translation");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) throw new Error();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
      }
      full += decoder.decode();
      if (full.trim().length === 0) throw new Error();

      setOutput(full);
      setStatus("idle");
    } catch {
      setStatus("error");
      setTab("original");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-10 pb-8 md:pt-14">
      <header className="flex animate-fade-up items-center gap-2">
        <svg viewBox="0 0 64 64" className="size-5" aria-hidden="true">
          <rect width="64" height="64" rx="16" fill="#befc65" />
          <path
            fill="#131314"
            d="M22 15h20c5.5 0 10 4.5 10 10v7c0 5.5-4.5 10-10 10H30l-9 8 1.8-8H22c-5.5 0-10-4.5-10-10v-7c0-5.5 4.5-10 10-10Z"
          />
          <circle cx="32" cy="28.5" r="6" fill="#befc65" />
        </svg>
        <span className="text-lg font-medium tracking-tight">
          Translator
          <sup className="ml-px text-[0.55em] font-normal text-muted-foreground">
            TM
          </sup>
        </span>
      </header>

      <section className="mt-14 max-w-2xl animate-fade-up text-center [animation-delay:80ms] md:mt-20">
        <h1 className="text-4xl font-medium tracking-tight text-balance md:text-5xl">
          Every message arrives with feelings attached.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground text-pretty">
          We expose them. Paste anything from your workday or your social
          feed, and read what the sender really meant.
        </p>
      </section>

      <section className="mt-10 w-full max-w-2xl animate-fade-up [animation-delay:160ms] md:mt-12">
        <div className="rounded-3xl border border-border bg-card shadow-[0_1px_2px_rgba(19,19,20,0.04)]">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div role="tablist" className="inline-flex rounded-full bg-muted p-1">
              <TabButton
                active={tab === "original"}
                onClick={() => setTab("original")}
              >
                Original
              </TabButton>
              <TabButton
                active={tab === "translation"}
                disabled={!hasTranslation && !translating}
                onClick={() => setTab("translation")}
              >
                Translation
              </TabButton>
            </div>
          </div>

          {/* Both panels stay mounted so switching tabs never remounts the
              textarea or the translated embeds — only visibility toggles. */}
          <div className={cn("animate-panel-in", tab !== "original" && "hidden")}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_INPUT_LENGTH}
              placeholder="Paste the email or chat message here…"
              aria-label="Message to translate"
              className="min-h-44 resize-none rounded-none border-0 bg-transparent p-6 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
            />
            <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {tweetData
                  ? tweetData.status === "error"
                    ? TWEET_LOAD_ERROR
                    : tweetCountLabel(tweetData)
                  : `${text.length.toLocaleString()} / ${MAX_INPUT_LENGTH.toLocaleString()}`}
              </span>
              <div className="flex items-center gap-2">
                {text.length > 0 && (
                  <Button
                    onClick={() => setText("")}
                    disabled={translating}
                    className="h-11 animate-panel-in rounded-full border border-input bg-card px-7 text-sm font-medium text-foreground transition-all hover:border-muted-foreground/30 hover:bg-muted"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  onClick={translate}
                  disabled={
                    translating ||
                    text.trim().length === 0 ||
                    (tweetData !== null && tweetData.status !== "ready")
                  }
                  className="h-11 rounded-full bg-accent px-7 text-sm font-medium text-accent-foreground transition-all hover:bg-accent/80 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                >
                  {translating ? "Translating…" : "Translate"}
                </Button>
              </div>
            </div>
          </div>

          <div className={cn("animate-panel-in", tab !== "translation" && "hidden")}>
            {translating ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-6">
                <span className="size-2.5 animate-pulse rounded-full bg-accent ring-1 ring-border" />
                <p
                  key={waitLine}
                  className="animate-panel-in font-mono text-xs text-muted-foreground"
                >
                  {WAITING_LINES[waitLine]}
                </p>
              </div>
            ) : tweetData ? (
              hasTranslation && (
                <>
                  <TweetThread
                    tweets={tweetData.tweets}
                    translations={translations}
                  />
                  <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
                    <span className="font-mono text-xs text-muted-foreground">
                      Emotional Accuracy: 100%
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={translate}
                        className="h-11 rounded-full border border-input bg-card px-7 text-sm font-medium text-foreground transition-all hover:border-muted-foreground/30 hover:bg-muted"
                      >
                        Retry
                      </Button>
                      <Button
                        onClick={() =>
                          copyText(
                            joinTweetTranslations(tweetData.tweets, translations)
                          )
                        }
                        className="h-11 rounded-full bg-accent px-7 text-sm font-medium text-accent-foreground transition-all hover:bg-accent/80"
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                </>
              )
            ) : (
              hasTranslation && (
                <>
                  <p className="animate-fade-up p-6 text-base leading-relaxed whitespace-pre-wrap">
                    {output}
                  </p>
                  <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
                    <span className="font-mono text-xs text-muted-foreground">
                      Emotional Accuracy: 100%
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={translate}
                        className="h-11 rounded-full border border-input bg-card px-7 text-sm font-medium text-foreground transition-all hover:border-muted-foreground/30 hover:bg-muted"
                      >
                        Retry
                      </Button>
                      <Button
                        onClick={() => copyText(output)}
                        className="h-11 rounded-full bg-accent px-7 text-sm font-medium text-accent-foreground transition-all hover:bg-accent/80"
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </div>

        {status === "error" && (
          <p className="mt-6 animate-panel-in text-center text-sm text-destructive">
            {GENERIC_ERROR}
          </p>
        )}
      </section>

      <footer className="mt-auto flex animate-fade-up flex-col items-center gap-2 pt-10 text-center text-[0.7rem] text-muted-foreground [animation-delay:240ms] md:gap-2.5 md:pt-14 md:text-xs">
        <p className="max-w-xs text-balance md:max-w-none">
          All translations are emotionally accurate and professionally
          inadvisable.
        </p>
      </footer>
    </main>
  );
}
