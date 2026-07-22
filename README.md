# Alternatino Translator™

<p align="center">
  <img src="https://translator.morroc.ai/cover.jpg" alt="Translator app — every message arrives with feelings attached" width="720" />
</p>

Every message arrives with feelings attached. Translator exposes them.

Paste any message from your workday: a polite email, a careful chat, a "gentle reminder" from a colleague. Translator rewrites it as what the sender really meant. The manners go; the facts stay.

This is a toy. The output will be rude. Do not send it to anyone you want to keep.

Inspired by the translator sketch from [Alternatino](https://www.youtube.com/watch?v=foT9rsHmS24).

## Setup

You need an [x.ai](https://x.ai) API key.

1. Copy `.env.example` to `.env.local`.
2. Put your key in `XAI_API_KEY`.
3. To use another model, set `XAI_MODEL`. The default is `grok-4.5`, which writes fluently toxic.

The key stays on the server. Visitors never see it, the provider, or the model, even in error messages.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:4000. Build for production with `npm run build`.

---

All translations are emotionally accurate and professionally inadvisable.
