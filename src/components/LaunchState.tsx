/**
 * Two facts about this launch, written onto <html> while the page is still being
 * parsed, so that CSS can act on them before React has loaded a single byte.
 *
 *   data-first-run   this browser has never been here (no tour taken, no device id: the same
 *                    test as `hasOnboarded()` in device.ts). The app screens show a plain
 *                    welcome veil until the tour itself is ready, instead of the capture screen
 *                    for as long as the phone takes to start the app. On a slow phone that was
 *                    five seconds of a screen the person could already tap, and then a tour
 *                    arriving on top of it.
 *   data-cold        this is a fresh page load, not a move between screens. The entrance
 *                    animation (`.enter` in globals.css) plays only then, and it is CSS, so it
 *                    plays on the first paint and not whenever the scripts get there.
 *
 * An inline script for the reason OpenOnCapture.tsx gives: it must run while the HTML is still
 * being parsed, and it lives in the root layout because a layout is rendered into the document
 * once, where a page rendered again by client navigation would make React log an error for
 * finding a script.
 *
 * Storage that cannot be read leaves both unset: `hasOnboarded()` fails toward "done", and so
 * does this.
 */
const SCRIPT = `try{var d=document.documentElement,S=localStorage;if(S.getItem("vaanitrack.onboarded")!=="true"&&S.getItem("vaanitrack.device")===null)d.setAttribute("data-first-run","");d.setAttribute("data-cold","");setTimeout(function(){d.removeAttribute("data-cold")},1800)}catch(e){}`;

export function LaunchState() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
