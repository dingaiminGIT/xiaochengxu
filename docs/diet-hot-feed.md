# 需求30、31的小程序配套

- “饮食建议”快捷入口发送 `client_context.entry_point = diet_advice`，与日常记录、提醒 capabilities 合并；普通输入、状态解读、照片入口不带此标记，失败重试保留原标记。分析展示和带 analysis_id 的确认按钮复用现有组件。
- 首页“全部”请求 `GET /moments?sort=popular` 并保持后端返回顺序；分类请求 `sort=latest&category_code=...`，我的发布不启用热度排序。快速切分类时忽略过期响应，详情返回首页会重新加载。
- 详情成功读取后，每次打开只发一次 `POST /moments/<id>/view`。匿名访问使用持久化随机 visitor_id，上报失败不影响阅读、不弹登录；点赞、评论等操作仍要求登录。后端负责30分钟去重，客户端不能决定计数。
- 帖子缓存映射 `view_count → viewCount`，本次不增加阅读量的视觉展示。

依赖后端需求30、31接口先上线；后端新增字段和接口向后兼容，旧小程序仍可正常使用。

验证：`node scripts/check-diet-hot-feed.cjs`，并运行其他 `scripts/check-*.cjs`。另在微信开发者工具中连接隔离的本地 API/MySQL，实际点击饮食建议、推荐确认、首页分类与游客详情进行联调。未包含32、33的硬件或健康监控界面改动。
