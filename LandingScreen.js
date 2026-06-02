import { useEffect, useRef, useState, memo } from 'react';
import { Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View, StatusBar } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFonts, DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
const { width: SW } = Dimensions.get('window');

// ── Theme ─────────────────────────────────────────────────────────────────────

function getColors(dark) {
  return dark ? {
    bg:           '#0A0A0A',
    appName:      '#FFFFFF',
    tagline:      '#777777',
    slideTitle:   '#F0F0F0',
    slideDesc:    '#7A7A7A',
    dot:          '#222222',
    dotActive:    '#FFFFFF',
    ctaBg:        '#FFFFFF',
    ctaText:      '#0A0A0A',
    ctaDisabledBg:'#111111',
    ctaDisabledBorder:'#222222',
    ctaDisabledText:'#333333',
    iconStroke:   '#C0C0C0',
    iconMuted:    '#555555',
  } : {
    bg:           '#F8F8F8',
    appName:      '#0A0A0A',
    tagline:      '#999999',
    slideTitle:   '#111111',
    slideDesc:    '#888888',
    dot:          '#DDDDDD',
    dotActive:    '#0A0A0A',
    ctaBg:        '#0A0A0A',
    ctaText:      '#FFFFFF',
    ctaDisabledBg:'#EEEEEE',
    ctaDisabledBorder:'#DDDDDD',
    ctaDisabledText:'#AAAAAA',
    iconStroke:   '#333333',
    iconMuted:    '#AAAAAA',
  };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconInfinity({ stroke, muted }) {
  return (
    <View style={ic.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[ic.loop, { borderColor: stroke }]} />
        <View style={[ic.loop, { borderColor: stroke, marginLeft: -7 }]} />
      </View>
      <View style={[ic.slash, { backgroundColor: muted }]} />
    </View>
  );
}

function IconNetwork({ stroke, muted }) {
  const spokes = [{ angle: -50, len: 13 }, { angle: 10, len: 13 }, { angle: 70, len: 13 }];
  return (
    <View style={ic.wrap}>
      {spokes.map(({ angle, len }, i) => (
        <View key={i} style={[ic.spoke, { height: len, backgroundColor: muted, transform: [{ rotate: `${angle}deg` }] }]} />
      ))}
      <View style={[ic.centerDot, { backgroundColor: stroke }]} />
      <View style={[ic.outerDot, { backgroundColor: muted, position: 'absolute', top: 0,   left: 10 }]} />
      <View style={[ic.outerDot, { backgroundColor: muted, position: 'absolute', top: 10,  right: 4 }]} />
      <View style={[ic.outerDot, { backgroundColor: muted, position: 'absolute', bottom: 2, left: 8 }]} />
    </View>
  );
}

function IconPadlock({ stroke }) {
  return (
    <View style={ic.wrap}>
      <View style={[ic.shackle, { borderColor: stroke }]} />
      <View style={[ic.body, { borderColor: stroke }]}>
        <View style={[ic.keyCircle, { borderColor: stroke }]} />
        <View style={[ic.keySlot, { backgroundColor: stroke }]} />
      </View>
    </View>
  );
}

const ic = StyleSheet.create({
  wrap:      { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  loop:      { width: 24, height: 17, borderRadius: 12, borderWidth: 2.5 },
  slash:     { position: 'absolute', width: 2.5, height: 54, borderRadius: 1.5, transform: [{ rotate: '45deg' }] },
  spoke:     { position: 'absolute', width: 1.5, borderRadius: 1, bottom: '50%', left: '50%', transformOrigin: 'bottom center' },
  centerDot: { width: 9, height: 9, borderRadius: 5 },
  outerDot:  { width: 6, height: 6, borderRadius: 3 },
  shackle:   { width: 22, height: 14, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderWidth: 2.5, borderBottomWidth: 0 },
  body:      { width: 32, height: 22, borderRadius: 6, borderWidth: 2.5, marginTop: -1, justifyContent: 'center', alignItems: 'center' },
  keyCircle: { width: 7, height: 7, borderRadius: 4, borderWidth: 2, marginBottom: 1 },
  keySlot:   { width: 2, height: 5, borderRadius: 1, marginTop: -1 },
});

// ── Strings ───────────────────────────────────────────────────────────────────

const STRINGS = {
  appName: 'NoSlop',
  tagline: 'Instagram without the noise.',
  cta:     'Get started',
  slides: [
    {
      title: 'Infinite scroll, off',
      desc:  'The Reels feed and infinite swipe are disabled. You open Instagram, not a slot machine.',
    },
    {
      title: 'Social stays intact',
      desc:  'The app removes the noise, not the connection. Stories, DMs and shared reels still work.',
    },
    {
      title: 'Zero access',
      desc:  'No screen reading, no account connection. The app just hides content, nothing more.',
    },
  ],
};

const ICONS = [IconInfinity, IconNetwork, IconPadlock];

// ── Component ─────────────────────────────────────────────────────────────────

const VideoBackground = memo(() => {
  const player = useVideoPlayer(require('./assets/bg.mp4'), p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsFullscreen={false} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)' }]} />
    </>
  );
});

export default function LandingScreen({ onDone }) {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_600SemiBold, DMSans_700Bold });
  const c = getColors(true);

  const scrollRef = useRef(null);
  const [page, setPage] = useState(0);
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const unlocked = page >= STRINGS.slides.length - 1;
  const userTouching = useRef(false);
  const dotProgress = useRef(new Animated.Value(0)).current;
  const dotAnimRef = useRef(null);

  function startDotAnim(p) {
    if (dotAnimRef.current) dotAnimRef.current.stop();
    if (p >= STRINGS.slides.length - 1) { dotProgress.setValue(1); return; }
    dotProgress.setValue(0);
    dotAnimRef.current = Animated.timing(dotProgress, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    });
    dotAnimRef.current.start(({ finished }) => {
      if (finished && !userTouching.current) {
        const next = p + 1;
        scrollRef.current?.scrollTo({ x: next * SW, animated: true });
        setPage(next);
      }
    });
  }

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    Animated.timing(ctaAnim, { toValue: unlocked ? 1 : 0.3, duration: 350, useNativeDriver: true }).start();
  }, [unlocked]);

  useEffect(() => {
    startDotAnim(page);
  }, [page]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  function handleScroll(e) {
    const p = Math.round(e.nativeEvent.contentOffset.x / SW);
    if (p !== page) setPage(p);
  }

  return (
    <View style={[s.root, { backgroundColor: '#000' }]}>
      <VideoBackground />
      <Animated.View style={[s.header, { opacity: headerAnim }]}>
        <Text style={[s.appName, { color: c.appName }]}>{STRINGS.appName}</Text>
        <Text style={[s.tagline, { color: c.tagline }]}>{STRINGS.tagline}</Text>
      </Animated.View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchStart={() => { userTouching.current = true; dotAnimRef.current?.stop(); }}
        onMomentumScrollEnd={(e) => { userTouching.current = false; handleScroll(e); }}
        onScrollEndDrag={(e) => { userTouching.current = false; const p = Math.round(e.nativeEvent.contentOffset.x / SW); if (p === page) startDotAnim(page); }}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}
      >
        {STRINGS.slides.map((slide, i) => (
          <Slide key={i} slide={slide} Icon={ICONS[i]} index={i} currentPage={page} colors={c} />
        ))}
      </ScrollView>

      <View style={s.dots}>
        {STRINGS.slides.map((_, i) => {
          const isActive = i === page;
          return (
            <View key={i} style={[s.dot, { backgroundColor: c.dot }, isActive && s.dotActive]}>
              {isActive && (
                <Animated.View style={[s.dotFill, { backgroundColor: c.dotActive, width: dotProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }]} />
              )}
            </View>
          );
        })}
      </View>

      <Animated.View style={{ opacity: ctaAnim, marginBottom: 40, marginTop: 20 }}>
        <TouchableOpacity
          style={[s.cta, { backgroundColor: c.ctaBg }]}
          onPress={unlocked ? onDone : null}
          activeOpacity={0.85}
        >
          <Text style={[s.ctaText, { color: c.ctaText }]}>{STRINGS.cta}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function Slide({ slide, Icon, index, currentPage, colors: c }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: index === currentPage ? 1 : 0, duration: 380, useNativeDriver: true }).start();
  }, [index === currentPage]);

  return (
    <Animated.View style={[s.slide, {
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    }]}>
      <View style={s.iconWrap}>
        <Icon stroke={c.iconStroke} muted={c.iconMuted} />
      </View>
      <Text style={[s.slideTitle, { color: c.slideTitle }]}>{slide.title}</Text>
      <Text style={[s.slideDesc,  { color: c.slideDesc  }]}>{slide.desc}</Text>
    </Animated.View>
  );
}

