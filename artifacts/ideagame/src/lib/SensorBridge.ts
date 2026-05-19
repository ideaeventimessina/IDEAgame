/**
 * SensorBridge — module-level singleton that owns all Ballo sensor listeners.
 *
 * ONE listener lifecycle: start() on MI PRENOTO tap → stop() on game end.
 * Listeners are NEVER removed between the booking warmup and BalloController.
 * This eliminates the iOS "stream stops after listener teardown" race.
 *
 * Architecture:
 *   GameFlowPhone.book()   → SensorBridge.start()      (gesture call stack)
 *   [booking POST]
 *   BalloController mount  → reads SensorBridge status (no new listeners)
 *   BalloController unmount→ SensorBridge.stop()
 */

const BALLO_PERM_KEY = 'ideagame:motion-permission';

export interface SensorStatus {
  started:         boolean;
  permMotion:      boolean;
  permOrient:      boolean;
  motionEvents:    number;
  orientEvents:    number;
  lastEventAt:     number | null;
  lastEnergy:      number;
  lastEmitAt:      number | null;
  lastOrientation: { a: number|null; b: number|null; g: number|null } | null;
  lastAccel:       { x: number|null; y: number|null; z: number|null } | null;
}

const _st: SensorStatus = {
  started: false, permMotion: false, permOrient: false,
  motionEvents: 0, orientEvents: 0, lastEventAt: null,
  lastEnergy: 0, lastEmitAt: null,
  lastOrientation: null, lastAccel: null,
};

const _orientSamples: number[] = [];
const _accelSamples:  number[] = [];
let   _prevOrient: { beta: number; gamma: number; alpha: number } | null = null;

let _onOrientation: ((e: DeviceOrientationEvent) => void) | null = null;
let _onMotion:      ((e: DeviceMotionEvent)      => void) | null = null;

function _attachListeners(): void {
  if (_onOrientation) return; // already attached — idempotent guard

  _onOrientation = (e: DeviceOrientationEvent) => {
    _st.orientEvents++;
    _st.lastEventAt = Date.now();
    _st.lastOrientation = { a: e.alpha, b: e.beta, g: e.gamma };

    if (_st.orientEvents === 1)
      console.log('[SensorBridge] first orientation — α:', e.alpha, 'β:', e.beta, 'γ:', e.gamma);

    const beta  = e.beta  ?? 0;
    const gamma = e.gamma ?? 0;
    const alpha = e.alpha ?? 0;

    if (_prevOrient !== null) {
      const db = Math.abs(beta  - _prevOrient.beta);
      const dg = Math.abs(gamma - _prevOrient.gamma);
      let   da = Math.abs(alpha - _prevOrient.alpha);
      if (da > 180) da = 360 - da; // handle 0↔360 wrap
      const movement = Math.sqrt(db * db + dg * dg + (da * 0.4) * (da * 0.4));
      if (movement > 0.1) _orientSamples.push(Math.min(movement, 60));
    }
    _prevOrient = { beta, gamma, alpha };
  };

  _onMotion = (e: DeviceMotionEvent) => {
    _st.motionEvents++;
    _st.lastEventAt = Date.now();
    const acc = e.acceleration ?? e.accelerationIncludingGravity;
    if (acc) {
      _st.lastAccel = { x: acc.x ?? null, y: acc.y ?? null, z: acc.z ?? null };
      if (_st.motionEvents === 1)
        console.log('[SensorBridge] first motion — accel:', _st.lastAccel);
      // Only push accel samples when orientation is not providing data this window
      if (_orientSamples.length === 0) {
        let mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
        if (!e.acceleration) mag = Math.abs(mag - 9.81); // subtract gravity baseline
        if (mag > 0.3) _accelSamples.push(Math.min(mag, 20));
      }
    }
  };

  window.addEventListener('deviceorientation', _onOrientation, true);
  window.addEventListener('devicemotion',      _onMotion,      true);
  console.log('[SensorBridge] listeners attached');
}

