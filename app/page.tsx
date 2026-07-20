"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_INPUT_LENGTH = 4000;
const GENERIC_ERROR = "Something got lost in translation. Try again.";

const WAITING_LINES = [
  "Reading between the lines…",
  "Extracting attached feelings…",
  "Scanning for suppressed resentment…",
  "Quantifying passive aggression…",
  "Detecting forced pleasantries…",
  "Isolating genuine sentiment…",
  "Cross-referencing what was said with what was meant…",
  "Recovering deleted honesty…",
  "Measuring sincerity levels… low.",
  "Consulting the sender's true intentions…",
];

type Tab = "original" | "translation";
type Status = "idle" | "translating" | "error";

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
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translating = status === "translating";
  const hasTranslation = output.length > 0;

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

  async function translate() {
    if (translating || text.trim().length === 0) return;
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

  function copy() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    });
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
          We expose them. Paste any message from your workday and read what
          the sender really meant.
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

          {tab === "original" ? (
            <div key="original" className="animate-panel-in">
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
                  {text.length.toLocaleString()} /{" "}
                  {MAX_INPUT_LENGTH.toLocaleString()}
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
                    disabled={translating || text.trim().length === 0}
                    className="h-11 rounded-full bg-accent px-7 text-sm font-medium text-accent-foreground transition-all hover:bg-accent/80 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                  >
                    {translating ? "Translating…" : "Translate"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div key="translation" className="animate-panel-in">
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
              ) : (
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
                        onClick={copy}
                        className="h-11 rounded-full bg-accent px-7 text-sm font-medium text-accent-foreground transition-all hover:bg-accent/80"
                      >
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {status === "error" && (
          <p className="mt-6 animate-panel-in text-center text-sm text-destructive">
            {GENERIC_ERROR}
          </p>
        )}
      </section>

      <footer className="mt-auto animate-fade-up pt-14 text-xs text-muted-foreground [animation-delay:240ms]">
        All translations are emotionally accurate and professionally
        inadvisable.
      </footer>
    </main>
  );
}