// ── Styles (layout only, no colors) ──────────────────────────────────────────

const s = StyleSheet.create({
  root:      { flex: 1, alignItems: 'center' },
  header:    { alignItems: 'center', paddingTop: 64, paddingBottom: 36 },
  appName:   { fontSize: 38, fontFamily: 'DMSans_700Bold', letterSpacing: 0.2 },
  tagline:   { fontSize: 16, fontFamily: 'DMSans_400Regular', marginTop: 6 },
  slide:     { width: SW, paddingHorizontal: 40, alignItems: 'center', justifyContent: 'center' },
  iconWrap:  { marginBottom: 28 },
  slideTitle:{ fontSize: 24, fontFamily: 'DMSans_700Bold', textAlign: 'center', marginBottom: 12, letterSpacing: 0.1 },
  slideDesc: { fontSize: 16, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 24 },
  dots:      { flexDirection: 'row', gap: 6, marginTop: 20 },
  dot:       { width: 6, height: 6, borderRadius: 3, overflow: 'hidden' },
  dotActive: { width: 18 },
  dotFill:   { height: 6, borderRadius: 3 },
  cta:       { paddingVertical: 14, paddingHorizontal: 52, borderRadius: 28 },
  ctaDisabled:{ borderWidth: 1 },
  ctaText:   { fontSize: 15, fontFamily: 'DMSans_600SemiBold', letterSpacing: 0.3 },
});
