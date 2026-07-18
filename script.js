// ================================================================
// PRZESTRZEŃ RELAKSU - HARMONIC LAYERS
// ================================================================
// Aplikacja do medytacji z dźwiękiem przestrzennym 3D (HRTF)
// Nowy układ UI: trzy niezależne zakładki
// ================================================================

'use strict';

// ================================================================
// === SEKCJA: CONFIGURATION ===
// ================================================================

const CONFIG = {
  // === Biblioteka ładowana dynamicznie z manifest.json ===
  // Poniższe tablice są PUSTE na starcie i wypełnia je loadManifest().
  // Aby dodać/edytować pozycje, zmieniaj manifest.json — NIE ten plik.
  sessions: [],   // medytacje prowadzone (głos)
  scenes: [],     // sceny tła / ambient
  objects: [],    // obiekty dźwiękowe 3D

  // Ścieżka do manifestu biblioteki
  manifestUrl: 'manifest.json',

  // Pozycje HRTF dla medytacji
  hrtfPositions: {
    left: { angle: -60, x: -0.866, z: -0.5 },
    center: { angle: 0, x: 0, z: -1 },
    right: { angle: 60, x: 0.866, z: -0.5 }
  },
  
  // Ustawienia audio
  fadeInTime: 0.15,
  fadeOutTime: 0.8,
  positionSmoothingTime: 0.05,
  
  // Ustawienia 3D - model liniowy: 100% przy 1m → 4% przy 100m
  audio3d: {
    refDistance: 1,
    rolloffFactor: 0.96,
    maxDistance: 100
  },

  // FAZA 4 — wspólny kanał przestrzenny
  spatial: {
    maxActiveObjects: 5,   // twardy cap panerów HRTF (głos nie wlicza się do listy obiektów)
    dryLevel: 0.85,        // poziom suchej ścieżki
    wetLevel: 0.16,        // poziom pogłosu (subtelny — mowa nie może się rozmyć)
    reverbDuration: 1.4,   // długość proceduralnego IR w sekundach
    reverbDecay: 3.0       // wykładnik zanikania IR
  }
  // Uwaga: głos lektora używa panera 'equalpower' (nie HRTF) — bezstratne panoramowanie
  // L/środek/P bez zabarwiania barwy mowy, więc nie potrzebuje kompensacji EQ (patrz initAudioContext).
};


// ================================================================
// === SEKCJA: STATE MANAGEMENT ===
// ================================================================

const state = {
  _stateVersion: 0,
  currentView: 'medytacje', // 'medytacje', 'mixer', 'player'
  mixerTab: 'ambient', // 'ambient', 'objects'

  // Nawigacja biblioteki medytacji (drill-down: tematy → podtematy → pliki)
  library: { level: 'groups', groupId: null, subgroupId: null },

  // Audio context
  audioContext: null,
  masterGain: null,

  // FAZA 4 — spójny kanał przestrzenny
  spatialBus: null,   // zbiorczy punkt dla głosu + obiektów (HRTF)
  ambientBus: null,   // sceny tła (bez HRTF)
  dryGain: null,      // sucha ścieżka spatialBus → master
  reverbSend: null,   // wysyłka na pogłos
  convolver: null,    // jeden wspólny pogłos
  wetGain: null,      // mokra ścieżka pogłosu → master
  lowPowerMode: false, // fallback equalpower na słabszych urządzeniach

  // Global controls
  isGlobalPlaying: false,
  isGlobalPaused: false,
  
  // MEDYTACJE
  meditation: {
    selected: null,
    buffer: null,
    source: null,
    gainNode: null,
    pannerNode: null,
    isPlaying: false,
    isPaused: false,
    pauseTime: 0,
    startTime: 0,
    duration: 0,
    volume: 1,
    hrtfEnabled: true,
    position: 'center',
    syncWithSpace: false
  },

  // PRZESTRZEŃ TŁA
  space: {
    active: null,
    sources: {},
    gains: {},
    buffers: {},
    volumes: {},
    instanceIds: {},
    loadingSceneId: null
  },

  // DŹWIĘKI 3D
  sounds: {
    objects: {},
    selectedObjectId: null
  },

  // TIMER
  timer: {
    duration: 0,
    remaining: 0,
    isRunning: false,
    intervalId: null,
    selectedPreset: null,
    startSoundBuffer: null,
    endSoundBuffer: null
  },
  
  masterVolume: 0.8
};

// Inicjalizacja stanu dla obiektów i scen — wywoływana PO załadowaniu manifestu
// (loadManifest wypełnia CONFIG.objects / CONFIG.scenes).
function initStateFromConfig() {
  // Stan obiektów 3D
  CONFIG.objects.forEach(obj => {
    if (state.sounds.objects[obj.id]) return; // nie nadpisuj
    state.sounds.objects[obj.id] = {
      enabled: false,
      buffer: null,
      source: null,
      gainNode: null,
      pannerNode: null,
      volume: 0.7,
      baseVolume: 1.0,
      position3d: {
        azimuth: Math.random() * 360,
        elevation: 0,
        distance: obj.defaultDistance != null
          ? obj.defaultDistance
          : 20 + Math.random() * 30
      },
      instanceId: null,
      isLoading: false
    };
  });

  // Stan scen (ambient)
  CONFIG.scenes.forEach(scene => {
    if (state.space.volumes[scene.id] == null) {
      state.space.volumes[scene.id] = 0.5;
    }
    if (state.space.instanceIds[scene.id] === undefined) {
      state.space.instanceIds[scene.id] = null;
    }
  });
}


// ================================================================
// === SEKCJA: UTILITY FUNCTIONS ===
// ================================================================

function switchView(viewName) {
  state.currentView = viewName;

  const views = {
    medytacje: document.getElementById('medytacje-view'),
    mixer: document.getElementById('mixer-view'),
    player: document.getElementById('player-view')
  };
  Object.entries(views).forEach(([name, el]) => {
    el?.classList.toggle('hidden-layer', name !== viewName);
  });

  // Dolna nawigacja — podświetl aktywną strefę (widok 'player' nie zaznacza żadnej)
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const isActive = tab.dataset.zone === viewName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  // Widok odtwarzacza chowa nawigację i mini-player (immersja)
  document.querySelector('.app-shell')?.classList.toggle('view-player', viewName === 'player');

  // Canvas radaru potrzebuje realnych wymiarów gdy mikser staje się widoczny
  if (viewName === 'mixer' && state.mixerTab === 'objects') {
    setTimeout(resizeCanvas, 50);
  }

  views[viewName]?.scrollTo?.(0, 0);

  markStateChanged();
}

// Mikser jest teraz osobną strefą (nie szufladą) — te aliasy zachowują dawne wywołania.
function openMixer() {
  switchView('mixer');
}

function closeMixer() {
  if (state.currentView === 'mixer') switchView('medytacje');
}

function setMixerTab(tabName) {
  state.mixerTab = tabName;

  document.querySelectorAll('.mixer-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mixerTab === tabName);
  });

  document.getElementById('mixer-tab-ambient')?.classList.toggle('active', tabName === 'ambient');
  document.getElementById('mixer-tab-objects')?.classList.toggle('active', tabName === 'objects');

  if (tabName === 'objects') {
    setTimeout(resizeCanvas, 50);
  }
}

