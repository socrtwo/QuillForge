# AI in QuillForge

The **AI** tab has 67 commands. Like every other command, each one can go on the Quick Access Bar, a custom tab or a keyboard shortcut, and macros can record it. AI is optional: nothing is sent anywhere until you set up a provider and run an AI command. You can turn AI off in **AI ▸ AI Settings**.

## Choosing where AI runs

Open **AI ▸ Set Up AI**. The first AI command you use also offers this. The choices fall into four groups.

| Group | Options | What it costs |
|---|---|---|
| Free, no account | On-device model; the browser's built-in model (desktop Chrome only) | Free. Your text stays on the device. |
| Free with a free account | OpenRouter free models, Google Gemini, Groq, Mistral, Cerebras, SambaNova, Z.ai (GLM), NVIDIA NIM, Cloudflare Workers AI, Cohere (trial) | Free tiers with rate limits. Some free tiers may use prompts for training. |
| On your own computer | Ollama, LM Studio | Free. Models run on your PC or Mac. |
| Paid | OpenAI, Anthropic, DeepSeek, xAI, Perplexity, Together, Fireworks, Hugging Face, Moonshot, Alibaba Qwen, Azure OpenAI, Amazon Bedrock, any OpenAI-compatible service | Pay as you go, on your own account. |

You can set up several providers and switch between them with **AI ▸ Active AI**.

### The on-device model (free, private, offline)

