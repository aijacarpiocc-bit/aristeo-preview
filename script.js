const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function getHeroPlaylist(frame) {
  const playlist = frame.querySelector('[data-hero-playlist]');
  if (!playlist) return null;
  return {
    clips: Array.from(playlist.content.children, item => item.dataset),
    videos: Array.from(frame.querySelectorAll('.hero-video')),
    index: 0,
    transition: null,
  };
}

const players = Array.from(document.querySelectorAll('.player'), frame => ({
  frame,
  video: frame.querySelector('video'),
  hero: getHeroPlaylist(frame),
  playButton: frame.querySelector('[data-play]'),
  playLabel: frame.querySelector('.play-label'),
  soundButton: frame.querySelector('[data-sound]'),
  name: frame.dataset.player,
  inView: false,
  pausedByUser: false,
}));

function isPlaying(player) {
  return Boolean(player.hero?.transition) || (!player.video.paused && !player.video.ended);
}

function updatePlayback(player) {
  const playing = isPlaying(player);
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

function loadHeroClip(video, clip, preload) {
  video.poster = clip.poster;
  video.preload = preload;
  if (video.getAttribute('src') !== clip.src) video.src = clip.src;
}

function nextHeroClip(player) {
  const { hero } = player;
  const index = (hero.index + 1) % hero.clips.length;
  const video = hero.videos.find(layer => layer !== player.video);
  loadHeroClip(video, hero.clips[index], 'auto');
  return { video, index };
}

function pause(player) {
  const transition = player.hero?.transition;
  if (transition) {
    player.hero.transition = null;
    transition.fade?.cancel();
    transition.video.removeAttribute('data-incoming');
    transition.video.pause();
    transition.video.currentTime = 0;
  }
  player.video.pause();
  if (transition) updatePlayback(player);
}

function resetHero(player) {
  const { hero } = player;
  pause(player);
  hero.index = 0;
  player.video = hero.videos[0];
  for (const video of hero.videos) {
    video.toggleAttribute('data-active', video === player.video);
    video.preload = 'none';
    if (video.hasAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }
  player.video.poster = hero.clips[0].poster;
}

async function advanceHero(player) {
  const { hero } = player;
  if (hero.transition || reducedMotion.matches || player.pausedByUser
      || !player.inView || document.hidden) return;

  const transition = nextHeroClip(player);
  const incoming = transition.video;
  const outgoing = player.video;
  hero.transition = transition;
  updatePlayback(player);

  try {
    // Keep the final frame underneath until playback is ready and the incoming layer is opaque.
    await incoming.play();
    if (hero.transition !== transition) return;
    incoming.setAttribute('data-incoming', '');
    transition.fade = incoming.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 400,
      fill: 'forwards',
    });
    await transition.fade.finished;
  } catch {
    if (hero.transition === transition) pause(player);
    return;
  }
  if (hero.transition !== transition) return;

  player.video = incoming;
  hero.index = transition.index;
  hero.transition = null;
  incoming.setAttribute('data-active', '');
  outgoing.removeAttribute('data-active');
  incoming.removeAttribute('data-incoming');
  transition.fade.cancel();
  updatePlayback(player);
  nextHeroClip(player);
}

function play(player) {
  const { video, hero } = player;
  if (hero) {
    if (hero.transition) return;
    if (!reducedMotion.matches && video.ended) {
      advanceHero(player);
      return;
    }
    loadHeroClip(video, hero.clips[hero.index], reducedMotion.matches ? 'none' : 'auto');
  }
  video.play().then(() => {
    if (hero && !reducedMotion.matches && !video.paused && !video.ended && video === player.video) {
      nextHeroClip(player);
    }
  }).catch(() => updatePlayback(player));
}

function updateVisibility(player) {
  if (!player.inView || document.hidden) {
    pause(player);
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
  if (!player.hero) video.loop = !reducedMotion.matches;
  if (reducedMotion.matches && player.hero) {
    resetHero(player);
  } else if (reducedMotion.matches) {
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

  for (const layer of player.hero?.videos ?? [video]) {
    for (const event of ['play', 'pause', 'emptied']) {
      layer.addEventListener(event, () => {
        if (layer === player.video) updatePlayback(player);
      });
    }
    layer.addEventListener('ended', () => {
      if (layer !== player.video) return;
      if (reducedMotion.matches) {
        setSound(player, false);
        layer.load();
      } else if (player.hero) {
        advanceHero(player);
      }
      updatePlayback(player);
    });
  }

  playButton.addEventListener('click', () => {
    player.pausedByUser = isPlaying(player);
    if (player.pausedByUser) pause(player);
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
