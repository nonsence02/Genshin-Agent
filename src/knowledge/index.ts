export interface KnowledgeRepository {
  findCharacterByStableKey(stableKey: string): Promise<unknown>;
  findMaterialByStableKey(stableKey: string): Promise<unknown>;
}
