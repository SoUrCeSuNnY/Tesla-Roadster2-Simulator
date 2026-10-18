# Tesla Roadster 2 Rocket Simulator 🚀🏎️

基于 Three.js 与自研 6-DOF 刚体物理引擎打造的纯浏览器端 **Tesla Roadster SpaceX Package（冷气推进器套件）低多边形飞行物理模拟器**。

零外部 npm 运行时依赖，提供完全自包含的单一离线 `.html` 版本，支持本地直接双击（`file://`）运行！

![Tesla Roadster Rocket Simulator](docs/screenshot.png)

---

## ✨ 核心特性

- **自研 6-DOF 物理与四轮悬架引擎**：零外部物理引擎依赖，轻量刚体数值积分（60Hz 物理步长），4 轮独立 Raycast 弹簧阻尼悬架、阿克曼几何前轮转向与非线性轮胎力学模型。
- **高压冷气推进 Blow-Down 热力学模型**：
  - 600 L / 80 MPa 气瓶，考虑真实气体压缩因子修正（初始装气约 413 kg）；
  - 10 个冷气推力器精密布置：尾部 `R1–R4` 主推力器（各 20 kN，总计 80 kN）、底部 `L1–L4` 升力力矩推力器（各 20 kN，总计 80 kN）、车头两侧 `Y1–Y2` 偏航推力器（各 5 kN）；
  - 推力随气压多变绝热膨胀实时衰减，支持一键充气与无限燃气作弊。
- **空中与地面双重法则平滑切换**：
  - 离地超 0.15 秒自动进入飞行模式，触地瞬时平滑交接回地面电驱与转向；
  - **起飞低头防误触保护（Takeoff Pitch Lockout）**：地面全油门（W）加起飞离地瞬间，自动阻断飞行俯仰指令，并在 HUD 弹出动态提示（`RELEASE [W] TO ENGAGE PITCH`），彻底避免离地即栽头砸向地面；
  - **飞行三轴独立反转**：支持在按键配置面板中独立开启 `Invert Pitch`、`Invert Yaw`、`Invert Roll`，不影响地面 A/D 转向。
- **全新辅助落地闭环控制（LANDING ASSIST）**：
  - **线性目标下降率曲线**：$v_d^*(h) = \text{clamp}(1.5 + 0.4375 \cdot h,\; 1.5,\; 5.0)\,\text{m/s}$，从 8 米高度迅速下沉，最终以稳健利落的 $1.5\,\text{m/s}$ 坚决触地，彻底消灭近地浮空悬停的拖沓反馈；
  - **姿态自动回平与角度外环**：杆量中立自动锁定 $0^\circ$ 水平姿态，满杆映射为 $\pm 30^\circ$ 绝对角度指令，0.2 秒平滑过渡。
- **轨迹录制与回放功能（Playback）**：
  - 支持实时开启/关闭轨迹录制（30 Hz 定频采样，最长 120 秒）；
  - 车辆重置（Reset）后可一键进入回放模式，基于时间插值重现车身动态、车轮转动与尾羽粒子；支持随时退出。
- **空中“子弹时间”作弊（Bullet Time Cheat）**：
  - 开启后，车辆离地进入空中自动按 0.5x 慢动作推进模拟，地面行驶自动恢复 1.0x。
- **Orbit 自由轨道相机**：
  - 支持 4 视角自由切换（按 `C` 键循环）：`3/4 追踪` → `正后追踪` → `俯顶视角` → **`Orbit 自由轨道视角`**；
  - 靶点严格动态跟随车身，支持鼠标/触控拖拽 360° 旋转、滚轮缩放视距（3～35m）；
  - 独创 **RenderPose 渲染插值体系**，彻底消除 60Hz 物理步长在 144Hz 高刷屏下的阶梯相机抖动。
- **2×2 街区网格大地图（2x2 Blocks City Grid）**：
  - 场景由 4 个互通主十字路口构成（覆盖 $-240 \sim 720$ 米范围），道路顶面与人行道精确对齐 $y = 0$；
  - 25 个 InstancedMesh 批次高效渲染 6.69 万个街景实例，Draw Call 严格受控；
  - 4 个路口 96 个信号灯按路口 4 秒错相控制，6 辆 NPC 车辆支持跨路口巡航、遇红灯减速停车与智能避让。

---

## 🎮 操控指南

### 1. 地面驾驶模式（Ground Mode）

