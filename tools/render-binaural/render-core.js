/* ================================================================
 * PRZESTRZEŃ RELAKSU — rdzeń renderujący
 * ================================================================
 * Jeden graf audio, dwa zastosowania:
 *   • render offline   (OfflineAudioContext) → plik WAV
 *   • podsłuch na żywo (AudioContext)        → strojenie parametrów uchem
 *
 * Graf budują te same funkcje w obu trybach, więc podsłuch i plik wynikowy
 * nie mogą się rozjechać.
 *
 * Powód istnienia narzędzia: aplikacja składa przestrzeń w czasie rzeczywistym
 * w przeglądarce słuchacza, więc pliki źródłowe (głos = mono) same w sobie
 * nie niosą przestrzenności. Do dokumentacji potrzebny jest plik, który tę
 * przestrzenność ma zapisaną na stałe.
 *
 * Sfinansowano ze środków Krajowego Planu Odbudowy i Zwiększania Odporności,
 * inwestycja A2.5.1 — program stypendialny NIMIT.
 * Umowa nr 143/KPO.STYPENDIA/NIMIT/2025
 * ================================================================ */

'use strict';

/* ---------- deterministyczny PRNG (mulberry32) ---------- */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- odpowiedź impulsowa: wzór z createImpulseResponse() w script.js,
              ale z ziarna zamiast Math.random() — dzięki temu render jest powtarzalny ---------- */
function buildImpulseResponse(ctx, duration, decay, seed) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);
  const rand = makeRandom(seed);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/* ---------- azymut / elewacja / odległość → kartezjański (jak convert3DToCartesian) ---------- */
function toCartesian(azimuth, elevation, distance) {
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return {
    x: distance * Math.cos(el) * Math.sin(az),
    y: distance * Math.sin(el),
    z: -distance * Math.cos(el) * Math.cos(az)
  };
}

function setPannerPosition(panner, azimuth, elevation, distance) {
  const c = toCartesian(azimuth, elevation, distance);
  if (panner.positionX) {
    panner.positionX.value = c.x;
    panner.positionY.value = c.y;
    panner.positionZ.value = c.z;
  } else {
    panner.setPosition(c.x, c.y, c.z);   // starsze Safari
  }
}

function setVoicePosition(panner, voicePositions, name) {
  const p = voicePositions[name] || voicePositions.center;
  if (panner.positionX) {
    panner.positionX.value = p.x;
    panner.positionY.value = p.y;
    panner.positionZ.value = p.z;
  } else {
    panner.setPosition(p.x, p.y, p.z);
  }
}

/* ================================================================
 * BUDOWA GRAFU — wspólna dla obu trybów
 * ================================================================ */

/** spatialBus (głos + obiekty) → dry/wet → master; ambientBus (sceny) → master.
 *  Układ 1:1 z initAudioContext() w script.js. */
function buildBuses(ctx, cfg, irSeed) {
  const master = ctx.createGain();
  master.gain.value = cfg.masterVolume;
  master.connect(ctx.destination);

  const spatialBus = ctx.createGain();
  const ambientBus = ctx.createGain();
  ambientBus.connect(master);

  const dry = ctx.createGain();
  dry.gain.value = cfg.dryLevel;
  spatialBus.connect(dry);
  dry.connect(master);

  const send = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = buildImpulseResponse(ctx, cfg.reverbDuration, cfg.reverbDecay, irSeed);
  const wet = ctx.createGain();
  wet.gain.value = cfg.wetLevel;
  spatialBus.connect(send);
  send.connect(conv);
  conv.connect(wet);
  wet.connect(master);

  return { master, spatialBus, ambientBus, dry, wet, send, conv };
}

/** Łańcuch głosu: gain → panner(equalpower) → spatialBus. Zwraca węzły, bez źródła. */
function buildVoiceChain(ctx, buses, cfg, voicePositions, voice) {
  const gain = ctx.createGain();
  gain.gain.value = voice.volume;
  const panner = ctx.createPanner();
  panner.panningModel = cfg.voicePanningModel;
  setVoicePosition(panner, voicePositions, voice.position);
  gain.connect(panner);
  panner.connect(buses.spatialBus);
  return { gain, panner };
}

/** Łańcuch obiektu punktowego: gain → panner(HRTF) → spatialBus. */
function buildObjectChain(ctx, buses, cfg, obj) {
  const gain = ctx.createGain();
  gain.gain.value = obj.volume;
  const panner = ctx.createPanner();
  panner.panningModel = cfg.objectPanningModel;
  panner.distanceModel = cfg.distanceModel;
  panner.refDistance = cfg.refDistance;
  panner.rolloffFactor = cfg.rolloffFactor;
  panner.maxDistance = cfg.maxDistance;
  setPannerPosition(panner, obj.azimuth, obj.elevation, obj.distance);
  gain.connect(panner);
  panner.connect(buses.spatialBus);
  return { gain, panner };
}

