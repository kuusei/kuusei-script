# Steam 国区参考定价辅助工具

在 Steam 库存或市场详情页打开物品的出售弹窗。价格栏下方显示国区最高五档求购、最低五档在售和每档数量。可以手填国区目标价并点击「换算填入」，也可以点国区最低价和低 ¥0.01 两个快捷按钮。

支持新版 React 出售弹窗。印度和乌克兰钱包的卖家收款可输入两位小数，原生收款状态、输入框和合计保持一致。只在当前物品的上架请求中保留精确到分的收款，避免新版弹窗提交前将收款向上取为整数。手续费最低值和步长不变，确认和上架仍由 Steam 原生流程处理。

新版弹窗从原生 React 组件识别物品、输入框和收款状态，复用 Steam 已加载的手续费缓存；不新增手续费查询。若 Steam 再次改变组件结构，需要相应更新适配。

Steam 批量出售页在每种物品下方提供「国区参考价」。页面只有一种物品时会默认展开，有多种时可展开对应物品进行查询和填价。

单件出售时通过已登录的 Steam 批量出售页读取物品盘口 ID，不再依赖旧版市场详情页。批量出售时直接复用当前页面的 ID。五档价格仍来自 Steam 人民币盘口接口，并校验人民币标识。

脚本自动识别印度卢比或乌克兰格里夫纳钱包，先按国区手续费反推人民币净收款，再换汇并向下保留两位小数，填入「您收款」。Steam 和游戏手续费分别按页面提供的费率计算，每项非零手续费最低 ¥0.07，向下取整到分。反推时取含手续费总价不超过国区目标价的最大净收款。

汇率来自 [MarketDB](https://marketdb.info/api)，由该服务根据 Steam 市场价格推算，并非 Valve 官方接口。一次请求获取人民币兑印度卢比和乌克兰格里夫纳的汇率，缓存一小时，并合并并发查询。不额外扣除 0.3% 汇率余量。查询失败时提示错误，可重试。

「买家支付」由 Steam 更新，显示的是当前钱包币种的含手续费金额。钱包最低金额和价格上限仍使用 Steam 页面数据校验，实际国区显示价以上架结果为准。

## Changelog

### 1.3.6

- Preserve decimal receipts on the first pricing click after refresh, including React input reuse without DOM mutations.

### 1.3.5

- Match pricing buttons to Steam's flat React dialog style, including hover, pressed, focus and disabled states.

### 1.3.4

- Restore CNY pricing controls and five-level order books in Steam's React sell dialog.
- Preserve two-decimal INR and UAH seller receipts through editing, rendering and request serialization.
