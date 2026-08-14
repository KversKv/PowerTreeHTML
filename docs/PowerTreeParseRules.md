# PowerTree 解析与绘制规则

> 本文档汇总当前工具的**数据解析**与**画布绘制**规则, 供维护与迭代对齐。
> 数据来源: `assets/app/layout/elk-adapter.js` / `render/*` / `data/power_tree_pmu1811.data.js`。

---

## 一、数据解析规则

### 1. 数据注入
- 数据经 `PT.registerData("power_tree", {...})` 注入, 存于 `data/*.data.js`
- 顶层字段: `meta / modes / groups / nodes / edges / pair_groups`
- 图对象: `PT.Graph(data)` 建图, 节点附加 `__in/__out/__calc`, 原始数据与计算结果严格分离

### 2. 分组 (groups)
- 支持嵌套 (`parent` 指向父分组), `side` 决定布局侧向: `left`(PMIC/板级) / `right`(chip/domain)
- 布局时递归: 子分组先布局, 尺寸由内容 + 内边距撑起
- 空分组 (成员被过滤/聚焦隐藏) 自动从布局移除

### 3. 节点 (nodes)
- 尺寸由 `layoutOpts.nodeSize(type)` 决定, 模块卡片 (buck/ldo/load/domain) 用圆角矩形, 电路符号 (source/switch 等) 用标准电气符号
- BUCK/LDO 系列 (buck/boost/buck_boost/ldo) 用**紧凑卡片** 120×58 (= 原 180×88 的 2/3), **只保留标题** (无第二行 id/refdes/part 描述), 参数行 (V=/I=) 与利用率条保留
- 节点可选 `vin_net` 字段显式声明输入网络名 (Vin 标签用, 见 §四.2)
- `side` 优先于分组 `side`, 决定 ELK 分区 (left=0 / right=2 / 其他=1)

### 4. 对偶组 (pair_groups) — 自定义外框
- 顶层数组, 每项 `{ id, label, members:[nodeId...] }`
- 用途: BUCK/LDO 输出短接的**并联对偶组**, 渲染浅外框, 布局视为整体
- 规则:
  - 成员 ≥2 个可见才聚合; 成员仍单独渲染
  - 成员坐标相对 pair 容器, 垂直堆叠 (BUCK 上 / LDO 下)
  - pair 容器按"首个成员所属 group"归位
  - **对偶不建功率边** (短接是输出对输出, 非功率流), 关系写在节点 `note`
  - 对偶轨下挂统一挂 **LDO 侧** (芯片默认 LDO `pu=1` / BUCK `pu=0`)

### 5. 边 (edges)
- `type: "power"` 实线 / `"control"` 虚线; `sub`: EN/PG/I2C/RESET/ISO/SENSE/IRQ
- 控制边**不参与布局分层**, 只参与绘制
- 跨容器边的端点在布局时向上 `lift` 到本容器直接孩子后参与分层

---

## 二、布局规则 (_fallbackLayout, file:// 降级)

> ELK 在 file:// 下 Web Worker 不可用, 统一走 `_fallbackLayout` 层次化同步布局。

### 1. 分层
- 容器内按 **Kahn 拓扑 + 最长路** 分层, 只用 power 边
- 每层一列, x 按前层最大宽度累加, y 同层垂直堆叠
- 层间距 `LAYER_GAP=56`, 节点间距 `NODE_GAP=24`, 分组内边距 `{t:48,l:16,r:16,b:16}`

### 2. 同层排序 (防交叉)
- 第一层: 按"直接下游扇出数"降序
- 后续层: 按"上游在上一层的 y 中心"**重心排序**, 下挂自动对齐到上游正后方

### 3. 世界坐标
- 节点坐标 = 相对父容器原点 (渲染器累加分组偏移)
- 边 `sections` = 世界绝对坐标

---

## 三、连线 (路由) 规则

### 1. 总线拓扑 (同源扇出)
- 同一源节点向右扇出 **≥3 条 power 边** → 判定为总线源 (VSYS / BUCK_03 / LDO_02 等)
- 结构: 源 → 水平短接 → **竖直干线 busX** → 各目标**短水平分支**
- `busX` = 源右缘到最近目标左缘的中点 (与源太近时外推)
- 干线 y 范围覆盖所有目标 y 中心 + 源 y
- 干线由**首条边**负责一次性绘制 (加粗 0.6px), 其余只画分支
- `__bus` 挂在 Graph 边对象 (`edge.__edge.__bus`) 上, 渲染器才读得到

