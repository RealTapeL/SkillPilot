#!/usr/bin/env python3
"""
SkillPilot OpenClaw 集成测试

模拟 OpenClaw 环境，测试 SkillPilot 的路由表现
"""

import subprocess
import json
import time
import os
import sys
import webbrowser
import threading
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, List, Any
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, TaskID
from rich.panel import Panel

# Web server imports
try:
    from http.server import HTTPServer, SimpleHTTPRequestHandler
except ImportError:
    from BaseHTTPServer import HTTPServer
    from SimpleHTTPServer import SimpleHTTPRequestHandler

console = Console()


@dataclass
class RouteResult:
    """路由结果数据结构"""
    query: str
    skill: Optional[str]
    confidence: float
    method: str
    latency_ms: float
    success: bool
    error: Optional[str] = None


@dataclass
class TestCase:
    """测试用例"""
    query: str
    expected_skill: str
    description: str


class SkillPilotTester:
    """SkillPilot 测试器"""
    
    def __init__(self, skills_dir: str, use_local: bool = True):
        self.skills_dir = Path(skills_dir).absolute()
        self.use_local = use_local
        self.index_dir = Path.home() / ".skillpilot_test" / "index"
        self.results: List[RouteResult] = []
        
        # 确定 skillpilot 命令
        if use_local:
            # 使用本地构建版本
            cli_path = Path(__file__).parent.parent / "packages" / "cli" / "dist" / "index.js"
            self.skillpilot_cmd = ["node", str(cli_path)]
        else:
            # 使用全局安装的版本
            self.skillpilot_cmd = ["skillpilot"]
    
    def index_skills(self) -> bool:
        """索引技能目录"""
        console.print(f"[blue]Indexing skills from {self.skills_dir}...[/blue]")
        
        cmd = self.skillpilot_cmd + ["index", str(self.skills_dir)]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                console.print(f"[green]✓ Skills indexed successfully[/green]")
                return True
            else:
                console.print(f"[red]✗ Index failed: {result.stderr}[/red]")
                return False
        except Exception as e:
            console.print(f"[red]✗ Error during indexing: {e}[/red]")
            return False
    
    def route(self, query: str) -> RouteResult:
        """执行路由查询"""
        cmd = self.skillpilot_cmd + ["route", query, "--json"]
        
        start_time = time.time()
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            elapsed_ms = (time.time() - start_time) * 1000
            
            if result.returncode != 0:
                return RouteResult(
                    query=query,
                    skill=None,
                    confidence=0,
                    method="error",
                    latency_ms=elapsed_ms,
                    success=False,
                    error=result.stderr
                )
            
            # 解析 JSON 输出
            try:
                data = json.loads(result.stdout)
                return RouteResult(
                    query=query,
                    skill=data.get("skill", {}).get("name") if data.get("skill") else None,
                    confidence=data.get("confidence", 0),
                    method=data.get("method", "unknown"),
                    latency_ms=data.get("latencyMs", elapsed_ms),
                    success=True
                )
            except json.JSONDecodeError:
                return RouteResult(
                    query=query,
                    skill=None,
                    confidence=0,
                    method="parse_error",
                    latency_ms=elapsed_ms,
                    success=False,
                    error="Failed to parse JSON output"
                )
                
        except subprocess.TimeoutExpired:
            return RouteResult(
                query=query,
                skill=None,
                confidence=0,
                method="timeout",
                latency_ms=30000,
                success=False,
                error="Command timed out"
            )
        except Exception as e:
            return RouteResult(
                query=query,
                skill=None,
                confidence=0,
                method="exception",
                latency_ms=0,
                success=False,
                error=str(e)
            )
    
    def run_tests(self, test_cases: List[TestCase]) -> Dict[str, Any]:
        """运行测试用例"""
        console.print(f"\n[bold cyan]Running {len(test_cases)} test cases...[/bold cyan]\n")
        
        correct = 0
        total_latency = 0
        
        with Progress() as progress:
            task = progress.add_task("[cyan]Testing...", total=len(test_cases))
            
            for tc in test_cases:
                result = self.route(tc.query)
                self.results.append(result)
                
                is_correct = result.skill == tc.expected_skill
                if is_correct:
                    correct += 1
                
                total_latency += result.latency_ms
                
                status = "[green]✓[/green]" if is_correct else "[red]✗[/red]"
                progress.update(task, advance=1, description=f"{status} {tc.query[:40]}...")
        
        accuracy = (correct / len(test_cases)) * 100 if test_cases else 0
        avg_latency = total_latency / len(test_cases) if test_cases else 0
        
        return {
            "total": len(test_cases),
            "correct": correct,
            "accuracy": accuracy,
            "avg_latency_ms": avg_latency,
            "results": self.results
        }
    
    def print_results(self, stats: Dict[str, Any]):
        """打印测试结果"""
        console.print("\n[bold]=" * 60)
        console.print("[bold cyan]SkillPilot OpenClaw Test Results[/bold cyan]")
        console.print("[bold]=" * 60)
        
        # 摘要统计
        table = Table(title="Summary")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green")
        
        table.add_row("Total Tests", str(stats["total"]))
        table.add_row("Correct", str(stats["correct"]))
        table.add_row("Accuracy", f"{stats['accuracy']:.1f}%")
        table.add_row("Avg Latency", f"{stats['avg_latency_ms']:.1f}ms")
        
        console.print(table)
        
        # 详细结果
        console.print("\n[bold]Detailed Results:[/bold]")
        
        detail_table = Table()
        detail_table.add_column("Query", style="cyan", max_width=40)
        detail_table.add_column("Expected", style="blue")
        detail_table.add_column("Actual", style="magenta")
        detail_table.add_column("Confidence", style="green")
        detail_table.add_column("Latency", style="yellow")
        detail_table.add_column("Status", style="bold")
        
        for tc, result in zip(TEST_CASES, self.results):
            status = "[green]PASS[/green]" if result.skill == tc.expected_skill else "[red]FAIL[/red]"
            if not result.success:
                status = "[red]ERROR[/red]"
            
            detail_table.add_row(
                tc.query[:40],
                tc.expected_skill,
                result.skill or "None",
                f"{result.confidence:.2f}",
                f"{result.latency_ms:.0f}ms",
                status
            )
        
        console.print(detail_table)
    
    def save_results(self, filename: str = "test_results.json"):
        """保存测试结果到文件"""
        output = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "results": [
                {
                    "query": r.query,
                    "skill": r.skill,
                    "confidence": r.confidence,
                    "method": r.method,
                    "latency_ms": r.latency_ms,
                    "success": r.success,
                    "error": r.error
                }
                for r in self.results
            ]
        }
        
        output_path = Path(__file__).parent / "results" / filename
        output_path.parent.mkdir(exist_ok=True)
        
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
        
        console.print(f"\n[green]Results saved to {output_path}[/green]")


