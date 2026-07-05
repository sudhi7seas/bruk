/**
 * Brük — Diet Detection Module
 * Keyword-based veg/non-veg/vegan detection from ingredient lists.
 * Keywords loaded from data/diet-keywords.json.
 */

import { CONFIG } from './config.js';

let keywords = null;

// ── LOAD KEYWORDS ─────────────────────────────────────────────────
async function loadKeywords() {
  if (keywords) return keywords;

  try {
    const res = await fetch(CONFIG.DIET_DATA_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    keywords = await res.json();
    return keywords;
  } catch (err) {
    console.warn('Brük: Could not load diet keywords, using built-in list.', err);
    keywords = FALLBACK_KEYWORDS;
    return keywords;
  }
}

// ── DETECT ────────────────────────────────────────────────────────
/**
 * Analyses text (ingredient list or translation) for dietary content.
 * @param {string} text
 * @returns {{ status: 'vegan'|'vegetarian'|'non-veg'|'unknown'|'none', triggers: string[] }}
 */
export async function detectDiet(text) {
  if (!text || text.trim().length < 3) return { status: 'none', triggers: [] };

  // Only run detection if text looks like an ingredient list
  if (!looksLikeIngredients(text)) return { status: 'none', triggers: [] };

  const kw = await loadKeywords();
  const lowerText = text.toLowerCase();

  const foundNonVeg = findKeywords(lowerText, [...kw.nonVeg.de, ...kw.nonVeg.en]);
  if (foundNonVeg.length > 0) {
    return { status: 'non-veg', triggers: foundNonVeg };
  }

  const foundNonVegan = findKeywords(lowerText, [...kw.nonVegan.de, ...kw.nonVegan.en]);
  if (foundNonVegan.length > 0) {
    return { status: 'vegetarian', triggers: foundNonVegan };
  }

  // If we found ingredient-like content but no animal products
  return { status: 'vegan', triggers: [] };
}

/**
 * v1.9.1 FIX — found and confirmed by actual execution testing, not just
 * reading the code: this heuristic previously treated a bare comma "," or
 * parenthesis "(" as a sufficient signal on its own that a piece of text
 * "looks like an ingredient list". Ordinary sentences contain commas
 * constantly (any compound sentence, greeting, or list of any kind), so
 * this caused false positives — e.g. "Hallo, wie geht es dir?" (a plain
 * greeting) was incorrectly tagged with a green "Vegan" badge, purely
 * because it contains a comma.
 *
 * Fix: require either (a) an explicit, unambiguous ingredient-list
 * keyword ("Zutaten", "ingredients", etc. — these essentially never
 * appear in ordinary conversation), or (b) list-like punctuation
 * (comma/parenthesis) AND at least THREE distinct specific food terms
 * present. Requiring three, not one, makes it extremely unlikely for an
 * ordinary sentence to misfire (e.g. "I like sugar and salt in my
 * coffee, but not too much" only hits two food terms and correctly does
 * NOT trigger), while still catching genuine bare ingredient lists that
 * lack an explicit "Zutaten:"/"Ingredients:" header.
 */
function looksLikeIngredients(text) {
  const lower = text.toLowerCase();

  // Strong, unambiguous signal — these phrases essentially never appear
  // outside of actual ingredient/nutrition labels.
  const strongKeywords = ['zutaten', 'inhaltsstoffe', 'ingredients', 'contains', 'enthält'];
  if (strongKeywords.some(k => lower.includes(k))) return true;

  // Weaker signal: only counts if BOTH list-like punctuation AND multiple
  // distinct specific food terms are present — neither alone is enough.
  const hasListPunctuation = lower.includes(',') || lower.includes('(');
  if (!hasListPunctuation) return false;

  const foodWords = ['zucker', 'salz', 'wasser', 'sugar', 'salt', 'water', 'mehl', 'flour'];
  const foodWordCount = foodWords.filter(w => lower.includes(w)).length;

  return foodWordCount >= 3;
}

function findKeywords(lowerText, list) {
  return list
    .map(k => k.toLowerCase())
    .filter(k => {
      // Word boundary match
      const regex = new RegExp(`(?:^|[\\s,;(\\[])${escapeRegex(k)}(?:[\\s,;)\\]%]|$)`, 'i');
      return regex.test(lowerText);
    });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── FALLBACK KEYWORD LIST ─────────────────────────────────────────
const FALLBACK_KEYWORDS = {
  nonVeg: {
    de: ['fleisch', 'rindfleisch', 'schweinefleisch', 'hühnerfleisch', 'hackfleisch',
      'speck', 'schinken', 'wurst', 'salami', 'fisch', 'lachs', 'thunfisch',
      'garnelen', 'gelatine', 'schmalz', 'hühnerbrühe', 'fleischbrühe', 'anchovis',
      'makrele', 'sardine', 'hering', 'forelle', 'krabben', 'muscheln', 'tintenfisch'],
    en: ['meat', 'beef', 'pork', 'chicken', 'ham', 'bacon', 'sausage', 'salami',
      'fish', 'salmon', 'tuna', 'shrimp', 'gelatin', 'gelatine', 'lard',
      'chicken broth', 'meat broth', 'anchovies', 'mackerel', 'sardine',
      'herring', 'trout', 'crab', 'mussels', 'squid', 'prawn', 'turkey'],
  },
  nonVegan: {
    de: ['milch', 'vollmilch', 'magermilch', 'butter', 'sahne', 'käse', 'ei',
      'eier', 'eigelb', 'eiweiß', 'honig', 'molke', 'laktose', 'joghurt',
      'quark', 'rahm', 'schlagsahne', 'butterschmalz', 'kasein', 'albumin',
      'ghee', 'creme fraiche'],
    en: ['milk', 'whole milk', 'skimmed milk', 'butter', 'cream', 'cheese', 'egg',
      'eggs', 'egg yolk', 'egg white', 'honey', 'whey', 'lactose', 'yogurt',
      'yoghurt', 'quark', 'casein', 'albumin', 'ghee', 'creme fraiche',
      'double cream', 'soured cream', 'fromage'],
  },
};
