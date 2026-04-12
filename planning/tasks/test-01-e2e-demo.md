---
id: test-01-e2e-demo
status: todo
sub: INFRA
layer: test
depends_on: [contract-01-policy-registry, contract-02-attestation-verifier, contract-03a-escrow-state, contract-03b-escrow-settlement, contract-03c-escrow-claim-refund, tee-05-signer-and-report]
estimate: 2h
demo_step: "End-to-end (ONE_PAGER §6 전체)"
---

# End-to-End 데모 시나리오 — testnet

## Context
MVP 완료 기준(PRD §6.1). 데모 영상에서 보여줄 장면을 스크립트로 재현 가능하게 만든다.

## Files
- `scripts/e2e/run_demo.sh`                  — 전체 실행 엔트리
- `scripts/e2e/01_deploy_contracts.sh`       — 3개 컨트랙트 배포 + 초기화
- `scripts/e2e/02_setup_foundation.sh`       — 재단 whitelist + escrow 주소 등록
- `scripts/e2e/03_register_policy.sh`        — 샘플 Policy 등록
- `scripts/e2e/04_start_tee_service.sh`      — docker-compose up
- `scripts/e2e/05_submit_persona.py`         — Persona 생성 + /v1/attest 호출
- `scripts/e2e/06_contribute.sh`             — ido-escrow.contribute 호출
- `scripts/e2e/07_advance_phases.sh`         — subscription_end까지 sleep + advance_status
- `scripts/e2e/08_settle.sh`                 — ido-escrow.settle
- `scripts/e2e/09_claim_refund.sh`           — claim + refund
- `scripts/e2e/10_verify.sh`                 — 최종 상태 assertion
- `scripts/e2e/config.env.example`
- `scripts/e2e/README.md`

## Spec

### 전제 조건
- NEAR CLI 설치 (`near-cli-rs` 또는 `near`)
- NEAR testnet 계정 준비:
  - `owner.testnet` — 컨트랙트 owner
  - `foundation-a.testnet` — 재단
  - `investor-1.testnet`, `investor-2.testnet`, `investor-3.testnet`
- 서브 계정: `policy.owner.testnet`, `verifier.owner.testnet`, `escrow.owner.testnet`
- Docker + uv (Python)
- EVM testnet 접근 (Sepolia, Base Sepolia 등) — 또는 mainnet readonly

### 시나리오 타임라인
```
T+0:00  Deploy contracts        (01_deploy)
T+0:01  Add foundation, set escrow (02_setup)
T+0:02  Register Policy (subscription_start = T+0:03, end = T+0:08, live_end = T+0:13)
T+0:03  Start TEE service       (04_start_tee_service, wait for /healthz)
T+0:03  Advance to Subscribing  (policy_registry.advance_status)
T+0:04  Investor 1 submits Persona → TEE returns bundle (05_submit_persona)
T+0:05  Investor 1 contributes (attached_deposit) (06_contribute)
T+0:05  Investor 2, 3 같은 흐름 (reuse script)
T+0:08  Advance to Live (advance_status)
T+0:09  Settle (08_settle)
T+0:10  Investor 1 claim, Investor 2 partial → claim + refund, Investor 3 refund (09_claim_refund)
T+0:12  Verify final state (10_verify)
```

### Policy 샘플
```json
{
  "natural_language": "Long-term NEAR holders who have held NEAR for at least 90 days and have at least 3 on-chain transactions. Prefer holders with DAO participation.",
  "ipfs_cid": "bafybeib...placeholder",
  "sale_config": {
    "token_contract": "demo-token.testnet",
    "total_allocation": "1000000000000000000000000",
    "price_per_token": "1000000000000000000000",
    "payment_token": {"Near": null},
    "subscription_start": "<T+0:03 ns>",
    "subscription_end":   "<T+0:08 ns>",
    "live_end":           "<T+0:13 ns>"
  }
}
```

