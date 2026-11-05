const W = 'https://version-x.akijelectronic.workers.dev';
const M = {
  manager: ['groq', 'openai/gpt-oss-120b'], chat: ['groq', 'openai/gpt-oss-120b'], memory: ['groq', 'openai/gpt-oss-120b'], reviewer: ['groq', 'openai/gpt-oss-120b'],
  coder: ['openrouter', 'qwen/qwen-2.5-coder-32b-instruct'], writer: ['openrouter', 'meta-llama/llama-3.3-70b-instruct'],
  vision: ['groq', 'llama-3.2-11b-vision-preview'], vision2: ['groq', 'meta-llama/llama-4-scout-17b-16e-instruct']
};
const $ = s => document.querySelector(s);
const ST = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
let facts = ST.get('vx_facts', []), hist = ST.get('vx_hist', []), busy = false, micOn = false, stopFlag = false, speaking = false, scene = '', camOn = false, camTimer, src, rec, torch;

const PERSONA = 'তুমি সাদিয়া, Version X-এর মেয়ে AI সহকারী। বাঙালির মতো সহজ কথ্য বাংলায়, ছোট ছোট বাক্যে, আপন বন্ধুর মতো কথা বলো। বইয়ের ভাষা, markdown, ইমোজি ও তালিকা এড়াও, কারণ উত্তর জোরে পড়ে শোনানো হবে। ব্যবহারকারী সম্পর্কে যা জানো: ';
const MGR = 'তুমি Manager। ব্যবহারকারীর কথা পড়ে শুধু JSON দাও: {"agent":"chat|coder|writer","steps":[...]}। steps এর ধরন: {"tool":"search","q":"..."} অথবা {"tool":"device","cmd":"call|sms|whatsapp|open|flash|vibrate|battery|location|notify|remind|camera","arg":"...","arg2":"..."}। remind এর arg হলো মিনিট, arg2 বার্তা। flash এর arg on/off। camera এর arg on/off। দরকার না হলে steps খালি রাখো। কোড হলে coder, লম্বা লেখা হলে writer, বাকি সব chat।';

// ---------- LLM ----------
async function llm(role, messages, onTok) {
  const m = M[role];
  const r = await fetch(W + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: m[0], model: m[1], messages, stream: !!onTok }) });
  if (!r.ok) throw new Error(await r.text());
  if (!onTok) return (await r.json()).choices[0].message.content;
  const rd = r.body.getReader(), dc = new TextDecoder(); let buf = '', out = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dc.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop();
    for (const l of ls) { if (!l.startsWith('data: ') || l.includes('[DONE]')) continue; try { const t = JSON.parse(l.slice(6)).choices[0].delta.content; if (t) { out += t; onTok(out); } } catch {} }
  }
  return out;
}

// ---------- UI ----------
['MANAGER', 'MEMORY', 'CHAT', 'CODER', 'WRITER'].forEach(a => { const d = document.createElement('div'); d.id = 'ag-' + a; d.textContent = a; $('#agents').append(d); });
const agent = n => document.querySelectorAll('#agents div').forEach(d => d.classList.toggle('work', d.id === 'ag-' + (n || '').toUpperCase()));
const state = s => { $('#state').textContent = s; Avatar.set({ THINKING: 'think', LISTENING: 'listen', SPEAKING: 'talk' }[s] || 'idle'); };
function addMsg(c, t) { const e = document.createElement('div'); e.className = 'm ' + c; e.textContent = t; $('#log').append(e); $('#log').scrollTop = 1e9; return e; }

