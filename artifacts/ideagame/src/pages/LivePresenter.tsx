/**
 * /live-presenter?code=PRESENTER_CODE
 * Presentatore Live: telecomando della Home session collegata alla stanza Live.
 */
import LiveRemote from '../components/LiveRemote';

export default function LivePresenter() {
  return <LiveRemote extended={false} />;
}
