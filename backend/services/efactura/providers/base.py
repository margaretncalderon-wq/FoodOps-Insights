"""Abstract base for country-specific e-invoicing providers.

Phase 0 only defines the interface — concrete implementations (DGIIProvider
for República Dominicana, SATProvider for México, etc.) land in later phases.
The interface intentionally keeps signatures generic so we don't bake in
DGII-specific shape too early.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class EInvoicingProvider(ABC):
    """Country-agnostic interface every provider must implement.

    `config` is the company's `EInvoicingConfig` dict and `secrets` is the
    decrypted credential bundle (cert PFX bytes, password, API keys) — both
    are injected by the orchestrator that picks a provider based on
    `config.provider`.
    """

    provider_key: str = "abstract"
    country: str = "XX"

    def __init__(self, config: Dict[str, Any], secrets: Optional[Dict[str, Any]] = None):
        self.config = config
        self.secrets = secrets or {}

    @abstractmethod
    async def build_xml(self, document: Dict[str, Any]) -> bytes:
        """Render the structured document (invoice, credit note, etc.) into
        the country's required XML schema. MUST validate against the official
        XSD before returning."""

    @abstractmethod
    async def sign(self, xml_bytes: bytes) -> bytes:
        """Apply the country's required digital signature (XMLDSig, XAdES,
        sello SAT, etc.) and return the signed XML bytes."""

    @abstractmethod
    async def submit(self, signed_xml: bytes) -> Dict[str, Any]:
        """Send to the authority's webservice. Returns a normalized envelope:
        `{ "status": "accepted"|"rejected"|"pending", "tracking_id": str,
           "raw_response": str, "errors": [...] }`."""

    @abstractmethod
    async def check_status(self, tracking_id: str) -> Dict[str, Any]:
        """Poll the authority for the final status of a previously submitted
        document. Used by the retry/queue worker."""

    @abstractmethod
    async def cancel(self, tracking_id: str, reason: str) -> Dict[str, Any]:
        """Cancel/void a previously accepted document (if the country
        allows it)."""


# Registry — populated by provider modules at import time once Phase 1 starts.
PROVIDER_REGISTRY: Dict[str, type] = {}


def register_provider(key: str):
    """Decorator used by concrete provider modules to register themselves."""
    def _wrap(cls: type) -> type:
        PROVIDER_REGISTRY[key] = cls
        return cls
    return _wrap


def get_provider(key: str) -> Optional[type]:
    return PROVIDER_REGISTRY.get(key)
