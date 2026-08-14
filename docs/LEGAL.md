# 法律声明 / Legal Notice

## 中文版

### 保密声明

本工具及其中包含的所有数据 (以下简称"本资料") 构成保密信息, 包括但不限于:
- SoC 电源架构
- 电源树拓扑
- 功耗模式与电流预算
- 器件选型与原理图引用

**未经授权, 严禁**:
- 复制、转发、发布、展示本资料的全部或部分内容
- 向任何第三方 (包括客户、供应商、合作伙伴) 披露
- 用于任何商业或非商业用途的逆向工程
- 上传至任何公网或不受控的存储/计算环境

### 免责声明

1. 本工具按"现状"提供, 不构成任何明示或暗示的担保, 包括但不限于适销性、特定用途适用性、不侵权的担保。
2. 本工具所有计算结果 (包括但不限于电流汇总、压降、热耗、效率) 均基于**理想化模型**, 仅供内部评估参考, **不构成设计依据**。
3. 最终设计应以**正式原理图、PCB 设计文件、器件规格书**为准。
4. 任何因使用本工具产生的直接或间接损失, 作者与发布方不承担任何责任。
5. 本工具中的效率数据可能来自典型工况, 实际应用需考虑温度、老化、工艺角等因素。

### 数据使用

- 本资料仅供内部评估使用
- 数据准确性**不保证**, 以最终器件规格书为准
- 如有疑问, 请联系: power-tree@example.com

### 前端只读说明

`index.html` (Viewer) 的只读限制**仅是 UI 层约束**, 不构成安全边界。
攻击者可以通过浏览器开发者工具绕过任何前端限制。
**敏感性控制完全依赖于分发管理**:
- 不要将打包文件上传到任何公网仓库
- 不要通过未加密邮件发送
- 接收方需签署 NDA

---

## English Version

### Confidentiality Notice

This tool and all data contained herein (the "Materials") constitute confidential information, including but not limited to:
- SoC power architecture
- Power tree topology
- Power modes and current budgets
- Component selection and schematic references

**Without authorization, you may NOT**:
- Copy, forward, publish, or display the Materials in whole or in part
- Disclose to any third party (including customers, suppliers, partners)
- Reverse engineer for any commercial or non-commercial purpose
- Upload to any public network or uncontrolled storage/compute environment

### Disclaimer

1. This tool is provided "AS IS" without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement.
2. All calculation results (including but not limited to current roll-up, voltage drop, thermal dissipation, efficiency) are based on **idealized models** and are for internal evaluation only. **They do NOT constitute design basis**.
3. Final designs shall be based on **official schematics, PCB design files, and component datasheets**.
4. The authors and distributors shall not be liable for any direct or indirect damages arising from the use of this tool.
5. Efficiency data in this tool may be from typical conditions; actual applications must account for temperature, aging, process corners, and other factors.

### Data Usage

- The Materials are for internal evaluation only
- Data accuracy is **not guaranteed**; refer to final component datasheets
- For questions, contact: power-tree@example.com

### Viewer Read-only Notice

The read-only restriction in `index.html` (Viewer) is **UI-layer only** and does NOT constitute a security boundary.
Attackers can bypass any front-end restriction via browser developer tools.
**Confidentiality control relies entirely on distribution management**:
- Do not upload packaged files to any public repository
- Do not send via unencrypted email
- Recipients must sign an NDA
