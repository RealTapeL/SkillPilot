#!/usr/bin/env python3
"""
SkillPilot 性能基准测试

测试路由延迟、准确率等性能指标
"""

import time
import json
import statistics
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import subprocess

from rich.console import Console
from rich.table import Table
from rich.progress import Progress
from rich.panel import Panel

console = Console()


@dataclass
class BenchmarkResult:
    """基准测试结果"""
    query: str
    latency_ms: float
    skill: str
    confidence: float
    method: str


def skillpilot_route(query: str, cli_path: Path) -> Dict[str, Any]:
    """调用 SkillPilot 路由"""
    cmd = ["node", str(cli_path), "route", query, "--json"]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            return json.loads(result.stdout)
        return {}
    except Exception:
        return {}


def run_latency_test(queries: List[str], cli_path: Path, iterations: int = 5) -> Dict[str, Any]:
    """运行延迟测试"""
    console.print(f"\n[bold cyan]Running Latency Test ({iterations} iterations per query)...[/bold cyan]\n")
    
    all_latencies = []
    results = []
    
    with Progress() as progress:
        task = progress.add_task("[cyan]Testing...", total=len(queries) * iterations)
        
        for query in queries:
            query_latencies = []
            
            for _ in range(iterations):
                start = time.perf_counter()
                result = skillpilot_route(query, cli_path)
                elapsed_ms = (time.perf_counter() - start) * 1000
                
                query_latencies.append(elapsed_ms)
                all_latencies.append(elapsed_ms)
                
                if result:
                    results.append(BenchmarkResult(
                        query=query,
                        latency_ms=elapsed_ms,
                        skill=result.get("skill", {}).get("name", "None"),
                        confidence=result.get("confidence", 0),
                        method=result.get("method", "unknown")
                    ))
                
                progress.update(task, advance=1)
    
    # 计算统计数据
    stats = {
        "count": len(all_latencies),
        "min_ms": min(all_latencies),
        "max_ms": max(all_latencies),
        "mean_ms": statistics.mean(all_latencies),
        "median_ms": statistics.median(all_latencies),
        "p95_ms": sorted(all_latencies)[int(len(all_latencies) * 0.95)],
        "p99_ms": sorted(all_latencies)[int(len(all_latencies) * 0.99)],
        "stdev_ms": statistics.stdev(all_latencies) if len(all_latencies) > 1 else 0
    }
    
    return stats, results


def run_throughput_test(queries: List[str], cli_path: Path, duration: int = 10) -> Dict[str, Any]:
    """运行吞吐量测试"""
    console.print(f"\n[bold cyan]Running Throughput Test ({duration} seconds)...[/bold cyan]\n")
    
    count = 0
    start_time = time.time()
    
    while time.time() - start_time < duration:
        for query in queries:
            skillpilot_route(query, cli_path)
            count += 1
            
            if time.time() - start_time >= duration:
                break
    
    elapsed = time.time() - start_time
    rps = count / elapsed
    
    return {
        "total_requests": count,
        "duration_seconds": elapsed,
        "requests_per_second": rps
    }


def print_latency_stats(stats: Dict[str, Any]):
    """打印延迟统计"""
    table = Table(title="Latency Statistics")
    table.add_column("Metric", style="cyan")
    table.add_column("Value (ms)", style="green", justify="right")
    
    table.add_row("Count", str(stats["count"]))
    table.add_row("Min", f"{stats['min_ms']:.2f}")
    table.add_row("Max", f"{stats['max_ms']:.2f}")
    table.add_row("Mean", f"{stats['mean_ms']:.2f}")
    table.add_row("Median", f"{stats['median_ms']:.2f}")
    table.add_row("P95", f"{stats['p95_ms']:.2f}")
    table.add_row("P99", f"{stats['p99_ms']:.2f}")
    table.add_row("Std Dev", f"{stats['stdev_ms']:.2f}")
    
    console.print(table)


def main():
    """主函数"""
    console.print("[bold cyan]" + "=" * 60)
    console.print("[bold cyan]SkillPilot Performance Benchmark")
    console.print("[bold cyan]" + "=" * 60)
    
    # 确定 CLI 路径
    cli_path = Path(__file__).parent.parent / "packages" / "cli" / "dist" / "index.js"
    
    if not cli_path.exists():
        console.print(f"[red]CLI not found at {cli_path}[/red]")
        console.print("[yellow]Please build the project first: pnpm run build[/yellow]")
        return 1
    
    # 测试查询
    test_queries = [
        "create a GitHub issue",
        "send Slack message",
        "read file content",
        "write to file",
        "build Docker image",
        "deploy to production",
        "run tests",
        "check CI status",
        "notify team",
        "open pull request"
    ]
    
    # 延迟测试
    latency_stats, results = run_latency_test(test_queries, cli_path, iterations=5)
    print_latency_stats(latency_stats)
    
    # 详细结果
    console.print("\n[bold]Detailed Results:[/bold]")
    table = Table()
    table.add_column("Query", style="cyan", max_width=30)
    table.add_column("Skill", style="magenta")
    table.add_column("Confidence", style="green")
    table.add_column("Method", style="blue")
    table.add_column("Avg Latency", style="yellow")
    
    for query in test_queries:
        query_results = [r for r in results if r.query == query]
        if query_results:
            avg_latency = statistics.mean([r.latency_ms for r in query_results])
            r = query_results[0]
            table.add_row(
                query[:30],
                r.skill or "None",
                f"{r.confidence:.2f}",
                r.method,
                f"{avg_latency:.1f}ms"
            )
    
    console.print(table)
    
    # 吞吐量测试
    throughput_stats = run_throughput_test(test_queries[:5], cli_path, duration=10)
    
    console.print("\n[bold]Throughput Test:[/bold]")
    throughput_table = Table()
    throughput_table.add_column("Metric", style="cyan")
    throughput_table.add_column("Value", style="green")
    
    throughput_table.add_row("Total Requests", str(throughput_stats["total_requests"]))
    throughput_table.add_row("Duration", f"{throughput_stats['duration_seconds']:.1f}s")
    throughput_table.add_row("Requests/sec", f"{throughput_stats['requests_per_second']:.1f}")
    
    console.print(throughput_table)
    
    # 保存结果
    output = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "latency": latency_stats,
        "throughput": throughput_stats
    }
    
    output_path = Path(__file__).parent / "results" / "benchmark.json"
    output_path.parent.mkdir(exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    
    console.print(f"\n[green]Results saved to {output_path}[/green]")
    
    # 性能评估
    console.print("\n[bold cyan]Performance Assessment:[/bold cyan]")
    
    mean_latency = latency_stats["mean_ms"]
    if mean_latency < 10:
        assessment = "[green]Excellent! < 10ms average latency[/green]"
    elif mean_latency < 25:
        assessment = "[green]Good! < 25ms average latency[/green]"
    elif mean_latency < 50:
        assessment = "[yellow]Acceptable. < 50ms average latency[/yellow]"
    else:
        assessment = "[red]Slow. > 50ms average latency[/red]"
    
    console.print(Panel(assessment, title="Assessment"))
    
    return 0


if __name__ == "__main__":
    exit(main())
