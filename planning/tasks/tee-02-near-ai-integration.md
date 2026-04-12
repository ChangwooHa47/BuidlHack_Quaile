---
id: tee-02-near-ai-integration
status: superseded
sub: TEE
layer: tee
depends_on: []
estimate: N/A
demo_step: "superseded"
---

# NEAR AI 통합 리서치 (SUPERSEDED)

이 태스크는 완료되었으며, 두 개의 산출물로 대체되었다:

1. **리서치 노트**: [planning/research/near-ai-tee-notes.md](../research/near-ai-tee-notes.md)
2. **구현 태스크**: [tee-02-inference-service.md](./tee-02-inference-service.md)

리서치 결과 핵심:
- NEAR AI Cloud는 **Intel TDX + NVIDIA GPU TEE**
- 추론 API는 **OpenAI 호환**
- 서명은 **secp256k1 ECDSA** (Ethereum 스타일)
- 서명 키는 TDX `report_data`에 바인딩됨
- 클라이언트 검증은 `dcap-qvl` + NVIDIA NRAS

이 파일은 이력 보존용. 작업하지 말 것.
