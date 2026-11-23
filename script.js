const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const players = Array.from(document.querySelectorAll('.player'), frame => ({
  frame,
  video: frame.querySelector('video'),
  playButton: frame.querySelector('[data-play]'),
  playLabel: frame.querySelector('.play-label'),
  soundButton: frame.querySelector('[data-sound]'),
  name: frame.dataset.player,
  inView: false,
  pausedByUser: false,
}));

function updatePlayback(player) {
  const playing = !player.video.paused && !player.video.ended;
  const action = playing ? 'Pausar' : 'Reproducir';
  player.playButton.hidden = Boolean(player.soundButton) && !playing
    && !player.pausedByUser && !reducedMotion.matches;
  player.frame.toggleAttribute('data-playing', playing);
  player.playLabel.textContent = action;
  player.playButton.setAttribute('aria-label', `${action} vídeo de ${player.name}`);
}

function setSound(player, audible) {
  if (!player.soundButton) return;
  player.video.muted = !audible;
  player.soundButton.setAttribute('aria-pressed', String(audible));
  player.soundButton.firstElementChild.textContent = audible ? '🔊' : '🔇';
}

function play(player) {
  const { video } = player;
  // Attach the hero source after checking the motion preference to avoid native autoplay in reduced mode.
  if (video.dataset.src && !video.hasAttribute('src')) {
    video.src = video.dataset.src;
  }
  video.play().catch(() => updatePlayback(player));
}

function updateVisibility(player) {
  if (!player.inView || document.hidden) {
    player.video.pause();
    setSound(player, false);
    if (reducedMotion.matches && player.video.currentTime > 0) {
      player.video.load();
    }
  } else if (!reducedMotion.matches && !player.pausedByUser) {
    play(player);
  }
}

function applyMotionPreference(player) {
  const { video } = player;
  video.autoplay = Boolean(video.dataset.src) && !reducedMotion.matches;
  video.loop = !reducedMotion.matches;
  if (reducedMotion.matches) {
    const started = !video.paused || video.currentTime > 0;
    video.pause();
    setSound(player, false);
    if (started) video.load();
  } else {
    updateVisibility(player);
  }
  updatePlayback(player);
}

const playerByFrame = new Map(players.map(player => [player.frame, player]));
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    const player = playerByFrame.get(entry.target);
    player.inView = entry.isIntersecting && entry.intersectionRatio >= 0.18;
    updateVisibility(player);
  }
}, { threshold: 0.18 }) : null;

for (const player of players) {
  const { frame, video, playButton, soundButton } = player;
  applyMotionPreference(player);

  for (const event of ['play', 'pause', 'ended', 'emptied']) {
    video.addEventListener(event, () => updatePlayback(player));
  }

  video.addEventListener('ended', () => {
    if (reducedMotion.matches) {
      setSound(player, false);
      video.load();
    }
  });

  playButton.addEventListener('click', () => {
    player.pausedByUser = !video.paused && !video.ended;
    if (player.pausedByUser) video.pause();
    else play(player);
  });

  if (soundButton) {
    soundButton.hidden = false;

    function toggleSound() {
      const audible = video.muted;
      if (audible) {
        for (const other of players) {
          if (other !== player) setSound(other, false);
        }
      }
      setSound(player, audible);
      if (audible && video.paused) {
        player.pausedByUser = false;
        play(player);
      }
    }

    soundButton.addEventListener('click', toggleSound);
    frame.closest('.video-card').addEventListener('click', event => {
      if (!event.target.closest('button') && (!reducedMotion.matches || !video.paused)) {
        toggleSound();
      }
    });
  }

  observer?.observe(frame);
}

reducedMotion.addEventListener('change', () => players.forEach(applyMotionPreference));
document.addEventListener('visibilitychange', () => players.forEach(updateVisibility));
