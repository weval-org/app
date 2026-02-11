"""Utility functions for the benchmark pipeline."""

import re
from datetime import datetime, timezone


def slugify(text: str, max_length: int = 60) -> str:
    """Convert text to a URL/filename-safe slug."""
    text = text.lower().strip()
    # Remove common prefixes that don't add value
    text = re.sub(r"^(a|an|the)\s+", "", text)
    # Replace non-alphanumeric with hyphens
    text = re.sub(r"[^a-z0-9]+", "-", text)
    # Remove leading/trailing hyphens
    text = text.strip("-")
    # Truncate to max length at word boundary
    if len(text) > max_length:
        text = text[:max_length].rsplit("-", 1)[0]
    return text


def format_arxiv_url(arxiv_id: str) -> str:
    """Format an arXiv ID into a full URL."""
    # Strip version suffix for canonical URL
    base_id = re.sub(r"v\d+$", "", arxiv_id)
    return f"https://arxiv.org/abs/{base_id}"


def format_arxiv_pdf_url(arxiv_id: str) -> str:
    """Format an arXiv ID into a PDF download URL."""
    base_id = re.sub(r"v\d+$", "", arxiv_id)
    return f"https://arxiv.org/pdf/{base_id}"


def now_iso() -> str:
    """Return current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def truncate(text: str, max_length: int = 200) -> str:
    """Truncate text to max_length, adding ellipsis if needed."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def format_authors_short(authors: list[str]) -> str:
    """Format author list for display: 'Smith et al.' or 'Smith & Doe'."""
    if not authors:
        return "Unknown"
    if len(authors) == 1:
        return _last_name(authors[0])
    if len(authors) == 2:
        return f"{_last_name(authors[0])} & {_last_name(authors[1])}"
    return f"{_last_name(authors[0])} et al."


def _last_name(full_name: str) -> str:
    """Extract last name from a full name string."""
    parts = full_name.strip().split()
    return parts[-1] if parts else full_name