/**
 * start() — call SYNCHRONOUSLY inside the user gesture handler (button tap).
 *
 * Fires requestPermission() synchronously (iOS requirement), attaches
 * persistent listeners immediately (same gesture call stack), then returns
 * a promise that resolves when the permission dialog settles.
 *
 * Idempotent: returns immediately if bridge is already running.
 */
function start(): Promise<'granted' | 'denied'> {
  if (_onMotion !== null) {
    console.log('[SensorBridge] already running — skipping start');
    return Promise.resolve((_st.permMotion || _st.permOrient) ? 'granted' : 'denied');
  }

  _st.started = true;
  console.log('[SensorBridge] start');

  const dme = (typeof DeviceMotionEvent !== 'undefined')
    ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
    : null;
  const doe = (typeof DeviceOrientationEvent !== 'undefined')
    ? (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
    : null;

  if (dme && typeof dme.requestPermission === 'function') {
    // iOS: call requestPermission() SYNCHRONOUSLY — must be in the gesture call stack.
    let motionP: Promise<string>;
    let orientP: Promise<string> = Promise.resolve('granted');

    try { motionP = dme.requestPermission(); }
    catch (e) { console.log('[SensorBridge] motion rP threw:', e); motionP = Promise.resolve('denied'); }

    if (doe && typeof doe.requestPermission === 'function') {
      try { orientP = doe.requestPermission(); }
      catch (e) { console.log('[SensorBridge] orient rP threw:', e); orientP = Promise.resolve('denied'); }
    }

    // Attach listeners SYNCHRONOUSLY — same gesture call stack as requestPermission().
    // iOS starts streaming events once permission resolves AND listeners are in place.
    // Attaching NOW (before any await) ensures they are ready the instant iOS grants.
    _attachListeners();

    return (async () => {
      let m = false, o = false;
      try { m = (await motionP) === 'granted'; } catch { /* ignore */ }
      try { o = (await orientP) === 'granted'; } catch { /* ignore */ }
      _st.permMotion = m;
      _st.permOrient = o;
      console.log('[SensorBridge] permission — motion:', m, '| orient:', o);

      if (m || o) {
        localStorage.setItem(BALLO_PERM_KEY, 'granted');
        return 'granted' as const;
      }
      // Both denied: clean up
      stop();
      localStorage.setItem(BALLO_PERM_KEY, 'denied');
      return 'denied' as const;
    })();
  } else {
    // Android / Chrome iOS / desktop: no requestPermission API — auto-granted.
    _st.permMotion = true;
    _st.permOrient = true;
    localStorage.setItem(BALLO_PERM_KEY, 'granted');
    console.log('[SensorBridge] permission — auto-granted (no requestPermission API)');
    _attachListeners();
    return Promise.resolve('granted' as const);
  }
}

function stop(): void {
  if (_onOrientation) {
    window.removeEventListener('deviceorientation', _onOrientation, true);
    _onOrientation = null;
  }
  if (_onMotion) {
    window.removeEventListener('devicemotion', _onMotion, true);
    _onMotion = null;
  }
  _st.started = false; _st.permMotion = false; _st.permOrient = false;
  _st.motionEvents = 0; _st.orientEvents = 0; _st.lastEventAt = null;
  _st.lastEnergy = 0; _st.lastEmitAt = null;
  _st.lastOrientation = null; _st.lastAccel = null;
  _orientSamples.length = 0;
  _accelSamples.length  = 0;
  _prevOrient = null;
  console.log('[SensorBridge] stopped');
}

/** Read current status without mutating anything. */
function getStatus(): Readonly<SensorStatus> {
  return _st;
}

/**
 * drainSamples() — called by BalloController every 400ms.
 * Returns current orientation-delta and accel samples, then clears the arrays.
 */
function drainSamples(): { orient: number[]; accel: number[] } {
  const orient = _orientSamples.splice(0);
  const accel  = _accelSamples.splice(0);
  return { orient, accel };
}

/** Record last emitted energy + timestamp (read back for diagnostics). */
function setLastEmit(energy: number): void {
  _st.lastEnergy = energy;
  _st.lastEmitAt = Date.now();
}

export const SensorBridge = { start, stop, getStatus, drainSamples, setLastEmit };
