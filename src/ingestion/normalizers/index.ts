export interface Normalizer<Input = unknown, Output = unknown> {
  normalize(input: Input): Output;
}

export { CharacterNormalizer, type NormalizedCharacter } from "./CharacterNormalizer.js";
export { MaterialNormalizer, type NormalizedMaterial } from "./MaterialNormalizer.js";
export {
  CharacterCostNormalizer,
  type CharacterCostExtractionResult,
  type ExtractedAscensionCost,
  type ExtractedTalentCost,
} from "./CharacterCostNormalizer.js";
export { DomainNormalizer, type NormalizedDomain, type NormalizedDomainReward } from "./DomainNormalizer.js";
export { EnemyNormalizer, type NormalizedEnemy, type NormalizedEnemyDrop } from "./EnemyNormalizer.js";
export {
  FarmCalendarNormalizer,
  FARM_DAYS,
  normalizeFarmDay,
  type FarmDay,
} from "./FarmCalendarNormalizer.js";
export {
  MaterialSourceNormalizer,
  type NormalizedMaterialSource,
  type NormalizedMaterialSourceExtraction,
} from "./MaterialSourceNormalizer.js";
export { normalizeSearchText, normalizeStableKey, prefixedStableKey } from "./normalizeKey.js";
