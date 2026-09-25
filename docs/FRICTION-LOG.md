# Friction log — building an Alexa+ MCP integration

Product feedback from building Chair Ready Voice: an MCP server (Cloudflare Workers + D1) that lets Alexa+ book, move and cancel appointments for a one-chair barbershop, plus an Agent Skill and a browser simulator.

Each item follows the same shape: **what happened**, **what I expected**, **suggestion**. Severity is how much time it cost or how much it would affect a real merchant: 🔴 blocked or cost hours, 🟠 slowed me down, 🟢 small.

---

## 1. Getting started

### 1.1 🔴 No clear path from "I have an MCP server" to "Alexa+ is calling it"
- **What happened:** I had a working, public MCP endpoint early on. I then spent a long time trying to work out how Alexa+ finds it: which console, what registration step, whether it's an account-linking style flow or a URL I paste somewhere, and whether a hackathon entry needs to be certified.
- **What I expected:** One page: "You have an MCP server. Here are the steps to connect it to Alexa+, and here's how to try it yourself before anyone else can see it."
- **Suggestion:** A single end-to-end quickstart that starts from a public MCP URL and ends with a spoken tool call on a dev account, with a screenshot of each console step and the expected time for each stage (e.g. review).

### 1.2 🟠 Unclear how an MCP server and an Agent Skill relate in Alexa+
- **What happened:** I built both: tools on the MCP server, and conversation rules in `SKILL.md` ("offer at most three times", "confirm before cancelling"). I couldn't tell whether Alexa+ reads the skill, the MCP server's `instructions` field, the tool descriptions, or some mix — so I duplicated the rules in all three.
- **What I expected:** A short explanation of which text Alexa+ uses to decide when to call my tools and how to speak, and in what order of priority.
- **Suggestion:** A diagram: utterance → routing (which text is used?) → tool choice (which text?) → response phrasing (which text?). Say explicitly whether `SKILL.md` is loaded, and whether MCP `instructions`, prompts and resources are used.

### 1.3 🟢 Terminology overlap: "skill"
- **What happened:** "Alexa Skill" (the classic Skills Kit), "Agent Skill" (the open `SKILL.md` format) and "Alexa+ integration" appear close together. Search results mix classic skill docs with Alexa+ material.
- **What I expected:** To know right away which docs apply to Alexa+.
- **Suggestion:** A banner on classic ASK pages saying "This is for classic Alexa Skills; for Alexa+ with MCP see …", and a glossary on the Alexa+ pages.

---

## 2. MCP protocol and spec versions

### 2.1 🟠 Which MCP spec version does Alexa+ speak?
- **What happened:** I built against spec **2025-11-25** (the current version in `@modelcontextprotocol/sdk` 1.30). I couldn't find a statement of which protocol versions Alexa+ sends in `initialize`, or whether it negotiates down to 2025-06-18 or 2025-03-26.
- **What I expected:** A supported-versions table, like the one browsers publish for web features.
- **Suggestion:** Publish supported spec versions, and the date Alexa+ will adopt the next one. Say what happens if a server only supports an older version.

### 2.2 🟠 Which MCP features are used: `outputSchema`, `structuredContent`, resources, prompts?
- **What happened:** I added an `outputSchema` to every tool and return `structuredContent`, plus a resource (`business://fade-and-co/info`) and a prompt (`book_haircut`). I don't know whether Alexa+ uses any of them, or only the text content.
- **What I expected:** A features matrix: tools ✅, annotations (`readOnlyHint`, `destructiveHint`) ?, structured output ?, resources ?, prompts ?, elicitation ?, sampling ?.
- **Suggestion:** Publish that matrix. In particular, say whether `destructiveHint` makes Alexa+ ask for confirmation by itself — that changes how I'd write the cancel tool's description.

### 2.3 🟢 How should errors be returned for voice?
- **What happened:** I return booking problems as `isError: true` with a sentence meant to be read aloud ("3 pm isn't free on Friday. Closest free times: 3:15, 4:30."). I wasn't sure whether Alexa+ reads that text, rephrases it, or replaces it with a generic "something went wrong".
- **What I expected:** Guidance on tool errors vs. protocol errors in a voice context.
- **Suggestion:** A short "writing tool results for voice" guide with do/don't examples, including errors.

---

## 3. Transport and hosting

### 3.1 🟠 Stateless vs. session transports on serverless
- **What happened:** Streamable HTTP allows the server to issue an `Mcp-Session-Id`. On Cloudflare Workers there's no guarantee the next request reaches the same instance, so I run fully stateless (`sessionIdGenerator: undefined`, JSON responses, a fresh server per request). It works, but I couldn't confirm Alexa+ is happy with a server that never issues a session id, and I don't know whether it opens the optional `GET /mcp` stream (on a stateless Worker nothing would ever be sent on it).
- **What I expected:** A statement that stateless servers are supported, and what Alexa+ does with a session id if one is given (does it resend it, for how long, what happens on a 404).
- **Suggestion:** Document the client's transport behaviour: session handling, retries, timeouts, whether it opens the GET/SSE stream, and whether it needs `text/event-stream` or accepts plain JSON responses.

