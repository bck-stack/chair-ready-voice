// Chair Ready Voice — MCP server (Streamable HTTP) + Alexa+ style voice simulator, on Cloudflare Workers.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { TOOLS, jsonSchemas, runTool } from "./tools.js";
import { BookingError, localNow, recentMessages, ownerBriefing } from "./engine.js";
import { seed } from "./seed.js";
import { PAGE } from "./page.js";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

function mcpServer(env) {
  const server = new McpServer(
    { name: "chair-ready-voice", title: "Chair Ready Voice", version: "1.0.0" },
    { instructions: "Booking tools for small appointment businesses (demo: Fade & Co., a one-chair barbershop in London). Typical flow: get_business_info → find_available_times or next_available → collect name + mobile → book_appointment. Always confirm before cancel_appointment." },
  );
  for (const t of TOOLS) {
    server.registerTool(t.name, {
      title: t.title, description: t.description, inputSchema: t.input,
      annotations: { readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
    }, async (args) => {
      try {
        const out = await t.run(env.DB, args);
        return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: Array.isArray(out) ? { items: out } : out };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: e instanceof BookingError ? e.message : `Error: ${e.message}` }] };
      }
    });
  }
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
- After booking, say the confirmation text is on its way.`;
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
