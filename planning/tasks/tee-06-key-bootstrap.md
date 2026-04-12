---
id: tee-06-key-bootstrap
status: todo
sub: TEE
layer: tee
depends_on: [tee-05-signer-and-report]
estimate: 1h
demo_step: "Setup (pre-demo)"
---

# TEE Signer Key Bootstrap

## Context
TEE 서명 키 생성 + 등록 + infra-02에 공급하는 전체 부트스트랩 플로우.
"key가 어디서 오는가"에 대한 단일 SSOT.

PRD NFR-SEC-2
research §4

## Files
- `scripts/tee/gen_signer_key.py`        — secp256k1 키 생성 + address 유도
- `scripts/tee/bootstrap_signer.sh`      — 전체 부트스트랩 오케스트레이션
- `scripts/tee/README.md`

## Spec

### 두 가지 모드

**모드 A: 개발 모드** (MVP 기본)
- 로컬에서 `Account.create()`로 secp256k1 키 생성
- privkey를 `.env.local`에 저장
- address를 `scripts/deploy/config.env`에 `INITIAL_TEE_SIGNING_ADDRESS`로 설정
- CVM 기동 시 `TEE_SIGNER_PRIVKEY` env로 주입
- **제약**: NFR-SEC-2 미충족 (키가 CVM 외부에서 생성됨). 로드맵에서 개선.

**모드 B: CVM 내부 생성** (로드맵)
- CVM 최초 기동 시 `secrets.token_bytes(32)` → privkey 생성
- `/v1/attestation/info` 노출 → TDX report_data에 signing_address 바인딩
- 외부 운영자가 `/v1/attestation/info`로 address 수집 후 owner 계정으로 `set_tee_pubkey` 호출
- 이 경우 privkey는 CVM 밖으로 절대 나가지 않음

### gen_signer_key.py
```python
#!/usr/bin/env python3
from eth_account import Account
import secrets
import json
import sys

def main():
    # Account.create()는 내부적으로 os.urandom(32) 사용
    acct = Account.create()
    out = {
        "address": acct.address,
        "address_bytes": list(bytes.fromhex(acct.address[2:])),
        "private_key": acct.key.hex(),
        "key_id": 1,
    }
    json.dump(out, sys.stdout, indent=2)
    print(file=sys.stderr)
    print(f"⚠️  Store the private key securely. Address: {acct.address}", file=sys.stderr)

if __name__ == "__main__":
    main()
```

### bootstrap_signer.sh
```bash
#!/usr/bin/env bash
set -euo pipefail

KEY_FILE="${1:-.secrets/tee_signer.json}"
mkdir -p "$(dirname $KEY_FILE)"
chmod 700 "$(dirname $KEY_FILE)"

if [ -f "$KEY_FILE" ]; then
    echo "Key exists: $KEY_FILE"
    cat "$KEY_FILE" | jq '.address'
    exit 0
fi

python3 scripts/tee/gen_signer_key.py > "$KEY_FILE"
chmod 600 "$KEY_FILE"

ADDR=$(jq -r '.address' "$KEY_FILE")
PRIV=$(jq -r '.private_key' "$KEY_FILE")
ADDR_BYTES=$(jq -c '.address_bytes' "$KEY_FILE")

echo "Generated signer: $ADDR"
echo ""
echo "Add to scripts/deploy/config.env:"
echo "  INITIAL_TEE_SIGNING_ADDRESS=$ADDR_BYTES"
echo ""
echo "Add to tee/inference/.env:"
echo "  TEE_SIGNER_PRIVKEY=$PRIV"
echo "  TEE_SIGNER_KEY_ID=1"
```

### 키 로테이션 플로우
```text
1. 새 키 생성: python3 gen_signer_key.py > .secrets/tee_signer_v2.json
2. 온체인 등록:
   near call $VERIFIER_ACCOUNT rotate_key \
     '{"new_address": [..], "grace_seconds": 3600}' \
     --accountId $OWNER_ACCOUNT
3. grace 기간 동안 이전 서비스는 이전 키로 계속 서명
4. 새 CVM 인스턴스는 새 privkey로 기동
5. grace 만료 후 이전 키 불가
```

## Acceptance Criteria
- [ ] `python3 scripts/tee/gen_signer_key.py` 실행 시 valid JSON 출력
- [ ] `bootstrap_signer.sh`가 idempotent (기존 키 재생성 안 함)
- [ ] 생성된 address가 hex 42자 + 0x prefix 형식
- [ ] 생성된 privkey가 64 hex chars (no 0x prefix)
- [ ] Python signer (tee-05 TeeSigner)에 privkey 주입 후 sign_payload() 성공
- [ ] 생성된 address bytes가 infra-02 init args 형식과 일치 (JSON array of u8)
- [ ] README에 보안 주의사항 명시 (.secrets/ gitignore 등)

## Test Cases
1. happy: 키 생성 → address/private_key 출력
2. happy: 두 번째 호출 → 기존 키 사용 (idempotent)
3. happy: 생성된 privkey로 TeeSigner 초기화 → address 일치
4. edge: `.secrets/` 디렉토리 권한 700으로 생성 확인
5. edge: 잘못된 env 주입 시 TeeSigner 초기화 실패 메시지

## Security
- `.secrets/`는 `.gitignore`에 포함되어야 함
- 모드 A는 MVP 편의용. 프로덕션은 모드 B로 전환 (PRD NFR-SEC-2 완전 충족)
- privkey가 실수로 로그에 남지 않도록 `bootstrap_signer.sh`는 stderr로만 힌트 표시

## References
- `planning/PRD.md` NFR-SEC-2
- `planning/research/near-ai-tee-notes.md` §4
- `planning/tasks/tee-05-signer-and-report.md`
- `planning/tasks/infra-02-testnet-deploy.md`
- eth_account: https://eth-account.readthedocs.io/
