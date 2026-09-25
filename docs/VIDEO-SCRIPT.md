# Demo video script — 2:45

**Format:** screen recording of the live simulator (https://chair-ready-voice.sitecheck-api.workers.dev) at 1920×1080, with a few seconds of b-roll at the start. Voice-over recorded separately. Customer lines are spoken into the simulator (or typed if the mic picks up noise) — keep them word for word so the tool calls match.

**Before recording:**
- `POST /api/reset` to load fresh demo data. The seed puts a full Saturday with two people on its waitlist (Tunde and Callum).
- Look up the number of Saturday's 09:00 booking (the seed numbers phones in booking order, so it depends on the weekday): `npx wrangler d1 execute chair-ready-voice --remote --command "SELECT customer, phone FROM bookings WHERE start LIKE '%09:00' AND status='booked'"`.
- Pick a recording day between Tuesday and Friday, so "tomorrow" is an open day and "Saturday" is the full one.
- Browser zoom 110%. Right-hand panel visible: tool calls, Marcus's chair, messages.
- Hide bookmarks bar and notifications.

---

| Time | On screen | Voice-over / audio |
|---|---|---|
| **0:00–0:20** | **The problem.** B-roll or stills: a barber mid-cut, a phone face-down on the counter buzzing. Text overlay builds line by line: *"~40 booking messages a day"* · *"1 in 5 Saturday no-shows"* · *"Same-day cancellations, nobody to fill them."* | "This is Marcus. He runs Fade & Co., a one-chair barbershop in Dalston. Around forty booking messages a day arrive while he's holding clippers. By the time he replies, the customer has gone somewhere else. One in five Saturday bookings don't show. And when someone cancels, the slot stays empty." |
| **0:20–0:30** | Title card: **Chair Ready Voice** — *Voice booking for one-person businesses, through Alexa+.* Cut to the simulator page. | "Chair Ready Voice lets Alexa+ run his diary. Here's what that sounds like." |
| **0:30–1:00** | **A customer books by voice.** Tap the ring. Customer: *"Can I get a skin fade at Fade & Co. tomorrow afternoon?"* Tool calls panel lights up: `find_available_times`. Assistant offers three times. Customer: *"Half twelve, please. It's Jordan Lee, 07700 900555."* Panel: `book_appointment`. Zoom on the Messages panel: confirmation text to Jordan, owner note to Marcus. | "The assistant checks the real diary — opening hours, his lunch break, other bookings, how long a skin fade takes — and offers three times. Jordan picks one, gives a name and number, and it's booked. Jordan gets a text. Marcus gets one line: nothing for you to do." |
| **1:00–1:25** | **A full Saturday → waitlist.** Customer: *"What about Saturday morning?"* Panel: `find_available_times` → empty list, note "Fully booked — the waitlist is open." Assistant offers the waitlist and the next free day. Customer: *"Put me on the waitlist."* Panel: `join_waitlist` → position 3. | "Saturday is full. Instead of a dead end, the assistant offers the waitlist and the next free day. Jordan is third in the queue. Saturdays also carry a five-pound deposit — that's how Marcus cuts no-shows." |
| **1:25–1:55** | **A cancellation refills the slot.** New conversation. Customer (a Saturday regular): *"I need to cancel my Saturday cut. My number is 07700 900 ___."* (Saturday 09:00's number, see prep.) Panel: `find_my_booking`. Assistant: *"Your skin fade on Saturday at 9, shall I cancel it?"* Customer: *"Yes."* Panel: `cancel_appointment` → `waitlist_notified: 3`. Messages panel fills: cancellation + refund note to the customer, three "9 am just opened" texts (Tunde, Callum, Jordan), owner note. | "Someone cancels their Saturday slot. The assistant finds the booking from their number, checks before cancelling, and refunds the deposit. Then, in the same moment, everyone on Saturday's waitlist gets a text: nine o'clock just opened, first to reply gets it. The empty chair is back on offer before Marcus has finished his current cut." |
| **1:55–2:15** | **The owner's briefing.** New conversation. Marcus: *"What does my Saturday look like?"* Panel: `owner_daily_briefing`. Assistant reads a short summary. The "Marcus's chair" panel shows the day's timeline with one gap highlighted. | "Between clients, Marcus asks one question and hears his day: how many appointments, what he'll take, who's on the waitlist, and how many bookings came in by voice this week." |
| **2:15–2:35** | **Under the hood: MCP.** Split screen: left, the tool calls panel scrolling through the calls from the demo; right, a terminal running `node test/mcp-client.mjs` showing the tool list, the `business://fade-and-co/info` resource and the `book_haircut` prompt. Brief flash of `npm test` → 32 passing. | "Everything you just saw is a standard MCP server on Cloudflare Workers — nine tools, each with a typed output, plus a resource and a prompt. Alexa+ calls it over Streamable HTTP. The simulator uses exactly the same tool code, and the booking rules are covered by tests." |
| **2:35–2:45** | End card: Fade & Co. logo, the MCP URL, the repo name. Small line: *"Nail techs, tattoo artists, groomers — any one-person diary."* | "Marcus keeps cutting. The assistant keeps the chair full. Chair Ready Voice." |

---

## Notes for the edit

- Keep the tool-call panel readable: zoom or crop to it for one second each time a new call appears.
- If the model phrases a reply differently from the script, keep it — don't re-record for wording. Re-record only if a tool call is missing.
- Captions on throughout (many judges watch muted).
- Total narration is about 330 words; at a relaxed pace that fits 2:45 with room for the customer lines.
