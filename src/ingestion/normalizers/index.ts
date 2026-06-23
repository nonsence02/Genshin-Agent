export interface Normalizer<Input = unknown, Output = unknown> {
  normalize(input: Input): Output;
}