### 3.2 🟠 Latency budget
- **What happened:** A booking can take several tool calls (info → free times → book). I didn't know how long Alexa+ waits for a tool before it gives up or starts talking, so I couldn't tell whether a cold start plus a D1 query is fine.
- **What I expected:** A published timeout per tool call and per turn.
- **Suggestion:** Publish the numbers, and include tool latency in whatever developer logs are available.

### 3.3 🟢 Authentication for owner-only tools
- **What happened:** `owner_daily_briefing` returns takings. In the demo anyone can call it. I wanted customer tools to be open and owner tools to need sign-in, but couldn't find how Alexa+ passes identity to an MCP server (OAuth per MCP's authorization spec? account linking? per-tool?).
- **What I expected:** An example of mixed public/private tools on one server.
- **Suggestion:** A sample showing MCP authorization with Alexa+, including how a voice user is asked to link an account.

---

## 4. Testing without a device

### 4.1 🔴 No way to try the voice experience end to end during the build
- **What happened:** I didn't have an Alexa+ device or a text simulator connected to my MCP server, so I couldn't hear how Alexa+ phrases my results. I built my own browser simulator: Web Speech API for voice, an agent loop on Workers AI (Llama 3.3 70B) calling the same tool code. It helped, but it's my guess at Alexa+'s behaviour, not the real thing.
- **What I expected:** A web or CLI test console where I type or speak an utterance and see: which tools Alexa+ picked, the arguments, my server's response and the final spoken text.
- **Suggestion:** An "Alexa+ MCP test console" in the developer console, with a trace view. This would have saved me the most time of anything in this list.

### 4.2 🟠 No reference for how Alexa+ fills arguments
- **What happened:** My tools take dates as `YYYY-MM-DD` in the business's timezone. "Tomorrow" depends on where the customer and business are. I didn't know whether Alexa+ resolves relative dates, in which timezone, or passes raw text — so I return `today` and `timezone` from `get_business_info` and hope the model uses them.
- **What I expected:** Guidance on how Alexa+ resolves dates, times, phone numbers and names before calling a tool, and whether it passes the user's locale/timezone.
- **Suggestion:** Document slot-like resolution for MCP arguments, or let the tool schema declare `format: date` and have Alexa+ resolve it in a known timezone.

### 4.3 🟢 No sample transcripts
- **What happened:** To tune tool descriptions I wanted to see real examples of an Alexa+ conversation that uses an MCP tool.
- **What I expected:** A few annotated transcripts in the docs.
- **Suggestion:** Publish 3–5 transcripts with the tool calls shown, including a failure and a multi-turn booking.

---

## 5. Agent Skills

### 5.1 🟠 Where does `SKILL.md` go, and is it used?
- **What happened:** I followed the open Agent Skills format (front matter `name` + `description`, then instructions). I couldn't find whether Alexa+ loads Agent Skills from a repo, an upload, or not at all for third-party MCP integrations.
- **What I expected:** A clear "put your skill here, it's used for X" section.
- **Suggestion:** If Alexa+ supports Agent Skills, document the upload path, size limits and whether it can reference the MCP server by URL. If it doesn't yet, say so, so builders don't duplicate effort.

### 5.2 🟢 No voice-specific guidance in the skill format
- **What happened:** Most Agent Skill examples are written for text or coding agents. For voice I had to invent rules: no lists, no IDs, at most three options, spoken times.
- **What I expected:** A voice section in the skill authoring guide.
- **Suggestion:** Add an official "writing skills for voice" example to the docs.

---

## 6. Tooling notes (not Amazon, but on the path)

These cost time too and may help other builders:

- **zod 4 → JSON Schema.** `z.toJSONSchema()` defaults to the *output* view, which marks fields with `.default()` as **required**. My function-calling schemas told the model that `business` was required. Fix: `z.toJSONSchema(schema, { io: "input" })`. The MCP SDK already does this for `inputSchema`.
- **Refinements run even after a regex fails.** A zod `.refine()` that assumes the string is already a valid date will throw on bad input. Guard it.
- **Client-side output validation.** The MCP SDK client validates `structuredContent` against `outputSchema`, which is emitted with `additionalProperties: false`. Adding a field to a result without adding it to the schema breaks clients. Good behaviour, but worth knowing.
- **Testing D1 locally.** A 30-line adapter over better-sqlite3 (`prepare/bind/first/all/run`, `meta.last_row_id`) was enough to run the whole engine and the MCP server in `node --test` with no Cloudflare account.

---

## Summary: the three things that would help most

1. **An end-to-end quickstart** from a public MCP URL to a spoken tool call on a developer account (1.1).
2. **A test console with a tool-call trace**, so builders can hear and see what Alexa+ does with their server before shipping (4.1).
3. **A capabilities page**: supported MCP spec versions, transport behaviour, which MCP features are used, timeouts, and how Agent Skills fit in (1.2, 2.1, 2.2, 3.1, 3.2, 5.1).
