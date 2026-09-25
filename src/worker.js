// Chair Ready Voice — MCP server (Streamable HTTP) + Alexa+ style voice simulator, on Cloudflare Workers.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { TOOLS, jsonSchemas, runTool, structured } from "./tools.js";
import { BookingError, localNow, recentMessages, ownerBriefing } from "./engine.js";
import { seed } from "./seed.js";
import { PAGE } from "./page.js";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

function mcpServer(env) {
  const server = new McpServer(
    { name: "chair-ready-voice", title: "Chair Ready Voice", version: "1.0.0" },
    { instructions: "Booking tools for small appointment businesses (demo: Fade & Co., a one-chair barbershop in London). Typical flow: get_business_info → find_available_times or next_available → collect name + mobile → book_appointment. Always confirm before cancel_appointment. The resource business://fade-and-co/info has the services, hours and today's date; the prompt book_haircut sets up a voice booking conversation." },
  );
  for (const t of TOOLS) {
    server.registerTool(t.name, {
      title: t.title, description: t.description, inputSchema: t.input, outputSchema: t.output,
      annotations: { readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
    }, async (args) => {
      try {
        const out = await t.run(env.DB, args);
        return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: structured(out) };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: e instanceof BookingError ? e.message : `Error: ${e.message}` }] };
      }
    });
  }

  server.registerResource("fade-and-co-info", "business://fade-and-co/info", {
    title: "Fade & Co. — services, hours and deposit rules",
    description: "Everything an assistant needs before offering times: services with length and price, opening hours with breaks, the Saturday deposit, and today's local date and time.",
    mimeType: "application/json",
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await runTool(env.DB, "get_business_info", { business: "fade-and-co" }), null, 2) }],
  }));

  server.registerPrompt("book_haircut", {
    title: "Book a haircut by voice",
    description: "Starts a voice booking at Fade & Co.: the assistant finds a free time, collects name and mobile, and books.",
    argsSchema: {
      service: z.string().optional().describe('What they want, e.g. "skin fade", "beard trim".'),
      when: z.string().optional().describe('When they want it, in their words, e.g. "tomorrow afternoon", "Saturday".'),
      name: z.string().optional().describe("The customer's name, if already known."),
    },
  }, ({ service, when, name }) => ({
    description: "Voice booking at Fade & Co.",
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `I'd like to book ${service ? `a ${service}` : "a haircut"} at Fade & Co.${when ? ` ${when}.` : ""}${name ? ` My name is ${name}.` : ""}`,
          "",
          "(Receptionist notes: read business://fade-and-co/info or call get_business_info for services and today's date. Turn relative days into YYYY-MM-DD. " +
          "Use find_available_times, or next_available if no day is given. Offer at most three times, spoken naturally. Before book_appointment you need service, date, time, full name and mobile number. " +
          "Mention the £5 deposit on Saturdays. If the day is full, offer join_waitlist and the next free day. Short spoken sentences, no lists, never read out IDs.)",
        ].join("\n"),
      },
    }],
  }));
  return server;
}

async function handleMcp(req, env) {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = mcpServer(env);
  await server.connect(transport);
  return transport.handleRequest(req);
}

// ---- Alexa+ simulator: a small agent loop that calls the same tools ----
function systemPrompt(now) {
  return `You are a voice assistant (like Alexa+) booking appointments at Fade & Co., a one-chair barbershop at 214 Kingsland Road, Dalston, London. The owner Marcus is cutting hair and never answers the phone — you handle everything.
Today is ${now.day} ${now.date}, local time ${now.time} (Europe/London).
Rules:
- Speak like a friendly voice assistant: short sentences, no lists, no markdown, times like "3 pm" or "10:30".
- Use the tools for every fact about services, times and bookings. Never invent times.
- Convert "tomorrow", "Saturday" etc. into a YYYY-MM-DD date yourself before calling tools.
- Offer at most three times in total per reply (never list several days of times). Before booking you need: service, date, time, full name, mobile number.
- Saturdays need a £5 deposit; mention it when relevant.
- If a requested day is full, say so, offer to add them to that day's waitlist, and suggest the single next free day with up to three times.
- To move an existing booking: find_my_booking with their number, then reschedule_appointment (never book a second appointment). Confirm before cancelling.
- After booking, say the confirmation text is on its way.
- NEVER invent or guess a name or phone number. Only call book_appointment or join_waitlist after the customer has said their own name and number in this conversation; otherwise ask for them. Never add anyone to a waitlist unless they asked for it.
- Book exactly the time the customer chose ("half twelve" = 12:30, "quarter past three" = 15:15). If that exact time isn't free, say so and offer the nearest free times instead of booking a different one.
- For the owner's briefing, answer in two or three sentences: number of appointments, takings, the first and last appointment, waitlist size. Never read out the whole list.`;
}

async function agent(env, history) {
  const n = localNow("Europe/London");
  const now = { ...n, day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n.dow] };
  const messages = [{ role: "system", content: systemPrompt(now) }, ...history.slice(-16)];
  const tools = jsonSchemas();
  const trace = [];
  for (let step = 0; step < 6; step++) {
    const r = await env.AI.run(MODEL, { messages, tools, max_tokens: 400, temperature: 0.2 });
    const calls = r.tool_calls || [];
    if (!calls.length) return { reply: (r.response || "").trim(), trace };
    messages.push({ role: "assistant", content: "", tool_calls: calls.map((c, i) => ({ id: `call_${step}_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) } })) });
    for (const [i, c] of calls.entries()) {
      let result;
      try { result = await runTool(env.DB, c.name, c.arguments); }
      catch (e) { result = { error: e.message }; }
      trace.push({ tool: c.name, args: c.arguments, result });
      messages.push({ role: "tool", tool_call_id: `call_${step}_${i}`, name: c.name, content: JSON.stringify(result) });
    }
  }
  return { reply: "Sorry, I got a bit tangled there. Could you say that again?", trace };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" } });
    try {
      if (url.pathname === "/mcp") return await handleMcp(req, env);
      if (url.pathname === "/api/agent" && req.method === "POST") {
        const { messages } = await req.json();
        if (!Array.isArray(messages)) return json({ error: "messages required" }, 400);
        return json(await agent(env, messages.filter((m) => ["user", "assistant"].includes(m.role) && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))));
      }
      if (url.pathname === "/api/state") {
        const today = localNow("Europe/London").date;
        const day = url.searchParams.get("date") || today;
        return json({ today, briefing: await ownerBriefing(env.DB, "fade-and-co", day), messages: await recentMessages(env.DB, "fade-and-co", 10) });
      }
      if (url.pathname === "/api/reset" && req.method === "POST") return json(await seed(env.DB));
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/" || url.pathname === "/index.html") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
