# Friction log: building an Alexa+ MCP integration

Product feedback from building Chair Ready Voice: an MCP server (Cloudflare Workers + D1) that lets Alexa+ book, move and cancel appointments for a one-chair barbershop, plus an Agent Skill and a browser simulator.

Every entry has the same fields: **task attempted**, **steps taken**, **expected result**, **actual result**, **severity**, **workaround used**, **suggestion**.

Severity: **High** = blocked us or cost hours · **Medium** = slowed us down · **Low** = small, but worth fixing.

| # | Area | Severity |
|---|---|---|
| 1 | Connecting a public MCP server to Alexa+ | High |
| 2 | Testing the voice experience without a device | High |
| 3 | Supported MCP spec versions and features | Medium |
| 4 | Stateless transport on serverless | Medium |
| 5 | Latency budget for tool calls | Medium |
| 6 | Where Agent Skills fit in | Medium |
| 7 | Owner-only tools and authentication | Medium |
| 8 | Argument resolution for dates and times | Low |
| 9 | Tool errors in a voice context | Low |
| 10 | "Skill" terminology | Low |

---

## 1. Connecting a public MCP server to Alexa+

- **Task attempted:** make Alexa+ call our MCP endpoint (`/mcp`, Streamable HTTP, spec 2025-11-25).
- **Steps taken:** built and deployed the server on Cloudflare Workers early; checked it with the official MCP SDK client; then searched the Alexa+ docs and developer consoles for the registration path (console, account linking, URL submission, certification).
- **Expected result:** one quickstart from "I have a public MCP URL" to "Alexa+ speaks a tool result on my developer account".
- **Actual result:** we could not find a single end-to-end path, or whether a hackathon entry needs certification before it can be tried.
- **Severity:** High.
- **Workaround used:** built our own Alexa+-style browser simulator (Web Speech API + an agent loop on Workers AI calling the same tool code) and kept building against it.
- **Suggestion:** an end-to-end quickstart that starts from a public MCP URL, with a screenshot for each console step and the expected time for each stage (for example review).

## 2. Testing the voice experience without a device

- **Task attempted:** hear how Alexa+ phrases our tool results and which tools it picks for a request.
- **Steps taken:** looked for a text or voice test console that can reach a third-party MCP server; looked for sample transcripts with tool calls.
- **Expected result:** a console where we type or speak an utterance and see the chosen tools, their arguments, our server's response and the final spoken text.
- **Actual result:** none found, so the real Alexa+ behaviour could only be guessed.
- **Severity:** High.
- **Workaround used:** our simulator shows every tool call, the barber's diary and every text message in a side panel; we tuned tool descriptions against an open model (Llama 3.3 70B) instead of Alexa+.
- **Suggestion:** an "Alexa+ MCP test console" with a trace view, plus 3-5 annotated sample transcripts (including a failure and a multi-turn booking). This would have saved the most time of anything in this log.

## 3. Supported MCP spec versions and features

- **Task attempted:** decide which MCP features are worth implementing for Alexa+.
- **Steps taken:** implemented `outputSchema` + `structuredContent` on all nine tools, annotations (`readOnlyHint`, `destructiveHint`), one resource (`business://fade-and-co/info`) and one prompt (`book_haircut`); searched for which of these Alexa+ reads.
- **Expected result:** a table of supported spec versions and a features matrix (tools, annotations, structured output, resources, prompts, elicitation, sampling).
- **Actual result:** no statement of which protocol versions Alexa+ sends in `initialize`, or which features it uses.
- **Severity:** Medium.
- **Workaround used:** implemented everything and kept a plain-text version of every result as a fallback.
- **Suggestion:** publish supported spec versions and a features matrix; in particular say whether `destructiveHint` makes Alexa+ ask for confirmation by itself, because that changes how the cancel tool should be described.

## 4. Stateless transport on serverless

- **Task attempted:** run Streamable HTTP on Cloudflare Workers, where consecutive requests can reach different instances.
- **Steps taken:** tried session ids first, then switched to a fully stateless server (`sessionIdGenerator: undefined`, JSON responses, a fresh server per request).
- **Expected result:** a statement that stateless servers are supported, and how the client handles `Mcp-Session-Id`, retries and the optional `GET /mcp` stream.
- **Actual result:** not documented; we could not confirm Alexa+ accepts a server that never issues a session id.
- **Severity:** Medium.
- **Workaround used:** stateless server with all state in D1; verified with the official SDK client.
- **Suggestion:** document the client's transport behaviour: session handling, retries, timeouts, whether it opens the GET/SSE stream, and whether plain JSON responses are accepted.

## 5. Latency budget for tool calls