QuillForge downloads a small open model once and runs it on the device with [Transformers.js](https://huggingface.co/docs/transformers.js). It uses WebGPU when the device has it and the CPU (WebAssembly) otherwise. The library comes from cdn.jsdelivr.net (pinned to version 4.2.0) and the model from huggingface.co. After that the model works offline from the browser cache.

| Model | Download | Notes |
|---|---|---|
| Qwen2.5 0.5B Instruct (default) | ≈ 480–510 MB | Best quality for its size; many languages. Apache-2.0. |
| SmolLM2 360M Instruct | ≈ 270–365 MB | Fastest; English-centric. Apache-2.0. |
| Gemma 3 270M IT | ≈ 270–545 MB | Very small. Gemma Terms of Use. |
| Llama 3.2 1B Instruct (q4f16) | ≈ 1.24 GB | Better writing, but needs WebGPU. Llama 3.2 Community License. |

Small models are fine for rewording, summaries and proofreading short passages. For long documents or careful drafting, a cloud model is much stronger. **AI ▸ Delete Downloaded Models** frees the storage.

## How the setup wizard gets your key

The wizard opens the right page in your **default browser**:

- **Create a free key**: the provider's sign-up and key page.
- **Create a paid key**: the billing or credits page.
- **Find my existing key**: the key list. For services that show a key only once (OpenAI, Anthropic, Groq and most others), the wizard tells you to create a new key, because the old one cannot be shown again.

Then the key comes back to QuillForge in one of three ways:

1. **OpenRouter sign-in: no copying at all.** QuillForge uses OpenRouter's OAuth PKCE flow. You approve in the browser, and OpenRouter sends a one-time code back to QuillForge, which exchanges it for a key.
   - Android: the code arrives through a listener that runs only for the sign-in, on `127.0.0.1` (this device only).
   - Web: the code arrives in a callback tab.
   - If your browser blocks the redirect, paste the address bar URL into the wizard.
2. **The clipboard.** Click the provider's "Copy" button for your key and come back. QuillForge reads the clipboard once and recognizes the key by its format (for example `sk-or-v1-…`, `gsk_…`, `sk-ant-api03-…`, `AIza…`/`AQ.…`). It then tests the key, saves it, and clears it from the clipboard. You can turn this off; Android 12 and later show a "pasted from clipboard" notice when it happens.
3. **Paste** into the key field.

**Limit:** an app cannot read what is shown in another app's browser. So the wizard does not scrape provider pages. It relies on the clipboard or the OAuth handoff.

Every key is checked against the provider's model list before it is saved. That list also fills the model pickers, so outdated default model names correct themselves.

## Privacy and keys

- QuillForge has no server. Requests go directly from your device to the provider you chose.
- **Keys** are stored only on the device:
  - Android: encrypted with AES-256-GCM using a key held in the Android Keystore.
  - Web: in this browser's IndexedDB.
  - Keys never go into settings exports, drafts or documents.
- The first time you use a cloud provider, QuillForge tells you where your text will go. Before it sends a whole document it asks you first; you can switch that prompt off.
- **AI Settings ▸ Insert AI edits as tracked changes** records every AI change as a revision by "AI (model)", with whole-word changes. Review them with **AI ▸ Review AI Edits**.

## How AI edits are applied

When AI changes text inside a paragraph, QuillForge applies only the words that changed (a word-level diff). Formatting on the words that did not change is kept, and pictures, footnotes and fields inside the paragraph are never deleted. Structured answers (lists, tables, headings) are read as Markdown and become real lists, tables and heading styles.

## Feature survey

These commands come from a survey of how word processors and writing tools expose AI: Word, Google Docs, Apple Pages, LibreOffice extensions, ONLYOFFICE, WPS, Zoho Writer, SoftMaker, Collabora, Hancom, Polaris, Notion, Coda, Craft, Canva Docs, Grammarly, ProWritingAid, Wordtune, LanguageTool, DeepL Write, Sudowrite, NovelAI, Lex, iA Writer, QuillBot, Jasper and others. Features are named generically; product feature brands are not used.

| Group | Commands |
|---|---|
| Assistant | AI Pane (chat), Ask About Document, Inline AI Command, Set Up AI, Active AI, Providers & Models, My Prompts, Prompt Library, AI Settings, AI & Privacy, Stop AI |
| Write | Draft with AI, Continue Writing, Draft from Template (25 document types), Create Document from Brief, Brainstorm Ideas, Generate Outline, Suggest Titles |
| Rewrite | Rewrite (several versions), Improve Writing, Change Tone (14 tones), Change Style (12 registers), Edit with Instruction, Simplify, Make It Sound Natural, Match My Voice |
| Length & Structure | Shorten, Expand, Make Bulleted List, Convert to Table, Key Points, Add Detail (examples, counterarguments, definitions…), Add Headings |
| Proofing | Proofread with AI (tracked changes), Clarity Suggestions (comments), Check Against Style Guide, Fix OCR Errors (tracked changes) |
| Summarize & Analyze | Summarize (5 forms), Insert Summary at Top, Action Items, Explain, Analyze Text, Generate FAQ, Extract Names, Dates & Places |
| Translate | Translate Selection (40 languages), Translate Document, Side-by-Side Translation, Detect Language |
| Research | Suggest Sources, Flag Claims to Verify, Format Citation (including Evidence Explained) |
| Review | Feedback as Comments, Reader Reaction (12 personas), Grade Against Rubric, Manuscript Critique, Summarize Comments, Draft Comment Reply, Review AI Edits |
| Pictures | Generate Alt Text, Image to Text (OCR), Describe Picture, Generate Image |
| Creative | Describe (sensory detail), Name Generator, Polish Dialogue, Story Notes (context sent with every request), Delete Downloaded Models |

Results appear in one of four places, depending on the command:

- **Preview dialogs** for rewrites, which show alternatives and offer Replace, Insert, Copy, Retry and Refine.
- **The AI pane**, for answers and analysis, with Insert, Replace and Top buttons.
- **Comments** attached to the quoted passages.
- **A new document**, for translations and drafts.

## Limits

- AI output can be wrong. Proofreading and OCR repair are applied as tracked changes, so you review each edit. Research commands suggest where to look; they do not verify facts.
- **Picture commands** need a model that accepts images (OpenAI, Anthropic, Gemini, OpenRouter vision models, xAI).
- **Generate Image** currently uses OpenAI's image model.
- **Perplexity, NVIDIA NIM and Cloudflare Workers AI** block calls from web browsers. They work in the Android app, which sends those requests through the native HTTP stack, without streaming.
- **GitHub Models** was retired on July 30, 2026, so it is not offered.
- **Pollinations** now requires a key; use it through "Other OpenAI-compatible service".
- **Chrome's built-in model** is desktop-only (Chrome 148+ with about 16 GB RAM and 22 GB free disk). It is not available on Android.
- **Untested on real devices:** the on-device model and the Android OAuth listener were exercised only in code review and CI builds. A live mock-server test covers the OpenAI-compatible, Anthropic and Gemini request formats, streaming, errors and the wizard (`tests/e2e/ai.mjs`).
