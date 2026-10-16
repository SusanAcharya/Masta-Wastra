// The paper doll figures, drawn on a 400 x 1000 grid (lib/figure.ts boxes use the same grid).
// Faceless dress form proportions, arms a little away from the body so sleeves read.
import type { Body } from "@/lib/figure";

export const FIGURE = {
  female: {
    head: { cx: 200, cy: 68, rx: 33, ry: 43 },
    neck: "M188 104 L188 140 Q200 147 212 140 L212 104 Z",
    body:
      "M150 150 C132 152 122 160 120 176 L124 230 C128 262 140 300 156 330 C158 345 150 380 142 420 C136 470 140 520 148 560 L158 690 C160 760 166 830 172 900 L170 940 L196 940 L194 900 C194 820 196 740 198 690 L199 480 L201 480 C204 740 206 820 206 900 L204 940 L230 940 L228 900 C234 830 240 760 242 690 L252 560 C260 520 264 470 258 420 C250 380 242 345 244 330 C260 300 272 262 276 230 L280 176 C278 160 268 152 250 150 Q225 146 212 140 L188 140 Q175 146 150 150 Z",
    arms: [
      "M122 172 C108 190 104 230 102 280 L96 400 C94 430 92 455 94 470 C92 490 96 505 104 506 C112 506 114 490 112 470 L118 400 C122 330 128 280 130 240 Z",
      "M278 172 C292 190 296 230 298 280 L304 400 C306 430 308 455 306 470 C308 490 304 505 296 506 C288 506 286 490 288 470 L282 400 C278 330 272 280 270 240 Z",
    ],
  },
  male: {
    head: { cx: 200, cy: 70, rx: 34, ry: 45 },
    neck: "M186 106 L186 142 Q200 150 214 142 L214 106 Z",
    body:
      "M148 152 C126 154 114 162 112 180 L116 240 C122 280 134 320 150 350 C150 380 148 400 148 430 C144 480 146 530 152 570 L160 700 C162 770 166 840 170 905 L168 945 L196 945 L194 905 C194 830 196 750 198 700 L199 490 L201 490 C204 750 206 830 206 905 L204 945 L232 945 L230 905 C234 840 238 770 240 700 L248 570 C254 530 256 480 252 430 C252 400 250 380 250 350 C266 320 278 280 284 240 L288 180 C286 162 274 154 252 152 Q226 148 214 142 L186 142 Q174 148 148 152 Z",
    arms: [
      "M114 176 C98 196 94 240 92 290 L86 410 C84 440 82 465 84 480 C82 500 86 515 95 516 C104 516 106 500 104 480 L110 410 C114 340 120 290 124 250 Z",
      "M286 176 C302 196 306 240 308 290 L314 410 C316 440 318 465 316 480 C318 500 314 515 305 516 C296 516 294 500 296 480 L290 410 C286 340 280 290 276 250 Z",
    ],
  },
} as const satisfies Record<Body, unknown>;

// A standalone SVG string (for the share card canvas), with literal colours.
export function figureSvg(body: Body, fill: string, line: string): string {
  const f = FIGURE[body];
  const shape = (d: string) => `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="2" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 1000" width="400" height="1000">${f.arms.map(shape).join("")}${shape(f.body)}${shape(f.neck)}<ellipse cx="${f.head.cx}" cy="${f.head.cy}" rx="${f.head.rx}" ry="${f.head.ry}" fill="${fill}" stroke="${line}" stroke-width="2"/></svg>`;
}