### 05_submit_persona.py (핵심)
```python
async def main():
    persona = PersonaSubmission(
        near_account="investor-1.testnet",
        policy_id=1,
        wallets=Wallets(
            near=[sign_near_proof(testnet_keys["investor-1"], policy_id=1, nonce=nonce)],
            evm=[sign_evm_proof(test_eth_privkey, chain_id=1, policy_id=1, nonce=nonce)],
        ),
        self_intro="I am a long-term NEAR holder since 2023 and contribute to Rust tooling.",
        github_oauth_token=os.getenv("DEMO_GITHUB_TOKEN"),
        nonce=nonce,
        client_timestamp=now_ns(),
    )
    r = httpx.post("http://localhost:8080/v1/attest", json=persona.model_dump())
    bundle = AttestationBundle.model_validate_json(r.text)
    # bundle을 JSON 파일로 저장 → 06_contribute.sh가 읽어서 cli 인자로 전달
    Path("bundle_1.json").write_text(bundle.model_dump_json())
```

### 06_contribute.sh
```bash
near call $ESCROW_ACCOUNT contribute \
  --args-file bundle_1.json \
  --accountId investor-1.testnet \
  --deposit 100 \
  --gas 100000000000000
```

### 10_verify.sh (assertions)
```bash
# 1. policy.status == Closed (PolicyStatus enum)
# 2. investor-1 contribution.outcome ∈ {FullMatch, PartialMatch} AND claim_done == true
# 3. investor-1 ft_balance > 0 (token received)
# 4. investor-3 contribution.outcome == NoMatch (or PartialMatch with refund) AND refund_done == true
# 5. escrow contract native balance ≈ 0 (모두 정산 완료, 약간의 storage deposit만 남음)
# 6. attestation verifier current_signing_address() == expected
```

## Acceptance Criteria
- [ ] `bash scripts/e2e/run_demo.sh` 한 번에 전체 시나리오 실행 성공
- [ ] 중간 실패 시 어느 단계인지 명확한 로그
- [ ] 각 단계의 tx hash/log가 `scripts/e2e/out/*.log`에 저장
- [ ] Policy 시간을 실제 환경에 맞게 파라미터화 (예: `DEMO_SECONDS=60`)
- [ ] 데모 영상 녹화에 필요한 **시각적 확인 지점**이 CLI 출력에 하이라이트됨
- [ ] 실패 재현 가능 (`scripts/e2e/cleanup.sh`로 리셋)

## Test Cases (demo scenarios)
1. happy: 3명 투자자, supply >= demand → 전원 FullMatch → 전원 claim_done
2. happy: supply < demand → 전원 PartialMatch → 전원 claim + refund
3. edge: 1명만 투자 → FullMatch (supply 충분)
4. edge: TEE 호출 실패 시 어느 단계에서 멈추는지 확인
5. edge: 재단이 Subscribing 중 mark_closed 시도 → Unauthorized (escrow만 허용)

## 데모 영상 체크리스트 (사람이 확인)
- [ ] 재단 Policy 등록 tx가 explorer에서 보임
- [ ] TEE 서비스의 `/healthz` 초록색
- [ ] 투자자가 Persona JSON을 제출하는 순간 로그 출력
- [ ] bundle에 `signing_address`, `payload_hash`, TEE report 확인
- [ ] contribute tx가 성공 → `ContributionCreated` 이벤트
- [ ] settle tx → `PolicySettled` 이벤트 + ratio_bps 값 출력
- [ ] claim/refund tx → native/ft 잔액 변화 explorer 확인
- [ ] 최종 assertion 10/10 통과

## Open Questions
1. testnet FT token (IDO 대상 토큰) 준비: mock FT 컨트랙트도 배포?
2. EVM signature는 실제 Sepolia 계정으로? 아니면 로컬 개인키?
3. 데모 시간 압축 (subscription=5분): testnet 블록 생성 시간 고려
4. faucet 자동화 (10 NEAR씩 x 4 계정)
5. 영상 녹화 툴 (QuickTime? asciinema? loom?) — 프레젠테이션용

## References
- `planning/PRD.md` §6.1
- `planning/ONE_PAGER.md` §6 데모 장면
- NEAR CLI: https://docs.near.org/tools/near-cli
- near-workspaces-rs (integration tests): https://github.com/near/near-workspaces-rs