/** Scena tła: binauralne stereo prosto na ambientBus, bez panera. */
function buildSceneChain(ctx, buses, scene) {
  const gain = ctx.createGain();
  gain.gain.value = scene.volume;
  gain.connect(buses.ambientBus);
  return { gain };
}

/* ================================================================
 * RENDER OFFLINE
 * ================================================================ */

async function fetchDecoded(ctx, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nie udało się pobrać ' + url + ' (HTTP ' + res.status + ')');
  return await ctx.decodeAudioData(await res.arrayBuffer());
}

/** Zapętla źródło na całą długość renderu, z wejściem i wyjściem. */
function loopToLength(ctx, buffer, gainNode, totalSeconds, fadeSeconds) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gainNode);
  src.start(0);
  src.stop(totalSeconds);
  if (fadeSeconds > 0) {
    const g = gainNode.gain;
    const target = g.value;
    g.setValueAtTime(0, 0);
    g.linearRampToValueAtTime(target, Math.min(fadeSeconds, totalSeconds / 2));
    g.setValueAtTime(target, Math.max(0, totalSeconds - fadeSeconds));
    g.linearRampToValueAtTime(0, totalSeconds);
  }
  return src;
}

/**
 * Renderuje jeden preset do AudioBuffer (stereo).
 * @param {object} cfg     — sekcja `engine`
 * @param {object} pos     — sekcja `voicePositions`
 * @param {object} preset
 * @param {string} baseUrl — przedrostek ścieżek do zasobów
 * @param {function} onProgress
 * @param {object}  opts   — { maxSeconds, offsetSeconds } dla renderu fragmentu
 */
async function renderPreset(cfg, pos, preset, baseUrl, onProgress, opts) {
  const log = onProgress || function () {};
  const o = opts || {};
  const url = (p) => (baseUrl ? baseUrl.replace(/\/$/, '') + '/' : '') + p;

  log('dekodowanie głosu…');
  const probe = new OfflineAudioContext(2, cfg.sampleRate, cfg.sampleRate);
  const voiceBuf = await fetchDecoded(probe, url(preset.voice.file));

  const offset = Math.max(0, o.offsetSeconds || 0);
  const voiceLen = o.maxSeconds
    ? Math.min(o.maxSeconds, Math.max(0, voiceBuf.duration - offset))
    : voiceBuf.duration - offset;
  const totalSeconds = voiceLen + cfg.reverbTailSeconds;
  const frames = Math.ceil(totalSeconds * cfg.sampleRate);
  log('długość renderu: ' + totalSeconds.toFixed(1) + ' s');

  const ctx = new OfflineAudioContext(2, frames, cfg.sampleRate);
  const buses = buildBuses(ctx, cfg, preset.irSeed);

  /* głos */
  const vBuf = await fetchDecoded(ctx, url(preset.voice.file));
  const v = buildVoiceChain(ctx, buses, cfg, pos, preset.voice);
  const vSrc = ctx.createBufferSource();
  vSrc.buffer = vBuf;
  vSrc.connect(v.gain);
  vSrc.start(0, offset, voiceLen);

  /* scena tła */
  if (preset.scene) {
    log('dekodowanie sceny ' + preset.scene.id + '…');
    const sBuf = await fetchDecoded(ctx, url(preset.scene.file));
    const s = buildSceneChain(ctx, buses, preset.scene);
    loopToLength(ctx, sBuf, s.gain, totalSeconds, cfg.sceneFadeSeconds);
  }

  /* obiekty punktowe */
  for (const obj of preset.objects || []) {
    log('dekodowanie obiektu ' + obj.id + '…');
    const oBuf = await fetchDecoded(ctx, url(obj.file));
    const oc = buildObjectChain(ctx, buses, cfg, obj);
    loopToLength(ctx, oBuf, oc.gain, totalSeconds, cfg.sceneFadeSeconds);
  }

  log('renderowanie…');
  return await ctx.startRendering();
}

/* ================================================================
 * PODSŁUCH NA ŻYWO
 * ================================================================
 * Głos i scena idą przez <audio> + createMediaElementSource() — strumieniowo,
 * bez decodeAudioData(). Trzynastominutowy plik to inaczej ~307 MB float32
 * w pamięci i kilka sekund czekania przed pierwszym dźwiękiem.
 * Krótkie obiekty zostają na AudioBuffer, bo tylko AudioBufferSourceNode
 * zapętla próbkowo dokładnie.
 * ================================================================ */