### 2. 普通边 (H-V-H 避让)
- 收集所有真实节点矩形为障碍, 外扩 `CLR=14px` 安全间距
- 前向边 (源左目标右): 竖直段强制走**间隙中线** `(源右缘+目标左缘)/2`, 同间隙边汇成共享干线
- 候选通道 = 节点左右缘外扩线 + 间隙中线, 选三段 (横-竖-横) 均不穿障碍且代价最小者
- 后向边 / 被挡边: 从候选通道挑不穿的, 偏好靠近间隙中线

### 3. 共享干线合并 (防叠加变粗 + 异网隔离)
- 同 x **且同 net** 的竖直段归并成一条干线 (y 范围取并集), 挑一条边作"承载者"挂 `__trunk={x,y1,y2,shared}`
- **异网竖直段绝不共线**: x 聚类 (±3px) 内再按 net 拆分, 异网干线 x 间距 <12px 且 y 区间重叠时横向拉开 12px
- 渲染时承载者用固定 **1.4px 细线**画整段干线, 只画一次
- 其余边标记 `__branchOnly`, 只画水平分支 (源水平 + 目标水平), 竖直段跳过
- 分支宽度按各自电流 (`widthForCurrent`), 干线保持细线
- `shared` = 是否 ≥2 条边共享该干线 (决定 T 型结点圆点与上游 net 标签; 独占干线只是走线拐角, 不画点不贴标签)
- 控制边不参与 net 拆分 (统一 `__ctl__` key, 维持旧合并行为)

### 4. 跨网交叉检测 (跨越弧数据)
- 收集每条 power 边**实际绘制**的线段 (总线干线/源短接/分支/共享干线/水平分支)
- 水平线段 × **异网**竖直线段**严格内交** (端点 ±2px 容差, T 型相接不算跨越) → 水平侧记 `__hops=[{x,y}...]`
- 控制虚线不参与跳线检测; `__hops` 挂在 Graph 边上, 每次布局开头统一清理防残留

---

## 四、渲染规则

### 1. 分层
- 泳道层 / 分组框层 / 边层 / 节点层 / 水印层
- 分组框: 圆角虚线框 + 标题; pair 外框: 浅紫圆角框 + 标签

