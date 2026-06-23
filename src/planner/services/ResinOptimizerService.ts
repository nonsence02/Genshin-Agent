export interface ResinOptimizerInput {
  playerStableKey: string;
  goalIds: number[];
}

export interface ResinOptimizerResult {
  tasks: Array<{
    sourceKey: string;
    resinEstimate: number;
    reason: string;
  }>;
}

export class ResinOptimizerService {
  async optimize(input: ResinOptimizerInput): Promise<ResinOptimizerResult> {
    void input;
    throw new Error("Resin optimization is not implemented yet.");
  }
}
