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
  // Sesje medytacji prowadzonej
  sessions: [
    { 
      id: 'body-scan', 
      name: 'Podróż przez ciało', 
      icon: '🧘', 
      file: 'assets/audio/voice/body-scan.webm', 
      fallback: 'assets/audio/voice/body-scan.mp3', 
      description: 'Delikatna wędrówka uwagi przez każdą część ciała',
      duration: '15 min'
    },
    { 
      id: 'breath-sitting', 
      name: 'Spokojny oddech', 
      icon: '🌬️', 
      file: 'assets/audio/voice/breath-sitting.webm', 
      fallback: 'assets/audio/voice/breath-sitting.mp3', 
      description: 'Powrót do naturalnego rytmu oddechu',
      duration: '10 min'
    },
    { 
      id: 'sounds-thoughts', 
      name: 'Przestrzeń myśli', 
      icon: '🎵', 
      file: 'assets/audio/voice/sounds-thoughts.webm', 
      fallback: 'assets/audio/voice/sounds-thoughts.mp3', 
      description: 'Obserwuj myśli jak chmury na niebie',
      duration: '12 min'
    },
    { 
      id: 'relaxation', 
      name: 'Głębokie rozluźnienie', 
      icon: '💆', 
      file: 'assets/audio/voice/relaxation.webm', 
      fallback: 'assets/audio/voice/relaxation.mp3', 
      description: 'Systematyczne uwalnianie napięć ciała',
      duration: '20 min'
    },
    { 
      id: 'visualization', 
      name: 'Wewnętrzna podróż', 
      icon: '🌌', 
      file: 'assets/audio/voice/visualization.webm', 
      fallback: 'assets/audio/voice/visualization.mp3', 
      description: 'Wizualizacja prowadząca do miejsca spokoju',
      duration: '18 min'
    }
  ],
  
  // Sceny tła dźwiękowego (przestrzenie)
  scenes: [
    { 
      id: 'beach', 
      name: 'Plaża', 
      icon: '🏖️', 
      file: 'assets/audio/scenes/beach.webm', 
      fallback: 'assets/audio/scenes/beach.mp3', 
      description: 'Ciepły piasek, delikatne fale, śpiew mew' 
    },
    { 
      id: 'mountain-meadow', 
      name: 'Polana', 
      icon: '🏔️', 
      file: 'assets/audio/scenes/mountain-meadow.webm', 
      fallback: 'assets/audio/scenes/mountain-meadow.mp3', 
      description: 'Szum wiatru w trawach, przestrzeń i cisza' 
    },
    { 
      id: 'summer-forest', 
      name: 'Las', 
      icon: '🌲', 
      file: 'assets/audio/scenes/summer-forest.webm', 
      fallback: 'assets/audio/scenes/summer-forest.mp3', 
      description: 'Szelest liści, śpiew ptaków, zapach żywicy' 
    },
    { 
      id: 'night-cicadas', 
      name: 'Cykady', 
      icon: '🌙', 
      file: 'assets/audio/scenes/night-cicadas.webm', 
      fallback: 'assets/audio/scenes/night-cicadas.mp3', 
      description: 'Ciepła letnia noc, rytmiczny chór owadów' 
    }
  ],
  
  // Obiekty dźwiękowe 3D
  objects: [
    { 
      id: 'bell', 
      name: 'Misa tybetańska', 
      icon: '🔔', 
      file: 'assets/audio/objects/bell.webm', 
      fallback: 'assets/audio/objects/bell.mp3', 
      description: 'Rezonujący dźwięk prowadzący do skupienia' 
    },
    { 
      id: 'clock', 
      name: 'Zegar', 
      icon: '🕰️', 
      file: 'assets/audio/objects/clock.webm', 
      fallback: 'assets/audio/objects/clock.mp3', 
      description: 'Miarowy rytm odmierzający chwile ciszy' 
    },
    { 
      id: 'blackbird', 
      name: 'Kos', 
      icon: '🐦', 
      file: 'assets/audio/objects/blackbird.webm', 
      fallback: 'assets/audio/objects/blackbird.mp3', 
      description: 'Melodia poranka, naturalny budzik duszy' 
    },
    { 
      id: 'stream', 
      name: 'Strumień', 
      icon: '💧', 
      file: 'assets/audio/objects/stream.webm', 
      fallback: 'assets/audio/objects/stream.mp3', 
      description: 'Nieustanny przepływ, symbol puszczania' 
    }
  ],
  
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
  }
};


// ================================================================
// === SEKCJA: STATE MANAGEMENT ===
// ================================================================