# 测试用例定义 - 扩展至 10 skills, 40+ 测试用例
TEST_CASES = [
    # ========== GitHub (github) ==========
    TestCase("create issue", "github", "Create GitHub issue (trigger)"),
    TestCase("open a PR", "github", "Open PR (trigger)"),
    TestCase("review pull request", "github", "Review PR (trigger)"),
    TestCase("list my repos", "github", "List repos (trigger)"),
    TestCase("check CI status", "github", "Check CI (trigger)"),
    # 语义匹配
    TestCase("create a GitHub issue", "github", "Create GitHub issue"),
    TestCase("open a pull request on github", "github", "Open PR"),
    TestCase("list my GitHub repositories", "github", "List repos"),
    # 模糊查询
    TestCase("I need to create an issue", "github", "Fuzzy: create issue"),
    TestCase("can you check the CI pipeline", "github", "Fuzzy: check CI"),
    
    # ========== Slack (slack) ==========
    TestCase("send slack message", "slack", "Send Slack message (trigger)"),
    TestCase("notify team", "slack", "Notify team (trigger)"),
    TestCase("post to channel", "slack", "Post to channel (trigger)"),
    # 语义匹配
    TestCase("send a message to Slack", "slack", "Send Slack message"),
    TestCase("notify the team on slack", "slack", "Notify team"),
    # 模糊查询
    TestCase("let everyone know", "slack", "Fuzzy: notify"),
    TestCase("message the channel", "slack", "Fuzzy: send message"),
    
    # ========== File Read (file-read) ==========
    TestCase("read file", "file-read", "Read file (trigger)"),
    TestCase("show content", "file-read", "Show content (trigger)"),
    # 语义匹配
    TestCase("read the README.md file", "file-read", "Read file"),
    TestCase("show me the README", "file-read", "Fuzzy: show README - was failing"),
    TestCase("display the contents of config.json", "file-read", "Fuzzy: display contents"),
    TestCase("cat the log file", "file-read", "Fuzzy: cat log"),
    
    # ========== File Write (file-write) ==========
    TestCase("write file", "file-write", "Write file (trigger)"),
    TestCase("save file", "file-write", "Save file (trigger)"),
    # 语义匹配
    TestCase("write output to results.txt", "file-write", "Write file"),
    TestCase("save this to a file", "file-write", "Fuzzy: save to file"),
    TestCase("update the config", "file-write", "Fuzzy: update config"),
    
    # ========== Docker (docker) ==========
    TestCase("build docker", "docker", "Build Docker (trigger)"),
    TestCase("docker build", "docker", "Docker build (trigger)"),
    # 语义匹配
    TestCase("build a Docker image", "docker", "Build Docker"),
    TestCase("run a docker container", "docker", "Run container"),
    TestCase("start the container", "docker", "Fuzzy: start container"),
    
    # ========== Git (git) ==========
    TestCase("git commit", "git", "Git commit (trigger)"),
    TestCase("create branch", "git", "Create branch (trigger)"),
    TestCase("git status", "git", "Git status (trigger)"),
    # 语义匹配
    TestCase("commit these changes", "git", "Fuzzy: commit changes"),
    TestCase("switch to main branch", "git", "Fuzzy: switch branch"),
    TestCase("show me the git log", "git", "Fuzzy: show log"),
    TestCase("what changed", "git", "Fuzzy: git diff"),
    
    # ========== AWS (aws) ==========
    TestCase("deploy to AWS", "aws", "Deploy AWS (trigger)"),
    TestCase("create S3 bucket", "aws", "Create S3 bucket (trigger)"),
    # 模糊查询 - 之前失败的
    TestCase("deploy to production", "aws", "Fuzzy: deploy production - was failing"),
    TestCase("push this live", "aws", "Fuzzy: push live"),
    TestCase("upload to the cloud", "aws", "Fuzzy: upload cloud"),
    
    # ========== NPM (npm) ==========
    TestCase("npm install", "npm", "NPM install (trigger)"),
    TestCase("npm run", "npm", "NPM run (trigger)"),
    # 语义匹配
    TestCase("install dependencies", "npm", "Fuzzy: install deps"),
    TestCase("run the build script", "npm", "Fuzzy: run build"),
    TestCase("npm test", "npm", "NPM test (trigger)"),
    
    # ========== Python (python) ==========
    TestCase("run python", "python", "Run Python (trigger)"),
    TestCase("pip install", "python", "Pip install (trigger)"),
    # 语义匹配
    TestCase("execute the script", "python", "Fuzzy: execute script"),
    TestCase("run pytest", "python", "Fuzzy: run tests"),
    
    # ========== Database (database) ==========
    TestCase("query database", "database", "Query DB (trigger)"),
    TestCase("show tables", "database", "Show tables (trigger)"),
    # 语义匹配
    TestCase("get all users from the database", "database", "Fuzzy: query users"),
    TestCase("run the migration", "database", "Fuzzy: run migration"),
]


