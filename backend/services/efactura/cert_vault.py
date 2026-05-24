"""Per-tenant certificate vault.

Phase 1A: store the company's `.p12 / .pfx` digital certificate encrypted
at rest. The master key lives in `backend/.env` as `EFACTURA_MASTER_KEY`
(generated once with `Fernet.generate_key()`). For production we should move
this key into a KMS / Secrets Manager — Fernet is fine for early-stage tenant
isolation but rotating keys requires a re-encryption pass.

This module is intentionally provider-agnostic. The same vault stores certs
for DGII, SAT, DIAN, etc. The provider layer (Phase 1+) reads from here when
it needs to sign documents.
"""
from __future__ import annotations

import base64
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509 import Certificate


_FERNET: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """Lazy-load the master key. Crashes loudly if missing so we don't
    silently fall back to a default that would be a security hole."""
    global _FERNET
    if _FERNET is None:
        key = os.environ.get("EFACTURA_MASTER_KEY")
        if not key:
            raise RuntimeError(
                "EFACTURA_MASTER_KEY missing from backend/.env — refusing to "
                "operate the certificate vault without an encryption key."
            )
        _FERNET = Fernet(key.encode() if isinstance(key, str) else key)
    return _FERNET


def parse_p12(pfx_bytes: bytes, password: Optional[str]) -> Dict[str, Any]:
    """Decrypt the PFX with the user-provided password and pull out
    human-readable metadata. Raises `ValueError` if the password is wrong or
    the file is corrupted — caller maps to HTTP 400."""
    try:
        pwd_bytes = password.encode("utf-8") if password else None
        _, cert, _ = pkcs12.load_key_and_certificates(pfx_bytes, pwd_bytes)
    except ValueError as e:
        # Wrong password OR corrupt file. We can't safely distinguish.
        raise ValueError(f"Invalid certificate or password: {e}")
    except Exception as e:
        raise ValueError(f"Unable to read PFX: {e}")
    if cert is None:
        raise ValueError("PFX did not contain an end-entity certificate.")
    return _extract_metadata(cert)


def _extract_metadata(cert: Certificate) -> Dict[str, Any]:
    """Pull only printable, non-sensitive fields from the X.509 cert."""
    try:
        subject = cert.subject.rfc4514_string()
    except Exception:
        subject = ""
    try:
        issuer = cert.issuer.rfc4514_string()
    except Exception:
        issuer = ""
    try:
        common_name = next(
            (a.value for a in cert.subject if a.oid.dotted_string == "2.5.4.3"),
            "",
        )
    except Exception:
        common_name = ""
    # Use the UTC-aware accessors when available (cryptography >= 42).
    # Falling back to the naive properties triggers a deprecation warning, so
    # we branch instead of relying on getattr's eager default.
    if hasattr(cert, "not_valid_before_utc"):
        valid_from = cert.not_valid_before_utc.isoformat()
        valid_to = cert.not_valid_after_utc.isoformat()
    else:
        valid_from = cert.not_valid_before.isoformat()
        valid_to = cert.not_valid_after.isoformat()
    return {
        "subject": subject,
        "issuer": issuer,
        "common_name": common_name,
        "serial_number": format(cert.serial_number, "X"),
        "valid_from": valid_from,
        "valid_to": valid_to,
        "fingerprint_sha256": cert.fingerprint(hashes.SHA256()).hex(),
    }


def encrypt_blob(blob: bytes) -> str:
    """Encrypt the PFX bytes + password tuple into an opaque token we can
    safely store in MongoDB. Returns ASCII (base64-ish Fernet token)."""
    f = _get_fernet()
    return f.encrypt(blob).decode("ascii")


def decrypt_blob(token: str) -> bytes:
    """Inverse of `encrypt_blob`. Raises `InvalidToken` if the master key
    rotated or the value was tampered with."""
    f = _get_fernet()
    try:
        return f.decrypt(token.encode("ascii"))
    except InvalidToken as e:
        raise RuntimeError("Certificate vault token could not be decrypted "
                           "(master key rotated or data corrupted)") from e


def pack_certificate(pfx_bytes: bytes, password: Optional[str]) -> str:
    """Bundle the PFX + password into a single encrypted token. We store the
    password alongside the PFX so background workers can sign without a
    human re-typing it. Both are protected by the master key."""
    pwd = (password or "").encode("utf-8")
    # Lightweight envelope: 4-byte big-endian password length + password + pfx.
    framed = len(pwd).to_bytes(4, "big") + pwd + pfx_bytes
    return encrypt_blob(framed)


def unpack_certificate(token: str) -> Dict[str, Any]:
    framed = decrypt_blob(token)
    pwd_len = int.from_bytes(framed[:4], "big")
    pwd = framed[4 : 4 + pwd_len].decode("utf-8") if pwd_len else ""
    pfx = framed[4 + pwd_len :]
    return {"pfx_bytes": pfx, "password": pwd}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


__all__ = [
    "parse_p12",
    "pack_certificate",
    "unpack_certificate",
    "encrypt_blob",
    "decrypt_blob",
    "now_iso",
]