- **Task attempted:** make sure a booking (info, then free times, then book) fits inside one voice turn.
- **Steps taken:** measured cold starts and D1 queries on Workers; looked for Alexa+ timeouts.
- **Expected result:** a published timeout per tool call and per turn.
- **Actual result:** none found.
- **Severity:** Medium.
- **Workaround used:** kept every tool to one or two D1 queries and returned spoken dates so the model needs fewer calls.
- **Suggestion:** publish the numbers and show tool latency in developer logs.

## 6. Where Agent Skills fit in

- **Task attempted:** give Alexa+ the receptionist's voice rules (offer at most three times, collect name and mobile before booking, never read out IDs, confirm before cancelling).
- **Steps taken:** wrote `skills/book-appointment/SKILL.md` in the open Agent Skills format; searched for how Alexa+ loads skills for third-party MCP integrations.
- **Expected result:** a clear "put your skill here, it is used for X" section, and which text Alexa+ uses for routing, tool choice and phrasing.
- **Actual result:** unclear whether Alexa+ reads `SKILL.md`, the MCP `instructions` field or the tool descriptions.
- **Severity:** Medium.
- **Workaround used:** duplicated the rules in all three places.
- **Suggestion:** a diagram (utterance, routing, tool choice, response phrasing) naming the text used at each step, the upload path and size limits for skills, and a "writing skills for voice" example.

## 7. Owner-only tools and authentication

- **Task attempted:** keep customer tools open while `owner_daily_briefing` (takings) needs sign-in.
- **Steps taken:** read the MCP authorization spec; searched for how Alexa+ passes a user's identity to an MCP server.
- **Expected result:** an example of mixed public and private tools on one server, including how a voice user is asked to link an account.
- **Actual result:** none found.
- **Severity:** Medium.
- **Workaround used:** in the demo the owner tools are open and the data is fictional.
- **Suggestion:** an official sample of MCP authorization with Alexa+ and per-tool access.

## 8. Argument resolution for dates and times

- **Task attempted:** accept "tomorrow afternoon" for a business in London.
- **Steps taken:** declared dates as `YYYY-MM-DD` in the business's timezone; looked for how Alexa+ resolves relative dates, phone numbers and names before calling a tool.
- **Expected result:** documented resolution rules and the timezone used.
- **Actual result:** not documented.
- **Severity:** Low.
- **Workaround used:** `get_business_info` returns today's date and the timezone; results include spoken dates ("Thursday 8 October") next to ISO dates.
- **Suggestion:** document slot-like resolution for MCP arguments, or honour `format: date` in tool schemas.

## 9. Tool errors in a voice context

- **Task attempted:** make booking problems sound helpful when spoken.
- **Steps taken:** returned problems as `isError: true` with a sentence meant to be read aloud ("3 pm isn't free on Friday. Closest free times: 3:15, 4:30.").
- **Expected result:** guidance on whether Alexa+ reads, rephrases or replaces tool error text.
- **Actual result:** not documented.
- **Severity:** Low.
- **Workaround used:** every error message already contains the alternative, so it works whether it is read verbatim or rephrased.
- **Suggestion:** a short "writing tool results for voice" guide with do/don't examples, including errors.

## 10. "Skill" terminology

- **Task attempted:** find the docs that apply to Alexa+ with MCP.
- **Steps taken:** searched for Alexa+ integration docs.
- **Expected result:** to know immediately which pages apply to Alexa+.
- **Actual result:** classic Alexa Skills, Agent Skills and Alexa+ integrations appear close together in search results.
- **Severity:** Low.
- **Workaround used:** read both sets of docs and kept only the Alexa+ and MCP parts.
- **Suggestion:** a banner on classic ASK pages pointing to the Alexa+ MCP docs, and a glossary on the Alexa+ pages.

---

## Tooling notes (not Amazon, but on the path)

- **zod 4 to JSON Schema:** `z.toJSONSchema()` defaults to the output view, which marks fields with `.default()` as required; function-calling schemas then told the model that optional fields were required. Fix: `z.toJSONSchema(schema, { io: "input" })`.
- **Client-side output validation:** the MCP SDK client validates `structuredContent` against `outputSchema` (emitted with `additionalProperties: false`), so every new result field must be added to the schema. Good behaviour, worth knowing.
- **Testing D1 locally:** a 30-line adapter over better-sqlite3 (`prepare/bind/first/all/run`, `meta.last_row_id`) ran the whole engine and MCP server in `node --test` with no Cloudflare account.

## The three things that would help most

1. An end-to-end quickstart from a public MCP URL to a spoken tool call on a developer account (1).
2. A test console with a tool-call trace (2).
3. A capabilities page: spec versions, features, transport behaviour, timeouts and how Agent Skills fit in (3, 4, 5, 6).
