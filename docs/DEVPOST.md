# Chair Ready Voice

**Voice booking for one-person businesses, through Alexa+. The owner keeps cutting; the assistant runs the diary.**

- Live simulator: https://chair-ready-voice.fadeandco.workers.dev
- MCP endpoint (Streamable HTTP, spec 2025-11-25): https://chair-ready-voice.fadeandco.workers.dev/mcp
- Agent Skill: `skills/book-appointment/SKILL.md`

---

## Inspiration

Our demo shop is Fade & Co., a one-chair barbershop on Kingsland Road in Dalston, London. Marcus runs it alone. He is the barber, the receptionist, the cleaner and the accountant.

His bookings arrive the way they do for most small shops: Instagram DMs, WhatsApp, texts, the odd phone call. On a normal day that's around 40 messages, and almost all of them land while he has clippers in his hand. He can't stop a skin fade halfway through to reply to "any chance of 4 o'clock?", so the reply goes out an hour later — by which point the customer has booked somewhere else.

Two more things cost him money every week:

- **No-shows.** About one in five Saturday appointments doesn't turn up. Saturday is his busiest and most valuable day, and an empty chair on a Saturday can't be sold again.
- **Same-day gaps.** When someone cancels at 11am for a 3pm slot, there are usually people who would have taken it. Marcus just has no time to text round and find them.

None of this needs a big system. It needs someone to answer the question "is there a time?" straight away, with the real diary in front of them. Alexa+ can now hold a conversation and call tools on a business's behalf, so we built the tools.

## What it does

A customer says, *"Alexa, can I get a skin fade at Fade & Co. tomorrow afternoon?"* The assistant checks Marcus's real diary and offers up to three free times. The customer picks one and gives their name and mobile number. The booking is made and a confirmation text goes out. Marcus gets a one-line note: "New booking by voice. Nothing for you to do."

Around that single flow:

- **Real availability.** Free times come from opening hours, the lunch break (13:30–14:00), existing bookings and the length of the service. A 60-minute cut-and-beard won't be offered at 18:15 when the shop closes at 19:00. Times earlier than 30 minutes from now aren't offered for today.
- **Saturday deposit.** Saturday bookings carry a £5 deposit with a pay link in the confirmation. This is the rule Marcus chose to cut Saturday no-shows; the assistant mentions it before booking.
- **Reschedule and cancel by voice.** The customer gives their mobile number (spaces, `+44`, dashes all match) and the assistant finds their booking. Rescheduling moves it; it never leaves a duplicate behind.
- **Waitlist refill.** When a day is full, the assistant offers the waitlist. When someone cancels, every person on that day's waitlist gets a text straight away: "3pm on Saturday just opened. First to reply YES gets it." Marcus is told the slot was offered — he doesn't have to do anything.
- **Owner's briefing.** Marcus can ask, "What does my day look like?" and hear his appointments in order, the day's takings, the waitlist size and how many bookings came in by voice this week.
- **Helpful errors.** If a time is taken, the answer is a sentence the assistant can say out loud: "4 pm isn't free on Thursday 8 October. Closest free times: 3, 3:15, 4:30, 4:45, 6:15."

All of this is exposed as a standard MCP server, so Alexa+ can use it, and so can any other MCP client.

## How we built it

