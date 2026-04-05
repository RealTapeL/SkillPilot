#!/usr/bin/env python3
"""
SkillPilot 真实性能基准测试

运行实际的路由测试，收集真实的性能数据
"""

import subprocess
import json
import time
import statistics
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Optional
import sys

@dataclass
class BenchmarkResult:
    query: str
    latency_ms: float
    skill: Optional[str]
    confidence: float
    method: str
    success: bool

def run_skillpilot_route(query: str, cli_path: Path) -> Optional[Dict]:
    """运行 skillpilot route 命令"""
    cmd = ["node", str(cli_path), "route", query, "--json"]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            # 从 stdout 中提取 JSON（多行 JSON 对象）
            stdout = result.stdout.strip()
            # 找到最后一个 { 开头的段落
            json_start = stdout.rfind('{')
            if json_start >= 0:
                json_str = stdout[json_start:]
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    pass
        return None
    except Exception as e:
        return None

def benchmark_query(query: str, cli_path: Path, iterations: int = 10) -> List[BenchmarkResult]:
    """对单个查询进行多次基准测试"""
    results = []
    
    for _ in range(iterations):
        start = time.perf_counter()
        data = run_skillpilot_route(query, cli_path)
        elapsed_ms = (time.perf_counter() - start) * 1000
        
        if data and data.get("skill"):
            results.append(BenchmarkResult(
                query=query,
                latency_ms=elapsed_ms,
                skill=data.get("skill", {}).get("name") if data.get("skill") else None,
                confidence=data.get("confidence", 0),
                method=data.get("method", "unknown"),
                success=True
            ))
        else:
            # 即使返回了结果但没有 skill，也算作成功（no-match）
            results.append(BenchmarkResult(
                query=query,
                latency_ms=elapsed_ms,
                skill=None,
                confidence=data.get("confidence", 0) if data else 0,
                method=data.get("method", "no-match") if data else "error",
                success=data is not None
            ))
    
    return results

def main():
    """主函数"""
    print("=" * 60)
    print("SkillPilot 真实性能基准测试")
    print("=" * 60)
    
    cli_path = Path(__file__).parent / "packages" / "cli" / "dist" / "index.js"
    
    if not cli_path.exists():
        print(f"错误: CLI 不存在于 {cli_path}")
        print("请先运行: pnpm run build")
        return 1
    
    # 确保索引存在
    test_skills = Path(__file__).parent / "test_openclaw_python" / "skills"
    if test_skills.exists():
        print(f"\n使用测试技能目录: {test_skills}")
        subprocess.run(
            ["node", str(cli_path), "index", str(test_skills)],
            capture_output=True
        )
    
    # 测试查询
    test_queries = [
        ("create issue", "github"),
        ("send slack message", "slack"),
        ("read file", "file-read"),
        ("write file", "file-write"),
        ("build docker", "docker"),
        ("create a GitHub issue for the bug", "github"),
        ("notify team on slack", "slack"),
        ("show me the README content", "file-read"),
        ("deploy to production", None),  # 无匹配
    ]
    
    iterations = 10
    all_results = []
    
    print(f"\n运行 {len(test_queries)} 个查询，每个 {iterations} 次...\n")
    
    for query, expected in test_queries:
        print(f"测试: \"{query}\"", end=" ")
        results = benchmark_query(query, cli_path, iterations)
        all_results.extend(results)
        
        # 计算统计
        latencies = [r.latency_ms for r in results if r.success]
        if latencies:
            avg = statistics.mean(latencies)
            p95 = sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) > 1 else latencies[0]
            print(f"→ 平均: {avg:.1f}ms, P95: {p95:.1f}ms")
        else:
            print("→ 失败")
    
    # 汇总统计
    print("\n" + "=" * 60)
    print("汇总结果")
    print("=" * 60)
    
    successful = [r for r in all_results if r.success and r.skill]
    failed = [r for r in all_results if not r.success or not r.skill]
    
    if successful:
        latencies = [r.latency_ms for r in successful]
        print(f"\n成功路由: {len(successful)}/{len(all_results)}")
        print(f"准确率: {len(successful)/len(all_results)*100:.1f}%")
        print(f"\n延迟统计:")
        print(f"  平均: {statistics.mean(latencies):.2f}ms")
        print(f"  中位数: {statistics.median(latencies):.2f}ms")
        print(f"  最小: {min(latencies):.2f}ms")
        print(f"  最大: {max(latencies):.2f}ms")
        
        sorted_latencies = sorted(latencies)
        p95_idx = int(len(sorted_latencies) * 0.95)
        p99_idx = int(len(sorted_latencies) * 0.99)
        print(f"  P95: {sorted_latencies[p95_idx]:.2f}ms")
        print(f"  P99: {sorted_latencies[p99_idx]:.2f}ms")
        
        # 按方法统计
        fast_results = [r for r in successful if r.method == "fast"]
        semantic_results = [r for r in successful if r.method == "semantic"]
        
        print(f"\n按路由方法:")
        if fast_results:
            fast_lats = [r.latency_ms for r in fast_results]
            print(f"  Fast Path: {len(fast_results)}次, 平均{statistics.mean(fast_lats):.2f}ms")
        if semantic_results:
            sem_lats = [r.latency_ms for r in semantic_results]
            print(f"  Semantic Path: {len(semantic_results)}次, 平均{statistics.mean(sem_lats):.2f}ms")
    
    if failed:
        print(f"\n失败/无匹配: {len(failed)}次")
    
    # 输出 JSON 供后续使用
    output = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_tests": len(all_results),
        "successful": len(successful),
        "failed": len(failed),
        "accuracy": len(successful)/len(all_results)*100 if all_results else 0,
        "latency": {
            "mean_ms": statistics.mean([r.latency_ms for r in successful]) if successful else 0,
            "median_ms": statistics.median([r.latency_ms for r in successful]) if successful else 0,
            "min_ms": min([r.latency_ms for r in successful]) if successful else 0,
            "max_ms": max([r.latency_ms for r in successful]) if successful else 0,
            "p95_ms": sorted([r.latency_ms for r in successful])[int(len(successful)*0.95)] if successful and len(successful) > 1 else 0,
        },
        "results": [
            {
                "query": r.query,
                "skill": r.skill,
                "confidence": r.confidence,
                "method": r.method,
                "latency_ms": r.latency_ms
            }
            for r in all_results
        ]
    }
    
    output_file = Path(__file__).parent / "benchmark_results.json"
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\n结果已保存到: {output_file}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