def start_web_server(port: int = 8080):
    """启动 HTTP 服务器并在浏览器中打开 dashboard"""
    dashboard_path = Path(__file__).parent / "dashboard.html"
    
    if not dashboard_path.exists():
        console.print("[yellow]⚠ dashboard.html not found, skipping web interface[/yellow]")
        return
    
    # 创建服务器
    os.chdir(Path(__file__).parent)
    
    class DashboardHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            # 简化日志输出
            pass
    
    try:
        server = HTTPServer(('localhost', port), DashboardHandler)
        
        # 在后台线程启动服务器
        def serve():
            try:
                server.serve_forever()
            except Exception:
                pass
        
        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        
        # 构建 URL
        url = f"http://localhost:{port}/dashboard.html"
        
        console.print(Panel(
            f"[bold green]🌐 Web Dashboard Started![/bold green]\n\n"
            f"[cyan]URL:[/cyan] {url}\n"
            f"[dim]按 Ctrl+C 停止服务器[/dim]",
            title="Web Interface",
            border_style="green"
        ))
        
        # 尝试自动打开浏览器
        time.sleep(0.5)  # 等待服务器启动
        try:
            webbrowser.open(url)
            console.print("[dim]✓ 浏览器已自动打开[/dim]")
        except Exception:
            console.print(f"[dim]请手动访问: {url}[/dim]")
        
        return server
        
    except OSError as e:
        if "Address already in use" in str(e):
            console.print(f"[yellow]⚠ 端口 {port} 已被占用，尝试其他端口...[/yellow]")
            return start_web_server(port + 1)
        else:
            console.print(f"[red]✗ 无法启动 web 服务器: {e}[/red]")
            return None


def main():
    """主函数"""
    console.print("[bold cyan]" + "=" * 60)
    console.print("[bold cyan]SkillPilot OpenClaw Integration Test")
    console.print("[bold cyan]" + "=" * 60)
    
    # 确定技能目录
    skills_dir = Path(__file__).parent / "skills"
    
    # 创建测试器
    tester = SkillPilotTester(
        skills_dir=str(skills_dir),
        use_local=True  # 使用本地构建版本
    )
    
    # 索引技能
    if not tester.index_skills():
        console.print("[red]Failed to index skills. Exiting.[/red]")
        return 1
    
    # 运行测试
    stats = tester.run_tests(TEST_CASES)
    
    # 打印结果
    tester.print_results(stats)
    
    # 保存结果
    tester.save_results()
    
    # 启动 web 服务器
    console.print("\n[dim]启动 web 界面...[/dim]")
    server = start_web_server(port=8080)
    
    if server:
        console.print("\n[dim]服务器运行中，按 Ctrl+C 停止...[/dim]")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            console.print("\n[yellow]停止服务器...[/yellow]")
            server.shutdown()
    
    # 返回退出码
    return 0 if stats["accuracy"] >= 70 else 1


if __name__ == "__main__":
    exit(main())
