#!/bin/bash
# circuits/scripts/setup.sh
# Usage: ./setup.sh
# Prereq: circom, snarkjs installed

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 1. Compile circuit ==="
mkdir -p build
circom eligibility.circom --r1cs --wasm --sym -o build

echo "=== 2. Powers of Tau (Phase 1) ==="
# circuit이 작으므로 2^12로 충분
snarkjs powersoftau new bn128 12 build/pot12_0000.ptau -v
snarkjs powersoftau contribute build/pot12_0000.ptau build/pot12_0001.ptau \
  --name="First contribution" -v -e="random entropy for setup"
snarkjs powersoftau prepare phase2 build/pot12_0001.ptau build/pot12_final.ptau -v

echo "=== 3. Phase 2 (circuit-specific) ==="
snarkjs groth16 setup build/eligibility.r1cs build/pot12_final.ptau build/eligibility_0000.zkey
snarkjs zkey contribute build/eligibility_0000.zkey build/eligibility_final.zkey \
  --name="First phase2 contribution" -v -e="more random entropy"
snarkjs zkey export verificationkey build/eligibility_final.zkey build/verification_key.json

echo "=== 4. Export Solidity verifier (참고용) ==="
snarkjs zkey export solidityverifier build/eligibility_final.zkey build/Verifier.sol

echo "=== Done ==="
echo "verification_key.json: build/verification_key.json"
echo "zkey: build/eligibility_final.zkey"
echo "wasm: build/eligibility_js/eligibility.wasm"
