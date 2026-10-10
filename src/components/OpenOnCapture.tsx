/**
 * Opening the app lands on capture, even from a shortcut that points here.
 *
 * A home-screen icon made before the manifest existed is pinned to whatever
 * page was open at the time, which for the person who reported this was the
 * journal. Fixing `start_url` cannot reach an icon that already exists, and
 * "remove it and reinstall" is not a fix anyone should be asked to perform.
 *
 * So the journal declines to be a front door. When a document is opened on it
 * from outside (a shortcut, a bookmark, a typed address) this hands over to
 * capture before anything paints.
 *
 * An inline script rather than an effect, so that it runs while the HTML is
 * still being parsed and the journal never flashes up first. It is mounted in
 * the root layout, not on the journal page: a layout is rendered into the
 * document once and never again, whereas a page is re-rendered by client
 * navigation, where React does not run scripts and logs an error for finding
 * one. Running once per document is also exactly the condition wanted, since
 * following the header link to the journal loads no new document.
 *
 *   pathname === "/journal"   the only page that redirects
 *   type === "navigate"       a reload or back/forward stays on the journal
 *   no same-origin referrer   a full-page link from inside the site stays too
 *   no `from=widget`          the home-screen widget has a Journal button, and a
 *                             button that says Journal must open the journal
 */
const SCRIPT = `try{var n=performance.getEntriesByType("navigation")[0];if(location.pathname==="/journal"&&n&&n.type==="navigate"&&document.referrer.indexOf(location.origin)!==0&&location.search.indexOf("from=widget")<0){location.replace("/app")}}catch(e){}`;

export function OpenOnCapture() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