function createPreview(cfg, pos, preset, baseUrl) {
  const url = (p) => (baseUrl ? baseUrl.replace(/\/$/, '') + '/' : '') + p;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buses = buildBuses(ctx, cfg, preset.irSeed);

  const media = [];
  const objects = Object.create(null);

  /* głos */
  const voiceEl = new Audio();
  voiceEl.src = url(preset.voice.file);
  voiceEl.preload = 'auto';
  media.push(voiceEl);
  const voice = buildVoiceChain(ctx, buses, cfg, pos, preset.voice);
  ctx.createMediaElementSource(voiceEl).connect(voice.gain);

  /* scena tła */
  let scene = null, sceneEl = null;
  if (preset.scene) {
    sceneEl = new Audio();
    sceneEl.src = url(preset.scene.file);
    sceneEl.loop = true;
    sceneEl.preload = 'auto';
    media.push(sceneEl);
    scene = buildSceneChain(ctx, buses, preset.scene);
    ctx.createMediaElementSource(sceneEl).connect(scene.gain);
  }

  /* obiekty — wymagają dekodowania, więc ładują się asynchronicznie */
  const ready = Promise.all((preset.objects || []).map(async (obj) => {
    const buf = await fetchDecoded(ctx, url(obj.file));
    const chain = buildObjectChain(ctx, buses, cfg, obj);
    objects[obj.id] = { gain: chain.gain, panner: chain.panner, buffer: buf, src: null };
  }));

  function startObjects() {
    Object.keys(objects).forEach((id) => {
      const o = objects[id];
      if (o.src) return;
      const src = ctx.createBufferSource();
      src.buffer = o.buffer;
      src.loop = true;
      src.connect(o.gain);
      src.start(0);
      o.src = src;
    });
  }
  function stopObjects() {
    Object.keys(objects).forEach((id) => {
      const o = objects[id];
      if (!o.src) return;
      try { o.src.stop(); } catch (e) { /* już zatrzymane */ }
      o.src.disconnect();
      o.src = null;
    });
  }

  return {
    ctx, buses, voice, scene, objects, ready,
    get currentTime() { return voiceEl.currentTime; },
    get duration() { return voiceEl.duration || 0; },
    get playing() { return !voiceEl.paused; },

    async play(fromSeconds) {
      await ready;
      if (ctx.state === 'suspended') await ctx.resume();
      if (typeof fromSeconds === 'number' && isFinite(fromSeconds)) {
        /* Bez metadanych przypisanie currentTime jest ignorowane — trzeba na nie poczekać. */
        if (voiceEl.readyState < 1) {
          await new Promise(function (res) {
            var done = function () { voiceEl.removeEventListener('loadedmetadata', done); res(); };
            voiceEl.addEventListener('loadedmetadata', done);
            setTimeout(done, 5000);
          });
        }
        var d = voiceEl.duration;
        voiceEl.currentTime = isFinite(d) ? Math.max(0, Math.min(fromSeconds, d - 1)) : fromSeconds;
      }
      startObjects();
      await voiceEl.play();
      if (sceneEl) await sceneEl.play();
    },
    pause() {
      voiceEl.pause();
      if (sceneEl) sceneEl.pause();
      stopObjects();
    },
    seek(seconds) {
      const d = voiceEl.duration || seconds;
      voiceEl.currentTime = Math.max(0, Math.min(seconds, d));
    },

    /* --- strojenie w locie --- */
    setMaster(v) { buses.master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setDry(v)    { buses.dry.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setWet(v)    { buses.wet.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setVoiceVolume(v) { voice.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setVoicePos(name) { setVoicePosition(voice.panner, pos, name); },
    setSceneVolume(v) { if (scene) scene.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    setObjectVolume(id, v) { if (objects[id]) objects[id].gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    setObjectPosition(id, az, el, dist) {
      if (objects[id]) setPannerPosition(objects[id].panner, az, el, dist);
    },
    /* Zmiana pogłosu wymaga przebudowy IR — tanio, to kilkadziesiąt tysięcy próbek. */
    rebuildReverb(duration, decay, seed) {
      buses.conv.buffer = buildImpulseResponse(ctx, duration, decay, seed);
    },

    destroy() {
      stopObjects();
      media.forEach((el) => { el.pause(); el.removeAttribute('src'); el.load(); });
      if (ctx.state !== 'closed') ctx.close();
    }
  };
}

/* ================================================================
 * AudioBuffer → WAV (PCM 24-bit)
 * ================================================================ */

function bufferToWav24(buffer) {
  const chans = buffer.numberOfChannels;
  const frames = buffer.length;
  const rate = buffer.sampleRate;
  const bytesPerSample = 3;
  const blockAlign = chans * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  ws(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chans, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  ws(36, 'data');
  view.setUint32(40, dataSize, true);

  const data = [];
  for (let ch = 0; ch < chans; ch++) data.push(buffer.getChannelData(ch));

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < chans; ch++) {
      let s = data[ch][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      const v = Math.round(s * 8388607);
      view.setUint8(off, v & 0xFF);
      view.setUint8(off + 1, (v >> 8) & 0xFF);
      view.setUint8(off + 2, (v >> 16) & 0xFF);
      off += 3;
    }
  }
  return out;
}

/* ================================================================
 * Metadane renderu — format zgodny z SAL_SCENA_*_META.txt
 * ================================================================ */

function buildMetaText(cfg, preset, info) {
  const i = info || {};
  const L = [];
  const line = '════════════════════════════════════════';
  L.push('SAL — Spatial Audio Lab · Przestrzeń Relaksu');
  L.push(line);
  L.push('Plik: ' + preset.slug);
  L.push('Medytacja: ' + preset.title);
  if (preset.skrypt) L.push('Skrypt źródłowy: ' + preset.skrypt);
  if (i.renderDate) L.push('Data renderu: ' + i.renderDate);
  if (i.seconds) L.push('Czas trwania: ' + i.seconds.toFixed(1) + ' s');
  L.push('Format: WAV stereo, ' + cfg.sampleRate + ' Hz, PCM 24-bit');
  L.push('Ziarno pogłosu (irSeed): ' + preset.irSeed + '  — render jest powtarzalny');
  L.push('');
  L.push('Parametry globalne');
  L.push('────────────────────────────────────────');
  L.push('  master ................ ' + cfg.masterVolume);
  L.push('  dry ................... ' + cfg.dryLevel);
  L.push('  wet ................... ' + cfg.wetLevel);
  L.push('  pogłos: długość ....... ' + cfg.reverbDuration + ' s');
  L.push('  pogłos: zanikanie ..... ' + cfg.reverbDecay);
  L.push('  ogon pogłosu .......... ' + cfg.reverbTailSeconds + ' s');
  L.push('  wejście/wyjście tła ... ' + cfg.sceneFadeSeconds + ' s');
  L.push('  model odległości ...... ' + cfg.distanceModel
        + ' (ref ' + cfg.refDistance + ' m, rolloff ' + cfg.rolloffFactor + ', max ' + cfg.maxDistance + ' m)');
  L.push('');
  L.push('Głos');
  L.push('────────────────────────────────────────');
  L.push('  plik .................. ' + preset.voice.file);
  L.push('  pozycja ............... ' + preset.voice.position + ' (panner ' + cfg.voicePanningModel + ')');
  L.push('  głośność .............. ' + preset.voice.volume);
  L.push('');
  if (preset.scene) {
    L.push('Scena tła');
    L.push('────────────────────────────────────────');
    L.push('  id .................... ' + preset.scene.id);
    L.push('  plik .................. ' + preset.scene.file);
    L.push('  głośność .............. ' + preset.scene.volume);
    L.push('');
  }
  L.push('Obiekty punktowe 3D (panner ' + cfg.objectPanningModel + ')');
  L.push('────────────────────────────────────────');
  (preset.objects || []).forEach((o, n) => {
    L.push(String(n + 1).padStart(2, '0') + '. ' + o.id);
    L.push('    plik .............. ' + o.file);
    L.push('    azymut ............ ' + o.azimuth + '°');
    L.push('    elewacja .......... ' + (o.elevation >= 0 ? '+' : '') + o.elevation + '°');
    L.push('    odległość ......... ' + o.distance + ' m');
    L.push('    głośność .......... ' + o.volume);
  });
  if (!(preset.objects || []).length) L.push('  (brak)');
  L.push('');
  L.push(line);
  L.push('Odsłuch wyłącznie na słuchawkach — efekt binauralny opiera się');
  L.push('na różnicy między kanałami i na filtracji HRTF.');
  L.push('');
  L.push('Sfinansowano ze środków Krajowego Planu Odbudowy i Zwiększania Odporności,');
  L.push('inwestycja A2.5.1 — program stypendialny NIMIT.');
  L.push('Umowa nr 143/KPO.STYPENDIA/NIMIT/2025');
  return L.join('\n');
}

if (typeof window !== 'undefined') {
  window.SALRender = {
    renderPreset, createPreview, bufferToWav24, buildMetaText,
    buildImpulseResponse, toCartesian, buildBuses,
    buildVoiceChain, buildObjectChain, buildSceneChain,
    setPannerPosition, setVoicePosition
  };
}
