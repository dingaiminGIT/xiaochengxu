# 管家统一报告（需求 39）

后端在聊天 `message.result.guardian_report` 返回 `schema=guardian_report, version=1` 的报告快照。五类场景使用同一组件：饮食建议、产品分析、配料表分析、产品对比、历史口粮分析。

`utils/assistant-chat.js` 识别版本；`components/guardian-report` 展示宠物资料、整体总结、喂养建议、社区经验和下一步提示。原有消息与未知协议回退到旧渲染。已保存的新报告直接回显，客户端不调用模型或重算差异。

“当前建议 / 社区经验”和“查看分值 / 直观对比”只影响展示。交互继续使用消息顶层 `interaction`，原样传回 `slot/value/analysis_id`；不从模型文字生成按钮。初算显示待核对，不能比较的版本不显示对比条形图。

执行 `node scripts/check-guardian-report.cjs` 验证映射、兼容和组件交互；联调固定使用 `local-dev/qa34-miniprogram`。后端完整字段与状态定义见后端仓库 `docs/guardian-report-v1.md`。
