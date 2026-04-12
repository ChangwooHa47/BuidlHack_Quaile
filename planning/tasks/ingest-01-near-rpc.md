---
id: ingest-01-near-rpc
status: todo
sub: TEE
layer: ingest
depends_on: [tee-01-persona-schema, tee-02-inference-service]
estimate: 2h
demo_step: "Subscribing.Review"
---

# NEAR RPC 지갑 데이터 수집기

## Context
투자자의 NEAR 지갑에서 `NearWalletSignal`을 생성.
TEE 내부에서 동작. 외부 RPC 호출만 허용, 원본 데이터는 TEE 밖으로 나가지 않음.

PRD: FR-IN-1, FR-IN-4, FR-IN-5
ERD §3.4

## Files
- `tee/inference/src/ingest/__init__.py`
- `tee/inference/src/ingest/near.py`
- `tee/inference/src/ingest/near_schema.py`    — 응답 파싱용 TypedDict
- `tee/inference/tests/test_near_ingest.py`
- `tee/inference/tests/fixtures/near_sample.json`

## Spec

### 클래스
```python
class NearIngestor:
    def __init__(self, rpc_url: str, archival_rpc_url: str, timeout: float = 10.0):
        self.rpc = rpc_url                # for current state
        self.archival = archival_rpc_url  # for historical queries
        self.client = httpx.AsyncClient(timeout=timeout)

    async def collect(self, proofs: list[NearWalletProof]) -> list[NearWalletSignal]:
        """Parallel collect per wallet. Returns partial results on per-wallet failure."""
        results = await asyncio.gather(
            *(self._collect_one(p) for p in proofs),
            return_exceptions=True,
        )
        return [r for r in results if isinstance(r, NearWalletSignal)]

    async def _collect_one(self, proof: NearWalletProof) -> NearWalletSignal:
        # 1. view_account (current state)
        # 2. EXPERIMENTAL_tx_status or indexer for first_seen_block
        # 3. view_access_key_list
        # 4. FT balance: nep141 enumeration (limited)
        # 5. DAO votes: Astra DAO query (optional)
```

### RPC 호출
JSON-RPC 엔드포인트:
- mainnet: `https://rpc.mainnet.near.org`
- testnet: `https://rpc.testnet.near.org`
- archival mainnet: `https://archival-rpc.mainnet.near.org`

메서드:
- `query` with `{ request_type: "view_account", finality: "final", account_id: "..." }`
- `query` with `{ request_type: "view_access_key_list", ..., account_id }`
- `query` with `{ request_type: "call_function", account_id: "dao.sputnik-v2.near", method_name: "get_proposals", args_base64: "..." }`

### first_seen_block 전략
- NEAR native RPC는 full tx history를 제공하지 않음
- **옵션 1**: NearBlocks API (off-chain indexer) — 무료 티어 있음
- **옵션 2**: Pagoda Indexer (GraphQL) — 공개 엔드포인트
- **옵션 3**: `view_account`의 storage_usage 기반 추정 (부정확, MVP는 제외)

> **MVP 선택**: NearBlocks API (`https://api.nearblocks.io/v1/account/{account}/txns-only?order=asc&per_page=1`)
> 단점: off-chain 의존. 단, TEE 안에서 호출하므로 ToR(trust)는 RPC와 동급.

### Rate Limit
- 퍼블릭 RPC: 분당 ~300 call (대략)
- NearBlocks: 분당 ~60 call
- 전략: 체인별 Semaphore, per-wallet batch size 4

### Error handling
```python
class NearIngestError(Exception): ...
class NearRpcTimeout(NearIngestError): ...
class NearRpcRateLimit(NearIngestError): ...
class NearWalletNotFound(NearIngestError): ...
class NearIndexerDown(NearIngestError): ...
```

- 재시도: exponential backoff (250ms, 500ms, 1s, 2s, 4s)
- 실패 시 해당 지갑만 스킵, 나머지 계속 (partial=true)

## Acceptance Criteria
- [ ] `uv run pytest tests/test_near_ingest.py` 성공
- [ ] Mock RPC 응답으로 parse → NearWalletSignal 생성
- [ ] 실제 mainnet account (`near`)로 integration test (옵션: `NEAR_INTEGRATION_TEST=1`)
- [ ] 401/429/500 응답 시 retry 동작
- [ ] 5회 재시도 후 실패 → partial result 반환

## Test Cases
1. happy (unit): mock 응답 → holding_days, total_txs, balance 정확 파싱
2. happy (integration): `near.near` 조회 → holding_days > 0
3. edge: 존재하지 않는 account (`xxx-nope-9999.near`) → WalletNotFound
4. edge: 429 응답 → backoff → 성공
5. edge: NearBlocks 응답 없음 → first_seen_block = 0, holding_days = 0, partial=true
6. edge: FT list 일부만 성공 → 있는 것만 반환
7. edge: Astra DAO 응답 형식 변경 → 에러 로그 + dao_votes = []

## References
- NEAR RPC docs: https://docs.near.org/api/rpc/introduction
- NearBlocks API: https://api.nearblocks.io/api-docs
- Pagoda Public Indexer: https://near-indexer.api.pagoda.co
- `planning/ERD.md` §3.4

## Open Questions
1. NearBlocks API 키가 필요한가? (로드맵: 전용 indexer 자체 호스팅)
2. Astra DAO말고 지원할 DAO 프로토콜? → MVP는 Sputnik v2 only
3. FT enumeration은 어떻게? → 투자자가 `expected_ft_tokens` 힌트를 Persona에 포함하거나, NearBlocks의 holdings endpoint 사용