### 2. 边绘制
- `power` 实线, 宽度按电流; `control` 虚线, 按 `sub` 配色
- 总线干线 / 共享干线在 `renderEdge` 里用 `__bus.first` / `__trunk` 单独画
- inline 无源元件在边中点画圆标记
- **Vin 标签** (`pt-edge-vin-label`): power 边目标为模块类型 (config `netNaming.moduleTypes`) 时, 标签锚在**目标端输入引脚上方** (右对齐), 显示**模块输入网络名** = `node.vin_net` 优先, 否则按 `netNaming.pattern` 推导 (缺省 `{net}_{node}`; 例: VSYS→BUCK_03 显示 `VSYS_BUCK_03`)。**电气连接仍走 `edge.net`, 只改显示**
- **上游 net 标签** (`pt-edge-net-label`): 总线首边画在源短接中点 / 共享干线承载者 (shared) 画在干线顶端, 保证上游网络名 (如 VSYS) 在画布上仍可追溯
- **相连 vs 跨越**: T 型结点圆点 (`pt-edge-dot`, r=2.8) = 电气相连 (总线分支×干线 / 同网共享干线接点); 跨越弧 (`pt-edge-hop`, 半圆拱 + 画布底色遮蔽被跨线) = 异网交叉不相连。统一由 `renderEdgeDecor` **第二遍**绘制, 压在所有边线之上; 遮蔽色走 CSS 类 (亮 `#fafafa` / 暗 `#121212` / 导出 `#ffffff`)
- **边选中高亮**: 点击边 → 同 net power 边 (或同 signal 控制边) 橙色 (#ff5722) 高亮, 其余边与无关节点淡化; 再点同一边或点背景取消; 与节点路径高亮互斥。点击经 `edgeLayer` **事件委托** (`data-edge-id`), 细线由加宽透明命中区 (`pt-edge-hit`, pointer-events:stroke) 兜底

### 3. 坐标约定
- 节点 `transform=translate(nx,ny)`, nx/ny 已累加各级分组偏移
- 边 `sections` 直接用世界坐标, 不加分组偏移 (渲染器原始坐标系)

---

## 五、关键红线 (file://)

- ❌ `fetch()/XMLHttpRequest` 读本地; ❌ ESM; ❌ SVG `<foreignObject>`
- ✅ 传统 `<script src>` + `PT.registerData()`
- ✅ Web Worker 不可用 → `_fallbackLayout` 同步降级
- ❌ 节点禁 `JSON.stringify/deepClone` (含 `__in/__out/__calc` 循环引用)

---

## 六、PMU1811 数据约定 (power_tree_pmu1811.data.js)

- 39 节点 / 71 边 / 7 分组 / 5 模式 / 4 对偶组
- 对偶组经 `pair_groups` 声明, 不建功率边
- 对偶轨下挂挂 LDO 侧; BUCK_03 级联链 `CH_BUCK03_SUB`
- SoC 侧负载电压与各自供电轨对齐
- `tools/validate.py` 校验退出码 0

---

## 七、踩坑记录 (迭代实测)

> 以下都是实际踩过并修复的坑, 改动相关代码前先对照。

### 布局 / 渲染对象引用
1. **`__bus` 挂错对象 → 竖直干线不画**
   - 布局里 `e` 是 ELK 边 `{id,sources,targets,__edge}`, 渲染器 `renderEdge` 读的是 Graph 边 `elkEdge.__edge`
   - `__bus`/`__trunk` 这类给渲染器用的标记, 必须挂在 **`e.__edge`** 上, 挂在 ELK 边 `e` 上渲染器读不到
2. **`graph.raw` 不存在** — 原数据在 **`graph.data`** (PT.Graph 构造时 `this.data = data`), `pair_groups` 从这里取
3. **pair 成员进容器后坐标丢失** — 成员坐标相对 pair 容器, `abs` 世界坐标表与 `resolveAbs` 必须**递归 pair/分组**并向上 lift, 否则 VSYS→BUCK_01 这类边端点解析不到而不画

### 布局结构
4. **旧 `_fallbackLayout` 只遍历根 children** → 分组内 31 个节点没参与坐标分配, 全叠在 `(0,0)`; 分组框被当普通节点、嵌套子分组零尺寸。必须**递归层次化布局**
5. **`_initElk` 无条件 `_elkFailed=true`** → 任何环境都走降级布局, ELK 实际从未生效, 别再怀疑"ELK 没调好"
6. **控制边参与分层** → PMU_SEQ 把所有节点拉到同层; 分层只用 power 边
7. **空分组不移除** → 聚焦/过滤后留下空框; 布局时过滤 `__empty` 分组

### 连线
8. **VSYS 扇出画成多条平行长线** → 应"同源扇出≥3 合并为总线干线+分支", 而非每目标一条独立长线
9. **跨间隙边各自选通道 + 同 x 错开** → 一级↔二级出现多条重叠竖线; 前向边竖直段强制走**间隙中线**, 天然汇成共享干线
10. **共享干线逐条按电流加粗 → 叠成粗线** → 同 x 竖直段归并, 承载者 `__trunk` 用固定 1.4px 细线画一次, 其余 `__branchOnly` 只画水平分支
11. **干线合并只看 x 不看 net** → 异网竖线共线, 图上像"短接"; 必须按 **(x, net)** 归并, 异网干线横向拉开, 配合结点圆点/跨越弧区分相连与交叉
12. **布局标记跨布局残留** → `__bus/__trunk/__hops` 挂在 Graph 边上, 折叠/过滤再布局后旧标记还在; 每次 `_fallbackLayout` 开头统一清理
13. **`highlightPath` 只置状态不重绘** → 节点上下游高亮不显示; 需触发 `render` (或传 `defer=true` 由调用方随后统一 render, 防二次重绘)
14. **细线点不中** → 1.2~4.4px 线宽命中困难; 加透明加宽命中区 `pt-edge-hit` (≥10px, `pointer-events:stroke`) + `edgeLayer` 事件委托, 勿逐路径绑 click (干线/标签/结点都要能点)

### 数据建模
11. **对偶短接建成 `BUCK→LDO` 功率边** → 触发 vin_range E 级 + 多父 W; 对偶是输出对输出短接, **不建功率边**, 关系写 `note`, 外框用 `pair_groups`
12. **`parallel_group` 误标对偶** → 报"仅 1 成员/均流风险"; 对偶是**互斥使能**非并联均流, 不用 `parallel_group`
13. **对偶轨下挂挂 BUCK 侧** → 与芯片默认相反 (§7/§9 LDO `pu=1` / BUCK `pu=0`); 统一挂 **LDO 侧**
14. **SoC 负载电压与供电轨不符** (1.8V 负载挂 0.79V 轨) → 必触发 vdrop W; 负载电压对齐轨道
15. **`validate.py` 只查 schema** → 退出码 0 不代表无 E/W; vin_range/过流/多父等是浏览器端 engine+rules 语义, 需在页面 console 看 `PT.store.issues`
