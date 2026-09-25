import { BACKGROUND_ART_KEY, BACKGROUND_COOKIE, BACKGROUND_HUES } from "./background";
import { THEME_COOKIE } from "./theme";

export const SIDEBAR_KEY = "trekker:sidebar";

/**
 * The background variant (`lib/background.ts`), from its cookie, as
 * `data-background` and, for a colour, `--bg-hue`; junk is plain, as the
 * server's parser has it. For the artwork, the poster this browser last drew
 * goes in `--bg-art` from storage, so a launch paints it at once and the
 * bell's answer only has to correct it on a new day. The poster's shape is
 * checked before it goes into a CSS `url()`. No backslashes in these
 * expressions: they live in a template string.
 */
const BACKGROUND_PART = `try{var b=document.cookie.match(/(?:^|; )${BACKGROUND_COOKIE}=([^;]*)/);var v=b?decodeURIComponent(b[1]).toLowerCase():"";var c=/^colour-([0-9]{1,3})$/.exec(v);if(v==="gradient"||v==="artwork")d.dataset.background=v;else if(c&&[${BACKGROUND_HUES.join(",")}].indexOf(+c[1])>=0){d.dataset.background="colour";d.style.setProperty("--bg-hue",c[1])}else delete d.dataset.background;if(v==="artwork"){var a=localStorage.getItem("${BACKGROUND_ART_KEY}");if(a&&/^[/][A-Za-z0-9_-]{1,64}[.](jpg|jpeg|png|webp)$/.test(a))d.style.setProperty("--bg-art",'url("https://image.tmdb.org/t/p/w92'+a+'")')}}catch(e){}`;

/**
 * Runs in <head> before the body paints. Three jobs, all about not flashing:
 *
 * - The theme is re-read from the cookie here, not trusted from the markup,
 *   because the service worker serves cached HTML that may predate the last
 *   change, and because only the browser can resolve "system".
 * - The sidebar's collapsed state lives in localStorage, which the server
 *   cannot see; setting the attribute now means the rail never jumps.
 * - The background variant, re-read from its cookie for the theme's reasons
 *   (`BACKGROUND_PART`).
 *
 * Each part is wrapped on its own: storage can throw in private windows, and a
 * failure in one must not cost the other.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=m?decodeURIComponent(m[1]):"dark";d.dataset.theme=p==="light"?"light":p==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):"dark"}catch(e){}try{if(localStorage.getItem("${SIDEBAR_KEY}")==="collapsed")d.dataset.sidebar="collapsed"}catch(e){}${BACKGROUND_PART}})();`;

/**
 * Registered from <head> rather than on `load`: the shell this worker caches is
 * what makes the next launch fast, and `load` can be seconds away on a page
 * that is still streaming.
 *
 * A "stale-page" message means the worker served this page from cache and the
 * server has since answered differently (usually: signed out). Reloading goes
 * to the network, which follows the redirect.
 *
 * A "page-fresh" message means the page was painted from cache and the server
 * has now answered. It can arrive before React has hydrated, so it is kept on
 * `window` as well as announced; `CacheRefresher` picks it up either way.
 */
export const SW_REGISTER_SCRIPT = `if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(function(){});navigator.serviceWorker.addEventListener("message",function(e){var t=e.data&&e.data.type;if(t==="stale-page")location.reload();if(t==="page-fresh"){window.__trekkerFresh=true;dispatchEvent(new Event("trekker:fresh"))}})}`;
