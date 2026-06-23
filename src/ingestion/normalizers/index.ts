export interface Normalizer<Input = unknown, Output = unknown> {
  normalize(input: Input): Output;
}

export { CharacterNormalizer, type NormalizedCharacter } from "./CharacterNormalizer.js";
export { MaterialNormalizer, type NormalizedMaterial } from "./MaterialNormalizer.js";
export { normalizeSearchText, normalizeStableKey, prefixedStableKey } from "./normalizeKey.js";
