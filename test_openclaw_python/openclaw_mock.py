#!/usr/bin/env python3
"""
OpenClaw 模拟器

模拟 OpenClaw 的 before_dispatch 钩子行为，
测试 SkillPilot 在实际 Agent 环境中的表现。
"""

import json
import subprocess
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Callable
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

console = Console()


@dataclass
class Message:
    """模拟 OpenClaw 消息"""
    text: str
    user_id: str = "test_user"
    session_id: str = "test_session"
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DispatchContext:
    """模拟 OpenClaw 调度上下文"""
    message: Message
    system_context: List[str] = field(default_factory=list)
    footer_notes: List[str] = field(default_factory=list)
    cancelled: bool = False
    
    def inject_system_context(self, context: str):
        """注入系统上下文"""
        self.system_context.append(context)
    
    def append_footer(self, text: str):
        """添加页脚注释"""
        self.footer_notes.append(text)
    
    def set_metadata(self, key: str, value: Any):
        """设置元数据"""
        self.message.metadata[key] = value


class OpenClawMock:
    """
    OpenClaw 模拟器
    
    模拟 OpenClaw 的插件系统和钩子机制
    """
    
    def __init__(self, skillpilot_cli_path: Optional[str] = None):
        self.hooks: Dict[str, List[Callable]] = {
            "before_dispatch": [],
            "before_agent_reply": []
        }
        self.config = {
            "hardRouteThreshold": 0.80,
            "softInjectThreshold": 0.45,
            "showRoutingInfo": True,
            "showConflictInfo": True
        }
        
        # SkillPilot CLI 路径
        if skillpilot_cli_path:
            self.skillpilot_cmd = ["node", skillpilot_cli_path]
        else:
            # 尝试自动发现
            cli_path = Path(__file__).parent.parent / "packages" / "cli" / "dist" / "index.js"
            self.skillpilot_cmd = ["node", str(cli_path)]
    
    def register_hook(self, name: str, handler: Callable):
        """注册钩子"""
        if name in self.hooks:
            self.hooks[name].append(handler)
    
    def call_hooks(self, name: str, ctx: DispatchContext) -> bool:
        """调用钩子，返回是否取消默认处理"""
        cancelled = False
        for handler in self.hooks.get(name, []):
            try:
                result = handler(ctx)
                if result and getattr(result, 'cancel', False):
                    cancelled = True
            except Exception as e:
                console.print(f"[red]Hook error: {e}[/red]")
        return cancelled
    
    def skillpilot_route(self, query: str) -> Optional[Dict]:
        """调用 SkillPilot 进行路由"""
        cmd = self.skillpilot_cmd + ["route", query, "--json"]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                console.print(f"[yellow]SkillPilot error: {result.stderr}[/yellow]")
                return None
        except Exception as e:
            console.print(f"[red]Failed to call SkillPilot: {e}[/red]")
            return None
    
    def before_dispatch_hook(self, ctx: DispatchContext):
        """
        before_dispatch 钩子实现
        
        模拟 OpenClaw 的 before_dispatch 钩子，
        在 LLM 处理之前调用 SkillPilot 进行路由
        """
        query = ctx.message.text
        
        console.print(f"\n[dim]→ Calling SkillPilot for routing...[/dim]")
        
        route_result = self.skillpilot_route(query)
        
        if not route_result:
            console.print("[yellow]  No routing result[/yellow]")
            return
        
        skill = route_result.get("skill")
        confidence = route_result.get("confidence", 0)
        method = route_result.get("method", "unknown")
        latency = route_result.get("latencyMs", 0)
        
        # 存储路由信息到元数据
        ctx.set_metadata("skillpilot", route_result)
        
        console.print(f"  [green]✓[/green] Routed to: [cyan]{skill['name'] if skill else 'None'}[/cyan]")
        console.print(f"    Confidence: {confidence:.2f}, Method: {method}, Latency: {latency:.0f}ms")
        
        if skill and confidence >= self.config["hardRouteThreshold"]:
            # 高置信度：注入技能上下文
            context = f"""You have a skill available: {skill['name']}
Description: {skill['description']}
Use this skill to answer the user's request."""
            
            ctx.inject_system_context(context)
            console.print(f"  [blue]→ Injected system context for {skill['name']}[/blue]")
            
            # 添加冲突信息
            if route_result.get("conflictResolved") and self.config["showConflictInfo"]:
                alternatives = route_result.get("conflictAlternatives", [])
                if alternatives:
                    footer = f"_SkillPilot: chose `{skill['name']}` over [{', '.join(alternatives)}]_"
                    ctx.append_footer(footer)
        
        elif skill and confidence >= self.config["softInjectThreshold"]:
            # 中置信度：软注入上下文
            context = f"You may find this skill relevant: {skill['name']}\nDescription: {skill['description']}"
            ctx.inject_system_context(context)
            console.print(f"  [blue]→ Soft context injection for {skill['name']}[/blue]")
    
    def before_agent_reply_hook(self, ctx: DispatchContext):
        """
        before_agent_reply 钩子实现
        
        在 Agent 回复之前添加路由信息
        """
        route_info = ctx.message.metadata.get("skillpilot")
        
        if route_info and self.config["showRoutingInfo"]:
            skill = route_info.get("skill")
            latency = route_info.get("latencyMs", 0)
            
            if skill:
                footer = f"_via {skill['name']} · {latency:.0f}ms_"
                ctx.append_footer(footer)
    
    def dispatch(self, message_text: str) -> DispatchContext:
        """
        模拟 OpenClaw 的消息调度流程
        
        完整的调度流程：
        1. before_dispatch 钩子（SkillPilot 路由）
        2. LLM 处理（模拟）
        3. before_agent_reply 钩子（添加路由信息）
        """
        console.print(Panel(f"[bold cyan]OpenClaw Dispatch[/bold cyan]\nMessage: {message_text}"))
        
        # 创建上下文
        ctx = DispatchContext(message=Message(text=message_text))
        
        # 注册 SkillPilot 钩子
        self.register_hook("before_dispatch", self.before_dispatch_hook)
        self.register_hook("before_agent_reply", self.before_agent_reply_hook)
        
        # 1. before_dispatch 钩子
        console.print("\n[bold]1. before_dispatch hooks[/bold]")
        cancelled = self.call_hooks("before_dispatch", ctx)
        
        if cancelled:
            console.print("[yellow]Dispatch cancelled by hook[/yellow]")
            return ctx
        
        # 2. 模拟 LLM 处理
        console.print("\n[bold]2. LLM Processing (simulated)[/bold]")
        
        if ctx.system_context:
            console.print("[dim]System context injected:[/dim]")
            for i, context in enumerate(ctx.system_context, 1):
                syntax = Syntax(context, "markdown", theme="monokai")
                console.print(Panel(syntax, title=f"Context {i}"))
        else:
            console.print("[dim]No system context (SkillPilot did not route)[/dim]")
        
        # 模拟回复
        simulated_reply = f"I've processed your request: '{message_text}'"
        console.print(f"[green]Agent reply:[/green] {simulated_reply}")
        
        # 3. before_agent_reply 钩子
        console.print("\n[bold]3. before_agent_reply hooks[/bold]")
        self.call_hooks("before_agent_reply", ctx)
        
        # 显示最终输出
        console.print("\n[bold]Final Output:[/bold]")
        output = simulated_reply
        if ctx.footer_notes:
            output += "\n" + "\n".join(ctx.footer_notes)
        
        console.print(Panel(output, title="Output", border_style="green"))
        
        return ctx


def demo():
    """演示 OpenClaw + SkillPilot 集成"""
    console.print("[bold cyan]" + "=" * 60)
    console.print("[bold cyan]OpenClaw + SkillPilot Integration Demo")
    console.print("[bold cyan]" + "=" * 60)
    
    # 创建模拟器
    openclaw = OpenClawMock()
    
    # 测试消息
    test_messages = [
        "create a GitHub issue for the bug",
        "send a message to the Slack channel",
        "read the README.md file",
        "build a Docker image",
        "hello world",  # 无匹配
    ]
    
    for msg in test_messages:
        openclaw.dispatch(msg)
        console.print("\n" + "-" * 60 + "\n")


if __name__ == "__main__":
    demo()
