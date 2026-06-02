import { StatusBar, setStatusBarStyle, setStatusBarBackgroundColor } from 'expo-status-bar';
import { View, StatusBar as RNStatusBar, Platform, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRef, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LandingScreen from './LandingScreen';

const CONTENT_SCRIPT = `
(function() {
  if (window.__NOREELS__) return;
  window.__NOREELS__ = true;

  function dbg(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dbg', msg: msg }));
  }
  dbg('SCRIPT_INIT path=' + window.location.pathname);

  var BLOCKER_ID = 'reel-blocker-overlay';
  var FEED_BLOCKER_ID = 'feed-focus-overlay';
  var FEED_CONTENT_ID = 'feed-focus-content';
  var REELS_ICON_ID = 'custom-reels-nav-icon';

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
  var lastSentDark = null;
  var reelsIconPos = null;

  function isOnSingleReel() {
    var path = window.location.pathname;
    if (path.indexOf('/reel/') === 0) return true;
    if (path.indexOf('/stories/') === 0) return false;
    // DM modal: reel shown as fullscreen overlay without URL change
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var r = videos[i].getBoundingClientRect();
      if (r.width > window.innerWidth * 0.7 && r.height > window.innerHeight * 0.5) return true;
    }
    return false;
  }

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

  function parseColor(cssColor) {
    // Avoid \d/\s regex — those escape sequences are eaten by template literals
    var s = cssColor.indexOf('(');
    var e = cssColor.lastIndexOf(')');
    if (s < 0 || e < 0) return null;
    var parts = cssColor.slice(s+1, e).split(',');
    if (parts.length < 3) return null;
    var r = parseInt(parts[0], 10);
    var g = parseInt(parts[1], 10);
    var b = parseInt(parts[2], 10);
    var a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
    if (isNaN(r) || isNaN(g) || isNaN(b) || a < 0.1) return null;
    return { lum: 0.299*r + 0.587*g + 0.114*b, css: 'rgb('+r+','+g+','+b+')' };
  }

  function getPageTheme() {
    if (!document.body) return { dark: false, bg: '#fff' };
    var bodyBg = parseColor(window.getComputedStyle(document.body).backgroundColor);
    if (bodyBg && bodyBg.lum < 200) {
      return { dark: bodyBg.lum < 128, bg: bodyBg.css };
    }
    var textColor = parseColor(window.getComputedStyle(document.body).color);
    if (textColor) {
      return { dark: textColor.lum > 128, bg: textColor.lum > 128 ? 'rgb(12,16,20)' : '#fff' };
    }
    return { dark: false, bg: '#fff' };
  }

  function isLoggedIn() {
    return !!(document.querySelector('nav') || document.querySelector('[role="tablist"]'));
  }

  function hasActiveDialog() {
    return !!document.querySelector('[role="dialog"],[role="alertdialog"]');
  }

  function applyFeedBlock() {
    if (!isHomeFeed() || !isLoggedIn()) return;

    // Dialog open: hide overlays but keep articles hidden to avoid flash
    if (hasActiveDialog()) {
      var o = document.getElementById(FEED_BLOCKER_ID);
      if (o) o.style.setProperty('display', 'none', 'important');
      var c = document.getElementById(FEED_CONTENT_ID);
      if (c) c.style.setProperty('display', 'none', 'important');
      return;
    }

    var storiesStrip = findStoriesStrip();
    if (storiesStrip) {
      var r = storiesStrip.getBoundingClientRect();
      if (r.bottom > 60 && r.bottom < window.innerHeight * 0.6) {
        cachedFeedTop = Math.round(r.bottom) + 4;
      }
    }

    // No stories strip and no cached position = interstitial or page still loading — bail out
    if (!cachedFeedTop) { removeFeedBlock(); return; }

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
    var theme = getPageTheme();
    var dark = theme.dark;
    var bg = theme.bg;
    if (window.ReactNativeWebView && dark !== lastSentDark) {
      lastSentDark = dark;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'theme',dark:dark}));
    }
    var titleColor = dark ? '#f5f5f5' : '#1c1c1c';
    var subtitleColor = dark ? '#555' : '#b8b8b8';
    var iconStroke = dark ? '#686868' : '#b0b0b0';

    var overlay = document.getElementById(FEED_BLOCKER_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = FEED_BLOCKER_ID;
      document.body.appendChild(overlay);
    }
    // Overlay: background + rainbow bar only
    overlay.innerHTML = '<div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:48px;height:1.5px;background:linear-gradient(90deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);border-radius:2px;opacity:0.55;"></div>';
    overlay.style.cssText = 'position:fixed;left:0;right:0;top:' + feedTop + 'px;bottom:' + navBottom + 'px;background:' + bg + ';z-index:2147483647;pointer-events:none;';

    // Content: separate position:fixed element at exact viewport center of the overlay zone
    var contentY = Math.round(feedTop + (window.innerHeight - feedTop - navBottom) / 2);
    var content = document.getElementById(FEED_CONTENT_ID);
    if (!content) {
      content = document.createElement('div');
      content.id = FEED_CONTENT_ID;
      document.body.appendChild(content);
      if (!document.getElementById('noslop-blink-style') && document.head) {
        var st = document.createElement('style');
        st.id = 'noslop-blink-style';
        st.textContent = '@keyframes noslopBlink{0%,100%{transform:scaleY(1)}40%{transform:scaleY(0.06)}70%{transform:scaleY(1)}}';
        document.head.appendChild(st);
      }
      content.innerHTML = [
        '<svg id="noslop-eye-svg" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="' + iconStroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;transform-origin:center;">',
        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>',
        '<circle cx="12" cy="12" r="4"/>',
        '<line x1="20" y1="3" x2="4" y2="21"/>',
        '</svg>',
        '<div style="font-size:14px;font-weight:600;color:' + titleColor + ';letter-spacing:-0.3px;">Focus mode</div>',
        '<div style="font-size:11.5px;color:' + subtitleColor + ';text-align:center;max-width:190px;line-height:1.65;margin-top:3px;">The feed is hidden.</div>',
      ].join('');
      (function scheduleBlink() {
        var delay = 3000 + Math.random() * 7000;
        setTimeout(function() {
          var svg = document.getElementById('noslop-eye-svg');
          if (!svg) return;
          svg.style.animation = 'none';
          svg.getBoundingClientRect();
          svg.style.animation = 'noslopBlink 0.4s ease-in-out';
          scheduleBlink();
        }, delay);
      })();
    }
    content.style.cssText = 'position:fixed;z-index:2147483648;left:50%;top:' + contentY + 'px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
  }

  function removeFeedBlock() {
    cachedFeedTop = null;
    var el = document.getElementById(FEED_BLOCKER_ID);
    if (el) el.remove();
    var ct = document.getElementById(FEED_CONTENT_ID);
    if (ct) ct.remove();
    document.querySelectorAll('[data-nofeed-hidden]').forEach(function(el) {
      el.style.removeProperty('display');
      el.removeAttribute('data-nofeed-hidden');
    });
    document.querySelectorAll('article').forEach(function(el) {
      el.style.removeProperty('display');
    });
    document.documentElement.style.removeProperty('overflow-y');
  }

  // --- Replace reels nav tab with custom icon ---
  function hideReelsTab() {
    var theme = getPageTheme();
    var navColor = theme.dark ? '#f5f5f5' : '#262626';
    var placed = false;

    function processReelsLink(el) {
      if (placed) return;
      // Measure BEFORE hiding (element may collapse to 0 after children are hidden)
      var rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        reelsIconPos = {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      }
      // Hide native children
      Array.from(el.children).forEach(function(c) {
        c.style.setProperty('display', 'none', 'important');
      });
      if (!reelsIconPos) return;
      placed = true;
      var cx = reelsIconPos.x;
      var cy = reelsIconPos.y;
      // Create/update a fixed overlay icon at exactly those coordinates
      var icon = document.getElementById(REELS_ICON_ID);
      if (!icon) {
        icon = document.createElement('div');
        icon.id = REELS_ICON_ID;
        document.body.appendChild(icon);
      }
      icon.style.cssText = 'position:fixed;z-index:2147483647;left:' + cx + 'px;top:' + cy + 'px;transform:translate(-50%,-50%);opacity:0.45;pointer-events:none;line-height:0;';
      icon.innerHTML = [
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"',
        ' stroke="' + navColor + '" stroke-width="2"',
        ' stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>',
        '<circle cx="12" cy="12" r="4"/>',
        '<line x1="20" y1="3" x2="4" y2="21"/>',
        '</svg>'
      ].join('');
    }

    ['a[href="/reels/"]', 'a[href="/reels"]'].forEach(function(sel) {
      document.querySelectorAll(sel).forEach(processReelsLink);
    });
    ['Reels', 'Reels Feed'].forEach(function(label) {
      document.querySelectorAll('[aria-label="' + label + '"]').forEach(function(el) {
        if (el.tagName === 'A' || el.tagName === 'BUTTON') processReelsLink(el);
      });
    });
    // Hide icon when nav bar is not visible (DMs, search, etc.)
    var icon = document.getElementById(REELS_ICON_ID);
    if (icon) icon.style.setProperty('display', placed ? 'block' : 'none', 'important');
  }

  // --- Intercept clicks on reels tab as extra layer ---
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && (a.getAttribute('href') === '/reels/' || a.getAttribute('href') === '/reels')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // --- Transparent overlay intercepts swipe gestures on single reel pages ---
  var REEL_OV_ID = 'reel-swipe-intercept';
  var _ovStartY = 0, _ovStartX = 0, _ovMoved = false;

  function createReelOverlay() {
    if (document.getElementById(REEL_OV_ID)) return;
    if (!document.body) { dbg('OVERLAY_SKIP no body'); return; }
    dbg('OVERLAY_CREATE path=' + window.location.pathname);
    var ov = document.createElement('div');
    ov.id = REEL_OV_ID;
    ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483646;background:transparent;';
    ov.addEventListener('touchstart', function(e) {
      _ovStartY = e.touches[0].clientY;
      _ovStartX = e.touches[0].clientX;
      _ovMoved = false;
      dbg('OV_TOUCHSTART y=' + _ovStartY);
    }, { passive: true });
    ov.addEventListener('touchmove', function(e) {
      var dy = e.touches[0].clientY - _ovStartY;
      var dx = e.touches[0].clientX - _ovStartX;
      if (dy * dy > dx * dx && dy * dy > 144) {
        _ovMoved = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        dbg('OV_SWIPE_BLOCKED dy=' + Math.round(dy));
      }
    }, { passive: false });
    ov.addEventListener('touchend', function(e) {
      if (!_ovMoved) {
        var t = e.changedTouches[0];
        ov.style.pointerEvents = 'none';
        var target = document.elementFromPoint(t.clientX, t.clientY);
        ov.style.pointerEvents = 'all';
        if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: t.clientX, clientY: t.clientY, view: window }));
      }
    }, { passive: true });
    ov.addEventListener('touchcancel', function() { _ovMoved = false; }, { passive: true });
    document.body.appendChild(ov);
  }

  function removeReelOverlay() {
    var el = document.getElementById(REEL_OV_ID);
    if (el) el.remove();
  }

  // --- Patch pushState / replaceState to catch SPA navigations ---
  var _push = window.history.pushState;
  window.history.pushState = function() {
    _push.apply(window.history, arguments);
    tick();
  };
  var _replace = window.history.replaceState;
  window.history.replaceState = function() {
    _replace.apply(window.history, arguments);
    tick();
  };
  window.addEventListener('popstate', tick);

  function tick() {
    setTimeout(function() {
      dbg('TICK path=' + window.location.pathname + ' singleReel=' + isOnSingleReel() + ' ovExists=' + !!document.getElementById(REEL_OV_ID));
      hideReelsTab();
      if (isReelsFeed()) { showBlocker(); } else { removeBlocker(); }
      if (isHomeFeed() && isLoggedIn()) { applyFeedBlock(); } else { removeFeedBlock(); }
      if (isOnSingleReel() && !hasActiveDialog()) { createReelOverlay(); } else { removeReelOverlay(); }
    }, 80);
  }

  // --- Polling fallback ---
  setInterval(function() {
    var onReel = isOnSingleReel();
    dbg('POLL path=' + window.location.pathname + ' onReel=' + onReel + ' ovExists=' + !!document.getElementById(REEL_OV_ID));
    hideReelsTab();
    if (isReelsFeed()) { showBlocker(); } else { removeBlocker(); }
    if (isHomeFeed() && isLoggedIn()) { applyFeedBlock(); } else { removeFeedBlock(); }
    if (onReel && !hasActiveDialog()) { createReelOverlay(); } else { removeReelOverlay(); }
  }, 600);

  tick();
})();
true;
`;

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0;

export default function App() {
  const webViewRef = useRef(null);
  const [isDark, setIsDark] = useState(false);
  const canGoBackRef = useRef(false);
  const [showLanding, setShowLanding] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done')
      .then((val) => setShowLanding(val === null))
      .catch(() => setShowLanding(false));
  }, []);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, []);

  if (showLanding === null) return <View style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;

  if (showLanding) {
    return (
      <View style={{ flex: 1, paddingTop: STATUS_BAR_HEIGHT, backgroundColor: '#0A0A0A' }}>
        <StatusBar style="light" />
        <LandingScreen onDone={() => {
          AsyncStorage.setItem('onboarding_done', '1');
          setShowLanding(false);
        }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: STATUS_BAR_HEIGHT, backgroundColor: isDark ? 'rgb(12,16,20)' : '#fff' }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
        onMessage={(e) => {
          try {
            var data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'theme') {
              setIsDark(data.dark);
              setStatusBarStyle(data.dark ? 'light' : 'dark', true);
              setStatusBarBackgroundColor(data.dark ? '#0c1014' : '#ffffff', true);
            } else if (data.type === 'dbg') {
              console.log('[WebView]', data.msg);
            }
          } catch (_) {}
        }}
        onNavigationStateChange={(navState) => {
          canGoBackRef.current = navState.canGoBack;
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(CONTENT_SCRIPT);
          }
        }}
      />
    </View>
  );
}
