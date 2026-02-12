"""PDF download for benchmark papers."""

from __future__ import annotations

import logging
from pathlib import Path

import requests

from .models import Paper

logger = logging.getLogger(__name__)


def ensure_temp_dir(temp_dir: str) -> Path:
    """Create temp directory for PDFs if it doesn't exist."""
    path = Path(temp_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def download_pdf(paper: Paper, temp_dir: str | Path) -> Path | None:
    """Download a paper's PDF to the temp directory.

    Returns the local path to the PDF, or None if download failed.
    """
    temp_path = Path(temp_dir)
    temp_path.mkdir(parents=True, exist_ok=True)

    filename = f"{paper.paper_id.replace('/', '_')}.pdf"
    pdf_path = temp_path / filename

    if pdf_path.exists():
        logger.info(f"PDF already exists: {pdf_path}")
        return pdf_path

    logger.info(f"Downloading {paper.paper_id}: {paper.pdf_url}")
    try:
        resp = requests.get(paper.pdf_url, timeout=60, stream=True)
        resp.raise_for_status()

        # Verify it looks like a PDF
        content_type = resp.headers.get("content-type", "")
        if "pdf" not in content_type and not resp.content[:5] == b"%PDF-":
            logger.warning(
                f"Downloaded content for {paper.paper_id} does not appear to be a PDF"
            )

        with open(pdf_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        size_mb = pdf_path.stat().st_size / (1024 * 1024)
        logger.info(f"Downloaded {paper.paper_id} ({size_mb:.1f} MB) -> {pdf_path}")
        return pdf_path

    except requests.RequestException as e:
        logger.error(f"Failed to download {paper.paper_id}: {e}")
        if pdf_path.exists():
            pdf_path.unlink()
        return None
