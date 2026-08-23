(() => {
  "use strict";

  const basePath = "assets/sfx/";
  const saveKey = "wav-sequencer-pattern";
  const themeKey = "wav-sequencer-theme";
  const genres = window.SEQUENCER_GENRES;
  const schedulerIntervalMs = 25;
  const scheduleAheadSeconds = 0.1;
  const startLeadSeconds = 0.05;
  const maximumLateSeconds = 0.035;
  const autoSaveDelayMs = 450;

  const app = document.querySelector("#app");
  const lanesEl = document.querySelector("#lanes");
  const playButton = document.querySelector("#play");
  const randomAllButton = document.querySelector("#randomAll");
  const openSettingsButton = document.querySelector("#openSettings");
  const settingsDialog = document.querySelector("#settingsDialog");
  const closeSettingsButton = document.querySelector("#closeSettings");
  const savePatternButton = document.querySelector("#savePattern");
  const loadPatternButton = document.querySelector("#loadPattern");
  const clearAllButton = document.querySelector("#clearAll");
  const bpmInput = document.querySelector("#bpm");
  const bpmValue = document.querySelector("#bpmValue");
  const themeSelect = document.querySelector("#theme");
  const genreSelect = document.querySelector("#genre");
  const bankTabsEl = document.querySelector("#bankTabs");
  const genreMetaEl = document.querySelector("#genreMeta");
  const statusEl = document.querySelector("#status");

  const sessions = new Map();
  const audioCache = new Map();
  const audioPending = new Map();
  const audioFailures = new Set();
  const fallbackCache = new Map();
  const activeSources = new Set();
  const activeFallbackAudios = new Set();
  const uiTimerIds = new Set();

  let currentGenreId = "original";
  let currentBankId = "all";
  let audioContext;
  let isPlaying = false;
  let isStarting = false;
  let step = 0;
  let transportStartStep = 0;
  let lastPresentedStep = null;
  let nextStepTime = 0;
  let schedulerTimerId = 0;
  let autoSaveTimerId = 0;
  let transportGeneration = 0;
  let soundRequestGeneration = 0;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function currentGenre() {
    return genres[currentGenreId];
  }

  function tracksForGenre(genre = currentGenre()) {
    return genre.banks.flatMap((bank) => bank.tracks);
  }

  function currentBank() {
    return currentGenre().banks.find((bank) => bank.id === currentBankId) || currentGenre().banks[0];
  }

  function trackById(trackId, genre = currentGenre()) {
    return tracksForGenre(genre).find((track) => track.id === trackId);
  }

  function createSession(genreId) {
    const genre = genres[genreId];
    const session = {
      bpm: genre.bpm.default,
      bank: genre.banks[0].id,
      steps: new Map(),
      sounds: new Map(),
      volumes: new Map(),
    };

    for (const track of tracksForGenre(genre)) {
      session.steps.set(track.id, new Set(track.pattern));
      session.sounds.set(track.id, track.sounds[0][1]);
      session.volumes.set(track.id, track.volume);
    }
    return session;
  }

  function currentSession() {
    if (!sessions.has(currentGenreId)) {
      sessions.set(currentGenreId, createSession(currentGenreId));
    }
    return sessions.get(currentGenreId);
  }

  function selectedFile(trackId) {
    return currentSession().sounds.get(trackId) || trackById(trackId).sounds[0][1];
  }

  function volumeFor(trackId) {
    return Math.max(0, Math.min(1, currentSession().volumes.get(trackId) ?? 0.72));
  }

  function setTrackVolume(trackId, value) {
    const volume = Math.max(0, Math.min(1, Number(value)));
    currentSession().volumes.set(trackId, volume);

    const input = document.querySelector(`[data-volume="${trackId}"]`);
    const output = document.querySelector(`[data-volume-value="${trackId}"]`);
    if (input) input.value = String(Math.round(volume * 100));
    if (output) output.textContent = `${Math.round(volume * 100)}%`;
  }

  function normalizeTheme(theme) {
    const aliases = {
      studio: "neo-grid",
      night: "cyber-console",
      mono: "minimal-pro",
    };
    const normalized = aliases[theme] || theme || "neo-grid";
    return !themeSelect || Array.from(themeSelect.options).some((option) => option.value === normalized)
      ? normalized
      : "neo-grid";
  }

  function isSettingsOpen() {
    return Boolean(
      settingsDialog
      && (settingsDialog.open || settingsDialog.hasAttribute("open")),
    );
  }

  function openSettings() {
    if (!settingsDialog || isSettingsOpen()) {
      return;
    }
    if (typeof settingsDialog.showModal === "function") {
      settingsDialog.showModal();
    } else {
      settingsDialog.setAttribute("open", "");
    }
  }

  function closeSettings() {
    if (!settingsDialog || !isSettingsOpen()) {
      return;
    }
    if (typeof settingsDialog.close === "function") {
      settingsDialog.close();
    } else {
      settingsDialog.removeAttribute("open");
    }
    openSettingsButton?.focus();
  }

  async function unlockAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported");
      }
      audioContext = new AudioContextClass();
      const handleStateChange = () => {
        if (isPlaying && audioContext.state !== "running") {
          stop({
            statusText: "音声が中断されたため停止しました",
          });
        }
      };
      if (typeof audioContext.addEventListener === "function") {
        audioContext.addEventListener("statechange", handleStateChange);
      } else {
        audioContext.onstatechange = handleStateChange;
      }
    }
    if (audioContext.state === "closed") {
      throw new Error("Web Audio context is closed");
    }
    if (audioContext.state !== "running") {
      await audioContext.resume();
    }
    if (audioContext.state !== "running") {
      throw new Error(`Web Audio context is ${audioContext.state}`);
    }
  }

  async function bufferFor(file) {
    await unlockAudio();
    if (audioCache.has(file)) {
      return audioCache.get(file);
    }
    if (audioFailures.has(file)) {
      throw new Error(`${file}: Web Audio unavailable`);
    }
    if (!audioPending.has(file)) {
      audioPending.set(file, (async () => {
        const response = await fetch(basePath + file);
        if (!response.ok) {
          throw new Error(`${file}: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return audioContext.decodeAudioData(arrayBuffer);
      })());
    }

    try {
      const buffer = await audioPending.get(file);
      audioCache.set(file, buffer);
      return buffer;
    } catch (error) {
      audioFailures.add(file);
      throw error;
    } finally {
      audioPending.delete(file);
    }
  }

  function fallbackAudio(file) {
    if (!fallbackCache.has(file)) {
      const audio = new Audio(basePath + file);
      audio.preload = "auto";
      fallbackCache.set(file, audio);
    }
    return fallbackCache.get(file);
  }

  function startBufferPlayback(buffer, volume, atTime) {
    if (!audioContext || audioContext.state !== "running") {
      return null;
    }

    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const startTime = Math.max(audioContext.currentTime, atTime);
    source.buffer = buffer;
    gain.gain.setValueAtTime(volume, startTime);
    source.connect(gain).connect(audioContext.destination);
    activeSources.add(source);
    source.onended = () => {
      activeSources.delete(source);
      try {
        source.disconnect();
        gain.disconnect();
      } catch (error) {
        // Some older WebKit versions throw when an already-disconnected node is cleaned up.
      }
    };
    source.start(startTime);
    return source;
  }

  function scheduleCachedSound(file, trackId, atTime) {
    const buffer = audioCache.get(file);
    if (!buffer || !audioContext || audioContext.state !== "running") {
      return false;
    }
    if (atTime < audioContext.currentTime - maximumLateSeconds) {
      return false;
    }
    startBufferPlayback(buffer, volumeFor(trackId), atTime);
    return true;
  }

  async function playSound(file, trackId, atTime = 0) {
    const volume = volumeFor(trackId);
    const requestGeneration = soundRequestGeneration;
    const hasScheduledTime = Number.isFinite(atTime) && atTime > 0;
    try {
      const buffer = await bufferFor(file);
      if (requestGeneration !== soundRequestGeneration) {
        return;
      }
      if (hasScheduledTime && atTime < audioContext.currentTime - maximumLateSeconds) {
        return;
      }
      startBufferPlayback(
        buffer,
        volume,
        hasScheduledTime ? atTime : audioContext.currentTime,
      );
    } catch (error) {
      if (hasScheduledTime || requestGeneration !== soundRequestGeneration) {
        return;
      }
      let audio;
      try {
        audio = fallbackAudio(file).cloneNode();
        audio.volume = volume;
        activeFallbackAudios.add(audio);
        const removeAudio = () => activeFallbackAudios.delete(audio);
        audio.addEventListener("ended", removeAudio, { once: true });
        audio.addEventListener("error", removeAudio, { once: true });
        await audio.play();
      } catch (fallbackError) {
        if (audio) {
          activeFallbackAudios.delete(audio);
        }
        console.warn(`Audio playback failed: ${file}`, fallbackError);
      }
    }
  }

  async function preloadCurrentSounds() {
    const files = [...new Set(tracksForGenre().map((track) => selectedFile(track.id)))];
    const results = await Promise.allSettled(files.map((file) => bufferFor(file)));
    return {
      files,
      total: files.length,
      failed: results.filter((result) => result.status === "rejected").length,
    };
  }

  function currentSoundSignature() {
    return [
      currentGenreId,
      ...tracksForGenre().map((track) => `${track.id}:${selectedFile(track.id)}`),
    ].join("|");
  }

  function syncTrack(trackId) {
    const active = currentSession().steps.get(trackId);
    document.querySelectorAll(`[data-track="${trackId}"]`).forEach((cell) => {
      const isActive = active.has(Number(cell.dataset.step));
      cell.classList.toggle("on", isActive);
      cell.setAttribute("aria-pressed", String(isActive));
    });
  }

  function clearTrack(trackId) {
    currentSession().steps.get(trackId).clear();
    syncTrack(trackId);
  }

  function fallbackChance(role, index) {
    const quarter = index % 4 === 0;
    const offbeat = index % 4 === 2;
    const odd = index % 2 === 1;
    const chances = {
      kick: quarter ? 0.16 : 0.035,
      snare: index === 4 || index === 12 ? 0.22 : 0.035,
      clap: index === 4 || index === 12 ? 0.20 : 0.025,
      ghost: odd ? 0.14 : 0.04,
      hat: offbeat ? 0.28 : 0.12,
      openhat: offbeat ? 0.26 : 0.035,
      ride: quarter ? 0.22 : 0.08,
      perc: odd ? 0.14 : 0.07,
      bass: quarter ? 0.12 : 0.09,
      lead: offbeat ? 0.13 : 0.055,
      chord: quarter ? 0.13 : 0.035,
      pad: quarter ? 0.07 : 0.015,
      fx: index === 0 || index === 8 || index === 15 ? 0.10 : 0.018,
      texture: quarter ? 0.08 : 0.025,
      loop: quarter ? 0.24 : 0.025,
    };
    return chances[role] ?? 0.06;
  }

  function randomizeTrack(track) {
    const active = currentSession().steps.get(track.id);
    const base = new Set(track.pattern);
    active.clear();

    for (let index = 0; index < 16; index += 1) {
      const chance = base.has(index) ? 0.74 : fallbackChance(track.role, index);
      if (Math.random() < chance) {
        active.add(index);
      }
    }

    if (track.role === "kick" && base.has(0)) active.add(0);
    if ((track.role === "snare" || track.role === "clap") && !active.has(4) && !active.has(12)) {
      active.add(Math.random() < 0.5 ? 4 : 12);
    }
    if (active.size === 0 && track.pattern.length > 0) {
      active.add(track.pattern[Math.floor(Math.random() * track.pattern.length)]);
    }
    syncTrack(track.id);
  }

  function iconMarkup(iconId) {
    const icons = {
      kick: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.2"></circle><path d="M4 18l-2 3"></path><path d="M20 18l2 3"></path></svg>',
      snare: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="7" rx="7" ry="3"></ellipse><path d="M5 7v7c0 1.7 3.1 3 7 3s7-1.3 7-3V7"></path><path d="M7 20l10-4"></path><path d="M17 20L7 16"></path></svg>',
      hat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16"></path><path d="M7 8c2.8-2.2 7.2-2.2 10 0"></path><path d="M6 13c3.4 2.2 8.6 2.2 12 0"></path><path d="M12 13v8"></path><path d="M8 21h8"></path></svg>',
      perc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8c-2 1.5-2 5 .2 6.5L11 17"></path><path d="M17 8c2 1.5 2 5-.2 6.5L13 17"></path><path d="M9 6l3 10"></path><path d="M15 6l-3 10"></path><path d="M8 5h2"></path><path d="M14 5h2"></path></svg>',
      bass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15c2-6 4-6 6 0s4 6 8 0"></path><path d="M5 19h14"></path><path d="M5 5h3"></path><path d="M8 5v14"></path></svg>',
      synth: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M6 6v12"></path><path d="M10 6v12"></path><path d="M14 6v12"></path><path d="M18 6v12"></path><path d="M6 13h12"></path></svg>',
      piano: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 5v9"></path><path d="M12 5v9"></path><path d="M17 5v9"></path><path d="M3 14h18"></path></svg>',
      world: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17c3-7 6-10 14-10"></path><path d="M7 20l10-16"></path><path d="M9 14l6 4"></path><circle cx="8" cy="8" r="2"></circle></svg>',
      fx: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h3l2-6 4 12 3-9 2 3h4"></path><path d="M4 4v3"></path><path d="M20 17v3"></path></svg>',
    };
    return icons[iconId] || icons.synth;
  }

  function renderGenreOptions() {
    genreSelect.textContent = "";
    for (const [genreId, genre] of Object.entries(genres)) {
      const option = document.createElement("option");
      option.value = genreId;
      option.textContent = genre.name;
      genreSelect.appendChild(option);
    }
  }

  function renderBankTabs() {
    bankTabsEl.textContent = "";
    for (const bank of currentGenre().banks) {
      const button = document.createElement("button");
      button.className = "bank-tab";
      button.type = "button";
      button.dataset.bank = bank.id;
      button.textContent = bank.label;
      const isActive = bank.id === currentBankId;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      button.addEventListener("click", () => {
        currentBankId = bank.id;
        currentSession().bank = bank.id;
        renderBankTabs();
        renderLanes();
        scheduleAutoSave();
        setStatus(`${currentGenre().name}: ${bank.label}`);
      });
      bankTabsEl.appendChild(button);
    }
  }

  function renderLanes() {
    const bank = currentBank();
    lanesEl.textContent = "";
    lanesEl.style.setProperty("--lane-count", String(Math.max(1, bank.tracks.length)));
    lanesEl.classList.toggle("sparse", bank.tracks.length < 5);

    for (const track of bank.tracks) {
      const section = document.createElement("section");
      section.className = "lane";

      const head = document.createElement("div");
      head.className = "lane-head";

      const title = document.createElement("div");
      title.className = "lane-title";

      const icon = document.createElement("span");
      icon.className = "lane-icon";
      icon.innerHTML = iconMarkup(track.icon);
      icon.setAttribute("aria-hidden", "true");

      const name = document.createElement("div");
      name.className = "lane-name";
      name.textContent = track.name;
      title.append(icon, name);

      const select = document.createElement("select");
      select.className = "sound-select";
      select.dataset.select = track.id;
      select.setAttribute("aria-label", `${track.name}の音色`);
      for (const [label, file] of track.sounds) {
        const option = document.createElement("option");
        option.value = file;
        option.textContent = label;
        select.appendChild(option);
      }
      select.value = selectedFile(track.id);
      select.addEventListener("change", () => {
        currentSession().sounds.set(track.id, select.value);
        playSound(select.value, track.id);
        scheduleAutoSave();
        setStatus(`${track.name}: ${select.options[select.selectedIndex].textContent}`);
      });

      const randomButton = document.createElement("button");
      randomButton.className = "lane-action lane-random";
      randomButton.type = "button";
      randomButton.textContent = "RND";
      randomButton.setAttribute("aria-label", `${track.name}をランダム配置`);
      randomButton.addEventListener("click", () => {
        randomizeTrack(track);
        playSound(selectedFile(track.id), track.id);
        scheduleAutoSave();
        setStatus(`${track.name}をランダム配置`);
      });

      const clearButton = document.createElement("button");
      clearButton.className = "lane-action clear";
      clearButton.type = "button";
      clearButton.textContent = "CLR";
      clearButton.setAttribute("aria-label", `${track.name}をクリア`);
      clearButton.addEventListener("click", () => {
        clearTrack(track.id);
        scheduleAutoSave();
        setStatus(`${track.name}をクリア`);
      });

      const volumeControl = document.createElement("label");
      volumeControl.className = "volume-control";

      const volumeLabel = document.createElement("span");
      volumeLabel.textContent = "VOL";

      const volumeInput = document.createElement("input");
      volumeInput.type = "range";
      volumeInput.min = "0";
      volumeInput.max = "100";
      volumeInput.step = "1";
      volumeInput.value = String(Math.round(volumeFor(track.id) * 100));
      volumeInput.dataset.volume = track.id;
      volumeInput.setAttribute("aria-label", `${track.name}の音量`);

      const volumeValue = document.createElement("output");
      volumeValue.className = "volume-value";
      volumeValue.dataset.volumeValue = track.id;
      volumeValue.textContent = `${volumeInput.value}%`;

      volumeInput.addEventListener("input", () => {
        setTrackVolume(track.id, Number(volumeInput.value) / 100);
        scheduleAutoSave();
      });

      volumeControl.append(volumeLabel, volumeInput, volumeValue);
      head.append(title, select, randomButton, clearButton, volumeControl);

      const steps = document.createElement("div");
      steps.className = "steps";
      for (let index = 0; index < 16; index += 1) {
        const button = document.createElement("button");
        button.className = "step";
        button.type = "button";
        button.dataset.track = track.id;
        button.dataset.step = String(index);
        button.dataset.index = String(index + 1);
        button.setAttribute("aria-label", `${track.name} ${index + 1}`);
        const isActive = currentSession().steps.get(track.id).has(index);
        button.setAttribute("aria-pressed", String(isActive));
        if (isActive) {
          button.classList.add("on");
        }
        button.addEventListener("click", () => {
          const active = currentSession().steps.get(track.id);
          if (active.has(index)) {
            active.delete(index);
            button.classList.remove("on");
            button.setAttribute("aria-pressed", "false");
          } else {
            active.add(index);
            button.classList.add("on");
            button.setAttribute("aria-pressed", "true");
            playSound(selectedFile(track.id), track.id);
          }
          scheduleAutoSave();
        });
        steps.appendChild(button);
      }

      section.append(head, steps);
      lanesEl.appendChild(section);
    }
  }

  function applyGenre(genreId, announce = true) {
    if (!genres[genreId]) {
      genreId = "original";
    }
    currentGenreId = genreId;
    const session = currentSession();
    const validBank = currentGenre().banks.some((bank) => bank.id === session.bank);
    currentBankId = validBank ? session.bank : currentGenre().banks[0].id;
    session.bank = currentBankId;

    genreSelect.value = currentGenreId;
    bpmInput.min = String(currentGenre().bpm.min);
    bpmInput.max = String(currentGenre().bpm.max);
    bpmInput.value = String(session.bpm);
    bpmValue.textContent = String(session.bpm);
    genreMetaEl.textContent = `${currentGenre().bpm.min}-${currentGenre().bpm.max} BPM`;

    renderBankTabs();
    renderLanes();
    if (announce) {
      setStatus(`${currentGenre().name}を選択しました`);
    }
  }

  function readStorage(key) {
    try {
      return {
        ok: true,
        value: window.localStorage.getItem(key),
      };
    } catch (error) {
      console.warn(`Storage read failed: ${key}`, error);
      return {
        ok: false,
        value: null,
      };
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`Storage write failed: ${key}`, error);
      return false;
    }
  }

  function savedPatternData() {
    const session = currentSession();
    return {
      version: 3,
      genre: currentGenreId,
      bank: currentBankId,
      bpm: Number(bpmInput.value),
      theme: themeSelect?.value || app.dataset.theme || "neo-grid",
      sounds: Object.fromEntries(session.sounds),
      volumes: Object.fromEntries(session.volumes),
      steps: Object.fromEntries(
        [...session.steps].map(([trackId, active]) => [
          trackId,
          [...active].sort((a, b) => a - b),
        ]),
      ),
    };
  }

  function persistPattern(announce = false) {
    if (autoSaveTimerId) {
      window.clearTimeout(autoSaveTimerId);
      autoSaveTimerId = 0;
    }

    const saved = savedPatternData();
    const didSave = writeStorage(saveKey, JSON.stringify(saved));
    if (announce) {
      setStatus(didSave
        ? `${currentGenre().name}のパターンをセーブしました`
        : "ブラウザにセーブできませんでした");
    } else if (!didSave) {
      setStatus("自動保存できませんでした");
    }
    return didSave;
  }

  function scheduleAutoSave() {
    if (autoSaveTimerId) {
      window.clearTimeout(autoSaveTimerId);
    }
    autoSaveTimerId = window.setTimeout(() => {
      autoSaveTimerId = 0;
      persistPattern(false);
    }, autoSaveDelayMs);
  }

  function flushAutoSave() {
    if (!autoSaveTimerId) {
      return;
    }
    window.clearTimeout(autoSaveTimerId);
    autoSaveTimerId = 0;
    persistPattern(false);
  }

  function savePattern() {
    persistPattern(true);
  }

  function loadVersion3(saved) {
    const genreId = genres[saved.genre] ? saved.genre : "original";
    const session = createSession(genreId);
    const genre = genres[genreId];

    session.bpm = Math.max(
      genre.bpm.min,
      Math.min(genre.bpm.max, Number(saved.bpm) || genre.bpm.default),
    );
    if (genre.banks.some((bank) => bank.id === saved.bank)) {
      session.bank = saved.bank;
    }

    for (const track of tracksForGenre(genre)) {
      const savedFile = saved.sounds?.[track.id];
      if (track.sounds.some(([, file]) => file === savedFile)) {
        session.sounds.set(track.id, savedFile);
      }
      const savedVolume = Number(saved.volumes?.[track.id]);
      if (Number.isFinite(savedVolume)) {
        session.volumes.set(track.id, Math.max(0, Math.min(1, savedVolume)));
      }
      if (Array.isArray(saved.steps?.[track.id])) {
        session.steps.set(
          track.id,
          new Set(saved.steps[track.id].filter((index) => Number.isInteger(index) && index >= 0 && index < 16)),
        );
      }
    }

    sessions.set(genreId, session);
    applyGenre(genreId, false);
  }

  function loadLegacy(saved) {
    const session = createSession("original");
    const genre = genres.original;
    session.bpm = Math.max(
      genre.bpm.min,
      Math.min(genre.bpm.max, Number(saved.bpm) || genre.bpm.default),
    );

    for (const track of tracksForGenre(genre)) {
      const savedFile = saved.sounds?.[track.id];
      if (track.sounds.some(([, file]) => file === savedFile)) {
        session.sounds.set(track.id, savedFile);
      }
      const savedVolume = Number(saved.volumes?.[track.id]);
      if (Number.isFinite(savedVolume)) {
        session.volumes.set(track.id, Math.max(0, Math.min(1, savedVolume)));
      }
      if (Array.isArray(saved.steps?.[track.id])) {
        session.steps.set(track.id, new Set(saved.steps[track.id]));
      }
    }

    sessions.set("original", session);
    applyGenre("original", false);
  }

  function loadPattern({ announce = true, reportMissing = true } = {}) {
    const stored = readStorage(saveKey);
    if (!stored.ok) {
      if (announce) {
        setStatus("ブラウザのセーブ領域を読み込めませんでした");
      }
      return false;
    }

    const raw = stored.value;
    if (!raw) {
      if (announce && reportMissing) {
        setStatus("ロードできるセーブがありません");
      }
      return false;
    }

    try {
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") {
        throw new Error("Invalid save data");
      }
      if (Number(saved.version) >= 3) {
        loadVersion3(saved);
      } else {
        loadLegacy(saved);
      }

      if (saved.theme) {
        const theme = normalizeTheme(saved.theme);
        if (themeSelect) {
          themeSelect.value = theme;
        }
        app.dataset.theme = theme;
        writeStorage(themeKey, theme);
      }
      if (announce) {
        setStatus(`${currentGenre().name}のセーブをロードしました`);
      }
      return true;
    } catch (error) {
      console.warn("Save data load failed", error);
      if (announce) {
        setStatus("セーブデータを読み込めませんでした");
      }
      return false;
    }
  }

  function markPlaying(index) {
    document.querySelectorAll(".step.playing").forEach((element) => element.classList.remove("playing"));
    document.querySelectorAll(`[data-step="${index}"]`).forEach((element) => element.classList.add("playing"));
  }

  function nextStepDuration(index) {
    const bpm = Math.max(1, Number(bpmInput.value) || currentGenre().bpm.default);
    const base = 60 / bpm / 4;
    const swing = currentGenre().swing ?? 0.5;
    return index % 2 === 0 ? base * 2 * swing : base * 2 * (1 - swing);
  }

  function queuePlayingIndicator(index, atTime, generation) {
    const delay = Math.max(0, (atTime - audioContext.currentTime) * 1000);
    const timerId = window.setTimeout(() => {
      uiTimerIds.delete(timerId);
      if (
        isPlaying
        && generation === transportGeneration
        && atTime >= audioContext.currentTime - maximumLateSeconds
      ) {
        lastPresentedStep = index;
        markPlaying(index);
      }
    }, delay);
    uiTimerIds.add(timerId);
  }

  function scheduleStep(index, atTime, generation) {
    queuePlayingIndicator(index, atTime, generation);
    for (const track of tracksForGenre()) {
      if (currentSession().steps.get(track.id).has(index)) {
        scheduleCachedSound(selectedFile(track.id), track.id, atTime);
      }
    }
  }

  function advanceStepClock() {
    const currentStep = step;
    nextStepTime += nextStepDuration(currentStep);
    step = (step + 1) % 16;
  }

  function runScheduler(generation) {
    if (
      !isPlaying
      || generation !== transportGeneration
      || !audioContext
      || audioContext.state !== "running"
    ) {
      if (isPlaying && generation === transportGeneration) {
        stop({
          statusText: "音声が中断されたため停止しました",
        });
      }
      return;
    }

    const now = audioContext.currentTime;
    let guard = 0;

    // A throttled timer must never make overdue notes fire in a burst.
    if (nextStepTime < now) {
      while (nextStepTime < now + 0.005 && guard < 64) {
        advanceStepClock();
        guard += 1;
      }
    }

    guard = 0;
    while (nextStepTime < now + scheduleAheadSeconds && guard < 64) {
      scheduleStep(step, nextStepTime, generation);
      advanceStepClock();
      guard += 1;
    }

    schedulerTimerId = window.setTimeout(
      () => runScheduler(generation),
      schedulerIntervalMs,
    );
  }

  function updatePlayButton(active, busy = false) {
    playButton.textContent = active ? "■" : "▶";
    playButton.setAttribute("aria-label", active ? "停止" : "再生");
    playButton.setAttribute("aria-pressed", String(active));
    playButton.setAttribute("aria-busy", String(busy));
  }

  async function start() {
    if (isPlaying || isStarting) {
      return;
    }

    const generation = ++transportGeneration;
    isStarting = true;
    updatePlayButton(true, true);
    step %= 16;
    transportStartStep = step;
    lastPresentedStep = null;
    setStatus("選択中の音源を準備中");

    let preloadResult = {
      total: 0,
      failed: 0,
    };

    try {
      await unlockAudio();
      if (generation !== transportGeneration) {
        return;
      }

      let signature;
      do {
        signature = currentSoundSignature();
        preloadResult = await preloadCurrentSounds();
        if (generation !== transportGeneration) {
          return;
        }
      } while (signature !== currentSoundSignature());

      await unlockAudio();
      if (preloadResult.total > 0 && preloadResult.failed === preloadResult.total) {
        throw new Error("No selected audio files could be decoded");
      }
    } catch (error) {
      if (generation !== transportGeneration) {
        return;
      }
      console.warn("Web Audio initialization failed", error);
      const statusText = window.location.protocol === "file:"
        ? "音源を読み込めません。HTTPサーバーから開いてください"
        : "音源を準備できませんでした";
      stop({ statusText });
      return;
    }

    if (generation !== transportGeneration) {
      return;
    }

    isStarting = false;
    isPlaying = true;
    updatePlayButton(true, false);
    nextStepTime = audioContext.currentTime + startLeadSeconds;
    const statusSuffix = preloadResult.failed > 0
      ? "（一部の音源は読み込めないためスキップ）"
      : "";
    setStatus(`${currentGenre().name}を再生中${statusSuffix}`);
    runScheduler(generation);
  }

  function stop({ statusText = "停止", announce = true } = {}) {
    const hadActiveTransport = isPlaying || isStarting;
    if (hadActiveTransport) {
      step = lastPresentedStep === null
        ? transportStartStep
        : (lastPresentedStep + 1) % 16;
    }
    transportGeneration += 1;
    soundRequestGeneration += 1;
    isStarting = false;
    isPlaying = false;
    if (schedulerTimerId) {
      window.clearTimeout(schedulerTimerId);
      schedulerTimerId = 0;
    }
    for (const timerId of uiTimerIds) {
      window.clearTimeout(timerId);
    }
    uiTimerIds.clear();
    for (const source of activeSources) {
      try {
        source.stop();
      } catch (error) {
        // The source may have ended between iteration and stop().
      }
    }
    activeSources.clear();
    for (const audio of activeFallbackAudios) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch (error) {
        // Resetting currentTime can fail before media metadata is available.
      }
    }
    activeFallbackAudios.clear();
    updatePlayButton(false, false);
    document.querySelectorAll(".step.playing").forEach((element) => element.classList.remove("playing"));
    if (announce) {
      setStatus(statusText);
    }
  }

  playButton.addEventListener("click", () => {
    if (isPlaying || isStarting) {
      stop();
    } else {
      start();
    }
  });

  randomAllButton.addEventListener("click", () => {
    for (const track of tracksForGenre()) {
      randomizeTrack(track);
    }
    renderLanes();
    scheduleAutoSave();
    setStatus(`${currentGenre().name}をランダム配置`);
  });

  clearAllButton.addEventListener("click", () => {
    for (const active of currentSession().steps.values()) {
      active.clear();
    }
    renderLanes();
    scheduleAutoSave();
    setStatus(`${currentGenre().name}をクリア`);
  });

  openSettingsButton?.addEventListener("click", openSettings);
  closeSettingsButton?.addEventListener("click", closeSettings);
  settingsDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings();
  });
  settingsDialog?.addEventListener("click", (event) => {
    if (event.target === settingsDialog) {
      closeSettings();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape"
      && isSettingsOpen()
      && typeof settingsDialog.showModal !== "function"
    ) {
      event.preventDefault();
      closeSettings();
    }
  });
  document.addEventListener("click", (event) => {
    if (
      isSettingsOpen()
      && typeof settingsDialog.showModal !== "function"
      && event.target !== openSettingsButton
      && !settingsDialog.contains(event.target)
    ) {
      closeSettings();
    }
  });

  savePatternButton?.addEventListener("click", () => {
    savePattern();
    closeSettings();
  });
  loadPatternButton?.addEventListener("click", () => {
    if (isPlaying || isStarting) {
      stop({ announce: false });
    }
    loadPattern();
    closeSettings();
  });

  bpmInput.addEventListener("input", () => {
    bpmValue.textContent = bpmInput.value;
    currentSession().bpm = Number(bpmInput.value);
    scheduleAutoSave();
  });

  themeSelect?.addEventListener("change", () => {
    app.dataset.theme = themeSelect.value;
    writeStorage(themeKey, themeSelect.value);
    scheduleAutoSave();
  });

  genreSelect.addEventListener("change", () => {
    if (isPlaying || isStarting) {
      stop({ announce: false });
    }
    applyGenre(genreSelect.value);
    scheduleAutoSave();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushAutoSave();
      if (isPlaying || isStarting) {
        stop({
          statusText: "画面が非表示になったため停止しました",
        });
      }
    }
  });

  window.addEventListener("pagehide", () => {
    flushAutoSave();
    stop({ announce: false });
  });

  renderGenreOptions();

  const storedTheme = readStorage(themeKey);
  if (storedTheme.value) {
    const theme = normalizeTheme(storedTheme.value);
    app.dataset.theme = theme;
    if (themeSelect) {
      themeSelect.value = theme;
    }
  }

  const didRestore = loadPattern({
    announce: false,
    reportMissing: false,
  });
  if (!didRestore) {
    applyGenre("original", false);
  }
  updatePlayButton(false, false);
  setStatus(didRestore
    ? `${currentGenre().name}の前回データを自動復元しました`
    : "ジャンルと音色を選び、ステップをタップしてください");
})();
