---
id: ingest-02-evm-multichain
status: todo
sub: TEE
layer: ingest
depends_on: [tee-01-persona-schema, tee-02-inference-service]
estimate: 2.5h
demo_step: "Subscribing.Review"
---

# EVM 멀티체인 지갑 데이터 수집기

## Context
EVM 지갑(Ethereum, Base, Arbitrum, Optimism, Polygon, BSC)에서 `EvmWalletSignal`을 수집.
**소유권은 Persona 수신 시 이미 EIP-191로 검증**되고, 이 모듈은 "검증된 주소"에 대해 on-chain 데이터만 수집.

PRD: FR-IN-2, FR-IN-3, FR-IN-4, FR-IN-5
ERD §3.4, §3.3 (EvmWalletProof)

## Files
- `tee/inference/src/ingest/evm.py`
- `tee/inference/src/ingest/chains.py`        — 체인 레지스트리
- `tee/inference/tests/test_evm_ingest.py`
- `tee/inference/tests/fixtures/evm_sample.json`

## Spec

### 체인 레지스트리
```python
@dataclass(frozen=True)
class ChainConfig:
    chain_id: int
    name: str
    rpc: str
    explorer_api: str | None     # Etherscan family base URL
    etherscan_api_key_env: str | None

SUPPORTED_CHAINS: dict[int, ChainConfig] = {
    1:     ChainConfig(1,     "ethereum", os.getenv("RPC_ETHEREUM"),  "https://api.etherscan.io/api",  "ETHERSCAN_API_KEY"),
    8453:  ChainConfig(8453,  "base",     os.getenv("RPC_BASE"),      "https://api.basescan.org/api",  "BASESCAN_API_KEY"),
    42161: ChainConfig(42161, "arbitrum", os.getenv("RPC_ARBITRUM"),  "https://api.arbiscan.io/api",   "ARBISCAN_API_KEY"),
    10:    ChainConfig(10,    "optimism", os.getenv("RPC_OPTIMISM"),  "https://api-optimistic.etherscan.io/api", "OPTIMISM_API_KEY"),
    137:   ChainConfig(137,   "polygon",  os.getenv("RPC_POLYGON"),   "https://api.polygonscan.com/api", "POLYGONSCAN_API_KEY"),
    56:    ChainConfig(56,    "bsc",      os.getenv("RPC_BSC"),       "https://api.bscscan.com/api",     "BSCSCAN_API_KEY"),
}
```

### 클래스
```python
class EvmIngestor:
    def __init__(self, chains: dict[int, ChainConfig]):
        self.chains = chains
        self.clients = {cid: web3.AsyncWeb3(web3.AsyncHTTPProvider(c.rpc)) for cid, c in chains.items()}

    async def collect(self, proofs: list[EvmWalletProof]) -> tuple[list[EvmWalletSignal], list[str]]:
        """Returns (signals, collection_errors)."""
        tasks = [self._collect_one(p) for p in proofs]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        signals, errors = [], []
        for p, r in zip(proofs, results):
            if isinstance(r, Exception):
                errors.append(f"{p.chain_id}:{p.address}: {type(r).__name__}")
            else:
                signals.append(r)
        return signals, errors

    async def _collect_one(self, proof: EvmWalletProof) -> EvmWalletSignal:
        # 1. chain config 확인 (UnsupportedChain)
        # 2. eth_getBalance
        # 3. eth_getTransactionCount (nonce = tx count)
        # 4. first_seen_block: etherscan `account.txlist?startblock=0&page=1&offset=1&sort=asc`
        # 5. ERC20 holdings: etherscan `account.tokenbalance` (대표 토큰 몇 개) 또는 `account.tokentx` 요약
        # 6. ENS (eth only): reverse lookup
```

### first_seen_block 전략
- **옵션 1 (권장)**: Etherscan family API `account.txlist` sort=asc, offset=1 → 첫 tx의 block
- **옵션 2**: Binary search on eth_getTransactionCount (O(log N) RPC calls) — API 키 없이 가능하지만 느림
- **MVP: 옵션 1** — API 키는 env로 관리

### ERC20 holdings
- **옵션 1**: 고정 화이트리스트 (USDC, USDT, WETH, DAI) — 가벼움
- **옵션 2**: `account.tokentx` 전체 스캔 → 최근 1000건 안에 등장한 컨트랙트 집계 → `balanceOf` 조회
- **MVP: 옵션 1** (5개 토큰 고정, 가벼움). 옵션 2는 로드맵.

### 지원 체인별 주의점
- **Base/Optimism/Arbitrum**: L2, tx 수가 cheap이라 many
- **Polygon**: 높은 tx throughput, rate limit 주의
- **BSC**: Etherscan 호환 + API 키 시스템 동일
- **Ethereum**: gas 높아 tx 적음 (일반 유저 기준)

### Error handling
```python
class EvmIngestError(Exception): ...
class UnsupportedChain(EvmIngestError):
    def __init__(self, chain_id: int): ...
class RpcFailure(EvmIngestError): ...
class ExplorerApiFailure(EvmIngestError): ...
class RateLimited(EvmIngestError): ...
```

- 체인당 Semaphore (concurrency 3) + exponential backoff
- 한 체인 실패 → 다른 체인 계속
- 모든 체인 실패 → partial=true, collection_errors로 보고

## Acceptance Criteria
- [ ] `uv run pytest tests/test_evm_ingest.py` 성공
- [ ] mock RPC + mock Etherscan으로 6 체인 병렬 수집 테스트
- [ ] Vitalik address (0xd8dA...045)로 ethereum integration test (옵션)
- [ ] 지원 안 하는 chain_id → UnsupportedChain
- [ ] 한 체인 timeout → 나머지 성공
- [ ] first_seen_block 계산이 etherscan ground truth와 일치

## Test Cases
1. happy (unit): mock response → native_balance, tx_count, first_seen_block 정확 파싱
2. happy (integration): Vitalik → ethereum 응답 정상
3. edge: 잘못된 chain_id → UnsupportedChain
4. edge: ethereum RPC 500 → retry → 성공
5. edge: arbitrum RPC 지속 timeout → signals에서 제외 + errors에 기록
6. edge: 6 체인 동시 호출 → 모두 병렬 실행 (시간 < 가장 느린 체인 × 1.5)
7. edge: ENS lookup 실패 → ens_name = None, 나머지 필드 정상
8. edge: zero balance wallet → 정상 파싱 (balance=0)

## References
- web3.py: https://web3py.readthedocs.io/
- Etherscan API: https://docs.etherscan.io/
- `planning/PRD.md` FR-IN-2~5
- `planning/ERD.md` §3.4

## Open Questions
1. API key는 CVM env로 주입 — 안전한가? → 키가 유출돼도 조회만 가능, 발행자는 특정 불가 (public indexer data)
2. ERC20 화이트리스트를 policy-specific하게 할지? (재단이 원하는 토큰 보유 요구) → 구현 복잡. MVP는 global 화이트리스트.
3. L2 전용 토큰 (OP, ARB 등)은 체인별 리스트 따로 관리
4. 6 체인 전부 실패하면 심사 거부? → MVP는 best-effort 진행, LLM이 "데이터 부족"으로 판단
