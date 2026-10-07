/**
 * SonicStrip - Frontend Controller
 * Handles drag-and-drop, format/bitrate configuration, batch uploading,
 * real-time progress, in-browser audio player with waveform canvas, and ZIP downloads.
 */

(function () {
  'use strict';

  // DOM Elements
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');
  const formatPills = document.querySelectorAll('.format-pill');
  const bitrateButtons = document.querySelectorAll('.bitrate-btn');
  const chkStreamCopy = document.getElementById('chk-stream-copy');
  const bitrateOptionsList = document.getElementById('bitrate-options-list');
  const bitrateHint = document.getElementById('bitrate-hint');
  const btnToggleTrim = document.getElementById('btn-toggle-trim');
  const trimChevron = document.getElementById('trim-chevron');
  const trimAccordionBody = document.getElementById('trim-accordion-body');
  const inputTrimStart = document.getElementById('input-trim-start');
  const inputTrimEnd = document.getElementById('input-trim-end');

  const queueSection = document.getElementById('queue-section');
  const queueCount = document.getElementById('queue-count');
  const queueTotalSize = document.getElementById('queue-total-size');
  const fileQueueList = document.getElementById('file-queue-list');
  const btnClearQueue = document.getElementById('btn-clear-queue');
  const btnStartConvert = document.getElementById('btn-start-convert');
  const btnConvertLabel = document.getElementById('btn-convert-label');

  const globalProgressCard = document.getElementById('global-progress-card');
  const progressTaskLabel = document.getElementById('progress-task-label');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressFill = document.getElementById('progress-fill');

  const resultsSection = document.getElementById('results-section');
  const audioCardsContainer = document.getElementById('audio-cards-container');
  const batchActionsBar = document.getElementById('batch-actions-bar');
  const btnDownloadAllZip = document.getElementById('btn-download-all-zip');

  const btnOpenFolder = document.getElementById('btn-open-folder');
  const btnClearAll = document.getElementById('btn-clear-all');
  const systemStatusText = document.getElementById('system-status-text');
  const footerEngineInfo = document.getElementById('footer-engine-info');

  // Application State
  const state = {
    selectedFormat: 'mp3',
    selectedBitrate: '320k',
    isStreamCopy: false,
    fileQueue: [], // Array of File objects
    activeAudioPlayers: new Map(), // audioElId -> { audio, canvas, isPlaying, ... }
    isConverting: false
  };

  // --- INITIALIZATION ---
  async function init() {
    setupEventListeners();
    await checkSystemStatus();
  }

  async function checkSystemStatus() {
    try {
      const res = await fetch('/api/system-info');
      if (res.ok) {
        const data = await res.json();
        systemStatusText.textContent = 'FFmpeg Engine Active';
        footerEngineInfo.textContent = `FFmpeg Ready • Outputs: ${data.output_directory}`;
      } else {
        systemStatusText.textContent = 'Engine Offline';
      }
    } catch (err) {
      systemStatusText.textContent = 'Engine Offline';
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Format Selection
    formatPills.forEach(pill => {
      pill.addEventListener('click', () => {
        if (state.isStreamCopy) return;
        formatPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedFormat = pill.dataset.format;
        updateBitrateOptionsAvailability();
      });
    });

    // Bitrate Selection
    bitrateButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        bitrateButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedBitrate = btn.dataset.bitrate;
        updateBitrateHint();
      });
    });

    // Stream Copy Toggle
    chkStreamCopy.addEventListener('change', (e) => {
      state.isStreamCopy = e.target.checked;
      updateStreamCopyUI();
    });

    // Trim Accordion
    btnToggleTrim.addEventListener('click', () => {
      const isOpen = trimAccordionBody.classList.toggle('open');
      trimChevron.classList.toggle('open', isOpen);
    });

    // Dropzone Events
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(Array.from(e.target.files));
      fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFiles(Array.from(dt.files));
      }
    });

    // Queue Management
    btnClearQueue.addEventListener('click', clearQueue);
    btnStartConvert.addEventListener('click', startConversionProcess);

    // Header Actions
    btnOpenFolder.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/open-folder', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('Output folder opened in File Explorer');
        } else {
          showToast('Could not open folder automatically', 'error');
        }
      } catch (e) {
        showToast('Error communicating with server', 'error');
      }
    });

    btnClearAll.addEventListener('click', async () => {
      if (confirm('Clear all temporary converted files and history?')) {
        try {
          const res = await fetch('/api/clear-history', { method: 'POST' });
          const data = await res.json();
          resultsSection.style.display = 'none';
          audioCardsContainer.innerHTML = '';
          showToast(`Cleaned up ${data.deleted_count} files`);
        } catch (e) {
          showToast('Error clearing files', 'error');
        }
      }
    });
  }

  // --- UI UPDATES ---
  function updateStreamCopyUI() {
    if (state.isStreamCopy) {
      formatPills.forEach(p => {
        p.style.opacity = '0.4';
        p.style.pointerEvents = 'none';
      });
      bitrateButtons.forEach(b => {
        b.disabled = true;
        b.classList.add('disabled');
      });
      bitrateHint.textContent = 'Original audio codec copied (no re-encoding)';
    } else {
      formatPills.forEach(p => {
        p.style.opacity = '1';
        p.style.pointerEvents = 'auto';
      });
      updateBitrateOptionsAvailability();
    }
  }

  function updateBitrateOptionsAvailability() {
    const isLossless = ['wav', 'flac'].includes(state.selectedFormat);
    if (isLossless) {
      bitrateButtons.forEach(b => {
        b.disabled = true;
        b.classList.add('disabled');
      });
      bitrateHint.textContent = 'Uncompressed / Lossless Bit-perfect';
    } else {
      bitrateButtons.forEach(b => {
        b.disabled = false;
        b.classList.remove('disabled');
      });
      updateBitrateHint();
    }
  }

  function updateBitrateHint() {
    const hints = {
      '320k': 'Maximum clarity & studio fidelity',
      '256k': 'High quality audio standard',
      '192k': 'Standard broadcast quality',
      '128k': 'Compact file size, fast download'
    };
    bitrateHint.textContent = hints[state.selectedBitrate] || 'Custom bitrate';
  }

  // --- FILE HANDLING & QUEUE ---
  function handleFiles(files) {
    if (!files || files.length === 0) return;

    // Filter video extensions
    const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.ts', '.3gp'];
    const addedFiles = [];

    files.forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isVideo = file.type.startsWith('video/') || validExtensions.includes(ext);
      if (isVideo) {
        // Prevent duplicate queue entries
        const exists = state.fileQueue.some(f => f.name === file.name && f.size === file.size);
        if (!exists) {
          state.fileQueue.push(file);
          addedFiles.push(file);
        }
      }
    });

    if (addedFiles.length === 0) {
      showToast('Please select valid video files (.mp4, .mkv, .mov, etc.)', 'warning');
      return;
    }

    renderQueue();
  }

  function renderQueue() {
    if (state.fileQueue.length === 0) {
      queueSection.style.display = 'none';
      return;
    }

    queueSection.style.display = 'block';
    queueCount.textContent = state.fileQueue.length;

    const totalBytes = state.fileQueue.reduce((acc, f) => acc + f.size, 0);
    queueTotalSize.textContent = formatBytes(totalBytes);

    btnConvertLabel.textContent = state.fileQueue.length > 1
      ? `Convert All (${state.fileQueue.length} Videos)`
      : 'Convert to Audio';

    fileQueueList.innerHTML = '';
    state.fileQueue.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.id = `queue-item-${index}`;

      item.innerHTML = `
        <div class="queue-item-left">
          <div class="queue-file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <div class="queue-file-meta">
            <span class="queue-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="queue-file-details">${formatBytes(file.size)}</span>
          </div>
        </div>
        <div class="queue-item-right">
          <span class="queue-status-tag" id="status-tag-${index}">Ready</span>
          <button type="button" class="btn-remove-queue" data-index="${index}" title="Remove file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      item.querySelector('.btn-remove-queue').addEventListener('click', (e) => {
        e.stopPropagation();
        const removeIdx = parseInt(e.currentTarget.dataset.index, 10);
        state.fileQueue.splice(removeIdx, 1);
        renderQueue();
      });

      fileQueueList.appendChild(item);
    });
  }

  function clearQueue() {
    state.fileQueue = [];
    renderQueue();
  }

  // --- CONVERSION EXECUTION ---
  async function startConversionProcess() {
    if (state.fileQueue.length === 0 || state.isConverting) return;

    state.isConverting = true;
    btnStartConvert.disabled = true;
    btnClearQueue.disabled = true;
    globalProgressCard.style.display = 'block';

    const parseTrimTime = (val) => {
      if (!val || !val.trim()) return null;
      val = val.trim();
      if (val.includes(':')) {
        const parts = val.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    };

    const startTimeVal = parseTrimTime(inputTrimStart.value);
    const endTimeVal = parseTrimTime(inputTrimEnd.value);

    const convertedItems = [];
    const totalFiles = state.fileQueue.length;

    try {
      if (totalFiles === 1) {
        // Single file processing
        const file = state.fileQueue[0];
        updateFileStatusTag(0, 'Extracting audio...', 'processing');
        updateGlobalProgress(10, `Processing ${file.name}...`);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', state.selectedFormat);
        formData.append('bitrate', state.selectedBitrate);
        formData.append('stream_copy', state.isStreamCopy);
        if (startTimeVal !== null) formData.append('start_time', startTimeVal);
        if (endTimeVal !== null) formData.append('end_time', endTimeVal);

        updateGlobalProgress(40, `Extracting audio track with FFmpeg...`);
        const res = await fetch('/api/convert', { method: 'POST', body: formData });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Conversion failed (${res.status})`);
        }

        const data = await res.json();
        updateFileStatusTag(0, 'Completed', 'completed');
        updateGlobalProgress(100, 'Audio extracted successfully!');
        convertedItems.push(data);
      } else {
        // Batch processing
        const formData = new FormData();
        state.fileQueue.forEach(f => formData.append('files', f));
        formData.append('format', state.selectedFormat);
        formData.append('bitrate', state.selectedBitrate);
        formData.append('stream_copy', state.isStreamCopy);

        updateGlobalProgress(25, `Batch converting ${totalFiles} videos...`);
        for (let i = 0; i < totalFiles; i++) {
          updateFileStatusTag(i, 'Processing...', 'processing');
        }

        const res = await fetch('/api/batch-convert', { method: 'POST', body: formData });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Batch conversion failed (${res.status})`);
        }

        const data = await res.json();
        updateGlobalProgress(100, `Completed ${data.total_converted} of ${totalFiles} files`);

        for (let i = 0; i < totalFiles; i++) {
          updateFileStatusTag(i, 'Completed', 'completed');
        }

        data.items.forEach(item => convertedItems.push(item));

        if (data.zip_download_url) {
          batchActionsBar.style.display = 'block';
          btnDownloadAllZip.href = data.zip_download_url;
          btnDownloadAllZip.setAttribute('download', data.zip_filename || 'converted_audio.zip');
        }
      }

      // Display Results
      displayResults(convertedItems);
      showToast(`Successfully converted ${convertedItems.length} audio track(s)!`);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error occurred during conversion', 'error');
      updateGlobalProgress(0, 'Conversion failed');
    } finally {
      state.isConverting = false;
      btnStartConvert.disabled = false;
      btnClearQueue.disabled = false;
      setTimeout(() => {
        globalProgressCard.style.display = 'none';
      }, 4000);
    }
  }

  function updateFileStatusTag(index, label, type) {
    const tag = document.getElementById(`status-tag-${index}`);
    if (tag) {
      tag.textContent = label;
      tag.className = `queue-status-tag ${type}`;
    }
  }

  function updateGlobalProgress(pct, label) {
    progressPercentage.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
    if (label) progressTaskLabel.textContent = label;
  }

  // --- RESULTS & IN-BROWSER AUDIO PLAYER ---
  function displayResults(items) {
    if (!items || items.length === 0) return;

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });

    items.forEach((item, idx) => {
      const card = createAudioCard(item, idx);
      audioCardsContainer.prepend(card);
    });
  }

  function createAudioCard(item, index) {
    const cardId = `audio-card-${item.id || index}-${Date.now()}`;
    const card = document.createElement('div');
    card.className = 'audio-card';
    card.id = cardId;

    const meta = item.meta || {};
    const ext = (meta.format || 'mp3').toUpperCase();
    const durationStr = meta.duration_formatted || '00:00';
    const reductionPct = meta.size_reduction_pct || 0;
    const speedStr = meta.elapsed_seconds ? `⚡ ${meta.elapsed_seconds}s` : '⚡ Fast';
    const outSizeStr = meta.output_size_formatted || '0 MB';
    const inSizeStr = meta.input_size_formatted || '';

    const streamUrl = item.stream_url;
    const downloadUrl = item.download_url;
    const filename = item.output_filename || 'audio.mp3';

    card.innerHTML = `
      <div class="audio-card-top">
        <div class="audio-title-group">
          <span class="audio-pill-ext">${ext}</span>
          <span class="audio-track-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span>
        </div>
        <div class="audio-meta-pills">
          <span class="meta-pill speed">${speedStr}</span>
          <span class="meta-pill">${outSizeStr}</span>
          ${reductionPct > 0 ? `<span class="meta-pill savings">-${reductionPct}% Size</span>` : ''}
          <span class="meta-pill">${durationStr}</span>
        </div>
      </div>

      <!-- In-Browser Audio Player & Waveform -->
      <div class="audio-player-widget">
        <audio id="audio-${cardId}" src="${streamUrl}" preload="metadata"></audio>
        <div class="player-controls-row">
          <button type="button" class="btn-play-pause" id="btn-play-${cardId}" aria-label="Play or pause audio">
            <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>

          <div class="player-waveform-wrap" id="waveform-wrap-${cardId}">
            <canvas class="waveform-canvas" id="canvas-${cardId}"></canvas>
            <div class="player-time-row">
              <span id="time-current-${cardId}">00:00</span>
              <span id="time-total-${cardId}">${durationStr}</span>
            </div>
          </div>

          <div class="player-volume-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <input type="range" class="volume-slider" id="volume-${cardId}" min="0" max="1" step="0.05" value="0.9" aria-label="Volume">
          </div>
        </div>
      </div>

      <div class="audio-card-actions">
        <a href="${downloadUrl}" class="btn-download-audio" download="${escapeHtml(filename)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Audio</span>
        </a>
      </div>
    `;

    // Initialize Waveform and Audio Player Logic
    setTimeout(() => {
      setupAudioPlayer(cardId);
    }, 50);

    return card;
  }

  function setupAudioPlayer(cardId) {
    const audio = document.getElementById(`audio-${cardId}`);
    const btnPlay = document.getElementById(`btn-play-${cardId}`);
    const iconPlay = btnPlay.querySelector('.icon-play');
    const iconPause = btnPlay.querySelector('.icon-pause');
    const canvas = document.getElementById(`canvas-${cardId}`);
    const timeCurrent = document.getElementById(`time-current-${cardId}`);
    const timeTotal = document.getElementById(`time-total-${cardId}`);
    const volumeSlider = document.getElementById(`volume-${cardId}`);
    const waveformWrap = document.getElementById(`waveform-wrap-${cardId}`);

    if (!audio || !canvas) return;

    // Generate static waveform bars pattern
    const barCount = 70;
    const barHeights = [];
    for (let i = 0; i < barCount; i++) {
      // Harmonic pleasant curve with subtle random heights
      const sinVal = Math.sin((i / barCount) * Math.PI * 2);
      const cosVal = Math.cos((i / barCount) * Math.PI * 4);
      const pseudoHeight = 0.3 + 0.45 * Math.abs(sinVal) + 0.2 * Math.abs(cosVal) + (Math.random() * 0.15);
      barHeights.push(Math.min(pseudoHeight, 0.95));
    }

    function drawWaveform(progressPct = 0) {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);

      const spacing = 2;
      const barWidth = Math.max((width - (barCount * spacing)) / barCount, 2);

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + spacing);
        const barH = barHeights[i] * height;
        const y = (height - barH) / 2;
        const isPlayed = (i / barCount) <= progressPct;

        if (isPlayed) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, '#06b6d4');
          grad.addColorStop(0.5, '#6366f1');
          grad.addColorStop(1, '#ec4899');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barH, 2);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();
      }
    }

    drawWaveform(0);

    // Play / Pause Toggle
    btnPlay.addEventListener('click', () => {
      // Pause any other playing audio
      state.activeAudioPlayers.forEach((otherAudio, otherId) => {
        if (otherId !== cardId && !otherAudio.paused) {
          otherAudio.pause();
        }
      });

      if (audio.paused) {
        audio.play().catch(e => console.log('Autoplay policy prevented playback:', e));
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', () => {
      iconPlay.style.display = 'none';
      iconPause.style.display = 'block';
      state.activeAudioPlayers.set(cardId, audio);
    });

    audio.addEventListener('pause', () => {
      iconPlay.style.display = 'block';
      iconPause.style.display = 'none';
    });

    audio.addEventListener('ended', () => {
      iconPlay.style.display = 'block';
      iconPause.style.display = 'none';
      drawWaveform(0);
      timeCurrent.textContent = '00:00';
    });

    audio.addEventListener('timeupdate', () => {
      if (audio.duration && !isNaN(audio.duration)) {
        const progress = audio.currentTime / audio.duration;
        drawWaveform(progress);
        timeCurrent.textContent = formatAudioSeconds(audio.currentTime);
        timeTotal.textContent = formatAudioSeconds(audio.duration);
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && !isNaN(audio.duration)) {
        timeTotal.textContent = formatAudioSeconds(audio.duration);
      }
    });

    // Waveform Click Seeking
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      if (audio.duration && !isNaN(audio.duration)) {
        audio.currentTime = pct * audio.duration;
        drawWaveform(pct);
      }
    });

    // Volume Adjustment
    volumeSlider.addEventListener('input', (e) => {
      audio.volume = parseFloat(e.target.value);
    });

    // Redraw on window resize
    window.addEventListener('resize', () => {
      const progress = audio.duration ? (audio.currentTime / audio.duration) : 0;
      drawWaveform(progress);
    });
  }

  // --- UTILITIES ---
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatAudioSeconds(seconds) {
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `app-toast toast-${type}`;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#6366f1'};
      color: white;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 0.88rem;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      z-index: 9999;
      animation: fadeIn 0.25s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Run initial setup
  window.addEventListener('DOMContentLoaded', init);
})();
