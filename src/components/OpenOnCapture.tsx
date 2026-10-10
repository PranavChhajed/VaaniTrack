/**
 * Opening the app lands on capture, even from a shortcut that points here.
 *
 * A home-screen icon made before the manifest existed is pinned to whatever
 * page was open at the time, which for the person who reported this was the
 * journal. Fixing `start_url` cannot reach an icon that already exists, and
 * "remove it and reinstall" is not a fix anyone should be asked to perform.
 *
 * So the journal itself declines to be a front door. When the document was
 * opened here from outside (a shortcut, a bookmark, a typed address) it hands
 * over to capture before anything paints.
 *
 * An inline script rather than an effect, so that it runs while the HTML is
 * still being parsed and the journal never flashes up first. It must not fire
 * when the journal is reached from inside the app, so it checks three things:
 *
 *   the document was loaded at this address   following the header link from
 *                                             capture is not a cold open
 *   type === "navigate"                       a reload or back/forward stays
 *   no same-origin referrer                   a full-page link from inside the
 *                                             site stays too
 */
const SCRIPT = `try{var n=performance.getEntriesByType("navigation")[0];if(n&&n.type==="navigate"&&new URL(n.name).pathname===location.pathname&&document.referrer.indexOf(location.origin)!==0){location.replace("/app")}}catch(e){}`;

export function OpenOnCapture() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