const state = {
  _stateVersion: 0,
  currentView: 'menu', // 'menu', 'meditation', 'space', 'sounds'

  // Audio context
  audioContext: null,
  masterGain: null,
  
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
    instanceIds: {}
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

// Inicjalizacja stanu obiektów 3D
CONFIG.objects.forEach(obj => {
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
      distance: 20 + Math.random() * 30
    },
    instanceId: null,
    isLoading: false
  };
});

// Inicjalizacja stanu scen
CONFIG.scenes.forEach(scene => {
  state.space.volumes[scene.id] = 0.5;
  state.space.instanceIds[scene.id] = null;
});


// ================================================================
// === SEKCJA: UTILITY FUNCTIONS ===
// ================================================================

function switchView(viewName) {
  state.currentView = viewName;

  const topLayer = document.getElementById('top-ui-layer');
  const mainMenu = document.getElementById('main-menu');
  const mainContent = document.getElementById('mainContent');

  if (viewName === 'menu') {
    topLayer?.classList.add('hidden-layer');
    mainContent?.classList.add('hidden-layer');
    mainMenu?.classList.remove('hidden-layer');
  } else {
    topLayer?.classList.remove('hidden-layer');
    mainContent?.classList.remove('hidden-layer');
    mainMenu?.classList.add('hidden-layer');

    // Switch Tab
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    const activePanel = document.getElementById(`tab-${viewName}`);
    if (activePanel) activePanel.classList.add('active');

    // Resize canvas if needed
    if (viewName === 'sounds') {
      setTimeout(resizeCanvas, 100);
    }
  }

  syncStatusBar();
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

async function initAudioContext() {
  if (state.audioContext) return;
  
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master gain
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.setValueAtTime(state.masterVolume, state.audioContext.currentTime);
    state.masterGain.connect(state.audioContext.destination);
    
    // Inicjalizacja gain nodes dla scen
    CONFIG.scenes.forEach(scene => {
      const gain = state.audioContext.createGain();
      gain.gain.setValueAtTime(0, state.audioContext.currentTime);
      gain.connect(state.masterGain);
      state.space.gains[scene.id] = gain;
    });
    
    // Inicjalizacja nodes dla obiektów 3D
    CONFIG.objects.forEach(obj => {
      const objState = state.sounds.objects[obj.id];
      
      objState.gainNode = state.audioContext.createGain();
      objState.gainNode.gain.setValueAtTime(0, state.audioContext.currentTime);
      
      objState.pannerNode = state.audioContext.createPanner();
      objState.pannerNode.panningModel = 'HRTF';
      objState.pannerNode.distanceModel = 'linear';
      objState.pannerNode.refDistance = CONFIG.audio3d.refDistance;
      objState.pannerNode.rolloffFactor = CONFIG.audio3d.rolloffFactor;
      objState.pannerNode.maxDistance = CONFIG.audio3d.maxDistance;
      
      objState.gainNode.connect(objState.pannerNode);
      objState.pannerNode.connect(state.masterGain);
      
      updateObject3DPosition(obj.id);
    });
    
    // Panner dla medytacji
    state.meditation.pannerNode = state.audioContext.createPanner();
    state.meditation.pannerNode.panningModel = 'HRTF';
    state.meditation.pannerNode.connect(state.masterGain);
    
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
  if (!state.meditation.gainNode || !state.meditation.pannerNode || !state.masterGain) return;
  
  if (enabled) {
    state.meditation.gainNode.disconnect();
    state.meditation.gainNode.connect(state.meditation.pannerNode);
    updateMeditationPosition(state.meditation.position);
  } else {
    state.meditation.gainNode.disconnect();
    state.meditation.gainNode.connect(state.masterGain);
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
}


// ================================================================
// === SEKCJA: SPACE PLAYBACK ===
// ================================================================

async function selectScene(sceneId) {
  const scene = CONFIG.scenes.find(s => s.id === sceneId);
  if (!scene || !state.audioContext) return;
  
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
    state.space.buffers[sceneId] = await loadAudioBuffer(scene.file, scene.fallback);
  }
  
  const buffer = state.space.buffers[sceneId];
  if (!buffer) {
    showStatus('Nie mogę odnaleźć tej przestrzeni', 3000);
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
  
  objState.enabled = enabled;
  markStateChanged();
  
  if (enabled) {
    showStatus(`Dodaję: ${obj.name}...`);
    
    const newInstanceId = generateInstanceId();
    objState.instanceId = newInstanceId;
    objState.isLoading = true;
    
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

function selectObjectFor3DControl(objectId) {
  state.sounds.selectedObjectId = objectId;
  
  const panel = document.getElementById('controls3dPanel');
  if (!panel) return;
  
  if (objectId) {
    const objState = state.sounds.objects[objectId];
    const obj = CONFIG.objects.find(o => o.id === objectId);
    
    panel.classList.add('visible');
    
    const titleEl = document.getElementById('controls3dTitle');
    if (titleEl && obj) {
      titleEl.textContent = `${obj.icon} ${obj.name} — pozycja 3D`;
    }
    
    // Ustaw wartości sliderów
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
    
  } else {
    panel.classList.remove('visible');
  }
  
  markStateChanged();
  drawVisualization();
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
    timerMini.textContent = '--:--';
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
  const timerMini = document.getElementById('timerBtn');
  
  const timeText = state.timer.isRunning ? formatTime(state.timer.remaining) : '--:--';
  
  if (display) display.textContent = timeText;
  if (timerMini) timerMini.textContent = timeText;
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

function renderMeditationList() {
  const container = document.getElementById('meditationList');
  if (!container) return;
  
  container.innerHTML = CONFIG.sessions.map(session => `
    <div class="item-card" data-id="${session.id}">
      <div class="item-icon">${session.icon}</div>
      <div class="item-info">
        <div class="item-name">${session.name}</div>
        <div class="item-desc">${session.duration} • ${session.description}</div>
      </div>
      <div class="item-status"></div>
    </div>
  `).join('');
}

function renderSpaceList() {
  const container = document.getElementById('spaceList');
  if (!container) return;
  
  container.innerHTML = CONFIG.scenes.map(scene => `
    <div class="item-card" data-id="${scene.id}">
      <div class="item-icon">${scene.icon}</div>
      <div class="item-info">
        <div class="item-name">${scene.name}</div>
        <div class="item-desc">${scene.description}</div>
      </div>
      <div class="item-status"></div>
    </div>
  `).join('');
}

function renderSoundsList() {
  const container = document.getElementById('soundsList');
  if (!container) return;
  
  container.innerHTML = CONFIG.objects.map(obj => `
    <div class="item-card sound-card" data-id="${obj.id}">
      <div class="item-icon">${obj.icon}</div>
      <div class="item-info">
        <div class="item-name">${obj.name}</div>
        <div class="item-desc">Przytrzymaj → ustawienia 3D</div>
      </div>
      <div class="item-status"></div>
    </div>
  `).join('');
}

function syncAllUI() {
  syncMeditationUI();
  syncSpaceUI();
  syncSoundsUI();
  syncStatusBar();
  drawVisualization();
}

function syncMeditationUI() {
  // Lista medytacji
  document.querySelectorAll('#meditationList .item-card').forEach(card => {
    const id = card.dataset.id;
    const isSelected = state.meditation.selected === id;
    const isPlaying = isSelected && state.meditation.isPlaying;
    
    card.classList.toggle('selected', isSelected);
    card.classList.toggle('playing', isPlaying);
  });
  
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

function syncSpaceUI() {
  // Lista przestrzeni
  document.querySelectorAll('#spaceList .item-card').forEach(card => {
    const id = card.dataset.id;
    const isActive = state.space.active === id;
    card.classList.toggle('active', isActive);
  });
  
  // Suwak głośności
  const volumeControl = document.getElementById('spaceVolumeControl');
  if (volumeControl) {
    volumeControl.classList.toggle('visible', state.space.active !== null);
    
    if (state.space.active) {
      const vol = state.space.volumes[state.space.active] ?? 0.5;
      const slider = document.getElementById('spaceVolume');
      const value = document.getElementById('spaceVolumeValue');
      if (slider) slider.value = Math.round(vol * 100);
      if (value) value.textContent = Math.round(vol * 100) + '%';
    }
  }
}

function syncSoundsUI() {
  // Lista dźwięków
  document.querySelectorAll('#soundsList .sound-card').forEach(card => {
    const id = card.dataset.id;
    const objState = state.sounds.objects[id];
    card.classList.toggle('enabled', objState?.enabled || false);
  });
}

function syncStatusBar() {
  const meditationChip = document.querySelector('.status-chip.meditation');
  const spaceChip = document.querySelector('.status-chip.space');
  const soundsChip = document.querySelector('.status-chip.sounds');
  
  // Meditation
  if (meditationChip) {
    const isPlaying = state.meditation.isPlaying;
    const isSelected = state.currentView === 'meditation';

    meditationChip.classList.toggle('active', isSelected);
    meditationChip.classList.toggle('playing', isPlaying);
    
    const textSpan = meditationChip.querySelector('span:last-child');
    if (textSpan) {
      if (isPlaying && state.meditation.selected) {
        const session = CONFIG.sessions.find(s => s.id === state.meditation.selected);
        textSpan.textContent = `▶ ${session?.name || 'Podróż'}`;
      } else {
        textSpan.textContent = 'Podróże';
      }
    }
  }
  
  // Space
  if (spaceChip) {
    const isPlaying = state.space.active !== null;
    const isSelected = state.currentView === 'space';

    spaceChip.classList.toggle('active', isSelected);
    spaceChip.classList.toggle('playing', isPlaying);
    
    const textSpan = spaceChip.querySelector('span:last-child');
    if (textSpan) {
      if (isPlaying) {
        const scene = CONFIG.scenes.find(s => s.id === state.space.active);
        textSpan.textContent = `${scene?.icon || ''} ${scene?.name || 'Przestrzeń'}`;
      } else {
        textSpan.textContent = 'Przestrzenie';
      }
    }
  }
  
  // Sounds
  if (soundsChip) {
    const enabledCount = Object.values(state.sounds.objects).filter(o => o.enabled).length;
    const isSelected = state.currentView === 'sounds';

    soundsChip.classList.toggle('active', isSelected);
    soundsChip.classList.toggle('playing', enabledCount > 0);
    
    const textSpan = soundsChip.querySelector('span:last-child');
    if (textSpan) {
      if (enabledCount > 0) {
        textSpan.textContent = `×${enabledCount} aktywn${enabledCount === 1 ? 'y' : 'e'}`;
      } else {
        textSpan.textContent = 'Dźwięki';
      }
    }
  }
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
  
  // === Main Menu & Navigation ===

  // Main Menu Cards
  document.querySelectorAll('.menu-card').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.dataset.target;
      switchView(target);
    });
  });

  // Top Navigation (Status Chips)
  document.querySelectorAll('.status-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const target = chip.dataset.layer; // reused 'data-layer' for id
      switchView(target);
    });
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
  masterVolume?.addEventListener('input', (e) => {
    state.masterVolume = e.target.value / 100;
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
  
  // Meditation list
  document.getElementById('meditationList')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;
    
    const id = card.dataset.id;
    if (id && id !== state.meditation.selected) {
      stopMeditation();
      await loadMeditationSession(id);
    }
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
  
  // Progress bar seek
  document.getElementById('progressBar')?.addEventListener('click', (e) => {
    if (!state.meditation.buffer) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = (e.clientX - rect.left) / rect.width;
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
  });
  
  // === Space Controls ===
  document.getElementById('spaceList')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;
    
    const id = card.dataset.id;
    
    if (state.space.active === id) {
      stopScene(id);
    } else {
      await selectScene(id);
    }
  });
  
  // Space volume
  document.getElementById('spaceVolume')?.addEventListener('input', (e) => {
    const volume = e.target.value / 100;
    updateSceneVolume(volume);
    document.getElementById('spaceVolumeValue').textContent = `${e.target.value}%`;
  });
  
  // === Sounds 3D Controls ===
  let longPressTimer = null;
  let isLongPress = false;
  
  document.getElementById('soundsList')?.addEventListener('mousedown', startSoundPress);
  document.getElementById('soundsList')?.addEventListener('mouseup', endSoundPress);
  document.getElementById('soundsList')?.addEventListener('mouseleave', cancelSoundPress);
  document.getElementById('soundsList')?.addEventListener('touchstart', startSoundPress, { passive: true });
  document.getElementById('soundsList')?.addEventListener('touchend', endSoundPress);
  
  function startSoundPress(e) {
    const card = e.target.closest('.sound-card');
    if (!card) return;
    
    const id = card.dataset.id;
    isLongPress = false;
    
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      selectObjectFor3DControl(id);
    }, 500);
  }
  
  function endSoundPress(e) {
    clearTimeout(longPressTimer);
    
    if (!isLongPress) {
      const card = e.target.closest('.sound-card');
      if (card) {
        const id = card.dataset.id;
        const objState = state.sounds.objects[id];
        toggleObject(id, !objState.enabled);
      }
    }
  }
  
  function cancelSoundPress() {
    clearTimeout(longPressTimer);
  }
  
  // 3D Controls Panel
  document.getElementById('btnClose3d')?.addEventListener('click', () => {
    selectObjectFor3DControl(null);
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
}


// ================================================================
// === SEKCJA: INITIALIZATION ===
// ================================================================

function init() {
  // Renderowanie list
  renderMeditationList();
  renderSpaceList();
  renderSoundsList();
  
  // Inicjalizacja canvas
  initCanvas();
  
  // Event handlery
  setupEventHandlers();
  
  // Synchronizacja UI
  syncAllUI();
  
  console.log('🎧 Przestrzeń relaksu — Harmonic Layers — zainicjalizowana');
  console.log('📁 Ścieżki audio: assets/audio/{voice,scenes,objects,timer}/*.webm');
}

// Uruchom po załadowaniu DOM
document.addEventListener('DOMContentLoaded', init);
