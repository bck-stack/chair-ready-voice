export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chair Ready Voice — Alexa+ booking for a one-chair barbershop</title>
<style>
:root{--bg:#07090d;--panel:#0f141c;--line:#1d2633;--text:#e8edf5;--mute:#8b97a8;--cyan:#27d3f5;--blue:#1a73ff;--gold:#c9a227;--red:#ff5d6c;--green:#35d08a}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;gap:14px;padding:18px 28px;border-bottom:1px solid var(--line)}
header b{font-size:18px;letter-spacing:.3px}header span{color:var(--mute);font-size:13px}
header .tag{margin-left:auto;font-size:12px;color:var(--mute);border:1px solid var(--line);padding:4px 10px;border-radius:99px}
main{display:grid;grid-template-columns:minmax(360px,1fr) minmax(380px,1.1fr);gap:22px;padding:22px 28px;max-width:1400px;margin:0 auto}
@media(max-width:900px){main{grid-template-columns:1fr;padding:16px}}
.device{background:radial-gradient(120% 90% at 50% 0%,#101a2a 0%,#070a10 70%);border:1px solid var(--line);border-radius:28px;padding:26px;display:flex;flex-direction:column;min-height:640px}
.ringwrap{display:flex;justify-content:center;margin:6px 0 16px}
.ring{width:132px;height:132px;border-radius:50%;border:6px solid #16324a;box-shadow:0 0 0 0 rgba(39,211,245,.0);transition:all .25s;display:grid;place-items:center;cursor:pointer;background:#0a1320}
.ring svg{width:44px;height:44px;fill:#5d7a95}
.ring.listen{border-color:var(--cyan);box-shadow:0 0 38px 6px rgba(39,211,245,.45)}.ring.listen svg{fill:var(--cyan)}
.ring.think{border-color:var(--blue);animation:spin 1.1s linear infinite;border-top-color:var(--cyan)}
.ring.speak{border-color:var(--cyan);animation:pulse 1s ease-in-out infinite}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{box-shadow:0 0 44px 10px rgba(39,211,245,.5)}}
.hint{text-align:center;color:var(--mute);font-size:13px;margin-bottom:10px}
#chat{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:4px 2px 10px;max-height:420px}
.u,.a{max-width:86%;padding:10px 14px;border-radius:16px;font-size:15.5px}
.u{align-self:flex-end;background:#1b2636;border-bottom-right-radius:4px}.a{align-self:flex-start;background:#0e2233;border:1px solid #173a52;border-bottom-left-radius:4px}
.a .who{font-size:11px;color:var(--cyan);letter-spacing:.6px;text-transform:uppercase;display:block;margin-bottom:2px}
form{display:flex;gap:8px;margin-top:10px}input{flex:1;background:#0b111a;border:1px solid var(--line);color:var(--text);border-radius:12px;padding:12px 14px;font:inherit}
button{background:#15202e;color:var(--text);border:1px solid var(--line);border-radius:12px;padding:10px 14px;font:inherit;cursor:pointer}button:hover{border-color:#2d3d52}
.send{background:var(--blue);border-color:var(--blue)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.chips button{font-size:13px;padding:7px 11px;border-radius:99px;color:#b9c6d6}
.side{display:flex;flex-direction:column;gap:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px 18px}
.card h3{margin:0 0 10px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--mute);display:flex;align-items:center;gap:8px}
.card h3 .dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
#trace{font:12.5px/1.45 Consolas,monospace;max-height:210px;overflow:auto}
.call{border-left:2px solid var(--cyan);padding:4px 0 6px 10px;margin-bottom:8px}.call .n{color:var(--cyan)}.call .r{color:#9fb0c3;white-space:pre-wrap;word-break:break-word}
.call.err{border-color:var(--red)}.call.err .n{color:var(--red)}
.chair{display:flex;flex-direction:column;gap:6px;max-height:250px;overflow:auto}
.slot{display:flex;gap:12px;align-items:center;background:#121a25;border:1px solid var(--line);border-radius:10px;padding:7px 11px;font-size:14px}
.slot .t{font-variant-numeric:tabular-nums;color:var(--mute);width:92px}.slot.new{border-color:var(--cyan);box-shadow:0 0 0 1px rgba(39,211,245,.3)}
.badge{margin-left:auto;font-size:11px;padding:2px 7px;border-radius:99px;border:1px solid var(--line);color:var(--mute)}.badge.v{color:var(--cyan);border-color:#1f4d63}.badge.d{color:var(--gold);border-color:#5a4a16}
.msg{font-size:13.5px;border-bottom:1px solid var(--line);padding:8px 0}.msg:last-child{border:0}.msg .to{color:var(--mute);font-size:12px}
.row{display:flex;gap:10px;align-items:center;justify-content:space-between}.small{font-size:12px;color:var(--mute)}
select{background:#0b111a;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:4px 8px}
footer{color:var(--mute);font-size:12px;text-align:center;padding:10px 0 24px}
code{background:#111a26;padding:1px 6px;border-radius:6px}
</style></head><body>
<header><b>Chair Ready Voice</b><span>Alexa+ booking for Fade &amp; Co., a one-chair barbershop in Dalston, London</span><span class="tag">MCP server · Streamable HTTP · <code>/mcp</code></span></header>
<main>
<section class="device">
  <div class="ringwrap"><div class="ring" id="ring" title="Tap to talk"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1a7 7 0 0 0 6-6.9h-2z"/></svg></div></div>
  <div class="hint" id="hint">Tap the ring and speak, or type below. Try “Alexa, book me a skin fade at Fade &amp; Co.”</div>
  <div id="chat"></div>
  <form id="f"><input id="q" autocomplete="off" placeholder="Say or type something to Alexa…"><button class="send">Send</button></form>
  <div class="chips">
    <button data-q="Alexa, can I get a skin fade at Fade and Co tomorrow afternoon?">Skin fade tomorrow</button>
    <button data-q="When's the next free slot for a beard trim?">Next beard trim</button>
    <button data-q="Can I get a haircut this Saturday?">This Saturday</button>
    <button data-q="I need to cancel my appointment, my number is 07700 900777">Cancel my booking</button>
    <button data-q="I'm Marcus, the owner. What does my day look like?">Owner: my day</button>
  </div>
</section>
<section class="side">
  <div class="card"><h3><span class="dot"></span>Behind the scenes — MCP tool calls</h3><div id="trace"><div class="small">Tool calls from the voice assistant appear here.</div></div></div>
  <div class="card"><div class="row"><h3 style="margin:0">Marcus's chair</h3><select id="day"></select></div><div class="small" id="sum" style="margin:8px 0"></div><div class="chair" id="chair"></div></div>
  <div class="card"><h3>Messages sent automatically</h3><div id="msgs"></div></div>
  <div class="row small"><span>Demo data resets on demand.</span><button id="reset">Reset demo</button></div>
</section>
</main>
<footer>Chair Ready Voice · open source · the same tools are exposed to any MCP client at <code>/mcp</code></footer>
<script>
const $=s=>document.querySelector(s), chat=$("#chat"), ring=$("#ring");
let history=[], lastIds=new Set(), speaking=false;
function add(role,text){const d=document.createElement("div");d.className=role==="user"?"u":"a";d.innerHTML=role==="user"?"":'<span class="who">Alexa</span>';d.appendChild(document.createTextNode(text));chat.appendChild(d);chat.scrollTop=1e9}
function state(s){ring.className="ring"+(s?" "+s:"")}
function say(text){if(!("speechSynthesis" in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);const v=speechSynthesis.getVoices().find(v=>/en-(GB|US)/.test(v.lang)&&/female|Sonia|Libby|Jenny|Aria|Samantha|Google UK English Female/i.test(v.name))||speechSynthesis.getVoices().find(v=>/^en/.test(v.lang));if(v)u.voice=v;u.rate=1.04;u.onstart=()=>state("speak");u.onend=()=>state("");speechSynthesis.speak(u)}
function showTrace(trace){if(!trace||!trace.length)return;const box=$("#trace");if(box.querySelector(".small"))box.innerHTML="";for(const t of trace){const d=document.createElement("div");d.className="call"+(t.result&&t.result.error?" err":"");const r=JSON.stringify(t.result);d.innerHTML='<div class="n">→ '+t.tool+'('+esc(JSON.stringify(t.args||{}))+')</div><div class="r">'+esc(r.length>260?r.slice(0,260)+"…":r)+'</div>';box.appendChild(d)}box.scrollTop=1e9}
function esc(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
async function ask(text){if(!text.trim())return;add("user",text);history.push({role:"user",content:text});state("think");
 try{const r=await fetch("/api/agent",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:history})}).then(r=>r.json());
  const reply=r.reply||r.error||"Sorry, something went wrong.";history.push({role:"assistant",content:reply});add("assistant",reply);showTrace(r.trace);say(reply);
  const booked=(r.trace||[]).find(t=>/book_appointment|reschedule/.test(t.tool)&&t.result&&!t.result.error);if(booked&&booked.result.date)$("#day").value=booked.result.date;await refresh(true)}
 catch(e){add("assistant","Sorry, I couldn't reach the shop just now.")}finally{if(!speechSynthesis.speaking)state("")}}
$("#f").onsubmit=e=>{e.preventDefault();const v=$("#q").value;$("#q").value="";ask(v)};
document.querySelectorAll(".chips button").forEach(b=>b.onclick=()=>ask(b.dataset.q));
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
ring.onclick=()=>{if(!SR){$("#hint").textContent="Voice input needs Chrome or Edge — type instead.";return}speechSynthesis.cancel();const r=new SR();r.lang="en-GB";r.interimResults=false;state("listen");r.onresult=e=>ask(e.results[0][0].transcript);r.onerror=()=>state("");r.onend=()=>{if(ring.className.includes("listen"))state("")};r.start()};
function fillDays(today){const s=$("#day");if(s.options.length)return;const n=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];for(let i=0;i<8;i++){const d=new Date(today+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+i);const v=d.toISOString().slice(0,10);s.add(new Option((i===0?"Today · ":i===1?"Tomorrow · ":"")+n[d.getUTCDay()]+" "+d.getUTCDate(),v))}s.onchange=()=>refresh()}
async function refresh(flash){const sel=$("#day").value;const r=await fetch("/api/state"+(sel?"?date="+sel:"")).then(r=>r.json());fillDays(r.today);if(!sel)$("#day").value=r.today;
 const b=r.briefing;$("#sum").textContent=b.day+" · "+b.appointments+" appointments · £"+b.takings+(b.waitlist?" · "+b.waitlist+" on waitlist":"");
 $("#chair").innerHTML=b.schedule.length?b.schedule.map(s=>{const k=s.time+s.customer;const isNew=flash&&!lastIds.has(k)&&lastIds.size;return '<div class="slot'+(isNew?" new":"")+'"><span class="t">'+s.time+"–"+s.until+"</span><span>"+esc(s.customer)+" · "+esc(s.service)+"</span>"+(s.via&&s.via.startsWith("voice")?'<span class="badge v">via voice</span>':s.deposit?'<span class="badge d">£'+s.deposit+' deposit</span>':'<span class="badge">online</span>')+"</div>"}).join(""):'<div class="small">No appointments — closed or empty.</div>';
 lastIds=new Set(b.schedule.map(s=>s.time+s.customer));
 $("#msgs").innerHTML=r.messages.length?r.messages.slice(0,5).map(m=>'<div class="msg"><div class="to">→ '+esc(m.recipient)+" · "+m.kind.replace("_"," ")+"</div>"+esc(m.body)+"</div>").join(""):'<div class="small">Confirmations, reminders and waitlist offers appear here.</div>'}
$("#reset").onclick=async()=>{await fetch("/api/reset",{method:"POST"});history=[];chat.innerHTML="";$("#trace").innerHTML='<div class="small">Tool calls from the voice assistant appear here.</div>';lastIds=new Set();await refresh()};
refresh();if("speechSynthesis" in window)speechSynthesis.onvoiceschanged=()=>{};
</script></body></html>`;
