// Fragment shader for the open reveal (five effects, uFx 0..4). Shared by the site and fx-lab.html.
window.REVEAL_VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
window.REVEAL_FS = `precision mediump float;
varying vec2 v;
uniform sampler2D uReal, uSketch, uDist;
uniform float uT, uSeed, uAhead, uAspect;
uniform int uFx;
uniform vec2 uTexel;                                     // 1 / real image size, for the line-trace edge filter
uniform vec3 uInk;
uniform vec4 uFocus;                                     // the flying piece's box (uv, y up): its lines stay out until it lands
uniform float uLand;
uniform float uWide, uReach;                             // wide: the canvas is a whole header band, the drawing its middle stage
uniform vec4 uStage;                                     //   the stage's box in the band (uv)
uniform vec4 uImg;                                       //   band uv -> the band picture's uv: xy scale, zw offset
uniform vec2 uKeep;                                      //   the band's whole columns (uv x); past them, its edge colour
uniform float uBare;                                     // a bare header (no frame, on the page's white)
uniform vec3 uDarkBg; uniform float uDark;              // a dark header: its own background, for the ink wash's dark end
uniform vec4 uRef;                                       // where the drawing's frame sits in the stage (uv, y up): offset xy, scale zw
                                                         //   (heroes.js land: a stage recomposed since the drawing was traced)
vec2 R(vec2 q){ if (uWide < 0.5) return q; vec2 t = q * uImg.xy + uImg.zw;
  if (uKeep.y > uKeep.x && (q.x < uKeep.x || q.x > uKeep.y)) t.x = q.x < uKeep.x ? 0.0 : 1.0; return t; }
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  // sv: the stage's own uv; od: how far outside both the stage and the drawing's frame, in stage heights (a drawing that
  // lands bigger than its stage, peeps at 5/3, keeps its outer lines and reveals them on time, not cropped to the stage)
  vec2 sv = v; float od = 0.0;
  if (uWide > 0.5) { sv = (v - uStage.xy) / (uStage.zw - uStage.xy);
    vec2 lo = min(vec2(0.0), uRef.xy), hi = max(vec2(1.0), uRef.xy + uRef.zw);
    vec2 o = max(max(lo - sv, sv - hi), 0.0); od = length(vec2(o.x * 1.3333, o.y)); }
  vec2 dv = (sv - uRef.xy) / uRef.zw;                    // the drawing's own uv
  vec2 oo = max(max(-dv, dv - 1.0), 0.0) * uRef.zw; float odd = length(vec2(oo.x * 1.3333, oo.y));   // outside the drawing's frame
  float d = (texture2D(uDist, clamp(dv, 0.0, 1.0)).r + (od + odd) * 0.9) / max(uReach, 1.0);   // 0 on the drawing's element, 1 far from it
  float dd = d + (n(v * 7.0 + uSeed * 1.7) - 0.5) * 0.12 + (n(v * 29.0 - uSeed) - 0.5) * 0.05;   // wobbly, hand-made
  float span = 1.25;
  if (uFx == 1 || uFx == 2) span = 1.6; else if (uFx == 3) span = 1.3; else if (uFx == 4 || uFx == 5) span = 1.8;
  else if (uFx == 6) span = 1.15; else if (uFx == 7) span = 1.4;
  if (uFx >= 5) dd = d + (n(v * 5.0) - 0.5) * 0.04;      // the calm ones: a gentle, still wobble that does not boil
  float front = uT * span - 0.06;
  vec4 real = texture2D(uReal, R(v));
  float ink = odd > 0.0 ? 0.0 : texture2D(uSketch, dv).a;
  if (uLand < 0.5 && dv.x > uFocus.x && dv.x < uFocus.z && dv.y > uFocus.y && dv.y < uFocus.w) ink = 0.0;   // no second copy of the piece in flight
  vec3 col = real.rgb; float fill = 0.0; float rim = 0.0;
  vec2 p = vec2(v.x * uAspect, v.y);

  if (uFx == 0) {                                        // INK BLEED: a wobbly front with a blue rim
    fill = 1.0 - smoothstep(front - 0.05, front, dd);
    rim = smoothstep(front - 0.03, front - 0.008, dd) * (1.0 - smoothstep(front - 0.008, front + 0.01, dd)) * 0.85;
  } else if (uFx == 1) {                                 // HATCH: marker strokes thicken until the paper is covered
    float w = clamp((front - dd) * 5.0, 0.0, 2.0);
    float s1 = abs(fract((p.x + p.y) * 34.0 + n(p * 9.0) * 0.9) - 0.5) * 2.0;
    float s2 = abs(fract((p.x - p.y) * 34.0 + n(p * 9.0 + 4.0) * 0.9) - 0.5) * 2.0;
    float c1 = clamp(w, 0.0, 1.0), c2 = clamp(w - 0.8, 0.0, 1.0);
    float m1 = (1.0 - smoothstep(c1 - 0.1, c1, s1)) * step(0.001, w);
    float m2 = (1.0 - smoothstep(c2 - 0.1, c2, s2)) * step(0.801, w);
    fill = max(max(m1, m2), step(1.7, w));
  } else if (uFx == 2) {                                 // HALFTONE: dots bloom until they merge into the picture
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.7071 * 58.0;
    vec2 cell = floor(q), f = fract(q) - 0.5;
    float rad = clamp((front - dd) * 3.2, 0.0, 1.0) * 0.8;
    fill = 1.0 - smoothstep(rad - 0.05, rad, length(f));
    vec2 cc = (cell + 0.5) / 58.0, pc = vec2(cc.x - cc.y, cc.x + cc.y) * 0.7071;
    vec3 dot = texture2D(uReal, R(vec2(pc.x / uAspect, pc.y))).rgb;
    col = mix(dot, real.rgb, step(0.97, (front - dd) * 3.2));
    fill *= step(-0.001, rad - 0.001);
  } else if (uFx == 3) {                                 // CONTOURS: the picture arrives ring by ring, each ring inked
    float N = 8.0;
    float edge = (floor(front * N) + 1.0) / N;
    fill = step(dd, edge - 0.0001) * step(0.0, front);
    float b = min(fract(dd * N), 1.0 - fract(dd * N));
    rim = (1.0 - smoothstep(0.0, 0.05, b)) * step(dd, edge + 0.001) * step(edge - 0.32, dd) * 0.8;
  } else if (uFx == 4) {                                // INK WASH: a blue monochrome floods in, then colour follows
    float f1 = 1.0 - smoothstep(front - 0.06, front, dd);
    float f2 = 1.0 - smoothstep(front - 0.46, front - 0.32, dd);
    float lum = dot(real.rgb, vec3(0.299, 0.587, 0.114));
    // white paper keeps a pale blue (not pure white), so on a light header (bingo's cream phones on white) the wash is
    // seen spreading out of the lines rather than the picture just fading up
    vec3 duo = mix(uInk, vec3(1.0), pow(lum, 0.8) * 0.86);
    // ... but a header on the page's own white has no frame: there the pale blue paper showed the whole box as a blue
    // rectangle that then vanished (fishreports, folio, Flip 7: Hans, 6 Nov), so its white stays white and the wash is only
    // on what sits on it (only near-pure white counts as paper: bingo's cream phones still take the wash)
    if (uBare > 0.5) duo = mix(duo, vec3(1.0), smoothstep(0.985, 0.998, lum));
    if (uDark > 0.5) duo = mix(uDarkBg, uInk, pow(lum, 0.7));   // on a dark app: its own dark, the ink only in the light parts (no blue flood)
    col = mix(duo, real.rgb, f2); fill = f1;
    // on a dark app the first fill (its own dark) hugs the drawing's lines, so they read as thick navy marker smears
    // (krakentix, review 2): there the real picture itself fades in over a long, soft ramp behind the front (no band of
    // flat dark around the lines), the blue lines alone ahead of it
    if (uDark > 0.5) { col = real.rgb; fill = f1 * (1.0 - smoothstep(front - 0.62, front - 0.12, dd)); }
  } else if (uFx == 5) {                                // LINE TRACE: the header first draws itself as ink lines, then colours in
    vec2 o = uTexel * 1.5;
    float l00 = dot(texture2D(uReal, R(v + vec2(-o.x, -o.y))).rgb, vec3(0.333)), l10 = dot(texture2D(uReal, R(v + vec2(0.0, -o.y))).rgb, vec3(0.333));
    float l20 = dot(texture2D(uReal, R(v + vec2(o.x, -o.y))).rgb, vec3(0.333)), l01 = dot(texture2D(uReal, R(v + vec2(-o.x, 0.0))).rgb, vec3(0.333));
    float l21 = dot(texture2D(uReal, R(v + vec2(o.x, 0.0))).rgb, vec3(0.333)), l02 = dot(texture2D(uReal, R(v + vec2(-o.x, o.y))).rgb, vec3(0.333));
    float l12 = dot(texture2D(uReal, R(v + vec2(0.0, o.y))).rgb, vec3(0.333)), l22 = dot(texture2D(uReal, R(v + vec2(o.x, o.y))).rgb, vec3(0.333));
    float gx = (l20 + 2.0 * l21 + l22) - (l00 + 2.0 * l01 + l02), gy = (l02 + 2.0 * l12 + l22) - (l00 + 2.0 * l10 + l20);
    float edge = smoothstep(0.10, 0.32, length(vec2(gx, gy)));
    float traced = 1.0 - smoothstep(front - 0.03, front, dd);
    float coloured = 1.0 - smoothstep(front - 0.42, front - 0.30, dd);
    fill = coloured;
    rim = edge * traced * (1.0 - coloured);              // the lines ride in ahead of the colour
  } else if (uFx == 6) {                                // CLEAN FILL: one crisp, slightly wobbly edge; nothing else
    fill = 1.0 - smoothstep(front - 0.012, front, dd);
  } else {                                               // COLOUR IN: horizontal marker strokes fill the shape, like colouring with a pen
    float k = clamp((front - dd) / 0.16, 0.0, 1.0);
    float s = abs(fract(p.y * 24.0 + sin(p.x * 2.3) * 0.35) - 0.5) * 2.0;
    fill = (1.0 - smoothstep(k - 0.08, k, s)) * step(0.001, k);
    fill = max(fill, step(0.999, k));
  }
  fill = max(fill, step(0.999, uT));
  float ahead = 1.0 - smoothstep(front + uAhead - 0.04, front + uAhead, dd);                    // drawing's lines appear just ahead
  // and dissolve once filled; on a dark app the picture comes up over a long ramp behind the front (above), so its lines
  // stay until it is there (the water taxi's band went blank white between its lines and its dark picture)
  float gone = uDark > 0.5 ? smoothstep(0.12, 0.62, front - dd) : smoothstep(0.0, 0.18, front - dd);
  float lines = ink * ahead * (1.0 - gone);
  float inkA = max(lines, rim) * (1.0 - step(0.999, uT));
  vec3 outc = mix(vec3(1.0), col, fill);
  outc = mix(outc, uInk, inkA);
  gl_FragColor = vec4(outc, max(fill, inkA));
}`;