// ---------- Voice ----------
const AC = new (window.AudioContext || window.webkitAudioContext)(), an = AC.createAnalyser(); an.fftSize = 256; an.connect(AC.destination);
const ab = new Uint8Array(an.fftSize);
Avatar.hook = () => { an.getByteTimeDomainData(ab); let s = 0; for (const v of ab) s += (v - 128) ** 2; return Math.min(1, Math.sqrt(s / ab.length) / 35); };
const getAudio = t => fetch(W + '/tts', { method: 'POST', body: JSON.stringify({ text: t }) }).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => AC.decodeAudioData(b)).catch(() => null);
async function speak(text) {
  const parts = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*#`_>]/g, '').match(/[^।.!?\n]+[।.!?]?/g)?.map(s => s.trim()).filter(Boolean) || [];
  speaking = true; state('SPEAKING');
  let nx = parts[0] && getAudio(parts[0]);
  for (let i = 0; i < parts.length && !stopFlag; i++) {
    const cur = await nx; nx = parts[i + 1] ? getAudio(parts[i + 1]) : null;
    if (cur) { src = AC.createBufferSource(); src.buffer = cur; src.connect(an); src.start(); await new Promise(r => (src.onended = r)); }
    else await new Promise(r => { const u = new SpeechSynthesisUtterance(parts[i]); u.lang = 'bn-BD'; u.onend = r; speechSynthesis.speak(u); });
  }
  speaking = false; state(micOn ? 'LISTENING' : 'IDLE');
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function mic(on) {
  micOn = on; $('#mic').classList.toggle('on', on);
  if (!on) { rec && rec.stop(); return state('IDLE'); }
  if (!SR) return addMsg('a', 'এই ব্রাউজারে ভয়েস ইনপুট নেই।');
  rec = new SR(); rec.lang = 'bn-BD'; rec.continuous = true;
  rec.onresult = e => { const t = e.results[e.results.length - 1][0].transcript.trim(); if (t && !speaking && !busy) run(t); };
  rec.onend = () => { if (micOn) try { rec.start(); } catch {} };
  rec.start(); state('LISTENING');
}

// ---------- Camera / Vision ----------
async function look(q) {
  const v = $('#cam'), c = document.createElement('canvas'); c.width = 512; c.height = v.videoHeight * 512 / v.videoWidth;
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const msgs = [{ role: 'user', content: [{ type: 'text', text: q || 'ছবিতে কী দেখছ? বাংলায় সংক্ষেপে বলো।' }, { type: 'image_url', image_url: { url: c.toDataURL('image/jpeg', .6) } }] }];
  try { return await llm('vision', msgs); } catch { return await llm('vision2', msgs); }
}
async function cam(on) {
  const v = $('#cam'); camOn = on; clearInterval(camTimer);
  if (!on) { v.srcObject?.getTracks().forEach(t => t.stop()); v.hidden = true; scene = ''; return; }
  v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); v.hidden = false; await v.play();
  camTimer = setInterval(async () => { if (!busy && !speaking) try { scene = await look('এক বাক্যে বলো কী দেখছ'); } catch {} }, 8000);
}

// ---------- Device control ----------
const go = url => { const AL = window.Capacitor?.Plugins?.AppLauncher; AL ? AL.openUrl({ url }) : (location.href = url); };
const notify = (t) => { if (Notification.permission === 'granted') new Notification('Sadia', { body: t }); };
const Dev = {
  call: n => (go('tel:' + n), 'কল দিচ্ছি'),
  sms: (n, t) => (go(`sms:${n}?body=${encodeURIComponent(t || '')}`), 'এসএমএস খুলছি'),
  whatsapp: (n, t) => (go(`https://wa.me/${String(n).replace(/\D/g, '')}?text=${encodeURIComponent(t || '')}`), 'হোয়াটসঅ্যাপ খুলছি'),
  open: a => { const U = { youtube: 'https://youtube.com', facebook: 'https://facebook.com', maps: 'https://maps.google.com', gmail: 'https://mail.google.com', whatsapp: 'https://wa.me/' }; go(U[String(a).toLowerCase()] || 'https://www.google.com/search?q=' + encodeURIComponent(a)); return a + ' খুলছি'; },
  flash: async on => {
    if (on === 'off') { torch?.stop(); torch = null; return 'ফ্ল্যাশ বন্ধ'; }
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); torch = s.getVideoTracks()[0];
    await torch.applyConstraints({ advanced: [{ torch: true }] }); return 'ফ্ল্যাশ চালু';
  },
  vibrate: () => (navigator.vibrate?.([200, 100, 200]), 'ভাইব্রেট করলাম'),
  battery: async () => Math.round((await navigator.getBattery()).level * 100) + '% ব্যাটারি',
  location: () => new Promise(r => navigator.geolocation.getCurrentPosition(p => r(`অক্ষাংশ ${p.coords.latitude.toFixed(4)}, দ্রাঘিমাংশ ${p.coords.longitude.toFixed(4)}`), () => r('লোকেশন পাইনি'))),
  notify: t => (notify(t), 'নোটিফিকেশন দিলাম'),
  remind: (min, msg) => { setTimeout(() => { notify(msg); speak(msg); navigator.vibrate?.(300); }, (parseFloat(min) || 1) * 60000); return `${min} মিনিট পর মনে করিয়ে দেব`; },
  camera: async on => { await cam(on !== 'off'); return on === 'off' ? 'ক্যামেরা বন্ধ' : 'ক্যামেরা চালু'; }
};
async function perms() { try { await Notification.requestPermission(); } catch {} navigator.geolocation?.getCurrentPosition(() => {}, () => {}); AC.resume(); try { navigator.wakeLock?.request('screen'); } catch {} }

