/* SADIA portrait stage: lightweight, no WebGL/GPU dependency. */
const Avatar = (() => {
  let stage, mouth, wave, caption, state = 'idle', level = 0, blinkTimer = 0;
  const api = { hook: () => 0, set: s => { state = s || 'idle'; } };
  api.init = el => {
    stage = el;
    mouth = document.getElementById('sadia-mouth');
    wave = document.getElementById('voice-wave');
    caption = document.getElementById('avatar-caption');
    const image = document.getElementById('sadia-portrait');
    if (image) image.addEventListener('error', () => { caption.textContent = 'Sadia image could not load'; });
    let last = performance.now();
    const tick = now => {
      requestAnimationFrame(tick);
      const dt = Math.min(.05, (now-last)/1000); last = now;
      let target = 0;
      try { target = Math.max(0, Math.min(1, Number(api.hook()) || 0)); } catch {}
      level += (target-level) * Math.min(1, dt*18);
      const speaking = state === 'talk' || state === 'SPEAKING' || level > .12;
      if (stage) stage.classList.toggle('speaking', speaking);
      if (mouth) {
        const viseme = speaking ? (.12 + level * .95) : .12;
        mouth.style.transform = `translate(-50%,-50%) scaleY(${Math.min(1.5, viseme)})`;
        mouth.style.opacity = speaking ? String(.55 + level*.3) : '0';
      }
      if (caption) caption.textContent =
        state === 'listen' ? 'সাদিয়া তোমার কথা শুনছে' :
        state === 'think' ? 'সাদিয়া ভাবছে…' :
        state === 'talk' ? 'সাদিয়া কথা বলছে' : 'সাদিয়া প্রস্তুত';
      if (wave) wave.classList.toggle('active', speaking);
    };
    requestAnimationFrame(tick);
  };
  return api;
})();