- **MCP server on Cloudflare Workers.** The `/mcp` endpoint uses the official `@modelcontextprotocol/sdk` with the web-standard Streamable HTTP transport, targeting spec version 2025-11-25. It runs **stateless**: every request builds a fresh server and transport, and no session id is issued. That fits Workers well — any instance can answer any request.
- **Nine tools, one catalogue.** `src/tools.js` defines each tool once with zod: input schema, output schema, description and annotations (`readOnlyHint` on lookups, `destructiveHint` on cancel). Every tool returns `structuredContent` that matches its declared `outputSchema`, plus a text version.
- **Also a resource and a prompt.** `business://fade-and-co/info` gives an agent the services, hours, deposit rule and today's date in one read. The `book_haircut` prompt opens a booking conversation with the receptionist rules attached.
- **Booking engine.** `src/engine.js` holds the rules: a 15-minute grid, breaks, service length, the same-day buffer, deposits by weekday, phone matching, the waitlist cascade and the owner's notes. Data lives in Cloudflare D1 (SQLite). Times are stored as local wall-clock strings in the business's timezone, so "Saturday at 3" means the same thing everywhere in the code.
- **Agent Skill.** `skills/book-appointment/SKILL.md` packages the conversation rules as an open-standard Agent Skill: offer at most three times, collect name and mobile before booking, never read out IDs, confirm before cancelling.
- **An Alexa+-style simulator.** We didn't have an Alexa+ developer device, so the web page acts as one. You tap the ring and talk (Web Speech API), or type. A small agent loop on Workers AI (Llama 3.3 70B, function calling) calls **the same tool code** the MCP server uses, and the reply is spoken back. A side panel shows every tool call, Marcus's chair for the day and every text message sent.
- **Tests.** `npm test` runs 32 tests with no Cloudflare account: an in-memory SQLite behind a small D1-compatible adapter, a frozen clock, and the official MCP client talking to the Worker's fetch handler in-process.

## Challenges we ran into

- **Testing without a device.** We couldn't put the skill in front of a real Alexa+ device during the build, so we built the simulator. That meant choosing an open model for the agent loop and writing a system prompt close to how a voice assistant should behave. It also meant the tools had to work well for a model we didn't control.
- **Making answers sound right.** A JSON list of 30 free times is correct but useless when spoken. We ended up moving voice rules into three places: tool descriptions ("offer at most three"), error messages written as sentences, and the Agent Skill.
- **Dates and "now".** "Tomorrow afternoon" has to become `2026-10-08` in London time, not UTC. The engine works in the business's timezone and returns spoken dates ("Thursday 8 October") alongside ISO dates, so the assistant never has to format a date itself.
- **Stateless on serverless.** Streamable HTTP supports sessions, but sessions need sticky state, which Workers don't give you for free. Running stateless was simpler and more reliable; the cost is that the server can't push notifications back to the client.
- **Bugs the tests found.** Writing the test suite found real problems: a blank service name silently matched the first service; rescheduling a booking 15 minutes later failed because the old booking blocked the new time; after closing time the assistant said the day was "fully booked"; a customer could join the same waitlist twice and get two texts. All fixed, all covered by tests.

## Accomplishments that we're proud of

- The whole booking loop works by voice: ask, book, reschedule, cancel, waitlist, owner briefing.
- The waitlist refill. A cancellation turns into a text to every waiting customer within the same request, and the owner hears about it without having to act.
- One tool catalogue drives the MCP server, the simulator's agent and the tests, so what we demo is what Alexa+ gets.
- It runs on the Cloudflare free tier. A small shop could run this for nothing.

## What we learned

- For voice, the tool's output is part of the conversation design. Spoken dates, short lists and error messages that already contain the alternative made the biggest difference to how natural the assistant sounded.
- `outputSchema` and `structuredContent` are worth the extra lines. They catch drift between the code and the description, and they give the client something it can check.
- Stateless MCP is a good default on serverless. Keep the state in the database, not the connection.
- Small businesses don't want a dashboard. Marcus's version of success is not having to look at his phone between cuts.

## What's next

- Publish the integration for Alexa+ and test it on real devices with real customers.
- Real messaging (SMS or WhatsApp) and real deposits through a payment link, instead of the demo log.
- "First to reply YES" handled end to end: the first reply books the slot and the others get a polite "it's gone".
- Onboarding for other one-person businesses — nail techs, tattoo artists, dog groomers, physios — from a short form: services, hours, break, deposit day.
- Per-business sign-in for the owner tools, so only Marcus can hear Marcus's takings.

## Built with

Alexa+ · Model Context Protocol (Streamable HTTP, spec 2025-11-25) · `@modelcontextprotocol/sdk` · Agent Skills · Cloudflare Workers · Cloudflare D1 · Workers AI (Llama 3.3 70B) · Web Speech API · zod · JavaScript (ES modules) · Node.js test runner · better-sqlite3
