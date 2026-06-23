export interface RawGameObjectForNormalization {
  id: number;
  externalKey: string;
  payload: unknown;
  sourceVersion?: string | null;
}

export interface NormalizedAlias {
  alias: string;
  normalized: string;
}
