---
id: infra-01-monorepo-init
status: todo
sub: INFRA
layer: infra
depends_on: []
estimate: 1h
demo_step: N/A
---

# Monorepo 초기화

## Context
`/Users/changwooha/Desktop/NEARAI`는 빈 폴더. 모노레포 루트로 세팅한다.
하나의 workspace 안에 Rust 컨트랙트 + Python TEE 서비스 + 통합 스크립트가 공존한다.

PRD §9 의존성, ERD §9 버전 관리

## Files
- `Cargo.toml` (workspace root)
- `rust-toolchain.toml`
- `.gitignore`
- `.editorconfig`
- `README.md`
- `tee/inference/pyproject.toml`
- `tee/inference/uv.lock` (생성됨)
- `scripts/build_all.sh`

## Spec

### Workspace 구성
`Cargo.toml`:
```toml
[workspace]
resolver = "2"
members = [
    "tee/shared",
    "contracts/policy-registry",
    "contracts/attestation-verifier",
    "contracts/ido-escrow",
]

[workspace.package]
edition = "2021"
version = "0.1.0"
license = "Apache-2.0"
rust-version = "1.78"

[workspace.dependencies]
near-sdk = "5.3"                       # 최신 확인 필요
near-contract-standards = "5.3"
borsh = { version = "1.5", default-features = false }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
sha3 = "0.10"
primitive-types = { version = "0.12", default-features = false }  # U256 for settle

[profile.release]
codegen-units = 1
opt-level = "z"
lto = "fat"
debug = false
panic = "abort"
overflow-checks = true
```

### rust-toolchain.toml
```toml
[toolchain]
channel = "1.78.0"
components = ["rustfmt", "clippy"]
targets = ["wasm32-unknown-unknown"]
```

### .gitignore
```
/target/
*.wasm
.env
.env.local
__pycache__/
*.pyc
.venv/
.idea/
.vscode/
tee/inference/.venv/
tee/inference/out/
planning/.tmp/
scripts/e2e/out/
```

### .editorconfig
```ini
root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{toml,yml,yaml,md}]
indent_size = 2

[Makefile]
indent_style = tab
```

### README.md (스켈레톤)
```markdown
# Buidl-NEAR AI

TEE-based IDO launchpad with AI-powered investor vetting.

## Layout
- `contracts/` — Rust NEAR smart contracts
- `tee/` — TEE inference service (Python) + shared Rust crate
- `scripts/` — deployment & e2e demo scripts
- `planning/` — PRD, ERD, tasks, reviews

## Build
./scripts/build_all.sh

## Docs
See `planning/ONE_PAGER.md`, `PRD.md`, `ERD.md`.
```

### scripts/build_all.sh
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Rust workspace build ==="
cargo build --workspace

echo "=== Wasm build (contracts) ==="
cargo build --target wasm32-unknown-unknown --release \
  -p policy-registry -p attestation-verifier -p ido-escrow

echo "=== Python TEE service ==="
cd tee/inference
uv sync
uv run pytest -q
```

### tee/inference/pyproject.toml
```toml
[project]
name = "buidl-near-ai-tee"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "httpx>=0.27",
    "web3>=7.2",
    "eth-account>=0.13",
    "eth-keys>=0.5",                   # secp256k1 raw hash signing (tee-02/tee-05 참조)
    "eth-hash[pycryptodome]>=0.7",     # keccak256 (pysha3 대체, Python 3.11+ 지원)
    "pycryptodome>=3.20",
    "pynacl>=1.5",                     # NEP-413 ed25519 verify (tee-03 참조)
    "base58>=2.1",                     # NEAR public_key 파싱 (tee-03 참조)
    "pydantic>=2.9",
    "openai>=1.50",
    "py-near>=1.1.50",                 # NEAR RPC. PyPI 최신 확인 필요.
]

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
    "pytest-httpx>=0.33",
    "respx>=0.21",
    "ruff>=0.7",
]
```

### 의존성 결정 노트 (iteration 2/3)
- **`pysha3`는 제거**. Python 3.11+에서 빌드 실패. `eth-hash[pycryptodome]` 또는 `pycryptodome.Hash.keccak`로 대체.
- **서명**: `eth_account.Account.signHash()`는 **사용 금지** — 내부적으로 EIP-191 prefix를 적용한다. 컨트랙트는 raw hash에 대한 서명을 기대하므로 **`eth_keys.PrivateKey.sign_msg_hash(msg_hash)`** 저수준 API를 사용한다. 자세한 내용은 `tee-02`, `tee-05` Spec 참조.
- **`py-near` 버전**: PyPI에서 최신 확인 (최소 1.1 이상). 없으면 `near-api` 직접 RPC 호출.

## Acceptance Criteria
- [ ] `cargo check --workspace` 성공 (멤버가 비어 있으면 경고만)
- [ ] `rustup target add wasm32-unknown-unknown` 후 빈 wasm 빌드 성공
- [ ] `cd tee/inference && uv sync` 성공
- [ ] `.gitignore`가 target/, .venv/, *.wasm을 포함
- [ ] README가 layout + build 방법을 설명
- [ ] `scripts/build_all.sh`가 실행 가능 (실제 멤버 빌드는 후속)

## Test Cases
1. happy: `cargo check --workspace` exit 0
2. happy: `uv sync` 의존성 설치 성공
3. edge: wasm target 미설치 → 에러 메시지로 가이드
4. edge: Python 3.10 환경 → pyproject requires 3.11 → 에러

## Open Questions
1. `near-sdk` 최신 버전? (5.3 가정, 루프에서 crates.io 확인)
2. `cargo-near` vs 수동 wasm build? → MVP는 수동 (의존성 최소)
3. Python 3.11 vs 3.12 vs 3.13? → 3.11 (fastapi/web3 호환성 안정)

## References
- NEAR SDK crates: https://crates.io/crates/near-sdk
- uv docs: https://docs.astral.sh/uv/
