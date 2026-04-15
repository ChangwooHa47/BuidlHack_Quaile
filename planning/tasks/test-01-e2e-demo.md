---
id: test-01-e2e-demo
status: done
sub: INFRA
layer: test
depends_on: [infra-02-testnet-deploy, fe-04-contribute-flow]
estimate: 2h
demo_step: "End-to-end (ONE_PAGER §6 전체)"
---

# End-to-End 데모 시나리오 (v2 — ZK 반영)

## Context
MVP 완료 기준(PRD §6.1). ZK proof 생성 단계가 추가된 전체 플로우 시연.

v1 대비 변경:
- TEE 응답에서 `zk_input` 추출 → snarkjs proof 생성 단계 추가
- `contribute()` 호출 시 `zk_proof_json`, `zk_public_inputs_json` 인자 추가
- TEE 응답 모델: `AttestationResponseModel` (`bundle` + `tee_report` + `zk_input`)

## Files
- `scripts/e2e/run_demo.sh` (create)
- `scripts/e2e/05_submit_persona.py` (create — TEE 호출 + ZK proof 생성)
- `scripts/e2e/06_contribute.sh` (create — bundle + ZK proof로 contribute)
- 기타 기존 스크립트들

## Spec

### ZK proof 생성 단계 (05_submit_persona.py 내)
```python
# 1. TEE /v1/attest 호출 → AttestationResponseModel
response = httpx.post(TEE_URL + "/v1/attest", json=persona.model_dump())
data = response.json()

# 2. zk_input 추출
zk_input = data["zk_input"]
# { "payload_hash_limbs": [...], "criteria": [...], "criteria_count": "6" }

# 3. snarkjs로 proof 생성 (CLI 호출)
import subprocess, json
Path("zk_input.json").write_text(json.dumps(zk_input))
subprocess.run(["snarkjs", "wtns", "calculate", WASM_PATH, "zk_input.json", "witness.wtns"], check=True)
subprocess.run(["snarkjs", "groth16", "prove", ZKEY_PATH, "witness.wtns", "proof.json", "public.json"], check=True)

# 4. 저장
bundle = data["bundle"]
Path("bundle_1.json").write_text(json.dumps(bundle))
Path("proof_1.json").write_text(Path("proof.json").read_text())
Path("public_1.json").write_text(Path("public.json").read_text())
```

### contribute 호출 (06_contribute.sh)
```bash
BUNDLE=$(cat bundle_1.json)
PROOF=$(cat proof_1.json)
PUBLIC=$(cat public_1.json)

near call $ESCROW_ACCOUNT contribute \
  "{\"policy_id\": 1, \"bundle\": $BUNDLE, \"zk_proof_json\": $(echo $PROOF | jq -c '.' | jq -Rs '.'), \"zk_public_inputs_json\": $(echo $PUBLIC | jq -c '.' | jq -Rs '.')}" \
  --accountId investor-1.testnet \
  --deposit 100 \
  --gas 200000000000000
```

### 검증 항목 (10_verify.sh)
1. policy.status == Closed
2. investor contribution.outcome ∈ {FullMatch, PartialMatch} AND claim_done == true
3. zk-verifier에 ProofVerified 이벤트 확인
4. escrow contract 잔액 ≈ 0

## Acceptance Criteria
- [ ] `run_demo.sh` 한 번에 전체 시나리오 실행 성공
- [ ] ZK proof 생성 단계 포함
- [ ] contribute가 bundle + ZK proof 인자로 호출
- [ ] 각 단계 tx hash 로그 기록

## 코드리뷰 체크포인트
1. snarkjs CLI 경로/파일 경로가 정확한지
2. contribute gas 200 TGas로 충분한지 (verify + verify_proof 체인)
3. ZK proof의 public inputs에 eligible="1" 포함 확인

## References
- 기존 test-01 계획 + ZK 변경사항
- zk-05: contribute() 시그니처 변경
- zk-07: TEE 응답의 zk_input 형식
