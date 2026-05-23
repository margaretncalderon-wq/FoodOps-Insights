"""Models for the e-invoicing module. Phase 0: just the per-tenant config so
the UI can be gated and providers can later read settings from a typed source.

Country values use ISO 3166 alpha-2. The provider key is a slug we reserve
per implementation (e.g. "dgii_do", "sat_mx", "dian_co"). For Phase 0 only
"dgii_do" exists in the catalog — others are placeholders.
"""
from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


SupportedCountry = Literal["DO", "MX", "CO", "PE", "CL", "AR", "EC", "ES"]
SupportedProvider = Literal["dgii_do", "sat_mx", "dian_co", "sunat_pe", "sii_cl", "afip_ar", "sri_ec", "aeat_es"]
Environment = Literal["certification", "production"]


class NCFRange(BaseModel):
    """A pre-authorized NCF (Número de Comprobante Fiscal) range from DGII.

    Phase 0 stores it for visibility; consumption is handled by the provider
    in later phases.
    """
    document_type: str  # e.g. "31" (e-CF Crédito Fiscal), "32" (Consumo)
    prefix: str = ""    # often empty for e-CF, kept for legacy NCFs
    sequence_from: int
    sequence_to: int
    current_sequence: int = 0
    expires_at: Optional[str] = None  # ISO date


class EInvoicingConfig(BaseModel):
    """Per-company e-invoicing configuration. Stored as a sub-document on
    `companies.industry_config.e_invoicing`.

    Phase 0 fields only — certificate upload + provider credentials land in
    Phase 1 once we pick the secrets storage strategy.
    """
    enabled: bool = False
    country: Optional[SupportedCountry] = None
    provider: Optional[SupportedProvider] = None
    environment: Environment = "certification"
    # Tax-ID of the issuer (RNC in DR, RFC in MX, NIT in CO, etc.).
    issuer_tax_id: Optional[str] = None
    issuer_legal_name: Optional[str] = None
    ncf_ranges: List[NCFRange] = Field(default_factory=list)
    # Cosmetic — visible status set by the provider once live (Phase 1+).
    cert_uploaded_at: Optional[str] = None
    last_test_at: Optional[str] = None
    last_test_status: Optional[str] = None  # "ok" | "failed" | null
    updated_at: Optional[str] = None


class EInvoicingConfigUpdate(BaseModel):
    """Patch payload — only the fields admins can set in Phase 0."""
    country: Optional[SupportedCountry] = None
    provider: Optional[SupportedProvider] = None
    environment: Optional[Environment] = None
    issuer_tax_id: Optional[str] = None
    issuer_legal_name: Optional[str] = None
    ncf_ranges: Optional[List[NCFRange]] = None


class EInvoicingToggleRequest(BaseModel):
    """Super-admin toggle to enable/disable the module for a tenant."""
    enabled: bool
    country: Optional[SupportedCountry] = None
    provider: Optional[SupportedProvider] = None
