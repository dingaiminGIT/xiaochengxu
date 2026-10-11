# 管家 P0：小程序改动与接口入口

本仓库分支 `feature/guardian-p0`，合并目标 `dev`，对应 [小程序草稿 PR #1](https://github.com/yougurt-cui/xiaochengxu/pull/1)。后端也有同名分支，合并目标 `main`，对应 [后端草稿 PR #2](https://github.com/yougurt-cui/chongxi/pull/2)。两个仓库各一个分支，当前未合并、未部署。

完整说明维护在后端仓库，避免前后端分别复制而失去同步：

- [按功能审查说明：问题、前后变化、验收方式](https://github.com/yougurt-cui/chongxi/blob/feature/guardian-p0/docs/guardian-p0-review.md)
- [小程序接口文档：请求、响应、状态、错误、联调顺序](https://github.com/yougurt-cui/chongxi/blob/feature/guardian-p0/docs/guardian-p0-api.md)
- [实现记录与测试边界](https://github.com/yougurt-cui/chongxi/blob/feature/guardian-p0/docs/guardian-p0.md)

## 页面改动

| 页面/场景 | 改了什么 | 要解决的问题 |
| --- | --- | --- |
| 食品上传、投稿详情 | 配料表拍照提示、识别结果说明、补拍按钮；重传保留名称 | 用户不知道拍哪里、是否成功以及失败后怎么处理 |
| 当前/历史口粮页 | 云端记录、日期备注补录、删除、旧本机记录核对导入 | 历史只在设备上，缺少实际吃粮时间与确认 |
| 历史口粮详情 | 展示同期咨询话题及次数 | 管家缺少历史背景；强调关联不能当作病因 |
| 管家选粮结果 | 候选卡、评分理由、查看历史和选粮入口 | 只有文字建议，缺少有数据支持的具体候选 |
| 候选粮确认 | “已开始吃”弹窗，确认后更新档案 | 不能把推荐或换粮意向当成实际吃过 |

## 接口调用对照

公共前缀 `/api/miniprogram`，统一 Bearer 登录态：

| 小程序代码 | 接口 | 使用时机 |
| --- | --- | --- |
| `utils/food-submission.js` | `POST /food-submissions` | 多图 multipart 上传；处理 202，后续查状态 |
| `pages/pet-space/food-submissions.js` | `GET /food-submissions`、`GET /food-submissions/{id}` | 展示状态、详情、约 5 秒刷新识别中记录 |
| `pages/pet-space/food-list.js` | `GET/POST /cat-profiles/{id}/diet-history` | 读取与补录历史 |
| 同上 | `DELETE /cat-profiles/{id}/diet-history/{record_id}` | 用户确认删除历史 |
| 同上 | `PATCH /cat-profiles/{id}` | 手动修改实际当前粮 |
| `utils/assistant-chat.js` | `POST /chat/conversations`、`POST /chat/conversations/{id}/messages` | 绑定宠物对话、配料附件、推荐和流程衔接 |
| 同上 | `PATCH /cat-profiles/{id}` | 候选卡确认已经开始吃后，提交 `diet.product_id`、`diet.formula_id` |

识别使用 `recognition_message`、`can_analyze`、`can_reupload`；候选卡只在 `result.recommendation.status === 'ready'` 时展示。聊天顺序渲染 `messages`，兼容只有 `message` 的响应。同期咨询缺资料时不能表示“没有健康问题”。账号和宠物变更时丢弃旧请求结果。

`medical_record` 动作目前打开既有宠物档案编辑页，界面叫“补充健康档案”，没有完整病历页面或评论经验数据。

## Review 与验收

按“失败照片补拍 → 历史补录 → 同期咨询展示 → 选粮 → 取消/确认更新 → 切换账号与宠物”的顺序验证。当前自动检查使用模拟微信/API 执行页面方法，不代表微信开发者工具编译和真机已验收。

```sh
node scripts/check-guardian-p0.cjs
node scripts/check-food-submissions.cjs
node scripts/check-assistant-chat.cjs
node scripts/check-food-list.cjs
npm run test:contracts
```

后端应先部署，再发布本小程序版本；完整业务推荐数据、真实照片 OCR、LLM 回复和真机仍需联调。完整病历、评论经验、药品/玩具推荐不在本次交付内。
