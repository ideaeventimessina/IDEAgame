/**
 * /live-regia?code=PRESENTER_CODE
 * Regia Live: stesso telecomando del Presentatore, con controlli estesi
 * (blackout, punteggi per giocatore, apri TV).
 */
import LiveRemote from '../components/LiveRemote';

export default function LiveRegia() {
  return <LiveRemote extended />;
}
