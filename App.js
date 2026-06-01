import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRef } from 'react';

const CONTENT_SCRIPT = `
(function() {
  if (window.__NOREELS__) return;
  window.__NOREELS__ = true;

  var BLOCKER_ID = 'reel-blocker-overlay';
  var FEED_BLOCKER_ID = 'feed-focus-overlay';

  // --- Reels feed overlay ---
  function isReelsFeed() {
    var p = window.location.pathname;
    return p === '/reels' || p === '/reels/' || p.startsWith('/reels/?');
  }

  function showBlocker() {
    if (document.getElementById(BLOCKER_ID)) return;
    var el = document.createElement('div');
    el.id = BLOCKER_ID;
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#d0d0d0;z-index:2147483647;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-family:sans-serif;';
    el.innerHTML = '<div style="font-size:20px;font-weight:700;color:#444;text-align:center;">Scroll des reels désactivé</div><div style="font-size:13px;color:#888;text-align:center;max-width:260px;">Les reels reçus en DM restent accessibles via lien direct</div>';
    document.body.appendChild(el);
  }

  function removeBlocker() {
    var el = document.getElementById(BLOCKER_ID);
    if (el) el.remove();
  }

  // --- Home feed blocker (keeps stories, hides posts) ---
  function isHomeFeed() {
    var p = window.location.pathname;
    return p === '/' || p === '';
  }

  var cachedFeedTop = null;

  function getNavBottom() {
    var nav = document.querySelector('nav') || document.querySelector('[role="tablist"]');
    if (nav) {
      var rect = nav.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.5) return Math.round(window.innerHeight - rect.top);
    }
    return 56;
  }

  function findStoriesStrip() {
    var divs = document.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      var r = d.getBoundingClientRect();
      if (r.top < 300 && r.bottom > 60 && d.scrollWidth > window.innerWidth + 10) return d;
    }
    return null;
  }

  function applyFeedBlock() {
    if (!isHomeFeed()) return;

    var storiesStrip = findStoriesStrip();
    if (storiesStrip) {
      var r = storiesStrip.getBoundingClientRect();
      if (r.bottom > 60 && r.bottom < window.innerHeight * 0.6) {
        cachedFeedTop = Math.round(r.bottom) + 4;
      }
    }

    // Hide articles and their non-stories siblings (e.g. "Vous êtes à jour")
    document.querySelectorAll('article').forEach(function(a) {
      a.style.setProperty('display', 'none', 'important');
      var p = a.parentElement;
      if (!p) return;
      Array.from(p.children).forEach(function(c) {
        if (c.tagName === 'ARTICLE') return;
        if (c.id === FEED_BLOCKER_ID) return;
        if (storiesStrip && c.contains(storiesStrip)) return;
        if (c.getAttribute('data-nofeed-hidden')) return;
        c.setAttribute('data-nofeed-hidden', '1');
        c.style.setProperty('display', 'none', 'important');
      });
    });

    document.documentElement.style.setProperty('overflow-y', 'hidden', 'important');

    var feedTop = cachedFeedTop || 220;
    var navBottom = getNavBottom();

    var overlay = document.getElementById(FEED_BLOCKER_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = FEED_BLOCKER_ID;
      overlay.innerHTML = [
        '<div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:48px;height:1.5px;background:linear-gradient(90deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);border-radius:2px;opacity:0.55;"></div>',
        '<div style="width:42px;height:42px;border-radius:50%;border:1px solid #ededed;display:flex;align-items:center;justify-content:center;margin-bottom:10px;background:#fafafa;">',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8c8c8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>',
        '<path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>',
        '<path d="M14.12 14.12a3 3 0 11-4.24-4.24"/>',
        '<line x1="1" y1="1" x2="23" y2="23"/>',
        '</svg>',
        '</div>',
        '<div style="font-size:14px;font-weight:600;color:#1c1c1c;letter-spacing:-0.3px;">Mode focus</div>',
        '<div style="font-size:11.5px;color:#b8b8b8;text-align:center;max-width:190px;line-height:1.65;margin-top:3px;">Le fil est masqué.<br>Profite des stories.</div>',
      ].join('');
      document.body.appendChild(overlay);
    }
    overlay.style.cssText = [
      'position:fixed',
      'left:0', 'right:0',
      'top:' + feedTop + 'px',
      'bottom:' + navBottom + 'px',
      'background:#fff',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'gap:4px',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'pointer-events:none',
    ].join(';') + ';';
  }

  function removeFeedBlock() {
    cachedFeedTop = null;
    var el = document.getElementById(FEED_BLOCKER_ID);
    if (el) el.remove();
    document.querySelectorAll('[data-nofeed-hidden]').forEach(function(el) {
      el.style.removeProperty('display');
      el.removeAttribute('data-nofeed-hidden');
    });
    document.querySelectorAll('article').forEach(function(el) {
      el.style.removeProperty('display');
    });
    document.documentElement.style.removeProperty('overflow-y');
  }

  // --- Hide reels nav tab ---
  function hideReelsTab() {
    ['a[href="/reels/"]', 'a[href="/reels"]'].forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(a) {
        var parent = a.closest('li') || a.closest('[role="listitem"]') || a.parentElement;
        if (parent) parent.style.setProperty('display','none','important');
        a.style.setProperty('display','none','important');
      });
    });
    ['Reels', 'Reels Feed'].forEach(function(label) {
      document.querySelectorAll('[aria-label="' + label + '"]').forEach(function(el) {
        var parent = el.closest('li') || el.parentElement;
        if (parent) parent.style.setProperty('display','none','important');
        el.style.setProperty('display','none','important');
      });
    });
  }

  // --- Intercept clicks on reels tab as extra layer ---
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && (a.getAttribute('href') === '/reels/' || a.getAttribute('href') === '/reels')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // --- Patch pushState to catch SPA navigations ---
  var _push = window.history.pushState;
  window.history.pushState = function() {
    _push.apply(window.history, arguments);
    tick();
  };
  window.addEventListener('popstate', tick);

  function tick() {
    setTimeout(function() {
      hideReelsTab();
      if (isReelsFeed()) { showBlocker(); } else { removeBlocker(); }
      if (isHomeFeed()) { applyFeedBlock(); } else { removeFeedBlock(); }
    }, 80);
  }

  // --- Polling fallback ---
  setInterval(function() {
    hideReelsTab();
    if (isReelsFeed()) { showBlocker(); } else { removeBlocker(); }
    if (isHomeFeed()) { applyFeedBlock(); } else { removeFeedBlock(); }
  }, 600);

  tick();
})();
true;
`;

export default function App() {
  const webViewRef = useRef(null);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <WebView
        ref={webViewRef}
        source={{ uri: 'https://www.instagram.com' }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        injectedJavaScriptBeforeContentLoaded={CONTENT_SCRIPT}
        injectedJavaScript={CONTENT_SCRIPT}
        scalesPageToFit={true}
        mixedContentMode="always"
        onNavigationStateChange={(navState) => {
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(CONTENT_SCRIPT);
          }
        }}
      />
    </View>
  );
}
