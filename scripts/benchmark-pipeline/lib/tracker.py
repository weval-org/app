"""Tracking system for the benchmark pipeline."""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from .models import Paper, PaperStatus, TrackingDatabase, TrackingEntry
from .utils import now_iso, truncate

logger = logging.getLogger(__name__)


class Tracker:
    """CRUD operations on the tracking YAML file."""

    def __init__(self, tracking_path: str | Path):
        self.path = Path(tracking_path)
        self.db = self._load()

    def _load(self) -> TrackingDatabase:
        """Load tracking database from YAML file."""
        if not self.path.exists():
            logger.info(f"Creating new tracking file: {self.path}")
            self.path.parent.mkdir(parents=True, exist_ok=True)
            db = TrackingDatabase()
            self._save(db)
            return db

        with open(self.path, "r") as f:
            raw = yaml.safe_load(f)

        if not raw:
            return TrackingDatabase()

        return TrackingDatabase(**raw)

    def _save(self, db: TrackingDatabase | None = None) -> None:
        """Save tracking database to YAML file."""
        if db is None:
            db = self.db
        db.last_updated = now_iso()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w") as f:
            yaml.dump(
                db.model_dump(mode="json"),
                f,
                default_flow_style=False,
                sort_keys=False,
                allow_unicode=True,
            )

    def save(self) -> None:
        """Public save method."""
        self._save()

    def get_entry(self, paper_id: str) -> TrackingEntry | None:
        """Get a tracking entry by paper ID."""
        for entry in self.db.papers:
            if entry.paper_id == paper_id:
                return entry
        return None

    def has_paper(self, paper_id: str) -> bool:
        """Check if a paper is already tracked."""
        return self.get_entry(paper_id) is not None

    def add_paper(self, paper: Paper) -> TrackingEntry:
        """Add a new paper to tracking. Returns the new entry."""
        if self.has_paper(paper.paper_id):
            logger.warning(f"Paper {paper.paper_id} already tracked, skipping")
            return self.get_entry(paper.paper_id)  # type: ignore

        entry = TrackingEntry(
            paper_id=paper.paper_id,
            title=paper.title,
            authors=paper.authors,
            arxiv_url=paper.arxiv_url,
            pdf_url=paper.pdf_url,
            doi=paper.doi,
            categories=paper.categories,
            abstract_snippet=truncate(paper.abstract),
            citation_count=paper.citation_count,
            influential_citation_count=paper.influential_citation_count,
            status=PaperStatus.DISCOVERED,
        )
        self.db.papers.append(entry)
        self._save()
        logger.info(f"Added paper: {paper.paper_id} - {paper.title}")
        return entry

    def update_status(
        self, paper_id: str, status: PaperStatus, **kwargs: object
    ) -> TrackingEntry | None:
        """Update a paper's status and optional fields."""
        entry = self.get_entry(paper_id)
        if not entry:
            logger.error(f"Paper {paper_id} not found in tracking")
            return None

        entry.status = status
        entry.last_updated = now_iso()

        for key, value in kwargs.items():
            if hasattr(entry, key):
                setattr(entry, key, value)

        self._save()
        logger.debug(f"Updated {paper_id} -> {status.value}")
        return entry

    def get_papers_by_status(self, status: PaperStatus) -> list[TrackingEntry]:
        """Get all papers with a given status."""
        return [e for e in self.db.papers if e.status == status]

    def get_all_papers(self) -> list[TrackingEntry]:
        """Get all tracked papers."""
        return self.db.papers

    def get_status_summary(self) -> dict[str, int]:
        """Get counts by status."""
        summary: dict[str, int] = {}
        for entry in self.db.papers:
            key = entry.status.value
            summary[key] = summary.get(key, 0) + 1
        return summary