function generateInstanceId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function markStateChanged() {
  state._stateVersion++;
  syncAllUI();
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// --- Generowane okładki (Faza 3 — brak pliku cover → deterministyczny gradient) ---
const EQ_BARS_HTML = '<span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span>';

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function coverGradient(id) {
  const hash = hashString(id || 'default');
  const hue1 = hash % 360;
  const hue2 = (hue1 + 40 + ((hash >> 8) % 70)) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 65% 42%), hsl(${hue2} 60% 24%))`;
}

function coverStyleAttr(item) {
  if (item.cover) return `background-image:url('${item.cover}')`;
  return `background:${coverGradient(item.id)}`;
}

function coverContent(item) {
  return item.cover ? '' : `<span class="cover-icon">${item.icon}</span>`;
}

// --- Ostatnio odtwarzana medytacja (sekcja "Kontynuuj") ---
const LAST_MEDITATION_KEY = 'relaxationMixer.lastMeditationId';

function getLastMeditationId() {
  try {
    return localStorage.getItem(LAST_MEDITATION_KEY);
  } catch (e) {
    return null;
  }
}

function setLastMeditationId(id) {
  try {
    localStorage.setItem(LAST_MEDITATION_KEY, id);
  } catch (e) {}
}

function updateGreeting() {
  const el = document.getElementById('greetingText');
  if (!el) return;
  const hour = new Date().getHours();
  let text;
  if (hour < 5) text = 'Dobrej nocy';
  else if (hour < 11) text = 'Dzień dobry';
  else if (hour < 18) text = 'Cześć';
  else if (hour < 22) text = 'Dobry wieczór';
  else text = 'Dobrej nocy';
  el.textContent = text;
}

function showStatus(message, duration = 2000) {
  const el = document.getElementById('statusMessage');
  if (!el) return;
  
  el.textContent = message;
  el.classList.add('visible');
  
  setTimeout(() => {
    el.classList.remove('visible');
  }, duration);
}


// ================================================================
// === SEKCJA: AUDIO CONTEXT & LOADING ===
// ================================================================

// FAZA 4 — proceduralny impuls pogłosu: zanikający szum stereo (zero transferu plików).
function createImpulseResponse(duration, decay) {
  const ctx = state.audioContext;
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

async function initAudioContext() {
  if (state.audioContext) return;
  
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master gain
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.setValueAtTime(state.masterVolume, state.audioContext.currentTime);
    state.masterGain.connect(state.audioContext.destination);

    // === FAZA 4: wspólny kanał przestrzenny ===
    // Wykrycie słabego urządzenia → fallback equalpower (tani pan L/R, bez elewacji/przód-tył).
    state.lowPowerMode = (navigator.hardwareConcurrency || 8) <= 4;
    const spatialPanningModel = state.lowPowerMode ? 'equalpower' : 'HRTF';

    // Busy zbiorcze
    state.spatialBus = state.audioContext.createGain(); // głos + obiekty (HRTF)
    state.ambientBus = state.audioContext.createGain(); // sceny tła (dry)
    state.ambientBus.connect(state.masterGain);

    // Sucha ścieżka: spatialBus → dryGain → master
    state.dryGain = state.audioContext.createGain();
    state.dryGain.gain.setValueAtTime(CONFIG.spatial.dryLevel, state.audioContext.currentTime);
    state.spatialBus.connect(state.dryGain);
    state.dryGain.connect(state.masterGain);

    // Mokra ścieżka (jeden wspólny pogłos): spatialBus → reverbSend → convolver → wetGain → master
    state.reverbSend = state.audioContext.createGain();
    state.convolver = state.audioContext.createConvolver();
    state.convolver.buffer = createImpulseResponse(CONFIG.spatial.reverbDuration, CONFIG.spatial.reverbDecay);
    state.wetGain = state.audioContext.createGain();
    state.wetGain.gain.setValueAtTime(CONFIG.spatial.wetLevel, state.audioContext.currentTime);
    state.spatialBus.connect(state.reverbSend);
    state.reverbSend.connect(state.convolver);
    state.convolver.connect(state.wetGain);
    state.wetGain.connect(state.masterGain);

    // Inicjalizacja gain nodes dla scen → ambientBus (pliki binauralne/stereo, bez panera)
    CONFIG.scenes.forEach(scene => {
      const gain = state.audioContext.createGain();
      gain.gain.setValueAtTime(0, state.audioContext.currentTime);
      gain.connect(state.ambientBus);
      state.space.gains[scene.id] = gain;
    });

    // Inicjalizacja nodes dla obiektów 3D → spatialBus
    CONFIG.objects.forEach(obj => {
      const objState = state.sounds.objects[obj.id];

      objState.gainNode = state.audioContext.createGain();
      objState.gainNode.gain.setValueAtTime(0, state.audioContext.currentTime);

      objState.pannerNode = state.audioContext.createPanner();
      objState.pannerNode.panningModel = spatialPanningModel;
      objState.pannerNode.distanceModel = 'linear';
      objState.pannerNode.refDistance = CONFIG.audio3d.refDistance;
      objState.pannerNode.rolloffFactor = CONFIG.audio3d.rolloffFactor;
      objState.pannerNode.maxDistance = CONFIG.audio3d.maxDistance;

      objState.gainNode.connect(objState.pannerNode);
      objState.pannerNode.connect(state.spatialBus);

      updateObject3DPosition(obj.id);
    });

    // Panner dla medytacji → spatialBus.
    // Głos używa 'equalpower' (nie HRTF): proste, bezstratne panoramowanie L/środek/P.
    // HRTF panera przeglądarki (generyczny KEMAR) filtruje górę pasma i zniekształca barwę mowy —
    // equalpower tego nie robi, więc na środku głos brzmi identycznie jak oryginał, bez potrzeby EQ.
    // Obiekty tła zostają na HRTF (spatialPanningModel) — tam liczy się lokalizacja, nie wierność barwy.
    state.meditation.pannerNode = state.audioContext.createPanner();
    state.meditation.pannerNode.panningModel = 'equalpower';

    state.meditation.pannerNode.connect(state.spatialBus);

    // Gain dla medytacji
    state.meditation.gainNode = state.audioContext.createGain();
    state.meditation.gainNode.gain.setValueAtTime(state.meditation.volume, state.audioContext.currentTime);
    state.meditation.gainNode.connect(state.meditation.pannerNode);
    
    updateMeditationPosition(state.meditation.position);
    
    console.log('🎧 Audio context zainicjalizowany');
    
    // Załaduj dźwięki timera
    loadTimerSounds();
    
  } catch (error) {
    console.error('Błąd inicjalizacji audio:', error);
    showStatus('Nie można uruchomić audio', 3000);
  }
}

async function loadAudioBuffer(primaryUrl, fallbackUrl) {
  const urls = [primaryUrl, fallbackUrl].filter(Boolean);
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (e) {
      console.warn(`Nie można załadować: ${url}`);
    }
  }
  
  return null;
}

async function loadTimerSounds() {
  state.timer.startSoundBuffer = await loadAudioBuffer(
    'assets/audio/timer/start.webm',
    'assets/audio/timer/start.mp3'
  );
  state.timer.endSoundBuffer = await loadAudioBuffer(
    'assets/audio/timer/end.webm',
    'assets/audio/timer/end.mp3'
  );
}

function playTimerSound(buffer) {
  if (!buffer || !state.audioContext) return;
  
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.masterGain);
  source.start();
}


// ================================================================
// === SEKCJA: MEDITATION PLAYBACK ===
// ================================================================

async function loadMeditationSession(sessionId) {
  const session = CONFIG.sessions.find(s => s.id === sessionId);
  if (!session) return;
  
  showStatus(`Przygotowuję: ${session.name}...`);
  
  const loading = document.getElementById('voiceLoading');
  if (loading) loading.classList.add('visible');
  
  state.meditation.selected = sessionId;
  setLastMeditationId(sessionId);
  renderContinueSection();

  state.meditation.buffer = await loadAudioBuffer(session.file, session.fallback);
  
  if (loading) loading.classList.remove('visible');
  
  if (state.meditation.buffer) {
    state.meditation.duration = state.meditation.buffer.duration;
    document.getElementById('totalTime').textContent = formatTime(state.meditation.duration);
    document.getElementById('meditationTitle').textContent = session.name;
    showStatus(`${session.name} — gotowe`);
  } else {
    showStatus('Nie mogę załadować sesji', 3000);
  }
  
  markStateChanged();
}

function playMeditation() {
  if (!state.meditation.buffer || !state.audioContext) return;
  
  const source = state.audioContext.createBufferSource();
  source.buffer = state.meditation.buffer;
  source.connect(state.meditation.gainNode);
  
  const offset = state.meditation.isPaused ? state.meditation.pauseTime : 0;
  
  source.start(0, offset);
  state.meditation.source = source;
  state.meditation.startTime = state.audioContext.currentTime - offset;
  state.meditation.isPlaying = true;
  state.meditation.isPaused = false;
  
  source.onended = () => {
    // Ignoruj opóźnione 'ended' ze "starego" source'a (np. po seeku/restarcie) —
    // inaczej zdarzenie z odtwarzania sprzed przewinięcia ubija nowo wystartowane audio.
    if (state.meditation.source !== source) return;
    if (state.meditation.isPlaying && !state.meditation.isPaused) {
      stopMeditation();
      if (state.meditation.syncWithSpace) {
        stopAllSpace();
        showStatus('Medytacja zakończona — przestrzeń zatrzymana');
      } else {
        showStatus('Medytacja zakończona');
      }
    }
  };
  
  updateGlobalPlayState();
  markStateChanged();
  startProgressUpdate();
}

function pauseMeditation() {
  if (!state.meditation.isPlaying || !state.meditation.source) return;
  
  state.meditation.pauseTime = state.audioContext.currentTime - state.meditation.startTime;
  
  try {
    state.meditation.source.stop();
  } catch (e) {}
  
  state.meditation.isPlaying = false;
  state.meditation.isPaused = true;
  
  updateGlobalPlayState();
  markStateChanged();
}

function stopMeditation() {
  if (state.meditation.source) {
    try {
      state.meditation.source.stop();
    } catch (e) {}
    state.meditation.source = null;
  }
  
  state.meditation.isPlaying = false;
  state.meditation.isPaused = false;
  state.meditation.pauseTime = 0;
  
  updateProgressBar(0);
  document.getElementById('currentTime').textContent = '00:00';
  
  updateGlobalPlayState();
  markStateChanged();
}

function updateMeditationPosition(position) {
  const pos = CONFIG.hrtfPositions[position];
  if (!pos || !state.meditation.pannerNode || !state.audioContext) return;
  
  const currentTime = state.audioContext.currentTime;
  const smoothingTime = CONFIG.positionSmoothingTime;
  
  state.meditation.pannerNode.positionX.setTargetAtTime(pos.x, currentTime, smoothingTime);
  state.meditation.pannerNode.positionY.setTargetAtTime(0, currentTime, smoothingTime);
  state.meditation.pannerNode.positionZ.setTargetAtTime(pos.z, currentTime, smoothingTime);
  
  state.meditation.position = position;
  markStateChanged();
}

function toggleHRTF(enabled) {
  state.meditation.hrtfEnabled = enabled;
  if (!state.meditation.gainNode || !state.meditation.pannerNode || !state.spatialBus) return;

  if (enabled) {
    state.meditation.gainNode.disconnect();
    state.meditation.gainNode.connect(state.meditation.pannerNode);
    updateMeditationPosition(state.meditation.position);
  } else {
    // Bypass panera, ale nadal przez wspólny kanał (dry + pogłos), nie prosto na master.
    state.meditation.gainNode.disconnect();
    state.meditation.gainNode.connect(state.spatialBus);
  }
  markStateChanged();
}

let progressInterval = null;

function startProgressUpdate() {
  if (progressInterval) clearInterval(progressInterval);
  
  progressInterval = setInterval(() => {
    if (!state.meditation.isPlaying) {
      clearInterval(progressInterval);
      return;
    }
    
    const elapsed = state.audioContext.currentTime - state.meditation.startTime;
    const progress = Math.min(elapsed / state.meditation.duration, 1);
    
    updateProgressBar(progress);
    document.getElementById('currentTime').textContent = formatTime(elapsed);
  }, 100);
}

function updateProgressBar(progress) {
  const fill = document.getElementById('progressFill');
  if (fill) {
    fill.style.width = `${progress * 100}%`;
  }
  const miniFill = document.getElementById('miniProgressFill');
  if (miniFill) {
    miniFill.style.width = `${progress * 100}%`;
  }
}


// ================================================================
// === SEKCJA: SPACE PLAYBACK ===
// ================================================================

async function selectScene(sceneId) {
  const scene = CONFIG.scenes.find(s => s.id === sceneId);
  if (!scene || !state.audioContext) return;
  if (state.space.loadingSceneId) return; // nie pozwalaj na równoległe przełączanie scen

  showStatus(`Przygotowuję: ${scene.name}...`);

  // Zatrzymaj poprzednią scenę
  if (state.space.active && state.space.sources[state.space.active]) {
    const oldSceneId = state.space.active;
    const oldInstanceId = state.space.instanceIds[oldSceneId];
    const oldGain = state.space.gains[oldSceneId];

    oldGain.gain.setTargetAtTime(0, state.audioContext.currentTime, CONFIG.fadeOutTime);

    setTimeout(() => {
      stopSceneSafe(oldSceneId, oldInstanceId);
    }, CONFIG.fadeOutTime * 1000 * 3);
  }

  // Ładuj bufor
  if (!state.space.buffers[sceneId]) {
    state.space.loadingSceneId = sceneId;
    markStateChanged();
    state.space.buffers[sceneId] = await loadAudioBuffer(scene.file, scene.fallback);
    state.space.loadingSceneId = null;
  }

  const buffer = state.space.buffers[sceneId];
  if (!buffer) {
    showStatus('Nie mogę odnaleźć tej przestrzeni', 3000);
    markStateChanged();
    return;
  }
  
  const newInstanceId = generateInstanceId();
  
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(state.space.gains[sceneId]);
  
  const targetVolume = state.space.volumes[sceneId] ?? 0.5;
  state.space.gains[sceneId].gain.setValueAtTime(0, state.audioContext.currentTime);
  state.space.gains[sceneId].gain.setTargetAtTime(targetVolume, state.audioContext.currentTime, CONFIG.fadeInTime);
  
  source.start();
  
  state.space.sources[sceneId] = source;
  state.space.instanceIds[sceneId] = newInstanceId;
  state.space.active = sceneId;
  
  updateGlobalPlayState();
  markStateChanged();
  showStatus(`${scene.name} — jesteś tutaj`);
}

function stopSceneSafe(sceneId, instanceId) {
  const currentSource = state.space.sources[sceneId];
  const currentInstanceId = state.space.instanceIds[sceneId];
  
  if (currentInstanceId !== instanceId) return;
  
  if (currentSource) {
    try {
      currentSource.stop();
      currentSource.disconnect();
    } catch (e) {}
    delete state.space.sources[sceneId];
    state.space.instanceIds[sceneId] = null;
  }
}

function stopScene(sceneId) {
  const instanceId = state.space.instanceIds[sceneId];
  if (!state.space.sources[sceneId]) return;
  
  const gain = state.space.gains[sceneId];
  gain.gain.setTargetAtTime(0, state.audioContext.currentTime, CONFIG.fadeOutTime);
  
  setTimeout(() => {
    stopSceneSafe(sceneId, instanceId);
  }, CONFIG.fadeOutTime * 1000 * 3);
  
  state.space.active = null;
  updateGlobalPlayState();
  markStateChanged();
  showStatus('Przestrzeń wyłączona');
}

function updateSceneVolume(volume) {
  const sceneId = state.space.active;
  if (!sceneId) return;
  
  state.space.volumes[sceneId] = volume;
  
  if (state.space.gains[sceneId] && state.audioContext) {
    state.space.gains[sceneId].gain.setTargetAtTime(volume, state.audioContext.currentTime, 0.1);
  }
  markStateChanged();
}

function stopAllSpace() {
  if (state.space.active) {
    stopScene(state.space.active);
  }
  
  // Zatrzymaj wszystkie obiekty
  CONFIG.objects.forEach(obj => {
    if (state.sounds.objects[obj.id].enabled) {
      toggleObject(obj.id, false);
    }
  });
  
  // Zatrzymaj timer
  if (state.timer.isRunning) {
    stopTimer();
  }
  
  showStatus('Przestrzeń zatrzymana');
}


// ================================================================
// === SEKCJA: 3D OBJECTS ===
// ================================================================

async function toggleObject(objectId, enabled) {
  const obj = CONFIG.objects.find(o => o.id === objectId);
  const objState = state.sounds.objects[objectId];
  if (!obj || !objState || !state.audioContext) return;
  
  if (objState.isLoading) return;

  // FAZA 4 — twardy cap aktywnych panerów HRTF. UI blokuje dodawanie ponad limit.
  if (enabled) {
    const activeCount = Object.values(state.sounds.objects).filter(o => o.enabled).length;
    if (activeCount >= CONFIG.spatial.maxActiveObjects) {
      showStatus(`Limit ${CONFIG.spatial.maxActiveObjects} dźwięków 3D — wyłącz inny, aby dodać`, 3000);
      markStateChanged(); // przywróć stan przycisku w UI
      return;
    }
  }

  objState.enabled = enabled;
  markStateChanged();

  if (enabled) {
    showStatus(`Dodaję: ${obj.name}...`);
    
    const newInstanceId = generateInstanceId();
    objState.instanceId = newInstanceId;
    objState.isLoading = true;
    markStateChanged();

    if (!objState.buffer) {
      objState.buffer = await loadAudioBuffer(obj.file, obj.fallback);
    }
    
    objState.isLoading = false;
    
    if (!objState.enabled || objState.instanceId !== newInstanceId) return;
    
    if (!objState.buffer) {
      showStatus('Nie mogę odnaleźć tego dźwięku', 3000);
      objState.enabled = false;
      objState.instanceId = null;
      markStateChanged();
      return;
    }
    
    const source = state.audioContext.createBufferSource();
    source.buffer = objState.buffer;
    source.loop = true;
    source.connect(objState.gainNode);
    
    const finalVolume = objState.volume * objState.baseVolume;
    objState.gainNode.gain.setValueAtTime(0, state.audioContext.currentTime);
    objState.gainNode.gain.setTargetAtTime(finalVolume, state.audioContext.currentTime, CONFIG.fadeInTime);
    
    source.start();
    objState.source = source;
    
    updateGlobalPlayState();
    showStatus(`${obj.name} — dodano`);
    
  } else {
    if (objState.source) {
      objState.gainNode.gain.setTargetAtTime(0, state.audioContext.currentTime, CONFIG.fadeOutTime);
      
      const sourceToStop = objState.source;
      setTimeout(() => {
        try {
          sourceToStop.stop();
          sourceToStop.disconnect();
        } catch (e) {}
      }, CONFIG.fadeOutTime * 1000 * 3);
      
      objState.source = null;
    }
    objState.instanceId = null;
    updateGlobalPlayState();
    showStatus(`${obj.name} — usunięto`);
  }
  
  markStateChanged();
}

function convert3DToCartesian(azimuth, elevation, distance) {
  const azimuthRad = (azimuth * Math.PI) / 180;
  const elevationRad = (elevation * Math.PI) / 180;
  
  const x = distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const y = distance * Math.sin(elevationRad);
  const z = -distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
  
  return { x, y, z };
}

function updateObject3DPosition(objectId) {
  const objState = state.sounds.objects[objectId];
  if (!objState || !objState.pannerNode) return;
  
  const pos3d = objState.position3d;
  const coords = convert3DToCartesian(pos3d.azimuth, pos3d.elevation, pos3d.distance);
  
  const currentTime = state.audioContext?.currentTime || 0;
  const smoothingTime = CONFIG.positionSmoothingTime;
  
  objState.pannerNode.positionX.setTargetAtTime(coords.x, currentTime, smoothingTime);
  objState.pannerNode.positionY.setTargetAtTime(coords.y, currentTime, smoothingTime);
  objState.pannerNode.positionZ.setTargetAtTime(coords.z, currentTime, smoothingTime);
}

function updateObjectVolume(objectId, volume) {
  const objState = state.sounds.objects[objectId];
  if (!objState) return;
  
  objState.volume = volume;
  
  if (objState.gainNode && objState.enabled && state.audioContext) {
    const finalVolume = volume * objState.baseVolume;
    objState.gainNode.gain.setTargetAtTime(finalVolume, state.audioContext.currentTime, 0.1);
  }
}

// Ustawia fokus edycji na obiekcie: podświetla go na radarze i w liście oraz
// wypełnia suwaki arkusza. NIE otwiera/zamyka samego arkusza (patrz open/closeSoundSheet).
function selectObjectFor3DControl(objectId) {
  state.sounds.selectedObjectId = objectId;

  if (objectId) {
    const objState = state.sounds.objects[objectId];
    const obj = CONFIG.objects.find(o => o.id === objectId);

    if (objState) {
      const titleEl = document.getElementById('controls3dTitle');
      if (titleEl && obj) {
        titleEl.textContent = `${obj.icon} ${obj.name} — pozycja 3D`;
      }

      const pos3d = objState.position3d;

      const volSlider = document.getElementById('baseVolume3d');
      const volValue = document.getElementById('baseVolumeValue');
      if (volSlider) volSlider.value = Math.round(objState.baseVolume * 100);
      if (volValue) volValue.textContent = Math.round(objState.baseVolume * 100) + '%';

      const distSlider = document.getElementById('distance3d');
      const distValue = document.getElementById('distanceValue');
      if (distSlider) distSlider.value = pos3d.distance;
      if (distValue) distValue.textContent = Math.round(pos3d.distance) + 'm';

      const azSlider = document.getElementById('azimuth3d');
      const azValue = document.getElementById('azimuthValue');
      if (azSlider) azSlider.value = pos3d.azimuth;
      if (azValue) azValue.textContent = Math.round(pos3d.azimuth) + '°';

      const elSlider = document.getElementById('elevation3d');
      const elValue = document.getElementById('elevationValue');
      if (elSlider) elSlider.value = pos3d.elevation;
      if (elValue) elValue.textContent = (pos3d.elevation >= 0 ? '+' : '') + Math.round(pos3d.elevation) + '°';
    }
  }

  // Podświetlenie wiersza w fokusie edycji
  document.querySelectorAll('#soundsList .sound-card').forEach(card => {
    card.classList.toggle('editing', card.dataset.id === objectId);
  });

  markStateChanged();
  drawVisualization();
}

// Otwiera bottom-sheet edycji pozycji 3D dla danego obiektu.
function openSoundSheet(objectId) {
  selectObjectFor3DControl(objectId);
  document.getElementById('controls3dPanel')?.classList.add('visible');
  document.getElementById('sound3dBackdrop')?.classList.add('visible');
}

// Zamyka bottom-sheet i czyści fokus edycji.
function closeSoundSheet() {
  document.getElementById('controls3dPanel')?.classList.remove('visible');
  document.getElementById('sound3dBackdrop')?.classList.remove('visible');
  selectObjectFor3DControl(null);
}


// ================================================================
// === SEKCJA: TIMER ===
// ================================================================

function startTimer(minutes) {
  if (state.timer.isRunning) stopTimer();
  
  state.timer.duration = minutes * 60;
  state.timer.remaining = state.timer.duration;
  state.timer.isRunning = true;
  state.timer.selectedPreset = minutes;
  
  playTimerSound(state.timer.startSoundBuffer);
  
  updateTimerDisplay();
  
  document.getElementById('btnTimerStart').style.display = 'none';
  document.getElementById('btnTimerStop').style.display = 'inline-block';
  document.getElementById('timerDisplay').classList.add('active');
  
  const timerMini = document.getElementById('timerBtn');
  if (timerMini) timerMini.classList.add('active');
  
  state.timer.intervalId = setInterval(() => {
    state.timer.remaining--;
    updateTimerDisplay();
    
    if (state.timer.remaining <= 0) {
      timerFinished();
    }
  }, 1000);
  
  markStateChanged();
}

function stopTimer() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
  
  state.timer.isRunning = false;
  state.timer.remaining = 0;
  
  updateTimerDisplay();
  
  document.getElementById('btnTimerStart').style.display = 'inline-block';
  document.getElementById('btnTimerStop').style.display = 'none';
  document.getElementById('timerDisplay').classList.remove('active');
  
  const timerMini = document.getElementById('timerBtn');
  if (timerMini) {
    timerMini.classList.remove('active');
    const timerMiniText = document.getElementById('timerBtnText');
    if (timerMiniText) timerMiniText.textContent = 'Timer';
  }
  
  document.querySelectorAll('.btn-timer-preset').forEach(btn => {
    btn.classList.remove('active');
  });
  state.timer.selectedPreset = null;
  
  markStateChanged();
}

function timerFinished() {
  stopTimer();
  playTimerSound(state.timer.endSoundBuffer);
  showStatus('⏰ Czas przestrzeni dobiegł końca', 4000);
  stopAllSpace();
}

function updateTimerDisplay() {
  const display = document.getElementById('timerDisplay');
  const timerMiniText = document.getElementById('timerBtnText');

  // Panel: pełny czas MM:SS; mini-przycisk w nagłówku: etykieta "Timer" gdy bezczynny, czas gdy odlicza.
  if (display) display.textContent = state.timer.isRunning ? formatTime(state.timer.remaining) : '--:--';
  if (timerMiniText) timerMiniText.textContent = state.timer.isRunning ? formatTime(state.timer.remaining) : 'Timer';
}


// ================================================================
// === SEKCJA: GLOBAL CONTROLS ===
// ================================================================

function updateGlobalPlayState() {
  const hasAnythingPlaying = 
    state.meditation.isPlaying || 
    state.space.active !== null ||
    Object.values(state.sounds.objects).some(o => o.enabled);
  
  state.isGlobalPlaying = hasAnythingPlaying;
  
  const btnPlayPauseAll = document.getElementById('btnPlayPauseAll');
  if (btnPlayPauseAll) {
    btnPlayPauseAll.classList.toggle('playing', state.isGlobalPlaying);
    btnPlayPauseAll.textContent = state.isGlobalPlaying ? '⏸' : '▶';
  }
}

function pauseAll() {
  state.isGlobalPaused = true;
  
  if (state.meditation.isPlaying) {
    pauseMeditation();
  }
  
  // Wycisz przestrzeń
  if (state.space.active && state.space.gains[state.space.active]) {
    state.space.gains[state.space.active].gain.setTargetAtTime(0, state.audioContext.currentTime, 0.1);
  }
  
  // Wycisz obiekty
  CONFIG.objects.forEach(obj => {
    const objState = state.sounds.objects[obj.id];
    if (objState.enabled && objState.gainNode) {
      objState.gainNode.gain.setTargetAtTime(0, state.audioContext.currentTime, 0.1);
    }
  });
  
  updateGlobalPlayState();
}

function resumeAll() {
  state.isGlobalPaused = false;
  
  if (state.meditation.isPaused) {
    playMeditation();
  }
  
  // Przywróć głośność przestrzeni
  if (state.space.active && state.space.gains[state.space.active]) {
    const vol = state.space.volumes[state.space.active] ?? 0.5;
    state.space.gains[state.space.active].gain.setTargetAtTime(vol, state.audioContext.currentTime, 0.1);
  }
  
  // Przywróć głośność obiektów
  CONFIG.objects.forEach(obj => {
    const objState = state.sounds.objects[obj.id];
    if (objState.enabled && objState.gainNode) {
      const finalVol = objState.volume * objState.baseVolume;
      objState.gainNode.gain.setTargetAtTime(finalVol, state.audioContext.currentTime, 0.1);
    }
  });
  
  updateGlobalPlayState();
}

function stopAll() {
  stopMeditation();
  
  if (state.space.active) {
    stopScene(state.space.active);
  }
  
  CONFIG.objects.forEach(obj => {
    if (state.sounds.objects[obj.id].enabled) {
      toggleObject(obj.id, false);
    }
  });
  
  if (state.timer.isRunning) {
    stopTimer();
  }
  
  state.isGlobalPlaying = false;
  state.isGlobalPaused = false;
  
  updateGlobalPlayState();
  markStateChanged();
  showStatus('Wszystko zatrzymane');
}


// ================================================================
// === SEKCJA: UI RENDERING ===
// ================================================================

// ================================================================
// === SEKCJA: BIBLIOTEKA — DRZEWO GRUP/PODGRUP + NAWIGACJA ===
// ================================================================

// Drzewo biblioteki: Map(groupId -> { id, title, icon, subgroups:Map(subId->[sesje]), direct:[sesje] })
let libraryTree = new Map();

function buildLibraryTree() {
  const tree = new Map();

  // Najpierw grupy zdefiniowane w manifeście (kolejność wg 'order')
  const metaGroups = (CONFIG.meditationGroups || []).slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  metaGroups.forEach(g => {
    tree.set(g.id, { id: g.id, title: g.title || g.id, icon: g.icon || '🧘', subgroups: new Map(), direct: [] });
  });

  // Przypisz medytacje do grup/podgrup
  CONFIG.sessions.forEach(s => {
    const gid = s.group || 'Inne';
    if (!tree.has(gid)) {
      tree.set(gid, { id: gid, title: gid, icon: s.icon || '🧘', subgroups: new Map(), direct: [] });
    }
    const node = tree.get(gid);
    if (s.subgroup) {
      if (!node.subgroups.has(s.subgroup)) node.subgroups.set(s.subgroup, []);
      node.subgroups.get(s.subgroup).push(s);
    } else {
      node.direct.push(s);
    }
  });

  // Usuń puste grupy (zdefiniowane w meta, ale bez plików)
  for (const [gid, node] of tree) {
    if (countGroup(node) === 0) tree.delete(gid);
  }

  libraryTree = tree;
  return tree;
}

function countGroup(node) {
  return node.direct.length + [...node.subgroups.values()].reduce((n, arr) => n + arr.length, 0);
}

function groupTitle(groupId) {
  return libraryTree.get(groupId)?.title || groupId;
}

// Polska odmiana: 1 sesja / 2-4 sesje / 5+ sesji
function sessionsLabel(n) {
  const last = n % 10, last2 = n % 100;
  if (n === 1) return '1 sesja';
  if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return `${n} sesje`;
  return `${n} sesji`;
}

function renderLibraryGroups() {
  const container = document.getElementById('libraryGroups');
  if (!container) return;
  const groups = [...libraryTree.values()];
  container.innerHTML = groups.map((g, i) => `
    <div class="tile" data-group="${g.id}" style="--i:${i}" tabindex="0" role="button" aria-label="Temat: ${g.title}, ${sessionsLabel(countGroup(g))}">
      <div class="tile-cover cover-art"><span class="cover-icon">${g.icon}</span></div>
      <div class="tile-title">${g.title}</div>
      <div class="tile-meta">${sessionsLabel(countGroup(g))}</div>
    </div>
  `).join('');
}

function renderLibrarySubgroups(groupId) {
  const container = document.getElementById('librarySubgroups');
  const node = libraryTree.get(groupId);
  if (!container || !node) return;

  const tiles = [];
  // Pliki bez podgrupy (jeśli grupa ma jednocześnie podgrupy i pliki luzem)
  if (node.direct.length > 0) {
    tiles.push(`
      <div class="tile" data-group="${groupId}" data-direct="1" style="--i:0" tabindex="0" role="button" aria-label="Ogólne, ${sessionsLabel(node.direct.length)}">
        <div class="tile-cover cover-art"><span class="cover-icon">${node.icon}</span></div>
        <div class="tile-title">Ogólne</div>
        <div class="tile-meta">${sessionsLabel(node.direct.length)}</div>
      </div>`);
  }
  [...node.subgroups.entries()].forEach(([subId, arr], idx) => {
    tiles.push(`
      <div class="tile" data-group="${groupId}" data-subgroup="${subId}" style="--i:${idx + 1}" tabindex="0" role="button" aria-label="Podtemat: ${subId}, ${sessionsLabel(arr.length)}">
        <div class="tile-cover cover-art"><span class="cover-icon">${node.icon}</span></div>
        <div class="tile-title">${subId}</div>
        <div class="tile-meta">${sessionsLabel(arr.length)}</div>
      </div>`);
  });
  container.innerHTML = tiles.join('');
}

function fileCardHTML(s, i) {
  const isSelected = state.meditation.selected === s.id;
  const isPlaying = isSelected && state.meditation.isPlaying;
  return `
    <div class="file-card ${isSelected ? 'selected' : ''} ${isPlaying ? 'playing' : ''}" data-id="${s.id}" style="--i:${i}" tabindex="0" role="button" aria-label="Medytacja: ${s.name}${s.duration ? ', ' + s.duration : ''}">
      <div class="file-card-cover cover-art" style="${coverStyleAttr(s)}">${coverContent(s)}</div>
      <div class="file-card-info">
        <div class="file-card-title">${s.name}</div>
        <div class="file-card-meta">${s.duration || 'Medytacja'}${s.description ? ' • ' + s.description : ''}</div>
      </div>
      <button class="file-card-play" data-id="${s.id}" aria-label="Odtwórz ${s.name}">${isPlaying ? '⏸' : '▶'}</button>
    </div>`;
}

function renderLibraryFiles(groupId, subgroupId) {
  const container = document.getElementById('libraryFiles');
  const node = libraryTree.get(groupId);
  if (!container || !node) return;
  const list = subgroupId ? (node.subgroups.get(subgroupId) || []) : node.direct;
  container.innerHTML = list.map((s, i) => fileCardHTML(s, i)).join('');
}

// Ustawia poziom biblioteki i renderuje odpowiedni widok + breadcrumb.
function showLibraryLevel(level, groupId = null, subgroupId = null) {
  state.library = { level, groupId, subgroupId };

  const groupsEl = document.getElementById('libraryGroups');
  const subsEl = document.getElementById('librarySubgroups');
  const filesEl = document.getElementById('libraryFiles');
  const navEl = document.getElementById('libraryNav');
  const headerEl = document.getElementById('librarySectionHeader');
  const continueEl = document.getElementById('continueSection');
  const emptyEl = document.getElementById('libraryEmpty');
  const bc = document.getElementById('libraryBreadcrumb');

  const isEmpty = libraryTree.size === 0;

  groupsEl?.classList.toggle('hidden-layer', level !== 'groups' || isEmpty);
  subsEl?.classList.toggle('hidden-layer', level !== 'subgroups');
  filesEl?.classList.toggle('hidden-layer', level !== 'files');
  navEl?.classList.toggle('hidden-layer', level === 'groups');
  headerEl?.classList.toggle('hidden-layer', level !== 'groups');
  emptyEl?.classList.toggle('hidden-layer', !(level === 'groups' && isEmpty));

  // "Kontynuuj" — renderContinueSection sam respektuje poziom (tylko 'groups')
  renderContinueSection();

  if (level === 'groups') {
    renderLibraryGroups();
  } else if (level === 'subgroups') {
    renderLibrarySubgroups(groupId);
    if (bc) bc.innerHTML = `<span class="crumb-current">${groupTitle(groupId)}</span>`;
  } else if (level === 'files') {
    renderLibraryFiles(groupId, subgroupId);
    const parts = [groupTitle(groupId)];
    if (subgroupId) parts.push(subgroupId);
    if (bc) {
      bc.innerHTML = parts.map((p, idx) =>
        idx === parts.length - 1
          ? `<span class="crumb-current">${p}</span>`
          : `${p}<span class="crumb-sep">/</span>`
      ).join('');
    }
  }

  document.getElementById('medytacje-view')?.scrollTo?.(0, 0);
  markStateChanged();
}

function openGroup(groupId) {
  const node = libraryTree.get(groupId);
  if (!node) return;
  if (node.subgroups.size > 0) {
    showLibraryLevel('subgroups', groupId);
  } else {
    showLibraryLevel('files', groupId, null);
  }
}

function libraryBack() {
  const { level, groupId, subgroupId } = state.library;
  if (level === 'files') {
    const node = libraryTree.get(groupId);
    if (node && node.subgroups.size > 0 && subgroupId) {
      showLibraryLevel('subgroups', groupId);
    } else if (node && node.subgroups.size > 0) {
      // pliki "Ogólne" w grupie mającej też podgrupy → wróć do podgrup
      showLibraryLevel('subgroups', groupId);
    } else {
      showLibraryLevel('groups');
    }
  } else if (level === 'subgroups') {
    showLibraryLevel('groups');
  }
}

function renderSpaceList() {
  const container = document.getElementById('spaceList');
  if (!container) return;

  container.innerHTML = CONFIG.scenes.map((scene, i) => {
    const vol = Math.round((state.space.volumes[scene.id] ?? 0.5) * 100);
    return `
    <div class="item-card" data-id="${scene.id}" style="--i:${i}" tabindex="0" role="switch" aria-checked="false" aria-label="Przestrzeń: ${scene.name}">
      <div class="item-icon cover-art" style="${coverStyleAttr(scene)}">${coverContent(scene)}</div>
      <div class="item-info">
        <div class="item-name">${scene.name}</div>
        <div class="item-desc">${scene.description}</div>
        <div class="item-inline-volume">
          <span class="item-inline-volume-icon">🔊</span>
          <input type="range" class="inline-volume-slider" min="0" max="100" value="${vol}" aria-label="Głośność: ${scene.name}">
        </div>
      </div>
      <div class="item-status" aria-hidden="true">${EQ_BARS_HTML}</div>
    </div>
  `;
  }).join('');
}

function renderSoundsList() {
  const container = document.getElementById('soundsList');
  if (!container) return;

  container.innerHTML = CONFIG.objects.map((obj, i) => {
    return `
    <div class="item-card sound-card" data-id="${obj.id}" style="--i:${i}" role="group" aria-label="Dźwięk 3D: ${obj.name}">
      <button type="button" class="sound-toggle" data-id="${obj.id}" role="switch" aria-checked="false" aria-label="Włącz lub wyłącz: ${obj.name}">⏻</button>
      <div class="item-icon cover-art" style="${coverStyleAttr(obj)}">${coverContent(obj)}</div>
      <div class="item-info">
        <div class="item-name">${obj.name}</div>
        <div class="item-desc">Dotknij, by ustawić w przestrzeni</div>
      </div>
      <button type="button" class="btn-3d-position" data-id="${obj.id}" aria-label="Ustaw pozycję 3D: ${obj.name}" title="Pozycja 3D">⚙</button>
      <div class="item-status" aria-hidden="true">${EQ_BARS_HTML}</div>
    </div>
  `;
  }).join('');
}

function renderSpacesRow() {
  const container = document.getElementById('spacesRow');
  if (!container) return;

  container.innerHTML = CONFIG.scenes.map((scene, i) => `
    <div class="space-chip" data-id="${scene.id}" style="--i:${i}" tabindex="0" role="switch" aria-checked="false" aria-label="Przestrzeń: ${scene.name}">
      <div class="space-chip-cover cover-art" style="${coverStyleAttr(scene)}">${coverContent(scene)}</div>
      <div class="space-chip-name">${scene.name}</div>
      <div class="equalizer" aria-hidden="true">${EQ_BARS_HTML}</div>
    </div>
  `).join('');
}

function renderContinueSection() {
  const section = document.getElementById('continueSection');
  const row = document.getElementById('continueRow');
  if (!section || !row) return;

  const lastId = getLastMeditationId();
  const session = CONFIG.sessions.find(s => s.id === lastId);

  // Widoczna tylko na poziomie tematów i tylko gdy jest co kontynuować
  if (!session || state.library.level !== 'groups') {
    section.classList.add('hidden-layer');
    if (!session) row.innerHTML = '';
    return;
  }

  section.classList.remove('hidden-layer');
  row.innerHTML = `
    <div class="continue-card" data-id="${session.id}" tabindex="0" role="button" aria-label="Otwórz medytację: ${session.name}">
      <div class="continue-card-cover cover-art" style="${coverStyleAttr(session)}">${coverContent(session)}</div>
      <div class="continue-card-info">
        <div class="continue-card-title">${session.name}</div>
        <div class="continue-card-meta">${session.duration || 'Medytacja'}</div>
      </div>
      <button class="continue-card-play" aria-label="Odtwórz ${session.name}">▶</button>
    </div>
  `;
}

function syncAllUI() {
  syncMeditationUI();
  syncSpaceUI();
  syncSoundsUI();
  syncMiniPlayer();
  updateMixerBadge();
  drawVisualization();
}

function syncMeditationUI() {
  const session = CONFIG.sessions.find(s => s.id === state.meditation.selected);

  // Wiersze plików w bibliotece (poziom "pliki")
  document.querySelectorAll('#libraryFiles .file-card').forEach(card => {
    const id = card.dataset.id;
    const isSelected = state.meditation.selected === id;
    const isPlaying = isSelected && state.meditation.isPlaying;

    card.classList.toggle('selected', isSelected);
    card.classList.toggle('playing', isPlaying);

    const playBtn = card.querySelector('.file-card-play');
    if (playBtn) playBtn.textContent = isPlaying ? '⏸' : '▶';
  });

  // Okładka w pełnoekranowym odtwarzaczu
  const playerCover = document.getElementById('playerCover');
  if (playerCover) {
    if (session?.cover) {
      playerCover.style.backgroundImage = `url('${session.cover}')`;
      playerCover.style.background = '';
      playerCover.textContent = '';
    } else {
      playerCover.style.backgroundImage = '';
      playerCover.style.background = session ? coverGradient(session.id) : '';
      playerCover.textContent = session?.icon || '🧘';
    }
  }

  // Przycisk play w karcie "Kontynuuj"
  const continuePlayBtn = document.querySelector('#continueRow .continue-card-play');
  if (continuePlayBtn) {
    const continueCard = continuePlayBtn.closest('.continue-card');
    const isThisSelected = continueCard && continueCard.dataset.id === state.meditation.selected;
    continuePlayBtn.textContent = (isThisSelected && state.meditation.isPlaying) ? '⏸' : '▶';
  }

  // Przycisk play
  const btnPlay = document.getElementById('btnPlayMeditation');
  if (btnPlay) {
    btnPlay.classList.toggle('playing', state.meditation.isPlaying);
    btnPlay.textContent = state.meditation.isPlaying ? '⏸' : '▶';
  }

  // HRTF toggle
  const hrtfToggle = document.getElementById('hrtfToggle');
  if (hrtfToggle) {
    hrtfToggle.classList.toggle('active', state.meditation.hrtfEnabled);
    hrtfToggle.setAttribute('aria-checked', state.meditation.hrtfEnabled);
  }

  // Position buttons
  document.querySelectorAll('#voicePosition .btn-position').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.pos === state.meditation.position);
  });

  // Sync toggle
  const syncToggle = document.getElementById('syncToggle');
  if (syncToggle) {
    syncToggle.classList.toggle('active', state.meditation.syncWithSpace);
    syncToggle.setAttribute('aria-checked', state.meditation.syncWithSpace);
  }
}

function syncMiniPlayer() {
  const miniPlayer = document.getElementById('miniPlayer');
  if (!miniPlayer) return;

  const hasSelection = !!state.meditation.selected;
  miniPlayer.classList.toggle('hidden-layer', !hasSelection);
  document.getElementById('medytacje-view')?.classList.toggle('has-mini-player', hasSelection);
  document.getElementById('mixer-view')?.classList.toggle('has-mini-player', hasSelection);

  if (!hasSelection) return;

  const session = CONFIG.sessions.find(s => s.id === state.meditation.selected);

  const cover = document.getElementById('miniPlayerCover');
  if (cover) {
    if (session?.cover) {
      cover.style.backgroundImage = `url('${session.cover}')`;
      cover.style.background = '';
      cover.textContent = '';
    } else {
      cover.style.backgroundImage = '';
      cover.style.background = session ? coverGradient(session.id) : '';
      cover.textContent = session?.icon || '🧘';
    }
  }

  const title = document.getElementById('miniPlayerTitle');
  if (title) title.textContent = session?.name || 'Podróż';

  const btnMiniPlay = document.getElementById('btnMiniPlayPause');
  if (btnMiniPlay) {
    btnMiniPlay.textContent = state.meditation.isPlaying ? '⏸' : '▶';
  }

  const progress = state.meditation.duration > 0
    ? Math.min((state.meditation.pauseTime || 0) / state.meditation.duration, 1)
    : 0;
  const fill = document.getElementById('miniProgressFill');
  if (fill && !state.meditation.isPlaying) {
    fill.style.width = `${progress * 100}%`;
  }
}

function updateMixerBadge() {
  const ambientActive = state.space.active !== null;
  const objectsActive = Object.values(state.sounds.objects).some(o => o.enabled);
  const hasActive = ambientActive || objectsActive;

  document.getElementById('btnOpenMixer')?.classList.toggle('has-active', hasActive);
  document.getElementById('btnZoneMixer')?.classList.toggle('has-active', hasActive);
}

function syncSpaceUI() {
  // Lista przestrzeni (mikser)
  document.querySelectorAll('#spaceList .item-card').forEach(card => {
    const id = card.dataset.id;
    const isActive = state.space.active === id;
    const isLoading = state.space.loadingSceneId === id;
    card.classList.toggle('active', isActive);
    card.classList.toggle('loading', isLoading);
    card.setAttribute('aria-checked', String(isActive));
    card.setAttribute('aria-busy', String(isLoading));

    // Inline suwak głośności (widoczny tylko dla aktywnej karty)
    const slider = card.querySelector('.inline-volume-slider');
    if (slider && document.activeElement !== slider) {
      const vol = state.space.volumes[id] ?? 0.5;
      slider.value = Math.round(vol * 100);
    }
  });

  // Rząd "Przestrzenie" na Home
  document.querySelectorAll('#spacesRow .space-chip').forEach(chip => {
    const id = chip.dataset.id;
    const isActive = state.space.active === id;
    chip.classList.toggle('active', isActive);
    chip.classList.toggle('loading', state.space.loadingSceneId === id);
    chip.setAttribute('aria-checked', String(isActive));
  });
}

function syncSoundsUI() {
  // Lista dźwięków
  document.querySelectorAll('#soundsList .sound-card').forEach(card => {
    const id = card.dataset.id;
    const objState = state.sounds.objects[id];
    const enabled = objState?.enabled || false;
    const loading = objState?.isLoading || false;

    card.classList.toggle('enabled', enabled);
    card.classList.toggle('loading', loading);
    card.classList.toggle('editing', state.sounds.selectedObjectId === id);

    // Stan przycisku włączania (toggle) — jedyny sposób na włączenie/wyłączenie
    const toggle = card.querySelector('.sound-toggle');
    if (toggle) {
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.setAttribute('aria-busy', String(loading));
    }
  });
}



// ================================================================
// === SEKCJA: CANVAS 3D VISUALIZATION ===
// ================================================================

let canvas = null;
let ctx = null;
let isDragging = false;
let dragObjectId = null;

function initCanvas() {
  canvas = document.getElementById('spatialCanvas');
  if (!canvas) return;
  
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setupCanvasInteractions();
}

function resizeCanvas() {
  if (!canvas) return;
  
  const parent = canvas.parentElement;
  if (!parent) return;
  
  const rect = parent.getBoundingClientRect();
  if (rect.width > 0) {
    canvas.width = rect.width;
    canvas.height = rect.width;
    drawVisualization();
  }
}

function drawVisualization() {
  if (!canvas || !ctx) return;
  
  const w = canvas.width;
  const h = canvas.height;
  
  // Guard against zero dimensions
  if (w <= 0 || h <= 0) return;
  
  const centerX = w / 2;
  const centerY = h / 2;
  const maxRadius = Math.min(w, h) / 2.3;
  
  if (maxRadius <= 0) return;
  
  // Background
  ctx.fillStyle = '#0f1923';
  ctx.fillRect(0, 0, w, h);
  
  // Radial grid
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.12)';
  ctx.lineWidth = 1;
  const step = maxRadius * 0.25;
  if (step > 0) {
    for (let r = step; r <= maxRadius; r += step) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  
  // Direction lines
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
  ctx.lineWidth = 1.5;
  const directions = [
    { angle: 0, label: 'N' },
    { angle: 90, label: 'E' },
    { angle: 180, label: 'S' },
    { angle: 270, label: 'W' }
  ];
  
  directions.forEach(dir => {
    const rad = (dir.angle * Math.PI) / 180;
    const x = centerX + maxRadius * Math.sin(rad);
    const y = centerY - maxRadius * Math.cos(rad);
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    // Label
    const labelX = centerX + (maxRadius + 15) * Math.sin(rad);
    const labelY = centerY - (maxRadius + 15) * Math.cos(rad);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.5)';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dir.label, labelX, labelY);
  });
  
  // Listener (center)
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👤', centerX, centerY);
  
  // Draw objects
  CONFIG.objects.forEach(obj => {
    const objState = state.sounds.objects[obj.id];
    if (!objState.enabled) return;
    
    const pos3d = objState.position3d;
    const rad = (pos3d.azimuth * Math.PI) / 180;
    const visualRadius = (pos3d.distance / 100) * maxRadius;
    const x = centerX + visualRadius * Math.sin(rad);
    const y = centerY - visualRadius * Math.cos(rad);
    
    const isSelected = state.sounds.selectedObjectId === obj.id;
    
    // Object circle
    ctx.fillStyle = isSelected ? '#c850a0' : '#34d399';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    
    // Glow for selected
    if (isSelected) {
      ctx.strokeStyle = 'rgba(200, 80, 160, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Icon
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.icon, x, y);
    
    // Elevation indicator
    if (pos3d.elevation !== 0) {
      ctx.fillStyle = pos3d.elevation > 0 ? '#ffdd00' : '#00ddff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(pos3d.elevation > 0 ? '↑' : '↓', x + 16, y - 16);
    }
  });
}

function setupCanvasInteractions() {
  if (!canvas) return;
  
  function getObjectAt(x, y) {
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.min(w, h) / 2.3;
    
    for (const obj of CONFIG.objects) {
      const objState = state.sounds.objects[obj.id];
      if (!objState.enabled) continue;
      
      const pos3d = objState.position3d;
      const rad = (pos3d.azimuth * Math.PI) / 180;
      const visualRadius = (pos3d.distance / 100) * maxRadius;
      const objX = centerX + visualRadius * Math.sin(rad);
      const objY = centerY - visualRadius * Math.cos(rad);
      
      const dist = Math.sqrt((x - objX) ** 2 + (y - objY) ** 2);
      if (dist < 25) return obj.id;
    }
    return null;
  }
  
  function updateObjectPositionFromCanvas(objectId, canvasX, canvasY) {
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.min(w, h) / 2.3;
    
    const dx = canvasX - centerX;
    const dy = centerY - canvasY;
    
    let azimuth = Math.atan2(dx, dy) * (180 / Math.PI);
    if (azimuth < 0) azimuth += 360;
    
    let distance = Math.sqrt(dx * dx + dy * dy) / maxRadius * 100;
    distance = Math.max(1, Math.min(100, distance));
    
    const objState = state.sounds.objects[objectId];
    objState.position3d.azimuth = Math.round(azimuth);
    objState.position3d.distance = Math.round(distance);
    
    updateObject3DPosition(objectId);
    
    // Update sliders if this object is selected
    if (state.sounds.selectedObjectId === objectId) {
      const azSlider = document.getElementById('azimuth3d');
      const azValue = document.getElementById('azimuthValue');
      if (azSlider) azSlider.value = Math.round(azimuth);
      if (azValue) azValue.textContent = Math.round(azimuth) + '°';
      
      const distSlider = document.getElementById('distance3d');
      const distValue = document.getElementById('distanceValue');
      if (distSlider) distSlider.value = Math.round(distance);
      if (distValue) distValue.textContent = Math.round(distance) + 'm';
    }
  }
  
  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const objId = getObjectAt(x, y);
    if (objId) {
      isDragging = true;
      dragObjectId = objId;
      selectObjectFor3DControl(objId);
    }
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragObjectId) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    updateObjectPositionFromCanvas(dragObjectId, x, y);
    drawVisualization();
  });
  
  canvas.addEventListener('mouseup', () => {
    isDragging = false;
    dragObjectId = null;
  });
  
  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    dragObjectId = null;
  });
  
  // Touch events
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    const objId = getObjectAt(x, y);
    if (objId) {
      isDragging = true;
      dragObjectId = objId;
      selectObjectFor3DControl(objId);
    }
  }, { passive: true });
  
  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || !dragObjectId) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    updateObjectPositionFromCanvas(dragObjectId, x, y);
    drawVisualization();
  }, { passive: false });
  
  canvas.addEventListener('touchend', () => {
    isDragging = false;
    dragObjectId = null;
  });
}


// ================================================================
// === SEKCJA: EVENT HANDLERS ===
// ================================================================

function setupEventHandlers() {
  // === Start button ===
  document.getElementById('btnStart')?.addEventListener('click', async () => {
    await initAudioContext();
    document.getElementById('audioPrompt')?.classList.add('hidden');
  });
  
  // === Nawigacja: Odtwarzacz → strefa Medytacje ===
  document.getElementById('btnBackToHome')?.addEventListener('click', () => {
    switchView('medytacje');
  });

  // === Mikser tła (osobna strefa) ===
  document.getElementById('btnOpenMixer')?.addEventListener('click', openMixer);

  document.getElementById('mixerTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.mixer-tab');
    if (btn) setMixerTab(btn.dataset.mixerTab);
  });

  // === Mini-player ===
  document.getElementById('miniPlayer')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-mini-control') || e.target.closest('.btn-mini-play')) return;
    switchView('player');
  });

  document.getElementById('btnMiniPlayPause')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.meditation.selected) return;
    if (state.meditation.isPlaying) {
      pauseMeditation();
    } else {
      playMeditation();
    }
  });

  document.getElementById('btnMiniStop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stopMeditation();
  });

  // === Global Controls ===
  document.getElementById('btnPlayPauseAll')?.addEventListener('click', () => {
    if (state.isGlobalPlaying && !state.isGlobalPaused) {
      pauseAll();
    } else {
      resumeAll();
    }
  });
  
  document.getElementById('btnStopAll')?.addEventListener('click', stopAll);
  
  // === Master Volume ===
  const masterVolume = document.getElementById('masterVolume');
  const masterVolumeValue = document.getElementById('masterVolumeValue');
  masterVolume?.addEventListener('input', (e) => {
    state.masterVolume = e.target.value / 100;
    if (masterVolumeValue) masterVolumeValue.textContent = `${e.target.value}%`;
    if (state.masterGain && state.audioContext) {
      state.masterGain.gain.setTargetAtTime(state.masterVolume, state.audioContext.currentTime, 0.1);
    }
  });
  
  // === Meditation Controls ===
  document.getElementById('btnPlayMeditation')?.addEventListener('click', () => {
    if (!state.meditation.selected) {
      showStatus('Wybierz najpierw sesję', 2000);
      return;
    }
    
    if (state.meditation.isPlaying) {
      pauseMeditation();
    } else {
      playMeditation();
    }
  });
  
  document.getElementById('btnStopMeditation')?.addEventListener('click', stopMeditation);
  
  // === Dolna nawigacja stref ===
  document.getElementById('bottomNav')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.nav-tab');
    if (!tab) return;
    switchView(tab.dataset.zone);
  });

  // === Biblioteka: poziom tematów (grupy) ===
  document.getElementById('libraryGroups')?.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (tile) openGroup(tile.dataset.group);
  });

  // === Biblioteka: poziom podtematów (podgrupy) ===
  document.getElementById('librarySubgroups')?.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    if (tile.dataset.direct === '1') {
      showLibraryLevel('files', tile.dataset.group, null);
    } else {
      showLibraryLevel('files', tile.dataset.group, tile.dataset.subgroup);
    }
  });

  // === Biblioteka: poziom plików (medytacje) ===
  document.getElementById('libraryFiles')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.file-card');
    if (!card) return;
    const id = card.dataset.id;

    // Przycisk play w wierszu — załaduj i przełącz play/pauza bez wchodzenia w odtwarzacz
    if (e.target.closest('.file-card-play')) {
      if (id !== state.meditation.selected) {
        stopMeditation();
        await loadMeditationSession(id);
      }
      if (state.meditation.isPlaying) pauseMeditation();
      else playMeditation();
      return;
    }

    // Kliknięcie wiersza — otwórz pełnoekranowy odtwarzacz
    if (id && id !== state.meditation.selected) {
      stopMeditation();
      await loadMeditationSession(id);
    }
    switchView('player');
  });

  // === Biblioteka: przycisk wstecz ===
  document.getElementById('btnLibraryBack')?.addEventListener('click', libraryBack);

  // Sekcja "Kontynuuj" (Home)
  document.getElementById('continueRow')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.continue-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('.continue-card-play')) {
      if (id !== state.meditation.selected) {
        stopMeditation();
        await loadMeditationSession(id);
      }
      if (state.meditation.isPlaying) {
        pauseMeditation();
      } else {
        playMeditation();
      }
      return;
    }

    if (id && id !== state.meditation.selected) {
      stopMeditation();
      await loadMeditationSession(id);
    }
    switchView('player');
  });

  // Voice volume
  const voiceVolume = document.getElementById('voiceVolume');
  voiceVolume?.addEventListener('input', (e) => {
    state.meditation.volume = e.target.value / 100;
    document.getElementById('voiceVolumeValue').textContent = `${e.target.value}%`;
    if (state.meditation.gainNode && state.audioContext) {
      state.meditation.gainNode.gain.setTargetAtTime(state.meditation.volume, state.audioContext.currentTime, 0.1);
    }
  });
  
  // HRTF toggle
  document.getElementById('hrtfToggle')?.addEventListener('click', function() {
    const enabled = !this.classList.contains('active');
    toggleHRTF(enabled);
  });
  
  // Position buttons
  document.getElementById('voicePosition')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-position');
    if (btn) {
      updateMeditationPosition(btn.dataset.pos);
    }
  });
  
  // Sync toggle
  document.getElementById('syncToggle')?.addEventListener('click', function() {
    state.meditation.syncWithSpace = !this.classList.contains('active');
    markStateChanged();
    showStatus(state.meditation.syncWithSpace 
      ? 'Przestrzeń zakończy się z końcem medytacji' 
      : 'Przestrzeń działa niezależnie');
  });
  
  // Progress bar — prawdziwy suwak z przeciąganiem (pointer events: mysz + dotyk)
  (() => {
    const bar = document.getElementById('progressBar');
    if (!bar) return;

    let dragging = false;

    const progressFromEvent = (e) => {
      const rect = bar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return Math.min(1, Math.max(0, rect.width > 0 ? x / rect.width : 0));
    };

    // Tylko podgląd wizualny (pasek + czas) — bez ruszania audio, żeby przeciąganie było płynne.
    const previewSeek = (progress) => {
      const seekTime = progress * (state.meditation.duration || 0);
      updateProgressBar(progress);
      document.getElementById('currentTime').textContent = formatTime(seekTime);
    };

    // Faktyczny seek na audiobufferze — dopiero po puszczeniu suwaka.
    const commitSeek = (progress) => {
      if (!state.meditation.buffer) return;
      const seekTime = progress * state.meditation.duration;
      const wasPlaying = state.meditation.isPlaying;

      stopMeditation();
      state.meditation.pauseTime = seekTime;
      state.meditation.isPaused = true;

      updateProgressBar(progress);
      document.getElementById('currentTime').textContent = formatTime(seekTime);

      if (wasPlaying) {
        playMeditation();
      }
    };

    bar.addEventListener('pointerdown', (e) => {
      if (!state.meditation.buffer) return;
      dragging = true;
      bar.classList.add('dragging');
      bar.setPointerCapture(e.pointerId);
      previewSeek(progressFromEvent(e));
    });

    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      previewSeek(progressFromEvent(e));
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      commitSeek(progressFromEvent(e));
    };

    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
  })();
  
  // === Space Controls ===
  document.getElementById('spaceList')?.addEventListener('click', async (e) => {
    if (e.target.closest('.item-inline-volume')) return; // suwak głośności ma własną obsługę
    const card = e.target.closest('.item-card');
    if (!card) return;

    const id = card.dataset.id;

    if (state.space.active === id) {
      stopScene(id);
    } else {
      await selectScene(id);
    }
  });

  // Inline suwak głośności — Ambient
  document.getElementById('spaceList')?.addEventListener('input', (e) => {
    const slider = e.target.closest('.inline-volume-slider');
    if (!slider) return;
    const card = slider.closest('.item-card');
    if (!card || card.dataset.id !== state.space.active) return;
    updateSceneVolume(slider.value / 100);
  });

  // === Sounds 3D Controls ===
  // Toggle TYLKO dedykowanym przyciskiem ⏻ — skrolowanie listy nie zmienia stanu.
  // Neutralny obszar wiersza oraz ⚙ otwierają arkusz edycji pozycji 3D.
  document.getElementById('soundsList')?.addEventListener('click', (e) => {
    const card = e.target.closest('.sound-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('.sound-toggle')) {
      const objState = state.sounds.objects[id];
      if (objState) toggleObject(id, !objState.enabled);
      return;
    }

    // ⚙ lub neutralny obszar wiersza → arkusz edycji pozycji 3D
    openSoundSheet(id);
  });

  // Backdrop zamyka arkusz edycji
  document.getElementById('sound3dBackdrop')?.addEventListener('click', closeSoundSheet);

  // Zamknięcie arkusza przyciskiem ✕
  document.getElementById('btnClose3d')?.addEventListener('click', () => {
    closeSoundSheet();
  });
  
  // 3D Sliders
  ['baseVolume3d', 'distance3d', 'azimuth3d', 'elevation3d'].forEach(sliderId => {
    document.getElementById(sliderId)?.addEventListener('input', (e) => {
      const objectId = state.sounds.selectedObjectId;
      if (!objectId) return;
      
      const objState = state.sounds.objects[objectId];
      const value = parseFloat(e.target.value);
      
      switch(sliderId) {
        case 'baseVolume3d':
          objState.baseVolume = value / 100;
          document.getElementById('baseVolumeValue').textContent = Math.round(value) + '%';
          if (objState.enabled && objState.gainNode && state.audioContext) {
            const finalVol = objState.volume * objState.baseVolume;
            objState.gainNode.gain.setTargetAtTime(finalVol, state.audioContext.currentTime, 0.1);
          }
          break;
        case 'distance3d':
          objState.position3d.distance = value;
          document.getElementById('distanceValue').textContent = Math.round(value) + 'm';
          updateObject3DPosition(objectId);
          break;
        case 'azimuth3d':
          objState.position3d.azimuth = value;
          document.getElementById('azimuthValue').textContent = Math.round(value) + '°';
          updateObject3DPosition(objectId);
          break;
        case 'elevation3d':
          objState.position3d.elevation = value;
          document.getElementById('elevationValue').textContent = (value >= 0 ? '+' : '') + Math.round(value) + '°';
          updateObject3DPosition(objectId);
          break;
      }
      
      drawVisualization();
    });
  });
  
  // === Timer ===
  document.getElementById('timerBtn')?.addEventListener('click', () => {
    document.getElementById('timerPanel')?.classList.toggle('visible');
  });
  
  document.getElementById('btnCloseTimer')?.addEventListener('click', () => {
    document.getElementById('timerPanel')?.classList.remove('visible');
  });
  
  document.querySelectorAll('.btn-timer-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const minutes = parseInt(btn.dataset.minutes);
      
      document.querySelectorAll('.btn-timer-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      state.timer.selectedPreset = minutes;
      document.getElementById('timerDisplay').textContent = formatTime(minutes * 60);
    });
  });
  
  document.getElementById('btnTimerStart')?.addEventListener('click', () => {
    if (state.timer.selectedPreset) {
      startTimer(state.timer.selectedPreset);
      document.getElementById('timerPanel')?.classList.remove('visible');
    } else {
      showStatus('Wybierz najpierw czas');
    }
  });
  
  document.getElementById('btnTimerStop')?.addEventListener('click', stopTimer);

  // === Dostępność klawiatury: aktywacja kart Enter/Spacja + Escape zamyka nakładki ===
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // Karty obsługiwane przez delegację 'click' na kontenerze — symulacja kliknięcia wystarcza
      if (target.matches('.tile, .file-card, .continue-card, .item-card:not(.sound-card)')) {
        e.preventDefault();
        target.click();
        return;
      }

      // Obiekty 3D — tap/klawiatura włącza/wyłącza (long-press/⚙ otwiera pozycję)
      if (target.matches('.sound-card')) {
        e.preventDefault();
        const id = target.dataset.id;
        const objState = state.sounds.objects[id];
        if (objState) toggleObject(id, !objState.enabled);
        return;
      }
      return;
    }

    if (e.key === 'Escape') {
      if (state.sounds.selectedObjectId) {
        closeSoundSheet();
        return;
      }
      if (document.getElementById('timerPanel')?.classList.contains('visible')) {
        document.getElementById('timerPanel').classList.remove('visible');
        return;
      }
      // W bibliotece: Escape cofa o poziom; w mikserze: wraca do medytacji
      if (state.currentView === 'mixer') {
        switchView('medytacje');
        return;
      }
      if (state.currentView === 'medytacje' && state.library.level !== 'groups') {
        libraryBack();
        return;
      }
    }
  });

  // === Gest mobilny: przeciągnięcie w dół zamyka panel timera ===
  attachSwipeDownToClose(
    document.getElementById('timerPanel'),
    document.querySelector('#timerPanel .timer-panel-header'),
    () => document.getElementById('timerPanel')?.classList.remove('visible')
  );
  attachSwipeDownToClose(
    document.getElementById('controls3dPanel'),
    document.querySelector('#controls3dPanel .controls-3d-header'),
    closeSoundSheet
  );
}

// Przeciągnięcie uchwytu (nagłówka) panelu w dół o więcej niż próg — zamyka panel.
// Typowy mobilny gest odrzucania "bottom sheet"; śledzimy tylko pojedynczy dotyk.
function attachSwipeDownToClose(sheetEl, handleEl, onClose) {
  if (!sheetEl || !handleEl) return;

  let startY = 0;
  let dragging = false;

  handleEl.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    dragging = true;
    sheetEl.style.transition = 'none';
  }, { passive: true });

  handleEl.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheetEl.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  handleEl.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    sheetEl.style.transition = '';
    const dy = e.changedTouches[0].clientY - startY;
    sheetEl.style.transform = '';
    if (dy > 80) onClose();
  });

  handleEl.addEventListener('touchcancel', () => {
    dragging = false;
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
  });
}


// ================================================================
// === SEKCJA: MANIFEST / BIBLIOTEKA ===
// ================================================================

// Ładowanie biblioteki z manifest.json.
// Mapuje wpisy manifestu na wewnętrzny kształt CONFIG (name/file/fallback),
// dzięki czemu reszta kodu nie wymaga zmian. Renderujemy tylko to, co istnieje.
async function loadManifest() {
  const mapEntry = (item) => ({
    id: item.id,
    name: item.title || item.name || item.id,
    author: item.author || '',
    icon: item.icon || '🎧',
    file: item.src?.webm || item.file || null,
    fallback: item.src?.mp3 || item.fallback || null,
    description: item.description || '',
    duration: item.duration || '',
    cover: item.cover || '',
    group: item.group,
    subgroup: item.subgroup,
    defaultVoicePosition: item.defaultVoicePosition,
    defaultDistance: item.defaultDistance
  });

  try {
    const response = await fetch(CONFIG.manifestUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    CONFIG.sessions = (data.meditations || []).map(mapEntry);
    CONFIG.scenes   = (data.ambient || []).map(mapEntry);
    CONFIG.objects  = (data.objects || []).map(mapEntry);
    CONFIG.meditationGroups = data.meditationGroups || [];

    console.log(
      `📚 Manifest: ${CONFIG.sessions.length} medytacji, ` +
      `${CONFIG.scenes.length} scen, ${CONFIG.objects.length} obiektów`
    );
  } catch (err) {
    console.error('Nie udało się załadować manifest.json:', err);
    showStatus('Nie udało się załadować biblioteki', 4000);
    CONFIG.sessions = [];
    CONFIG.scenes = [];
    CONFIG.objects = [];
    CONFIG.meditationGroups = [];
  }
}


// ================================================================
// === SEKCJA: INITIALIZATION ===
// ================================================================

async function init() {
  // 1. Załaduj bibliotekę z manifestu (wypełnia CONFIG.sessions/scenes/objects)
  await loadManifest();

  // 2. Zbuduj stan zależny od zawartości biblioteki
  initStateFromConfig();

  // 3. Powitanie + budowa biblioteki (grupy/podgrupy) + listy miksera
  updateGreeting();
  buildLibraryTree();
  showLibraryLevel('groups');
  renderSpaceList();
  renderSoundsList();
  renderContinueSection();

  // 4. Inicjalizacja canvas
  initCanvas();

  // 5. Event handlery
  setupEventHandlers();

  // 6. Synchronizacja UI
  syncAllUI();

  console.log('🎧 Przestrzeń relaksu — Harmonic Layers — zainicjalizowana');
  console.log('📁 Biblioteka: manifest.json → assets/audio/{voice,scenes,objects}/*');
}

// Uruchom po załadowaniu DOM
document.addEventListener('DOMContentLoaded', init);

