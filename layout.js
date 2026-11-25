// =====================================================================
//  UKŁAD SALI – Duża Scena
//  Pozycje i numeracja miejsc są w seats.js (wygenerowane 1:1 z planu
//  widowni przez tools/build_layout.py). Tutaj: strefy, nazwy sekcji,
//  napisy na planie.
// =====================================================================

export { SEAT_DATA } from './seats.js';

export const ZONES = {
  1: { name: 'Strefa I',   color: '#7d2a8c' },
  2: { name: 'Strefa II',  color: '#f2b01e' },
  3: { name: 'Strefa III', color: '#e8692b' },
  4: { name: 'Strefa IV',  color: '#178a3f' },
};

export const SECTIONS = [
  { id: 'P',  name: 'Parter' },
  { id: 'BL', name: 'Balkon I lewy' },
  { id: 'BP', name: 'Balkon I prawy' },
  { id: 'L1', name: 'Parter lewy – Loża I' },
  { id: 'L2', name: 'Parter prawy – Loża II' },
  { id: 'L3', name: 'Parter lewy – Loża III' },
  { id: 'L4', name: 'Parter prawy – Loża IV' },
  { id: 'L5', name: 'Parter lewy – Loża V' },
  { id: 'L6', name: 'Parter prawy – Loża VI' },
  { id: 'L7', name: 'Balkon I – Loża VII' },
  { id: 'L8', name: 'Balkon I – Loża VIII' },
  { id: 'B1', name: 'Balkon I środkowy' },
  { id: 'B2', name: 'Balkon II' },
];

// Sekcje z numerami rzędów przy końcach rzędów
export const ROW_SECTIONS = ['P', 'B1', 'B2'];

// Napisy na planie: [tekst, x, y, rozmiar]
export const LABELS = [
  ['PARTER', 495, 410, 12],
  ['BALKON I\nLEWY', 203, 334, 8], ['BALKON I\nPRAWY', 790, 334, 8],
  ['PARTER\nLEWY\nLOŻA I', 263, 404, 7], ['PARTER\nPRAWY\nLOŻA II', 731, 404, 7],
  ['PARTER\nLEWY\nLOŻA III', 215, 477, 7], ['PARTER\nPRAWY\nLOŻA IV', 775, 477, 7],
  ['PARTER LEWY\nLOŻA V', 227, 646, 7], ['PARTER PRAWY\nLOŻA VI', 760, 646, 7],
  ['BALKON I\nLOŻA VIII', 147, 741, 7], ['BALKON I\nLOŻA VII', 833, 743, 7],
  ['BALKON I ŚRODKOWY', 495, 922, 11],
  ['BALKON II', 495, 1066, 11],
];

export const VIEWBOX = { x: 60, y: 140, w: 875, h: 1000 };
export const STAGE = { x: 327, y: 159, w: 335, h: 91 };
export const CONSOLE = { x: 446, y: 742, w: 102, h: 38 };
