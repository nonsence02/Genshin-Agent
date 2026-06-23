export interface CharacterRequirementInput {
  characterStableKey: string;
  targetLevel?: number;
  targetTalents?: {
    normal?: number;
    skill?: number;
    burst?: number;
  };
}

export interface CharacterRequirementResult {
  requirements: Array<{
    materialStableKey: string;
    quantity: number;
  }>;
}

export class CharacterRequirementService {
  async calculate(input: CharacterRequirementInput): Promise<CharacterRequirementResult> {
    void input;
    throw new Error("Character requirement calculation is not implemented yet.");
  }
}