| 按键 / 控制 | 动作说明 |
|---|---|
| **W** / **S** | 电驱加速 / 刹车与倒车 |
| **A** / **D** | 前轮阿克曼几何转向（向左 / 向右） |
| **Shift**（按住） | 激活尾部 4 个推进器（R1–R4），开启超强火箭推力加速！ |
| **Space**（按住） | 激活底部 4 个升力推进器（L1–L4），进行垂直强力起跳 |
| **R** | 一键瞬间重置车辆位置与姿态至出发路口起点 |
| **C** | 循环切换相机视角（3/4 Chase → Direct Chase → Top-down → Orbit） |

### 2. 飞行模式（Flight Mode）

离地超过 0.15 秒后，飞控系统自动接管姿态：

| 按键 / 控制 | 动作说明 |
|---|---|
| **W** / **S** | 俯仰控制（Pitch）：**W** 低头 / **S** 抬头（通过前后升力喷口差动实现） |
| **A** / **D** | 偏航控制（Yaw）：**A** 向左偏航 / **D** 向右偏航（通过车头侧向 Y1/Y2 喷口喷射） |
| **Q** / **E** | 横滚控制（Roll）：**Q** 向左滚转 / **E** 向右滚转（通过左右升力喷口差动实现） |
| **Space**（按住） | 升力推力主油门：提供垂直上升与悬停升力 |
| **Shift**（按住） | 空中尾推全开：提供强劲的空中前向火箭加速 |

> **提示**：若起飞时仍按住油门 W 键，系统会暂时锁定 Pitch 轴并提示 `RELEASE [W] TO ENGAGE PITCH`，松开按键后即可自由俯仰。

### 3. 特殊玩法与作弊选项（HUD / Settings 面板）

- **Orbit 自由相机**：切换至 Orbit 视角后，在画布上按住鼠标左键（或触控）拖拽即可自由 360° 旋转视角，滑动滚轮可自由拉近/推远镜头。
- **Bullet Time（子弹时间）**：在设置面板勾选后，在空中享受 0.5x 慢镜头特技操控。
- **Record / Play Replay（轨迹录制与回放）**：
  1. 点击 HUD 左侧「Record」开启录制；
  2. 驾驶车辆完成任意高难度飞行或漂移特技后，点击「Stop Recording」；
  3. 按 `R` 键重置车辆后，HUD 会出现「▶ Play Replay」按钮，点击即可欣赏慢镜头回放；按 `Esc` 或点击「Exit Replay」可随时退出。
- **Invincible（无敌模式）**：勾选后免除任何速度、倾角或底盘击穿坠毁判定。
- **Infinite Fuel（无限燃料）**：锁定 80 MPa 气瓶压力，喷射不消耗冷气质量。
- **KEYBINDS（按键与反转设置）**：点击 HUD「KEYBINDS」按钮可自定义 12 项动作键位，并可单独开启飞行 Pitch/Yaw/Roll 输入反转，设置自动保存至 `localStorage`。

---

## 🚀 快速开始与运行

### 方式一：单文件独立版（无需任何开发环境或服务器）
直接双击打开以下自包含 HTML 文件即可在浏览器中完整运行：
```text
roadster-lab/dist/roadster-rocket-standalone.html
```
- 体积约 1.48 MB，内联全部 17 个运行模块、CSS 与 Three.js 脚本；
- 彻底解除浏览器 `file://` 协议下的 CORS 限制，单文件随处可玩。

### 方式二：静态 HTTP 服务运行
```bash
cd roadster-lab
# 使用内置启动脚本启动静态服务器（默认 8080 端口）
npm start
# 浏览器访问：http://127.0.0.1:8080/
```

### 方式三：重新构建单文件分发版
```bash
cd roadster-lab
# 零外部 npm 依赖打包
npm run build
# 或使用别名：
npm run build:single
```

---

## 🧪 测试与质量保证

本项目包含完整的自动化物理与飞控单测套件及无头 Chromium 浏览器回归测试：

```bash
cd roadster-lab

# 1. 运行 148 项物理、动力学与飞控闭环单测
node --test scripts/test-simulator.mjs

# 2. 运行 17 项单 HTML 打包器构建测试
node --test scripts/test-single-html.mjs

# 3. 运行 DOM 状态与资产校验
node scripts/check-ui-state.mjs
npm run check

# 4. 运行单文件离线 Chromium 自动化测试（需 python3 与 playwright）
python3 scripts/test-standalone.py

# 5. 运行主应用 Chromium 浏览器全量交互测试
python3 scripts/test-browser.py
```

---

## 📄 许可证

本项目遵循 MIT 许可证。内置 Three.js (r170) 遵循其官方 MIT 许可。
