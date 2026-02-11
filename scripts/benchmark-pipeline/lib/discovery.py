"""Paper discovery via arXiv API and Semantic Scholar."""

from __future__ import annotations

import logging
import re
import time

import arxiv
import requests

from .models import Paper, PipelineConfig
from .utils import format_arxiv_pdf_url, format_arxiv_url

logger = logging.getLogger(__name__)

SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1"


def search_arxiv(
    query: str,
    max_results: int = 50,
    categories: list[str] | None = None,
) -> list[Paper]:
    """Search arXiv for benchmark papers."""
    # Build category filter
    cat_filter = ""
    if categories:
        cat_parts = [f"cat:{cat}" for cat in categories]
        cat_filter = f" AND ({' OR '.join(cat_parts)})"

    full_query = f"{query}{cat_filter}"
    logger.info(f"Searching arXiv: {full_query} (max {max_results})")

    client = arxiv.Client()
    search = arxiv.Search(
        query=full_query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance,
    )

    papers = []
    for result in client.results(search):
        # Extract arXiv ID from the entry_id URL
        arxiv_id = _extract_arxiv_id(result.entry_id)
        if not arxiv_id:
            continue

        paper = Paper(
            paper_id=arxiv_id,
            title=result.title.strip().replace("\n", " "),
            authors=[a.name for a in result.authors],
            abstract=result.summary.strip().replace("\n", " "),
            arxiv_url=format_arxiv_url(arxiv_id),
            pdf_url=format_arxiv_pdf_url(arxiv_id),
            categories=[c for c in result.categories],
            published=result.published.isoformat() if result.published else None,
            doi=result.doi,
        )
        papers.append(paper)

    logger.info(f"Found {len(papers)} papers on arXiv")
    return papers


def enrich_with_semantic_scholar(
    paper: Paper,
    api_key: str | None = None,
) -> Paper:
    """Enrich a paper with Semantic Scholar metadata."""
    arxiv_id = re.sub(r"v\d+$", "", paper.paper_id)
    url = f"{SEMANTIC_SCHOLAR_API}/paper/ARXIV:{arxiv_id}"
    params = {"fields": "citationCount,influentialCitationCount,tldr"}
    headers = {}
    if api_key:
        headers["x-api-key"] = api_key

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        if resp.status_code == 429:
            logger.warning("Semantic Scholar rate limit hit, waiting 3s...")
            time.sleep(3)
            resp = requests.get(url, params=params, headers=headers, timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            paper.citation_count = data.get("citationCount")
            paper.influential_citation_count = data.get("influentialCitationCount")
            if data.get("tldr"):
                paper.tldr = data["tldr"].get("text")
            logger.debug(
                f"Enriched {paper.paper_id}: {paper.citation_count} citations"
            )
        elif resp.status_code == 404:
            logger.debug(f"Paper {paper.paper_id} not found on Semantic Scholar")
        else:
            logger.warning(
                f"Semantic Scholar API error {resp.status_code} for {paper.paper_id}"
            )
    except requests.RequestException as e:
        logger.warning(f"Semantic Scholar request failed for {paper.paper_id}: {e}")

    return paper


def filter_candidates(
    papers: list[Paper],
    min_citations: int = 0,
) -> list[Paper]:
    """Filter papers to likely benchmark papers."""
    benchmark_keywords = [
        "benchmark",
        "evaluation",
        "eval",
        "dataset",
        "leaderboard",
        "test suite",
        "scoring",
        "rubric",
    ]

    filtered = []
    for paper in papers:
        # Skip if below citation threshold (when data available)
        if min_citations > 0 and paper.citation_count is not None:
            if paper.citation_count < min_citations:
                continue

        # Check title and abstract for benchmark-related keywords
        text = f"{paper.title} {paper.abstract}".lower()
        if any(kw in text for kw in benchmark_keywords):
            filtered.append(paper)

    logger.info(
        f"Filtered {len(papers)} -> {len(filtered)} candidate benchmark papers"
    )
    return filtered


def discover_papers(
    config: PipelineConfig,
    query: str | None = None,
    max_results: int | None = None,
    s2_api_key: str | None = None,
) -> list[Paper]:
    """Full discovery pipeline: search + enrich + filter."""
    q = query or (config.queries[0] if config.queries else "LLM benchmark evaluation")
    n = max_results or config.default_max_results

    # Search arXiv
    papers = search_arxiv(
        query=q,
        max_results=n,
        categories=config.default_categories,
    )

    # Enrich with Semantic Scholar (with rate limiting)
    for i, paper in enumerate(papers):
        papers[i] = enrich_with_semantic_scholar(paper, api_key=s2_api_key)
        if i < len(papers) - 1:
            time.sleep(0.5)  # Be nice to the API

    # Filter to likely benchmark papers
    papers = filter_candidates(papers, min_citations=config.min_citations)

    return papers


def _extract_arxiv_id(entry_id: str) -> str | None:
    """Extract arXiv ID from entry URL like http://arxiv.org/abs/2401.12345v1."""
    match = re.search(r"(\d{4}\.\d{4,5})(v\d+)?$", entry_id)
    if match:
        return match.group(1)
    # Also handle old-style IDs like hep-ph/9905221
    match = re.search(r"([a-z-]+/\d{7})(v\d+)?$", entry_id)
    if match:
        return match.group(1)
    return None
