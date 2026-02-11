#!/usr/bin/env python3
"""Weval Benchmark Pipeline - Automated paper-to-Blueprint conversion.

Usage:
    python pipeline.py discover --query "LLM benchmark" --max-results 50
    python pipeline.py download --all-discovered
    python pipeline.py analyze --all-downloaded
    python pipeline.py generate --all-analyzed --validate
    python pipeline.py run --query "LLM benchmark" --max-results 20
    python pipeline.py status [--filter analyzed]
    python pipeline.py retry --all-failed
    python pipeline.py submit --paper-id 2401.12345
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

# Add the script directory to path so lib imports work
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from lib.models import PaperStatus, PipelineConfig
from lib.tracker import Tracker

console = Console()
logger = logging.getLogger("benchmark-pipeline")


def load_config(config_path: str | None = None) -> PipelineConfig:
    """Load pipeline configuration from YAML file."""
    path = Path(config_path) if config_path else SCRIPT_DIR / "config.yaml"
    if not path.exists():
        logger.warning(f"Config file not found: {path}, using defaults")
        return PipelineConfig()

    with open(path, "r") as f:
        raw = yaml.safe_load(f)

    return PipelineConfig(
        default_max_results=raw.get("discovery", {}).get("default_max_results", 50),
        default_categories=raw.get("discovery", {}).get(
            "default_categories", ["cs.CL", "cs.AI", "cs.LG"]
        ),
        min_citations=raw.get("discovery", {}).get("min_citations", 5),
        queries=raw.get("discovery", {}).get("queries", []),
        sufficiency_model=raw.get("gemini", {}).get(
            "sufficiency_model", "gemini-2.0-flash"
        ),
        analysis_model=raw.get("gemini", {}).get(
            "analysis_model", "gemini-2.5-flash-preview-05-20"
        ),
        generation_model=raw.get("gemini", {}).get(
            "generation_model", "gemini-2.5-flash-preview-05-20"
        ),
        gemini_temperature=raw.get("gemini", {}).get("temperature", 0.1),
        gemini_max_output_tokens=raw.get("gemini", {}).get("max_output_tokens", 8192),
        retry_max_attempts=raw.get("gemini", {}).get("retry_max_attempts", 5),
        retry_base_delay_seconds=raw.get("gemini", {}).get(
            "retry_base_delay_seconds", 2
        ),
        temp_pdf_dir=raw.get("paths", {}).get(
            "temp_pdf_dir", "/tmp/weval-benchmark-papers"
        ),
        tracking_file=raw.get("paths", {}).get("tracking_file", "data/tracking.yaml"),
        analyses_dir=raw.get("paths", {}).get("analyses_dir", "data/analyses"),
        output_dir=raw.get("paths", {}).get("output_dir", "output/blueprints"),
        prompts_dir=raw.get("paths", {}).get("prompts_dir", "prompts"),
        default_models=raw.get("blueprint", {}).get("default_models", ["CORE"]),
        default_tags=raw.get("blueprint", {}).get(
            "default_tags", ["benchmark", "automated-extraction"]
        ),
        configs_repo=raw.get("github", {}).get("configs_repo", "weval-org/configs"),
        configs_local_path=raw.get("github", {}).get("configs_local_path", ""),
        branch_prefix=raw.get("github", {}).get(
            "branch_prefix", "benchmark-pipeline"
        ),
    )


def resolve_path(config: PipelineConfig, path_attr: str) -> Path:
    """Resolve a config path relative to the script directory."""
    value = getattr(config, path_attr)
    path = Path(value)
    if path.is_absolute():
        return path
    return SCRIPT_DIR / path


def get_gemini_client(config: PipelineConfig):
    """Create a Gemini client from config."""
    from lib.gemini_client import GeminiClient

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        console.print("[red]Error: GEMINI_API_KEY or GOOGLE_API_KEY not set. Set it in .env or environment.[/red]")
        sys.exit(1)

    return GeminiClient(
        api_key=api_key,
        default_model=config.analysis_model,
        temperature=config.gemini_temperature,
        max_output_tokens=config.gemini_max_output_tokens,
        max_retries=config.retry_max_attempts,
        base_delay=config.retry_base_delay_seconds,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Subcommands
# ──────────────────────────────────────────────────────────────────────────────


def cmd_discover(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Discover benchmark papers from arXiv."""
    from lib.discovery import discover_papers

    tracker = Tracker(resolve_path(config, "tracking_file"))

    s2_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    papers = discover_papers(
        config=config,
        query=args.query,
        max_results=args.max_results,
        s2_api_key=s2_key,
    )

    added = 0
    skipped = 0
    for paper in papers:
        if tracker.has_paper(paper.paper_id):
            skipped += 1
            continue
        tracker.add_paper(paper)
        added += 1

    console.print(
        f"\n[green]Discovery complete:[/green] {added} new papers added, "
        f"{skipped} already tracked, {len(papers)} total found"
    )


