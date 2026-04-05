#!/bin/bash
# SkillPilot 简单性能测试

CLI="node packages/cli/dist/index.js"
QUERIES=(
    "create issue"
    "send slack message"  
    "read file"
    "write file"
    "build docker"
    "create a GitHub issue for the bug"
    "notify team on slack"
    "show me the README content"
    "deploy to production"
)

echo "============================================================"
echo "SkillPilot 真实性能基准测试"
echo "============================================================"
echo ""

# 确保索引存在
$CLI index test_openclaw_python/skills 2>/dev/null

echo "运行 ${#QUERIES[@]} 个查询，每个 10 次..."
echo ""

TOTAL_LATENCY=0
SUCCESS_COUNT=0
TOTAL_COUNT=0

for query in "${QUERIES[@]}"; do
    echo -n "测试: \"$query\" "
    
    QUERY_LATENCIES=""
    QUERY_SUCCESS=0
    
    for i in {1..10}; do
        START=$(date +%s%N)
        OUTPUT=$($CLI route "$query" --json 2>/dev/null)
        END=$(date +%s%N)
        
        LATENCY=$(( (END - START) / 1000000 ))  # 转换为 ms
        TOTAL_COUNT=$((TOTAL_COUNT + 1))
        
        # 检查是否有匹配
        if echo "$OUTPUT" | grep -q '"skill":'; then
            if ! echo "$OUTPUT" | grep -q '"skill": null'; then
                QUERY_SUCCESS=$((QUERY_SUCCESS + 1))
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
                QUERY_LATENCIES="$QUERY_LATENCIES $LATENCY"
                TOTAL_LATENCY=$((TOTAL_LATENCY + LATENCY))
            fi
        fi
    done
    
    if [ $QUERY_SUCCESS -gt 0 ]; then
        # 计算平均
        AVG=$((TOTAL_LATENCY / SUCCESS_COUNT))
        echo "→ 成功: $QUERY_SUCCESS/10, 平均: ${AVG}ms"
    else
        echo "→ 无匹配"
    fi
done

echo ""
echo "============================================================"
echo "汇总结果"
echo "============================================================"
echo ""

if [ $SUCCESS_COUNT -gt 0 ]; then
    AVG=$((TOTAL_LATENCY / SUCCESS_COUNT))
    echo "成功路由: $SUCCESS_COUNT/$TOTAL_COUNT"
    echo "准确率: $(echo "scale=1; $SUCCESS_COUNT * 100 / $TOTAL_COUNT" | bc)%"
    echo "平均延迟: ${AVG}ms"
else
    echo "没有成功匹配"
fi
