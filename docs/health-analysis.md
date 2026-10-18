# 需求 23 小程序对接

管家使用原聊天 API 展示营养健康解读：每款粮显示最多三个关注点，每项包含标签、画像依据、机制说明和观察事项；两款粮的比较沿用同一结构。数据来自后端 `result.health_analysis`，前端不计算健康结论。

`utils/assistant-chat.js` 将 `subjects/comparisons/prompt` 转成显示字段；普通回复与旧版后端保持原样。聊天历史保留完整文字回退，旧客户端也能阅读分析。

用户选择是否推荐时，原样回传 `food_health_recommendation`、选项值和服务端提供的 `analysis_id`。选项值为 `yes:<analysis_id>` 或 `no:<analysis_id>`，旧客户端即使只回传 slot/value 也能保留分析身份。不能改为通用的“帮我推荐主粮”，否则会丢失分析身份。新消息会禁用旧消息选项；后端进一步校验旧选项、已消费确认及宠物/会话身份。

用户没有当前粮而直接要求推荐时，继续使用原流程。中间档不额外推断；缺画像、缺知识及未命中由后端状态直接展示。

验证：

```bash
npm run test:health-analysis
node scripts/check-assistant-chat.cjs
npm run test:contracts
node scripts/check-cloud-reminders.cjs
node scripts/check-food-catalog.cjs
```

另以微信 CLI preview 完成 WXML/LESS/JS 编译打包；在独立调试副本连接本机后端，验证真实分析结果展示和推荐按钮进入原选粮询问。调试副本使用本机 API 地址，仓库 `config.js` 仍保留正式地址，尚未上传开发版或发布。
