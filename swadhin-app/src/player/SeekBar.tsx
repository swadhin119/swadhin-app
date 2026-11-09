import React, { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";
import { fmtTime } from "../lib/subtitles";

export function SeekBar({ time, dur, buffered, scrub, onScrub, onCommit }: {
  time: number; dur: number; buffered: number; scrub: number | null;
  onScrub(f: number | null): void; onCommit(f: number): void;
}) {
  const w = useRef(1);
  const cb = useRef({ onScrub, onCommit }); cb.current = { onScrub, onCommit };
  const fr = (x: number) => Math.max(0, Math.min(1, x / w.current));
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => cb.current.onScrub(fr(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => cb.current.onScrub(fr(e.nativeEvent.locationX)),
    onPanResponderRelease: (e) => { const f = fr(e.nativeEvent.locationX); cb.current.onScrub(null); cb.current.onCommit(f); },
    onPanResponderTerminate: () => cb.current.onScrub(null),
  }), []);
  const f = scrub ?? (dur > 0 ? Math.min(1, time / dur) : 0);
  const b = dur > 0 ? Math.max(f, Math.min(1, buffered / dur)) : 0;
  return (
    <View style={st.wrap} onLayout={(e) => { w.current = e.nativeEvent.layout.width || 1; }} {...pan.panHandlers}>
      <View style={st.bg} pointerEvents="none">
        <View style={[st.buf, { width: `${b * 100}%` }]} />
        <View style={[st.fill, { width: `${f * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[st.knob, scrub != null && st.knobBig, { left: `${f * 100}%` }]} />
      {scrub != null ? <View pointerEvents="none" style={[st.bubble, { left: `${f * 100}%` }]}><Text style={st.bubbleTxt}>{fmtTime(scrub * dur)}</Text></View> : null}
    </View>
  );
}
const st = StyleSheet.create({
  wrap: { flex: 1, height: 40, justifyContent: "center" },
  bg: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,.25)", overflow: "hidden" },
  buf: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,.35)" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: C.accent },
  knob: { position: "absolute", width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 13, backgroundColor: "#fff" },
  knobBig: { width: 20, height: 20, borderRadius: 10, marginLeft: -10, top: 10, backgroundColor: C.accent },
  bubble: { position: "absolute", top: -22, marginLeft: -28, width: 56, alignItems: "center", backgroundColor: "rgba(0,0,0,.8)", borderRadius: 8, paddingVertical: 2 },
  bubbleTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
