// One touch layer for the whole video: tap, double-tap, long-press (2x), swipe sideways (seek),
// swipe up/down on the left (brightness) or right (volume) half.
import React, { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";

export type Zone = "L" | "C" | "R";
export interface GestureHandlers {
  onTap(): void;
  onDoubleTap(zone: Zone): void;
  onSeekDrag(deltaSec: number, phase: "move" | "end"): void;
  onSideDrag(side: "L" | "R", inc: number, phase: "move" | "end"): void;
  onLongPress(active: boolean): void;
}
const SEEK_FULL_WIDTH_SEC = 180; // a swipe across the full width = 3 minutes
const LOCK_PX = 16, LONG_MS = 450, DOUBLE_MS = 300;

export function GestureLayer({ handlers, locked }: { handlers: GestureHandlers; locked?: boolean }) {
  const h = useRef(handlers); h.current = handlers;
  const isLocked = useRef(!!locked); isLocked.current = !!locked;
  const size = useRef({ w: 1, h: 1 });
  const g = useRef({ mode: "none" as "none" | "h" | "v", side: "L" as "L" | "R", lastDy: 0, long: false, x0: 0, lt: null as ReturnType<typeof setTimeout> | null, tapT: null as ReturnType<typeof setTimeout> | null, lastT: 0, lastZone: "C" as Zone });

  const clearLong = () => { if (g.current.lt) { clearTimeout(g.current.lt); g.current.lt = null; } };
  const finish = (dx: number, cancelled: boolean) => {
    const s = g.current; clearLong();
    if (s.long) { s.long = false; h.current.onLongPress(false); return; }
    if (s.mode === "h") { h.current.onSeekDrag(cancelled ? 0 : Math.round((dx / size.current.w) * SEEK_FULL_WIDTH_SEC), "end"); return; }
    if (s.mode === "v") { h.current.onSideDrag(s.side, 0, "end"); return; }
    if (cancelled) return;
    if (isLocked.current) { h.current.onTap(); return; }
    const zone: Zone = s.x0 < size.current.w * 0.33 ? "L" : s.x0 > size.current.w * 0.67 ? "R" : "C";
    const now = Date.now();
    if (now - s.lastT < DOUBLE_MS && s.lastZone === zone) {
      if (s.tapT) { clearTimeout(s.tapT); s.tapT = null; }
      s.lastT = now; h.current.onDoubleTap(zone); return; // more quick taps keep seeking
    }
    s.lastT = now; s.lastZone = zone;
    if (s.tapT) clearTimeout(s.tapT);
    s.tapT = setTimeout(() => { s.tapT = null; h.current.onTap(); }, DOUBLE_MS);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const s = g.current; s.mode = "none"; s.long = false; s.lastDy = 0; s.x0 = e.nativeEvent.locationX;
      clearLong();
      if (!isLocked.current) s.lt = setTimeout(() => { if (s.mode === "none") { s.long = true; h.current.onLongPress(true); } }, LONG_MS);
    },
    onPanResponderMove: (_e, gs) => {
      const s = g.current;
      if (isLocked.current || s.long) return;
      if (s.mode === "none") {
        if (Math.abs(gs.dx) < LOCK_PX && Math.abs(gs.dy) < LOCK_PX) return;
        clearLong();
        if (Math.abs(gs.dx) > Math.abs(gs.dy)) s.mode = "h";
        else { s.mode = "v"; s.side = s.x0 < size.current.w / 2 ? "L" : "R"; s.lastDy = gs.dy; }
      }
      if (s.mode === "h") h.current.onSeekDrag(Math.round((gs.dx / size.current.w) * SEEK_FULL_WIDTH_SEC), "move");
      else { const inc = -(gs.dy - s.lastDy) / (size.current.h * 0.7); s.lastDy = gs.dy; h.current.onSideDrag(s.side, inc, "move"); }
    },
    onPanResponderRelease: (_e, gs) => finish(gs.dx, false),
    onPanResponderTerminate: (_e, gs) => finish(gs.dx, true),
  }), []);

  return <View style={StyleSheet.absoluteFill} onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 }; }} {...pan.panHandlers} />;
}
