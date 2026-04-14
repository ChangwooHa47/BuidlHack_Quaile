from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

import httpx

NVIDIA_NRAS_GPU_ATTEST_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu"
TDX_STATUS_OK = frozenset({"UpToDate"})


class AttestationVerificationError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class VerifiedAttestation:
    signing_address: str
    tdx_status: str
    nvidia_verdict: bool
    binds_address: bool
    embeds_nonce: bool


def _hex_bytes(value: str, *, field: str) -> bytes:
    try:
        return bytes.fromhex(value.removeprefix("0x"))
    except ValueError as exc:
        raise AttestationVerificationError(f"{field} is not valid hex") from exc


def _decode_jwt_payload_unverified(jwt_token: str) -> dict[str, Any]:
    """Decode NRAS JWT payload after trusting the HTTPS NRAS response."""
    parts = jwt_token.split(".")
    if len(parts) < 2:
        raise AttestationVerificationError("NVIDIA NRAS response is not a JWT")
    payload_b64 = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AttestationVerificationError(
            "NVIDIA NRAS JWT payload is invalid"
        ) from exc


def _signing_address_bytes(signing_address: str, signing_algo: str) -> bytes:
    algo = signing_algo.lower()
    raw = _hex_bytes(signing_address, field="signing_address")
    if algo == "ecdsa" and len(raw) != 20:
        raise AttestationVerificationError("ECDSA signing_address must be 20 bytes")
    if algo != "ecdsa" and len(raw) > 32:
        raise AttestationVerificationError("signing_address must be at most 32 bytes")
    return raw


def _expected_report_data_first32(attestation: dict[str, Any]) -> bytes:
    signing_algo = str(attestation.get("signing_algo", "ecdsa"))
    address = _signing_address_bytes(attestation["signing_address"], signing_algo)
    tls_fingerprint = attestation.get("tls_cert_fingerprint")
    if tls_fingerprint:
        return sha256(
            address + _hex_bytes(tls_fingerprint, field="tls_cert_fingerprint")
        ).digest()
    return address.ljust(32, b"\x00")


def _extract_report_data(intel_result_json: dict[str, Any]) -> bytes:
    report = intel_result_json.get("report")
    if isinstance(report, dict):
        td10 = report.get("TD10")
        if isinstance(td10, dict):
            report_data = td10.get("report_data") or td10.get("reportdata")
            if isinstance(report_data, str):
                return _hex_bytes(report_data, field="TDX report_data")

    quote = intel_result_json.get("quote")
    if isinstance(quote, dict):
        body = quote.get("body")
        if isinstance(body, dict):
            report_data = body.get("reportdata") or body.get("report_data")
            if isinstance(report_data, str):
                return _hex_bytes(report_data, field="TDX report_data")

    raise AttestationVerificationError("TDX verification result missing report_data")


def verify_report_data(
    attestation: dict[str, Any],
    request_nonce_hex: str,
    intel_result_json: dict[str, Any],
) -> tuple[bool, bool]:
    report_data = _extract_report_data(intel_result_json)
    if len(report_data) < 64:
        raise AttestationVerificationError("TDX report_data must be at least 64 bytes")

    raw_nonce = _hex_bytes(request_nonce_hex, field="request nonce")
    if len(raw_nonce) != 32:
        raise AttestationVerificationError("request nonce must be 32 bytes")

    binds_address = report_data[:32] == _expected_report_data_first32(attestation)
    embeds_nonce = report_data[32:64] == raw_nonce
    return binds_address, embeds_nonce


async def verify_tdx_quote(attestation: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    try:
        import dcap_qvl
    except ImportError as exc:
        raise AttestationVerificationError("dcap-qvl is not installed") from exc

    quote_hex = attestation.get("intel_quote")
    if not isinstance(quote_hex, str) or not quote_hex:
        raise AttestationVerificationError("attestation missing intel_quote")

    try:
        result = await dcap_qvl.get_collateral_and_verify(bytes.fromhex(quote_hex))
    except Exception as exc:
        raise AttestationVerificationError(
            "Intel TDX quote verification failed"
        ) from exc

    status = str(getattr(result, "status", ""))
    if status not in TDX_STATUS_OK:
        raise AttestationVerificationError(f"Intel TDX quote status is {status!r}")

    try:
        result_json = json.loads(result.to_json())
    except (AttributeError, TypeError, json.JSONDecodeError) as exc:
        raise AttestationVerificationError(
            "TDX verifier returned invalid JSON"
        ) from exc

    return status, result_json


async def verify_gpu_attestation(
    attestation: dict[str, Any], request_nonce_hex: str
) -> bool:
    payload_raw = attestation.get("nvidia_payload")
    if isinstance(payload_raw, str):
        try:
            payload = json.loads(payload_raw)
        except json.JSONDecodeError as exc:
            raise AttestationVerificationError("nvidia_payload is not JSON") from exc
    elif isinstance(payload_raw, dict):
        payload = payload_raw
    else:
        raise AttestationVerificationError("attestation missing nvidia_payload")

    payload_nonce = payload.get("nonce")
    if (
        not isinstance(payload_nonce, str)
        or payload_nonce.lower() != request_nonce_hex.lower()
    ):
        raise AttestationVerificationError(
            "GPU payload nonce does not match request nonce"
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(NVIDIA_NRAS_GPU_ATTEST_URL, json=payload)
        resp.raise_for_status()
        body = resp.json()

    try:
        jwt_token = body[0][1]
        verdict = _decode_jwt_payload_unverified(jwt_token)[
            "x-nvidia-overall-att-result"
        ]
    except (KeyError, IndexError, TypeError) as exc:
        raise AttestationVerificationError("NVIDIA NRAS response is invalid") from exc

    if verdict is not True:
        raise AttestationVerificationError("NVIDIA attestation verdict is not PASS")
    return True


def _find_model_attestation(
    report: dict[str, Any], signing_address: str
) -> dict[str, Any]:
    attestations = report.get("model_attestations")
    if not isinstance(attestations, list) or not attestations:
        raise AttestationVerificationError("report missing model_attestations")

    for attestation in attestations:
        if not isinstance(attestation, dict):
            continue
        address = attestation.get("signing_address")
        if isinstance(address, str) and address.lower() == signing_address.lower():
            return attestation

    raise AttestationVerificationError(
        "report does not contain attestation for requested signing_address"
    )


async def verify_near_ai_report(
    content: bytes, signing_address: str, request_nonce_hex: str
) -> VerifiedAttestation:
    try:
        report = json.loads(content)
    except json.JSONDecodeError as exc:
        raise AttestationVerificationError("attestation report is not JSON") from exc
    if not isinstance(report, dict):
        raise AttestationVerificationError("attestation report must be a JSON object")

    attestation = _find_model_attestation(report, signing_address)
    status, intel_result = await verify_tdx_quote(attestation)
    binds_address, embeds_nonce = verify_report_data(
        attestation, request_nonce_hex, intel_result
    )
    if not binds_address:
        raise AttestationVerificationError(
            "TDX report_data does not bind signing_address"
        )
    if not embeds_nonce:
        raise AttestationVerificationError(
            "TDX report_data does not embed request nonce"
        )

    nvidia_verdict = await verify_gpu_attestation(attestation, request_nonce_hex)
    return VerifiedAttestation(
        signing_address=signing_address,
        tdx_status=status,
        nvidia_verdict=nvidia_verdict,
        binds_address=binds_address,
        embeds_nonce=embeds_nonce,
    )
