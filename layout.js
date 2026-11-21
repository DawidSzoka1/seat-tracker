// =====================================================================
//  UKŁAD SALI – Duża Scena (odwzorowany z planu widowni)
//  Liczby miejsc w rzędach są ODCZYTANE Z OBRAZKA – sprawdźcie je
//  z prawdziwym planem i w razie potrzeby popraw "seats".
//
//  Format "seats":  "1-24"            -> miejsca 1..24
//                   "1-7,_6,8-15"     -> 1..7, potem 6 pustych pozycji
//                                         (np. konsoleta), potem 8..15
//  zone: 1 = Strefa I, 2 = Strefa II, 3 = Strefa III, 4 = Strefa IV
// =====================================================================

export const ZONES = {
  1: { name: 'Strefa I',   color: '#7d2a8c' },
  2: { name: 'Strefa II',  color: '#f2b01e' },
  3: { name: 'Strefa III', color: '#e8692b' },
  4: { name: 'Strefa IV',  color: '#178a3f' },
};

const W = 1000; // szerokość rysunku (do odbić lustrzanych)

// ---------- PARTER ----------
const parterRows = [
  [1, '1-24', 3], [2, '1-25', 3], [3, '1-25', 3],
  [4, '1-26', 2], [5, '1-26', 2], [6, '1-26', 2], [7, '1-26', 2], [8, '1-26', 2], [9, '1-27', 2],
  [10, '1-27', 1], [11, '1-27', 1], [12, '1-26', 1], [13, '1-24', 1],
  [14, '1-7,_6,8-15', 3], [15, '1-4,_6,5-9', 3],
  [16, '1-16', 3], [17, '1-17', 3], [18, '1-17', 3], [19, '1-18', 3],
];
const parterY = (r) => (r <= 13 ? 405 + (r - 1) * 24 : 728 + (r - 14) * 24);

// ---------- SEKCJE ----------
const left = [
  {
    id: 'BL', name: 'Balkon I lewy', type: 'block', x: 168, y: 352, rot: 105, pitch: 26,
    rows: [
      { row: null, seats: '1-9', zone: 4, y: 0 },
      { row: null, seats: '10-17', zone: 4, x: 16, y: -24, pitch: 22 },
    ],
  },
  {
    id: 'L1', name: 'Parter lewy – Loża I', type: 'block', x: 258, y: 440, rot: 90, pitch: 29,
    rows: [{ row: null, seats: '1-6', zone: 3, y: 0 }],
  },
  {
    id: 'L3', name: 'Parter lewy – Loża III', type: 'block', x: 214, y: 516, rot: 90, pitch: 22,
    rows: [{ row: null, seats: '1-4', zone: 4, y: 0 }],
  },
  {
    id: 'L5', name: 'Parter lewy – Loża V', type: 'block', x: 214, y: 672, rot: 62, pitch: 15,
    rows: [
      { row: null, seats: '1-7', zone: 2, y: 0 },
      { row: null, seats: '8-14', zone: 2, y: -18, x: -4 },
    ],
  },
  {
    id: 'L8', name: 'Balkon I – Loża VIII', type: 'block', x: 150, y: 768, rot: 58, pitch: 15,
    rows: [
      { row: null, seats: '1-6', zone: 3, y: 0 },
      { row: null, seats: '7-12', zone: 3, y: -18, x: -4 },
    ],
  },
  {
    id: 'PL', name: 'Parter – lewe skrzydło', type: 'block', x: 300, y: 784, rot: 38, pitch: 14,
    rows: [
      { row: 19, seats: '1-6', zone: 3, y: 0, x: 4 },
      { row: 20, seats: '1-7', zone: 3, y: 21 },
    ],
  },
  {
    id: 'B1L', name: 'Balkon I – lewy bok', type: 'block', x: 318, y: 972, rot: 62, pitch: 17,
    rows: [{ row: null, seats: '1-2', zone: 3, y: 0 }],
  },
];

function mirror(sec, id, name) {
  return {
    ...sec, id, name,
    x: W - sec.x, rot: 180 - sec.rot,
    rows: sec.rows.map((r) => ({ ...r, y: -(r.y || 0) })),
  };
}

const right = [
  mirror(left[0], 'BP', 'Balkon I prawy'),
  mirror(left[1], 'L2', 'Parter prawy – Loża II'),
  mirror(left[2], 'L4', 'Parter prawy – Loża IV'),
  mirror(left[3], 'L6', 'Parter prawy – Loża VI'),
  mirror(left[4], 'L7', 'Balkon I – Loża VII'),
  mirror(left[5], 'PP', 'Parter – prawe skrzydło'),
  mirror(left[6], 'B1P', 'Balkon I – prawy bok'),
];

export const SECTIONS = [
  {
    id: 'P', name: 'Parter', type: 'arc', cx: 500, pitch: 14, k: 0.0006, rowLabels: true,
    rows: parterRows.map(([row, seats, zone]) => ({
      row, seats, zone, y: parterY(row), k: row >= 14 ? 0.00035 : undefined,
    })),
  },
  ...left,
  ...right,
  {
    id: 'B1', name: 'Balkon I środkowy', type: 'arc', cx: 500, pitch: 13.5, k: 0.0004, rowLabels: true,
    rows: [
      { row: 1, seats: '1-23', zone: 2, y: 925 },
      { row: 2, seats: '1-24', zone: 1, y: 948 },
      { row: 3, seats: '1-23', zone: 1, y: 971 },
      { row: 4, seats: '1-22', zone: 2, y: 994 },
      { row: 5, seats: '1-4,_10,5-7', zone: 3, y: 1017 },
    ],
  },
  {
    id: 'B2', name: 'Balkon II', type: 'arc', cx: 500, pitch: 13.5, k: 0.0002, rowLabels: true,
    rows: [
      { row: 1, seats: '1-19', zone: 4, y: 1080 },
      { row: 2, seats: '1-18', zone: 4, y: 1102 },
    ],
  },
];

// Napisy na planie: [tekst, x, y, rozmiar]
export const LABELS = [
  ['PARTER', 500, 387, 13],
  ['BALKON I\nLEWY', 196, 326, 9], ['BALKON I\nPRAWY', 804, 326, 9],
  ['PARTER\nLEWY\nLOŻA I', 262, 398, 8], ['PARTER\nPRAWY\nLOŻA II', 738, 398, 8],
  ['PARTER\nLEWY\nLOŻA III', 214, 474, 8], ['PARTER\nPRAWY\nLOŻA IV', 786, 474, 8],
  ['PARTER LEWY\nLOŻA V', 228, 640, 8], ['PARTER PRAWY\nLOŻA VI', 772, 640, 8],
  ['BALKON I\nLOŻA VIII', 152, 735, 8], ['BALKON I\nLOŻA VII', 848, 735, 8],
  ['BALKON I ŚRODKOWY', 500, 903, 12],
  ['BALKON II', 500, 1060, 12],
];

export const VIEWBOX = { w: W, h: 1130 };
export const STAGE = { x: 330, y: 150, w: 340, h: 80 };
export const CONSOLE = { x: 452, y: 718, w: 82, h: 44 };
