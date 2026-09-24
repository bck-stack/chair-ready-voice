# Chair Ready Voice

**An MCP server that lets Alexa+ (or any AI agent) book appointments for one-person businesses — so the owner never has to pick up the phone.**

Demo business: **Fade & Co.**, a one-chair barbershop at 214 Kingsland Road, Dalston, London. Marcus works alone. Around 40 booking messages a day arrive while he's holding clippers; by the time he replies, customers have booked elsewhere, and one in five Saturday chairs is a no-show.

With Chair Ready Voice, a customer just says *"Alexa, can I get a skin fade at Fade & Co. tomorrow afternoon?"* — the assistant checks the real diary, offers free times, books, texts a confirmation, handles reschedules and cancellations, and fills cancelled slots from the waitlist. Marcus gets a heads-up, nothing to do.

- **Live simulator:** https://chair-ready-voice.sitecheck-api.workers.dev
- **MCP endpoint (Streamable HTTP, spec 2025-11-25):** `https://chair-ready-voice.sitecheck-api.workers.dev/mcp`

## Tools

| Tool | What it does |
|---|---|
| `get_business_info` | Name, address, opening hours, deposit rules, services with length and price |
| `find_available_times` | Genuinely free start times for a service on a date (hours, breaks, existing bookings, service length) |
| `next_available` | Next days with free times — for "when's your next slot?" |
| `book_appointment` | Books a free time, sends the confirmation, applies the Saturday deposit rule |
| `find_my_booking` | Upcoming bookings for a mobile number |
| `reschedule_appointment` | Moves a booking to a new free time |
| `cancel_appointment` | Cancels, refunds the deposit and **offers the freed slot to everyone on that day's waitlist** |
| `join_waitlist` | Puts a customer on a full day's waitlist |
| `owner_daily_briefing` | The owner's day: schedule, takings, waitlist, bookings that came in by voice |

Read-only tools carry `readOnlyHint`; `cancel_appointment` carries `destructiveHint`. Errors come back as `isError` results with a sentence the assistant can say out loud ("3 pm isn't free on Friday. Closest free times: 3:15, 4:30.").

## Use it from any MCP client

```json
{
  "mcpServers": {
    "chair-ready-voice": { "type": "http", "url": "https://chair-ready-voice.sitecheck-api.workers.dev/mcp" }
  }
}
```

Smoke test with the official SDK client:

```bash
node test/mcp-client.mjs
```

## The Alexa+ simulator

The web page simulates an Alexa+ device: tap the ring and speak (Web Speech API), or type. A small agent loop (Llama 3.3 70B on Workers AI, function calling) calls **the same tool implementations** the MCP server exposes, and the reply is spoken back. The right-hand panel shows what happens behind the scenes: every tool call, Marcus's chair for the day, and the messages sent automatically.

## Architecture

```
Alexa+ / any MCP client ──Streamable HTTP──►  /mcp  (McpServer, stateless)
Browser simulator ──► /api/agent (LLM + tool calls) ─┐
                                                     ├─► src/tools.js ─► src/engine.js ─► Cloudflare D1
Owner panel ──► /api/state ──────────────────────────┘
```

- `src/engine.js` — availability engine and booking rules (15-minute grid, breaks, deposits, waitlist cascade)
- `src/tools.js` — one tool catalogue (zod schemas) used by both the MCP server and the agent
- `src/worker.js` — Cloudflare Worker: MCP transport, agent loop, simulator API
- `schema.sql`, `src/seed.js` — database schema and demo data (relative to today)

## Run your own

```bash
npm install
npx wrangler d1 create chair-ready-voice      # put the id in wrangler.toml
npx wrangler d1 execute chair-ready-voice --remote --file schema.sql
npx wrangler deploy
curl -X POST https://<your-worker>/api/reset  # load demo data
```

Runs on the Cloudflare Workers free tier (Workers, D1, Workers AI).

## License

MIT