// ---------- Main pipeline ----------
async function run(text) {
  if (busy || !text) return; busy = true; stopFlag = false; addMsg('u', text); state('THINKING');
  try {
    agent('manager'); let plan = { agent: 'chat', steps: [] };
    try { plan = JSON.parse((await llm('manager', [{ role: 'system', content: MGR }, { role: 'user', content: text }])).match(/\{[\s\S]*\}/)[0]); } catch {}
    const obs = [];
    for (const s of plan.steps || []) {
      if (stopFlag) break;
      try {
        if (s.tool === 'search') obs.push('সার্চ: ' + (await (await fetch(W + '/search?q=' + encodeURIComponent(s.q))).json()).map(x => x.title + ' - ' + x.snippet).join(' | '));
        else if (s.tool === 'device' && Dev[s.cmd]) obs.push(s.cmd + ': ' + await Dev[s.cmd](s.arg, s.arg2));
      } catch (e) { obs.push((s.cmd || s.tool) + ' ব্যর্থ: ' + e.message); }
    }
    const ag = ['chat', 'coder', 'writer'].includes(plan.agent) ? plan.agent : 'chat'; agent(ag);
    const sys = PERSONA + (facts.join('; ') || 'কিছু না') + (scene ? '। ক্যামেরায় এখন দেখা যাচ্ছে: ' + scene : '') + (ag === 'chat' ? '' : '। কাজটা পুরো করো, কোড হলে code block দাও।');
    const el = addMsg('a', '…');
    let ans = await llm(ag, [{ role: 'system', content: sys }, ...hist.slice(-12), { role: 'user', content: text + (obs.length ? '\n\n[টুলের ফলাফল]\n' + obs.join('\n') : '') }], t => { el.textContent = t; $('#log').scrollTop = 1e9; });
    if (ag !== 'chat' && !stopFlag) { agent('manager'); try { ans = await llm('reviewer', [{ role: 'system', content: 'তুমি Reviewer। নিচের উত্তরে ভুল থাকলে ঠিক করে পুরো উত্তরটা আবার দাও, ঠিক থাকলে হুবহু একই দাও।' }, { role: 'user', content: ans }]); el.textContent = ans; } catch {} }
    hist.push({ role: 'user', content: text }, { role: 'assistant', content: ans }); hist = hist.slice(-30); ST.set('vx_hist', hist);
    agent('memory');
    llm('memory', [{ role: 'system', content: 'ব্যবহারকারীর কথা থেকে স্থায়ী গুরুত্বপূর্ণ তথ্য (নাম, পছন্দ, পরিকল্পনা) থাকলে শুধু ছোট বাংলা বাক্যের JSON array দাও, না থাকলে []' }, { role: 'user', content: text }])
      .then(r => { facts = [...new Set([...facts, ...JSON.parse(r.match(/\[[\s\S]*\]/)[0])])].slice(-60); ST.set('vx_facts', facts); }).catch(() => {}).finally(() => agent(''));
    busy = false; if (!stopFlag) await speak(ans);
  } catch (e) { addMsg('a', 'সমস্যা হয়েছে: ' + e.message); state('IDLE'); agent(''); }
  busy = false;
}

$('#send').onclick = () => { perms(); const t = $('#inp').value.trim(); $('#inp').value = ''; run(t); };
$('#inp').onkeydown = e => { if (e.key === 'Enter') $('#send').click(); };
$('#mic').onclick = () => { perms(); mic(!micOn); };
$('#camb').onclick = () => cam(!camOn).catch(e => addMsg('a', 'ক্যামেরা পাইনি: ' + e.message));
$('#stop').onclick = () => { stopFlag = true; try { src?.stop(); } catch {} speechSynthesis.cancel(); };
Avatar.init($('#stage'));
navigator.serviceWorker?.register('sw.js');
