export const BACKGROUND_MUSIC_URL = '/music/tiem-vui.wav';

const clampLevel = (value, fallback) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

// A single looping media element keeps its position when the shop is paused or
// muted. It does not share the voice queue, so disabling speech leaves music on.
export function createBackgroundMusicPlayer({
  createAudio = () => new Audio(BACKGROUND_MUSIC_URL),
  onBlocked = () => {},
  onError = () => {},
  onPlaying = () => {},
} = {}) {
  let settings = { enabled: true, volume: .28, masterVolume: .8, paused: false, muted: false, preview: false, talking: false };
  let audio, pending, disposed = false, blocked = false, failed = false, playing = false, revision = 0;

  const shouldPlay = () => !disposed && settings.enabled && !settings.paused && !settings.muted && !settings.preview && settings.volume > 0 && settings.masterVolume > 0;
  const level = () => settings.volume * settings.masterVolume * (settings.talking ? .22 : 1);
  const notify = (callback, error) => { try { callback(error); } catch {} };

  function stop() {
    playing = false;
    if (audio) { audio.pause(); audio.volume = 0; }
  }

  function attempt() {
    if (!shouldPlay() || blocked || failed) return Promise.resolve(false);
    if (!audio) {
      audio = createAudio();
      audio.loop = true;
      audio.preload = 'metadata';
    }
    const media = audio;
    media.volume = level();
    if (pending) return pending;
    if (!media.paused) { playing = true; return Promise.resolve(true); }
    const startedRevision = revision;
    let playResult;
    // Call play synchronously: unlock() is invoked inside a real browser gesture.
    try { playResult = media.play(); }
    catch (error) { playResult = Promise.reject(error); }
    pending = Promise.resolve(playResult).then(() => {
      if (!shouldPlay()) { media.pause(); playing = false; return false; }
      playing = true;
      notify(onPlaying);
      return true;
    }, error => {
      playing = false;
      // pause() can reject a pending play(). That cancellation is not a failure
      // and must never show an autoplay error after the user has muted the page.
      if (!shouldPlay() || error?.name === 'AbortError') return false;
      if (error?.name === 'NotAllowedError') { blocked = true; notify(onBlocked, error); }
      else { failed = true; notify(onError, error); }
      return false;
    }).finally(() => {
      pending = null;
      // If an earlier pause cancelled play while the user already resumed, make
      // one attempt for that new intent. An unchanged failed intent never loops.
      if (revision !== startedRevision && shouldPlay() && media.paused && !blocked && !failed) void attempt();
    });
    return pending;
  }

  function update(next = {}) {
    if (disposed) return Promise.resolve(false);
    const previousIntent = shouldPlay();
    settings = { ...settings, ...next };
    settings.volume = clampLevel(settings.volume, .28);
    settings.masterVolume = clampLevel(settings.masterVolume, .8);
    if (previousIntent !== shouldPlay()) revision++;
    if (!shouldPlay()) { stop(); return Promise.resolve(false); }
    return attempt();
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    blocked = false;
    failed = false;
    return attempt();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    revision++;
    stop();
    if (audio) {
      audio.removeAttribute?.('src');
      audio.load?.();
    }
  }

  return { update, unlock, dispose, get playing() { return playing; } };
}
