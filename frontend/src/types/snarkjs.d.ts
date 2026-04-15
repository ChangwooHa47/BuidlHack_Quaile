declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<{ proof: object; publicSignals: string[] }>;
    verify(
      vkey: object,
      publicSignals: string[],
      proof: object,
    ): Promise<boolean>;
  };
}
