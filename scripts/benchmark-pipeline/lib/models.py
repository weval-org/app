"""Pydantic data models for the benchmark pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PaperStatus(str, Enum):
    DISCOVERED = "discovered"
    DOWNLOADING = "downloading"
    DOWNLOADED = "downloaded"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    INSUFFICIENT_DATA = "insufficient_data"
    CONVERTING = "converting"
    READY_FOR_REVIEW = "ready_for_review"
    APPROVED = "approved"
    PR_CREATED = "pr_created"
    UPLOADED = "uploaded"
    DENIED = "denied"
    SKIPPED = "skipped"


class Paper(BaseModel):
    """A discovered paper from arXiv + Semantic Scholar."""

    paper_id: str  # arXiv ID e.g. "2401.12345"
    title: str
    authors: list[str]
    abstract: str
    arxiv_url: str
    pdf_url: str
    categories: list[str] = Field(default_factory=list)
    published: Optional[str] = None  # ISO date
    doi: Optional[str] = None
    citation_count: Optional[int] = None
    influential_citation_count: Optional[int] = None
    tldr: Optional[str] = None


class TrackingEntry(BaseModel):
    """A tracked paper in the pipeline."""

    paper_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    arxiv_url: str
    pdf_url: str = ""
    doi: Optional[str] = None
    categories: list[str] = Field(default_factory=list)
    abstract_snippet: str = ""
    citation_count: Optional[int] = None
    influential_citation_count: Optional[int] = None

    status: PaperStatus = PaperStatus.DISCOVERED
    reason: str = ""

    analysis_path: Optional[str] = None
    blueprint_filename: Optional[str] = None
    blueprint_path: Optional[str] = None
    pr_url: Optional[str] = None

    discovery_date: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    last_updated: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    sufficiency_score: Optional[float] = None
    prompt_count: Optional[int] = None
    has_explicit_rubric: Optional[bool] = None


class TrackingDatabase(BaseModel):
    """The full tracking YAML structure."""

    version: int = 1
    last_updated: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    papers: list[TrackingEntry] = Field(default_factory=list)


class SufficiencyResult(BaseModel):
    """Result of the sufficiency assessment."""

    is_sufficient: bool
    confidence: float = 0.0  # 0-1
    has_explicit_prompts: bool = False
    has_scoring_criteria: bool = False
    has_metrics: bool = False
    has_gold_answers: bool = False
    benchmark_name: Optional[str] = None
    reason: str = ""


class ExtractedPrompt(BaseModel):
    """A single evaluation prompt extracted from a paper."""

    id: str = ""
    prompt_text: str
    system_prompt: Optional[str] = None
    ideal_response: Optional[str] = None
    scoring_criteria: list[str] = Field(default_factory=list)
    category: Optional[str] = None
    source_section: Optional[str] = None


class PaperAnalysis(BaseModel):
    """Full analysis of a paper's evaluation methodology."""

    paper_id: str
    benchmark_name: str
    description: str = ""
    evaluation_type: str = ""  # MCQ, open-ended, rubric-based, etc.
    metrics: list[str] = Field(default_factory=list)
    prompts: list[ExtractedPrompt] = Field(default_factory=list)
    system_prompt: Optional[str] = None
    scoring_methodology: str = ""
    sufficiency: SufficiencyResult = Field(default_factory=SufficiencyResult)
    tags: list[str] = Field(default_factory=list)


class PipelineConfig(BaseModel):
    """Loaded pipeline configuration."""

    # Discovery
    default_max_results: int = 50
    default_categories: list[str] = Field(
        default_factory=lambda: ["cs.CL", "cs.AI", "cs.LG"]
    )
    min_citations: int = 5
    queries: list[str] = Field(default_factory=list)

    # Gemini
    sufficiency_model: str = "gemini-2.0-flash"
    analysis_model: str = "gemini-2.5-flash"
    generation_model: str = "gemini-2.5-flash"
    gemini_temperature: float = 0.1
    gemini_max_output_tokens: int = 8192
    retry_max_attempts: int = 5
    retry_base_delay_seconds: int = 2

    # Paths
    temp_pdf_dir: str = "/tmp/weval-benchmark-papers"
    tracking_file: str = "data/tracking.yaml"
    analyses_dir: str = "data/analyses"
    output_dir: str = "output/blueprints"
    prompts_dir: str = "prompts"

    # Blueprint
    default_models: list[str] = Field(default_factory=lambda: ["CORE"])
    default_tags: list[str] = Field(
        default_factory=lambda: ["benchmark", "automated-extraction"]
    )

    # GitHub
    configs_repo: str = "weval-org/configs"
    configs_local_path: str = ""
    branch_prefix: str = "benchmark-pipeline"
