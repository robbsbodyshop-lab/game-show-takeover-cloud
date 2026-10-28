/** Colour tones for the three capsule/germ colours (engine colours 1, 2, 3), from the design palette. */
import type { Tones } from './pixelGrid.ts';

export type ColorId = 1 | 2 | 3;

export const EMBER: Tones = { base: '#E23B4A', light: '#FF7C7C', dark: '#8E1B3A' };
export const SUN: Tones = { base: '#FFD23F', light: '#FFF07A', dark: '#C9861A' };
export const TIDE: Tones = { base: '#5FE0FF', light: '#D4F7FF', dark: '#2F6FE8' };

export const COLOR_IDS: readonly ColorId[] = [1, 2, 3];

export const TONES: Readonly<Record<ColorId, Tones>> = { 1: EMBER, 2: SUN, 3: TIDE };

export const NIGHT = '#12093A';
export const LAGOON = '#2B1F72';
export const DEEP = '#4B39B8';
export const SHADE = '#1A0F52';
export const MIST = '#B7BDFF';