def cmd_download(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Download PDFs for discovered papers."""
    from lib.downloader import download_pdf

    tracker = Tracker(resolve_path(config, "tracking_file"))

    if args.paper_id:
        entries = [tracker.get_entry(args.paper_id)]
        entries = [e for e in entries if e]
    else:
        entries = tracker.get_papers_by_status(PaperStatus.DISCOVERED)

    if not entries:
        console.print("[yellow]No papers to download.[/yellow]")
        return

    console.print(f"Downloading {len(entries)} papers...")

    success = 0
    for entry in entries:
        tracker.update_status(entry.paper_id, PaperStatus.DOWNLOADING)

        from lib.models import Paper

        paper = Paper(
            paper_id=entry.paper_id,
            title=entry.title,
            authors=entry.authors,
            abstract=entry.abstract_snippet,
            arxiv_url=entry.arxiv_url,
            pdf_url=entry.pdf_url,
            categories=entry.categories,
        )
        pdf_path = download_pdf(paper, config.temp_pdf_dir)

        if pdf_path:
            tracker.update_status(entry.paper_id, PaperStatus.DOWNLOADED)
            success += 1
        else:
            tracker.update_status(
                entry.paper_id,
                PaperStatus.SKIPPED,
                reason="PDF download failed",
            )

    console.print(f"\n[green]Download complete:[/green] {success}/{len(entries)} succeeded")


def cmd_analyze(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Analyze downloaded papers with Gemini."""
    from lib.analyzer import analyze_paper, save_analysis

    tracker = Tracker(resolve_path(config, "tracking_file"))
    client = get_gemini_client(config)

    if args.paper_id:
        entries = [tracker.get_entry(args.paper_id)]
        entries = [e for e in entries if e]
    else:
        entries = tracker.get_papers_by_status(PaperStatus.DOWNLOADED)

    if not entries:
        console.print("[yellow]No papers to analyze.[/yellow]")
        return

    console.print(f"Analyzing {len(entries)} papers with Gemini...")

    analyzed = 0
    insufficient = 0
    failed = 0

    for entry in entries:
        pdf_filename = f"{entry.paper_id.replace('/', '_')}.pdf"
        pdf_path = Path(config.temp_pdf_dir) / pdf_filename

        if not pdf_path.exists():
            console.print(f"[red]PDF not found for {entry.paper_id}: {pdf_path}[/red]")
            tracker.update_status(
                entry.paper_id, PaperStatus.SKIPPED, reason="PDF not found locally"
            )
            failed += 1
            continue

        tracker.update_status(entry.paper_id, PaperStatus.ANALYZING)

        try:
            # Use prompts_dir relative to script directory
            config_with_resolved_prompts = config.model_copy()
            config_with_resolved_prompts.prompts_dir = str(
                resolve_path(config, "prompts_dir")
            )

            analysis = analyze_paper(
                client=client,
                paper_id=entry.paper_id,
                pdf_path=pdf_path,
                config=config_with_resolved_prompts,
            )

            # Save analysis
            analysis_path = save_analysis(
                analysis, resolve_path(config, "analyses_dir")
            )

            if analysis.sufficiency.is_sufficient:
                tracker.update_status(
                    entry.paper_id,
                    PaperStatus.ANALYZED,
                    analysis_path=str(analysis_path),
                    sufficiency_score=analysis.sufficiency.confidence,
                    prompt_count=len(analysis.prompts),
                    has_explicit_rubric=analysis.sufficiency.has_scoring_criteria,
                )
                analyzed += 1
                console.print(
                    f"  [green]✓[/green] {entry.paper_id}: {len(analysis.prompts)} prompts extracted"
                )
            else:
                tracker.update_status(
                    entry.paper_id,
                    PaperStatus.INSUFFICIENT_DATA,
                    analysis_path=str(analysis_path),
                    reason=analysis.sufficiency.reason,
                    sufficiency_score=analysis.sufficiency.confidence,
                )
                insufficient += 1
                console.print(
                    f"  [yellow]–[/yellow] {entry.paper_id}: insufficient ({analysis.sufficiency.reason})"
                )

        except Exception as e:
            logger.error(f"Analysis failed for {entry.paper_id}: {e}")
            tracker.update_status(
                entry.paper_id,
                PaperStatus.DOWNLOADED,  # Roll back
                reason=f"Analysis failed: {str(e)[:200]}",
            )
            failed += 1
            console.print(f"  [red]✗[/red] {entry.paper_id}: {e}")

    console.print(
        f"\n[green]Analysis complete:[/green] {analyzed} analyzed, "
        f"{insufficient} insufficient, {failed} failed"
    )


def cmd_generate(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Generate Blueprint YAML from analyses."""
    from lib.analyzer import load_analysis
    from lib.blueprint_generator import (
        blueprint_filename_for_paper,
        generate_blueprint_deterministic,
        generate_blueprint_via_gemini,
        write_blueprint,
    )
    from lib.validators import validate_blueprint_yaml

    tracker = Tracker(resolve_path(config, "tracking_file"))

    if args.paper_id:
        entries = [tracker.get_entry(args.paper_id)]
        entries = [e for e in entries if e]
    else:
        entries = tracker.get_papers_by_status(PaperStatus.ANALYZED)

    if not entries:
        console.print("[yellow]No analyzed papers to generate Blueprints for.[/yellow]")
        return

    # Only need Gemini client if not using deterministic mode
    client = None
    if not args.deterministic:
        client = get_gemini_client(config)

    console.print(f"Generating Blueprints for {len(entries)} papers...")

    generated = 0
    failed = 0

    for entry in entries:
        # Load analysis
        analysis = load_analysis(resolve_path(config, "analyses_dir"), entry.paper_id)
        if not analysis:
            console.print(f"[red]No analysis found for {entry.paper_id}[/red]")
            failed += 1
            continue

        tracker.update_status(entry.paper_id, PaperStatus.CONVERTING)

        try:
            # Generate Blueprint YAML
            config_with_resolved_prompts = config.model_copy()
            config_with_resolved_prompts.prompts_dir = str(
                resolve_path(config, "prompts_dir")
            )

            if args.deterministic or not client:
                yaml_content = generate_blueprint_deterministic(
                    analysis, entry, config_with_resolved_prompts
                )
            else:
                yaml_content = generate_blueprint_via_gemini(
                    client, analysis, entry, config_with_resolved_prompts
                )

            # Validate if requested
            if args.validate:
                errors = validate_blueprint_yaml(yaml_content)
                if errors:
                    console.print(
                        f"  [red]✗[/red] {entry.paper_id}: validation failed"
                    )
                    for err in errors:
                        console.print(f"      {err}")

                    # Try deterministic fallback if Gemini output was invalid
                    if not args.deterministic and client:
                        console.print(
                            f"      Trying deterministic fallback..."
                        )
                        yaml_content = generate_blueprint_deterministic(
                            analysis, entry, config_with_resolved_prompts
                        )
                        errors = validate_blueprint_yaml(yaml_content)
                        if errors:
                            tracker.update_status(
                                entry.paper_id,
                                PaperStatus.ANALYZED,  # Roll back
                                reason=f"Blueprint validation failed: {'; '.join(errors[:3])}",
                            )
                            failed += 1
                            continue

            # Write Blueprint
            filename = blueprint_filename_for_paper(analysis, entry)
            output_path = write_blueprint(
                yaml_content, resolve_path(config, "output_dir"), filename
            )

            tracker.update_status(
                entry.paper_id,
                PaperStatus.READY_FOR_REVIEW,
                blueprint_filename=filename,
                blueprint_path=str(output_path),
            )
            generated += 1
            console.print(f"  [green]✓[/green] {entry.paper_id} -> {filename}")

        except Exception as e:
            logger.error(f"Generation failed for {entry.paper_id}: {e}")
            tracker.update_status(
                entry.paper_id,
                PaperStatus.ANALYZED,  # Roll back
                reason=f"Generation failed: {str(e)[:200]}",
            )
            failed += 1
            console.print(f"  [red]✗[/red] {entry.paper_id}: {e}")

    console.print(
        f"\n[green]Generation complete:[/green] {generated} Blueprints created, "
        f"{failed} failed"
    )


def cmd_run(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Run the full pipeline: discover -> download -> analyze -> generate."""
    stop_after = getattr(args, "stop_after", None)

    console.print("[bold]Running full benchmark pipeline...[/bold]\n")

    # Stage 1: Discover
    console.print("[bold cyan]Stage 1: Discovery[/bold cyan]")
    cmd_discover(args, config)

    if stop_after == "discover":
        return

    # Stage 2: Download
    console.print("\n[bold cyan]Stage 2: Download[/bold cyan]")
    download_args = argparse.Namespace(paper_id=None)
    cmd_download(download_args, config)

    if stop_after == "download":
        return

    # Stage 3: Analyze
    console.print("\n[bold cyan]Stage 3: Analysis[/bold cyan]")
    analyze_args = argparse.Namespace(paper_id=None)
    cmd_analyze(analyze_args, config)

    if stop_after == "analyze":
        return

    # Stage 4: Generate
    console.print("\n[bold cyan]Stage 4: Blueprint Generation[/bold cyan]")
    generate_args = argparse.Namespace(
        paper_id=None, validate=True, deterministic=False
    )
    cmd_generate(generate_args, config)


def cmd_status(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Show tracking status summary."""
    tracker = Tracker(resolve_path(config, "tracking_file"))

    if args.paper_id:
        entry = tracker.get_entry(args.paper_id)
        if not entry:
            console.print(f"[red]Paper {args.paper_id} not found[/red]")
            return
        _print_paper_detail(entry)
        return

    papers = tracker.get_all_papers()
    if not papers:
        console.print("[yellow]No papers tracked yet.[/yellow]")
        return

    # Summary
    summary = tracker.get_status_summary()
    console.print(f"\n[bold]Tracking {len(papers)} papers:[/bold]")
    for status, count in sorted(summary.items()):
        console.print(f"  {status}: {count}")

    # Table
    console.print()
    table = Table(title="Papers")
    table.add_column("ID", style="cyan", no_wrap=True)
    table.add_column("Title", max_width=50)
    table.add_column("Status", style="bold")
    table.add_column("Citations")
    table.add_column("Prompts")
    table.add_column("Blueprint")

    for entry in papers:
        if args.filter and entry.status.value != args.filter:
            continue

        status_style = {
            "discovered": "white",
            "downloaded": "blue",
            "analyzed": "green",
            "ready_for_review": "bold green",
            "pr_created": "bold cyan",
            "uploaded": "bold magenta",
            "insufficient_data": "yellow",
            "skipped": "dim",
            "denied": "red",
        }.get(entry.status.value, "white")

        table.add_row(
            entry.paper_id,
            entry.title[:50],
            f"[{status_style}]{entry.status.value}[/{status_style}]",
            str(entry.citation_count or "–"),
            str(entry.prompt_count or "–"),
            entry.blueprint_filename or "–",
        )

    console.print(table)


def cmd_retry(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Retry failed papers."""
    tracker = Tracker(resolve_path(config, "tracking_file"))

    if args.paper_id:
        entry = tracker.get_entry(args.paper_id)
        if not entry:
            console.print(f"[red]Paper {args.paper_id} not found[/red]")
            return
        entries = [entry]
    else:
        # Find papers that failed at any stage
        failed_statuses = [PaperStatus.INSUFFICIENT_DATA, PaperStatus.SKIPPED]
        entries = []
        for status in failed_statuses:
            entries.extend(tracker.get_papers_by_status(status))

    if not entries:
        console.print("[yellow]No failed papers to retry.[/yellow]")
        return

    console.print(f"Resetting {len(entries)} papers for retry...")

    from_stage = getattr(args, "from_stage", "download")
    reset_status = {
        "download": PaperStatus.DISCOVERED,
        "analyze": PaperStatus.DOWNLOADED,
        "generate": PaperStatus.ANALYZED,
    }.get(from_stage, PaperStatus.DISCOVERED)

    for entry in entries:
        tracker.update_status(entry.paper_id, reset_status, reason="")
        console.print(f"  Reset {entry.paper_id} -> {reset_status.value}")

    console.print(f"\n[green]Reset {len(entries)} papers. Run the appropriate stage to retry.[/green]")


def cmd_submit(args: argparse.Namespace, config: PipelineConfig) -> None:
    """Create PR for a Blueprint."""
    from lib.analyzer import load_analysis
    from lib.pr_creator import create_blueprint_pr

    tracker = Tracker(resolve_path(config, "tracking_file"))

    if args.paper_id:
        entries = [tracker.get_entry(args.paper_id)]
        entries = [e for e in entries if e]
    else:
        entries = tracker.get_papers_by_status(PaperStatus.APPROVED)

    if not entries:
        console.print("[yellow]No papers ready for submission. Use 'status' to check.[/yellow]")
        return

    for entry in entries:
        if not entry.blueprint_path:
            console.print(f"[red]No Blueprint path for {entry.paper_id}[/red]")
            continue

        blueprint_path = Path(entry.blueprint_path)
        if not blueprint_path.exists():
            console.print(f"[red]Blueprint file not found: {blueprint_path}[/red]")
            continue

        analysis = load_analysis(resolve_path(config, "analyses_dir"), entry.paper_id)
        if not analysis:
            console.print(f"[red]No analysis found for {entry.paper_id}[/red]")
            continue

        console.print(f"Creating PR for {entry.paper_id}...")
        pr_url = create_blueprint_pr(blueprint_path, entry, analysis, config)

        if pr_url:
            tracker.update_status(entry.paper_id, PaperStatus.PR_CREATED, pr_url=pr_url)
            console.print(f"  [green]✓[/green] PR created: {pr_url}")
        else:
            console.print(f"  [red]✗[/red] PR creation failed for {entry.paper_id}")


def _print_paper_detail(entry) -> None:
    """Print detailed info about a tracked paper."""
    console.print(f"\n[bold]{entry.title}[/bold]")
    console.print(f"  Paper ID:    {entry.paper_id}")
    console.print(f"  Authors:     {', '.join(entry.authors)}")
    console.print(f"  arXiv URL:   {entry.arxiv_url}")
    console.print(f"  Status:      [bold]{entry.status.value}[/bold]")
    if entry.reason:
        console.print(f"  Reason:      {entry.reason}")
    console.print(f"  Citations:   {entry.citation_count or 'N/A'}")
    console.print(f"  Prompts:     {entry.prompt_count or 'N/A'}")
    if entry.blueprint_filename:
        console.print(f"  Blueprint:   {entry.blueprint_filename}")
    if entry.pr_url:
        console.print(f"  PR URL:      {entry.pr_url}")
    console.print(f"  Discovered:  {entry.discovery_date}")
    console.print(f"  Updated:     {entry.last_updated}")


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────


def main() -> None:
    # Load .env if present
    load_dotenv(SCRIPT_DIR / ".env")

    parser = argparse.ArgumentParser(
        description="Weval Benchmark Pipeline - Automated paper-to-Blueprint conversion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--config", type=str, default=None, help="Path to config.yaml"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Verbose output"
    )
    parser.add_argument(
        "-q", "--quiet", action="store_true", help="Quiet output (warnings only)"
    )

    subparsers = parser.add_subparsers(dest="command", help="Pipeline subcommands")

    # discover
    p_discover = subparsers.add_parser("discover", help="Search arXiv for benchmark papers")
    p_discover.add_argument("--query", "-Q", type=str, help="Search query")
    p_discover.add_argument(
        "--max-results", "-n", type=int, default=None, help="Max results"
    )

    # download
    p_download = subparsers.add_parser("download", help="Download PDFs")
    p_download.add_argument("--paper-id", type=str, help="Specific paper ID")

    # analyze
    p_analyze = subparsers.add_parser("analyze", help="Analyze papers with Gemini")
    p_analyze.add_argument("--paper-id", type=str, help="Specific paper ID")

    # generate
    p_generate = subparsers.add_parser("generate", help="Generate Blueprint YAML")
    p_generate.add_argument("--paper-id", type=str, help="Specific paper ID")
    p_generate.add_argument(
        "--validate", action="store_true", help="Validate generated Blueprints"
    )
    p_generate.add_argument(
        "--deterministic",
        action="store_true",
        help="Use deterministic generation (no Gemini)",
    )

    # run (full pipeline)
    p_run = subparsers.add_parser("run", help="Run full pipeline")
    p_run.add_argument("--query", "-Q", type=str, help="Search query")
    p_run.add_argument(
        "--max-results", "-n", type=int, default=None, help="Max results"
    )
    p_run.add_argument(
        "--stop-after",
        choices=["discover", "download", "analyze", "generate"],
        help="Stop after specified stage",
    )

    # status
    p_status = subparsers.add_parser("status", help="Show tracking status")
    p_status.add_argument("--paper-id", type=str, help="Specific paper ID")
    p_status.add_argument("--filter", type=str, help="Filter by status")

    # retry
    p_retry = subparsers.add_parser("retry", help="Retry failed papers")
    p_retry.add_argument("--paper-id", type=str, help="Specific paper ID")
    p_retry.add_argument(
        "--from-stage",
        choices=["download", "analyze", "generate"],
        default="download",
        help="Stage to restart from",
    )

    # submit
    p_submit = subparsers.add_parser("submit", help="Create PR for Blueprint")
    p_submit.add_argument("--paper-id", type=str, help="Specific paper ID")

    args = parser.parse_args()

    # Setup logging
    if args.quiet:
        log_level = logging.WARNING
    elif args.verbose:
        log_level = logging.DEBUG
    else:
        log_level = logging.INFO

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    if not args.command:
        parser.print_help()
        return

    config = load_config(args.config)

    # Dispatch
    commands = {
        "discover": cmd_discover,
        "download": cmd_download,
        "analyze": cmd_analyze,
        "generate": cmd_generate,
        "run": cmd_run,
        "status": cmd_status,
        "retry": cmd_retry,
        "submit": cmd_submit,
    }

    cmd_func = commands.get(args.command)
    if cmd_func:
        cmd_func(args, config)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
