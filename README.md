# 🌱 农场废旧农膜回收称重与补贴资格系统

回收站登记收料与分拣结果，审核人员确认补贴资格，种植户查询交膜量与补贴金额，管理员按地块监管回收/合格/兑付并控制当期额度。

## 一条命令启动

```bash
bash start.sh
```

脚本自动完成：安装依赖 → 生成 Prisma Client → 创建 SQLite 数据库 → 写入种子数据 → 并行启动后端与前端。

- 前端：<http://localhost:5173>
- 后端 API：<http://localhost:3000/api>
- 停止：`Ctrl+C`

前置条件：Node.js ≥ 18（开发环境为 Node 22），首次启动会自动执行 `npm install`。

### 演示账号（密码统一 `123456`）

| 用户名 | 角色 | 能做什么 |
| --- | --- | --- |
| `zhang` / `li` | 种植户 | 只能查看**本人**的收据、处理进度、核定补贴与兑付回执 |
| `collector` | 收料员 | 模拟地磅读数、过磅登记、分拣补录（不能审批自己的单据） |
| `reviewer` | 审核人员 | 称重修正（留痕）、补贴资格通过/驳回、解除重复嫌疑 |
| `admin` | 管理员 | 按地块统计、查看当期额度、发起兑付 |

## 业务流程

```
过磅登记（毛重/皮重，地磅读数留痕）
   └─> 分拣补录（净重 + 质量等级 A/B/C/拒收）
          └─> 审核（修正留痕 / 驳回泥膜·重复膜 / 通过）
                 └─> 补贴核定（等级折算 → 地块面积上限 → 当期额度）
                        └─> 兑付（本地模拟回执，一票一回执）
```

## 核心规则与实现位置

| 规则 | 实现 |
| --- | --- |
| 只有审核通过的数量进入补贴清单 | `WeighRecord.status = APPROVED` 后才写 `approvedSubsidyKg/subsidyYuan`（`records.service.ts` `review()`） |
| 泥土夹杂过多不得直接计补 | 分拣等级 C/拒收折算系数为 0，审核通过被拒，须按 `SOIL_CONTAMINATION` 驳回（`domain.ts` `GRADE_FACTOR`） |
| 同一批膜重复过磅 | 同地块+同膜种、净重差 ≤2kg、30 分钟窗口内自动标记 `suspectedDuplicate`，审核通过被拒，须核实后驳回（`DUPLICATE_FILM`）或填写核实结论解除嫌疑 |
| 称重修正保留原值/原因/复核人 | `WeightCorrection` 表记录字段、原值、新值、原因、复核人；修正毛/皮重自动重算净重；**不能修正本人登记的单** |
| 补贴数量受地块面积限制 | 按当期同地块已核定量累计，上限 = 面积(亩) × `perMuCapKg`，超出部分截断并标记 `cappedByPlot` |
| 补贴数量受当期额度限制 | 总额度 `totalQuotaYuan - usedQuotaYuan`，金额先按分取整再反推公斤数，永不超额，标记 `cappedByPeriod` |
| 收料员不能审批自己的单据 | `review()` 内校验 `collectorId !== 当前用户`（管理员也可审） |
| 重复提交不增加补贴 | 过磅 `clientTicketNo` 唯一幂等；审核事务内复查状态，重放返回原结果且不重复占用额度 |
| 重复兑付不增加金额 | `Payment.recordId` 与 `idempotencyKey` 双唯一约束 + 兑付前复查，金额只取单据核定额，不信任客户端 |
| 种植户数据隔离 | 列表/详情/兑付清单对 FARMER 角色强制 `farmerId = 本人` |
| 地磅读数本地模拟 | `ScaleService` 返回带抖动的稳定读数并写 `ScaleReading` 留痕（真实场景替换为仪表驱动） |
| 兑付回执本地模拟 | `PaymentsService.issueReceipt()` 生成 `RC日期+单号` 回执（真实场景对接惠农一卡通/银行） |

## 交付示例（重点验收场景）

示例使用**独立的 `examples.db`**，不污染开发库，并带 32 项断言：

```bash
npm run examples
```

覆盖：

- **A 重量修正**：毛重 120→110，原值/新值/原因/复核人全部留痕，净重自动重算；收料员自行修正被拒
- **B 泥土夹杂过多**：C 级单据不能通过，驳回后补贴为 0
- **C 重复交膜**：同车膜 5 分钟内二次过磅自动标记嫌疑，不能直接计补，驳回不产生补贴
- **D 地块面积上限**：5 亩 × 20kg = 100kg，首笔**恰好达到上限**足额 200 元，第二笔 50kg 被截断为 0
- **E 当期额度上限**：100 元小额度当期，80+20 元**恰好耗尽**，再交膜核定 0 元并标记额度截断
- **F 禁止自审**：收料员审批本人单据被拒，换审核人员后通过
- **G 幂等**：重复过磅提交只生成一张单，重复审核不重复占用额度，重复兑付返回同一回执且总额不增加

## 技术栈

- 后端：TypeScript、NestJS 11、Prisma 6、SQLite、JWT（`@nestjs/jwt` + `bcryptjs`）
- 前端：React 18、Vite 5、React Router 6（开发服务器 `/api` 代理到 3000 端口）
- 数据库文件：`backend/prisma/dev.db`（删除后重新执行 `bash start.sh` 即自动重建）

## 目录结构

```
.
├── start.sh                 # 一条命令启动
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # User/Plot/SubsidyPeriod/WeighRecord/WeightCorrection/Payment/ScaleReading
│   │   └── seed.ts          # 演示种子（5 个账号 + 3 地块 + 1 个补贴当期）
│   └── src/
│       ├── auth/            # JWT 登录、角色守卫
│       ├── scale/           # 模拟地磅
│       ├── records/         # 过磅/分拣/修正/审核（核心业务规则）
│       ├── payments/        # 幂等兑付 + 模拟回执
│       ├── stats/           # 按地块回收量/合格量/已兑付量
│       └── examples/        # 端到端示例场景与断言
└── frontend/src/
    ├── api.ts / auth.tsx    # fetch 封装与登录态
    └── pages/               # 种植户 / 收料员 / 审核员 / 管理员 四个页面
```

## 其他命令

```bash
npm run dev        # 已安装依赖时直接前后端并行开发（不重建库）
npm run build      # 前后端生产构建
npm run seed       # 重新写入种子（幂等 upsert）
npm run examples   # 重建 examples.db 并运行示例断言
```
