# ingest-02 fix note

## 요약

`ingest-02`는 Ethereum, Base, Arbitrum, Optimism, Polygon, BSC 6개 EVM 체인의 지갑 데이터를 수집하는 태스크다.

현재 실데이터 검증 결과, RPC 호출 자체는 체인별 RPC endpoint가 필요하고, `first_seen_block`/ERC20 조회에 사용하는 Etherscan-family explorer API는 2026년 현재 V1 endpoint가 deprecated 상태다.

현 PR에서는 실데이터 검증 가능한 3개 체인만 활성화한다.

```text
Ethereum  chain_id=1
Arbitrum  chain_id=42161
Polygon   chain_id=137
```

## 확인된 사실

### 1. 체인별 V1 explorer endpoint는 동작하지 않음

명세의 예시는 체인별 explorer URL을 사용한다.

```text
https://api.etherscan.io/api
https://api.basescan.org/api
https://api.arbiscan.io/api
https://api-optimistic.etherscan.io/api
https://api.polygonscan.com/api
https://api.bscscan.com/api
```

하지만 실제 호출 결과 6개 모두 다음 응답을 반환했다.

```text
You are using a deprecated V1 endpoint, switch to Etherscan API V2
```

따라서 V1 endpoint를 그대로 쓰면 integration test는 통과할 수 없다.

### 2. Etherscan V2 endpoint는 chainid로 멀티체인을 지원함

현재 동작 가능한 explorer endpoint는 다음 형태다.

```text
https://api.etherscan.io/v2/api?chainid={chain_id}
```

이 방식은 체인별 explorer 도메인 대신 공통 Etherscan V2 endpoint와 `chainid` 파라미터를 사용한다.

### 3. 현재 API key/plan으로 실데이터 확인 가능한 체인은 3개

현재 API key/plan 기준 `txlist` 조회 결과:

```text
1 ethereum     OK
42161 arbitrum OK
137 polygon    OK
```

다음 3개 체인은 Etherscan API plan 제한으로 실패한다.

```text
8453 base     Free API access is not supported for this chain
10 optimism   Free API access is not supported for this chain
56 bsc        Free API access is not supported for this chain
```

### 4. RPC endpoint는 여전히 체인별로 필요함

Explorer API는 V2 endpoint 하나로 통일할 수 있지만, RPC 호출은 각 활성 체인의 RPC endpoint가 필요하다.

현 PR에서 필요한 RPC env:

```text
RPC_ETHEREUM
RPC_ARBITRUM
RPC_POLYGON
```

Explorer API key는 Etherscan V2 공통 key 하나를 사용한다.

```text
ETHERSCAN_API_KEY
```

## 운영 선택지

### 선택지 A: 명세 그대로 유지

- 체인별 explorer URL과 체인별 API key env를 유지한다.
- 문제: V1 endpoint deprecated로 실데이터 integration이 실패한다.
- 결론: 현재 외부 API 상태와 맞지 않아 운영 불가.

### 선택지 B: Etherscan V2로 전환하고 6개 체인 유지

- explorer endpoint를 `https://api.etherscan.io/v2/api`로 통일한다.
- `chainid` 파라미터로 체인을 구분한다.
- RPC env는 체인별로 유지한다.
- explorer API key는 `ETHERSCAN_API_KEY` 하나로 통일한다.
- 문제: 현재 무료 API plan에서는 Base, Optimism, BSC 조회가 막힌다.
- 결론: Etherscan full chain coverage가 되는 plan/key가 있으면 6개 체인 운영 가능.

### 선택지 C: 현재 검증 가능한 3개 체인만 MVP로 제한

현재 API key/plan으로 실데이터 검증 가능한 체인만 남긴다.

```text
Ethereum  chain_id=1
Arbitrum  chain_id=42161
Polygon   chain_id=137
```

Base, Optimism, BSC는 `ingest-02` 후속 fix 또는 운영 plan 업그레이드 이후 재활성화한다.

## 권장안

현재 PR에서 실데이터 integration까지 검증 가능한 상태를 우선하려면 선택지 C가 가장 안전하다.

현 PR은 선택지 C를 적용한다.

```text
현재 무료 Etherscan API plan에서 실데이터 검증 가능한 Ethereum, Arbitrum, Polygon만 활성화한다.
Base, Optimism, BSC는 Etherscan full chain coverage plan 또는 대체 indexer가 준비되면 활성화한다.
```

6개 체인을 반드시 유지해야 한다면 선택지 B로 가되, 배포환경에 Etherscan full chain coverage가 가능한 API key를 주입해야 한다.

## 검증 명령

기본 mock 검증:

```bash
uv run pytest tests/test_evm_ingest.py
```

실데이터 integration:

```bash
set -a
source .env
set +a
uv run pytest tests/test_evm_ingest.py -k vitalik -s
```

## 주의

테스트 실패 로그에 RPC/API key가 노출될 수 있으므로, 실패 로그 공유 시 key 값은 반드시 마스킹한다.
