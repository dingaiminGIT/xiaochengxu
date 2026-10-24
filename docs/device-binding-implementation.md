# 小佩设备绑定实现与验证

2026-10-24。设计来源：Figma pPCjkbwO4knAZCp3FnwRA5，页面 54:1622。

## 已实现

首页底部设备面板 → 开始绑定 → 品牌选择 → 中国区小佩用户名/密码 + 未默认勾选的知情同意 → 设备选择 → 宠物与使用方式 → 绑定结果 → 详情/事件/同步。账号管理支持重新连接、断开、保留历史、删除历史；单台解绑删除该台本程序记录。设置“数据与隐私”链接至设备隐私补充说明。

输入在请求发送时与离开页面时清空，不写入本地存储。服务端不保存用户名、密码及密码摘要。只将必要会话加密保存，与宠析用户隔离。拒绝或无法读取正式说明时不接受连接。仅展示设备真实可用字段，不向手动日常记录或健康统计写入推断数据。

## 接口与部署

后端实现位于 chongxi 仓库 `services/miniprogram_device_service.py`、`services/petkit_user_transport.py` 和 `api/miniprogram_api.py`。部署配置与限制见该仓库 `docs/petkit-user-binding.md`。现有管理员采集接口不参与用户连接。

`GET device-capabilities`、`GET device-policy` 可匿名读取；其他请求均需小程序 Bearer 登录令牌，接口前缀 `/api/miniprogram`。

- `GET device-connections`：自己的账号连接。
- `POST device-connections/petkit`：用户名、密码及同意版本，验证成功返回会话连接与设备候选。
- `GET device-connections/:id/devices`、`POST .../devices/refresh`：缓存列表/重新查询。
- `GET/POST device-bindings`：自己的绑定列表/新增关联。
- `GET/DELETE device-bindings/:id`：详情/解除绑定。
- `POST device-bindings/:id/sync`：有界同步，返回可查询结果 job。
- `GET device-sync-jobs/:id`、`GET device-bindings/:id/events?kind=eat|feed`：同步结果/最近可用记录。
- `DELETE device-connections/:id`：撤回连接，`delete_history` 决定是否删除历史。

首次绑定后自动发起一次同步；失败不影响绑定成功，不覆盖已有成功快照。当前采用 22 秒内完成的同步请求，并返回已完成的结果记录，不是后台定时采集。会话过期需用户重新提供密码；没有自动重登。设备在线状态未知时保持未知。

## 验证和未完成的上线条件

新增页面与首页 LESS 样式已成功编译，WXML 标签结构检查通过。本地前端行为测试 `node scripts/check-devices.cjs`；既有接口契约、健康分析与管家回归通过。后端 9 项测试通过，覆盖同意先于请求、凭证加密、用户隔离、重复绑定、冲突、撤回与历史删除、同步失败保留快照、临时连接过期、零与缺失值。

微信开发者工具服务端口关闭，CLI 自动编译/截图未能执行；需要在工具内打开项目做原生预览。未使用任何真实小佩密码，也未完成实机型号兼容性测试。未部署或发布。

上线需配置真实运营主体与隐私联系渠道、加密密钥及功能开关，部署新增接口，确认网关/APM 不采集登录请求体。隐私补充说明须并入产品完整隐私协议；不得以本补充说明声称已完成产品全部隐私告知。
