# 模拟器集成验证记录

## 当前结果

- `node --test scripts/test-simulator.mjs`：**112 passed，0 failed，0 skipped**。
- `node scripts/check-ui-state.mjs`：**PASS**。该测试读取 `dist/viewer.html`，覆盖原查看器的 DOM 状态、模式、展开滑块、喷口说明、GLB 导出与无 WebGL 回退；不把 DOM mock 当作真实渲染证明。
- `npm run check`：**PASS**。6746 三角形、283 网格、10 喷口、6 张资料图片；GLB 522356 bytes、270 导出节点。
- `python3 scripts/test-browser.py`：真实无头 Chromium **66 项检查通过**；模拟器与查看器均无 JavaScript `pageerror`。使用软件 WebGL 参数 `--enable-unsafe-swiftshader`，不是特定 GPU 的性能验证。

## 最终复审

**APPROVED**：本轮 LANDING／起飞保护／三轴反转已完成最终复审。Reviewer 首轮发现焦点清键可绕过物理松键保护，现使用独立 physicalKeys 跟踪并阻止清键后的 auto-repeat 复活；复审无剩余阻塞项。Reviewer 独立重跑 **112/112** 单测通过。集成方完整 Chromium **66 项检查全部通过**（含真实 W/I/K 起飞、动态警告、焦点repeat防绕过、LANDING实际帧、三轴反转持久化和移动视口）。

## 针对性修复与回归范围

1. **地面翻滚检测**：接地时超过 45° 的姿态检测独立于首次着陆／报告窗口。数值回归覆盖未激活飞行判定的 44.9999°、45°、45.0001°、60°，无敌开关、重复事件防护，以及完成正常着陆报告后再次翻滚。
2. **按键释放与控件焦点**：HUD 获得焦点、blur、visibilitychange 清除驾驶输入；捕获阶段的 keyup 总是移除释放键。复审发现 Space 的默认按钮激活也被取消，现仅在驾驶上下文阻止默认行为，保留控件键盘操作。
3. **查看器入口**：DOM 冒烟测试使用 `viewer.html`；真实 Chromium 也加载该入口并切换透视模式。
4. **重置报告与状态**：数值测试覆盖真实待定／已报告的正常着陆与坠毁状态重置，确认没有延迟事件。浏览器检查按钮 Space 和驾驶上下文 R 都能清除相关状态／报告，并恢复驾驶焦点。

5. **方向修复**：地面转向符号反转；飞行 Q/E 滚转符号反转；飞行 A/D 偏航符号未改。数值测试覆盖前进／倒车 Ackermann、直接／辅助各轴力矩符号与角速率收敛。
6. **自定义按键**：11 项新增单元测试覆盖 12 个默认动作、分模式 W/S、共享升力、左右修饰键、版本化持久化、异常／损坏存储回退、非法键与动作、订阅快照、默认恢复和重复绑定。浏览器覆盖实际点击捕获改键、modal 防误输入、HUD 动态提示、I/K 分模式映射、T 重置、刷新后保留、Escape 行为、默认恢复，以及 390×844／844×390 的入口和关闭按钮可访问性。

7. **LANDING角度级联**：新增数值测试验证不同航向下中立回正力矩、±30°定角收敛／松杆恢复、Yaw速率不变、0.2秒混合、进入退出滞回和GROUND／DIRECT退出。HUD显示LANDING ASSIST。
8. **起飞持键保护**：默认W与自定义油门I／低头K真实起飞均验证双向Pitch阻断、物理键名警告、keyup立即解除、新按键生效及反转不能绕过；额外覆盖HUD焦点清键＋auto-repeat绕过回归。
9. **飞行轴反转**：所有8种组合只交换对应飞行输入，实际直接／辅助力矩随之反转，地面物理转向与油门不变；兼容旧version1载入、无效数据／存储失败回退、默认恢复false。共新增26项单元测试，原86项保留。

## 浏览器检查

脚本：`scripts/test-browser.py`。使用 Python 的可选 `playwright` 包及已安装 Chromium；模拟器运行本身不需要这些依赖。先启动静态服务器，再执行：

```bash
# 终端一，从 roadster-lab/ 运行
python3 -m http.server 8080 --directory dist

# 终端二，从 roadster-lab/ 运行
python3 scripts/test-browser.py
# 可选：ROADSTER_URL=http://127.0.0.1:其他端口/
```

检查包含：WebGL 页面运行、驾驶按键生效、HUD 焦点清键、控件上的捕获释放、方向键调节滑块、Space 激活 DIRECT／ASSISTED／REFILL／关闭报告／RESET 且不误触升力、R 清除真实待定着陆及报告、无旧报告复现、Escape 返回驾驶、查看器切换模式与页面异常检查。

截图：[`simulator-regression.png`](simulator-regression.png)、[`simulator-keybinds.png`](simulator-keybinds.png)。截图显示当前城市道路、车辆、遥测和控制 HUD；它不是全部物理场景的视觉验收。

## 边界与未验证事项

- blur／visibilitychange 在浏览器内显式派发事件验证注册的处理逻辑，**没有验证操作系统切窗或真实后台标签页调度**。
- 未进行跨浏览器、真实移动硬件、真实 GPU 性能、音频主观体验或长时间人工游玩验收；移动尺寸仅在 Chromium 中模拟视口。
- 本轮扩展浏览器脚本在软件渲染下曾超过170秒；测试场景现将WebGL像素比降为0.5、保留原CSS视口，最终在240秒工具上限内完整通过66项。此优化仅在测试脚本内，不改变游戏默认渲染。浏览器／操作系统保留快捷键不保证可捕获。
- 起飞物理键的keyup若在浏览器失焦期间丢失，会保守保留锁定；重新按下并松开提示键恢复。这是fail-closed设计，不会因焦点清键误解锁。
- 接地数值与控制回归验证的是本游戏实现，不代表真实车辆性能或物理参数校准。
- 当前工作目录不含 Git 仓库元数据，不能提供 Git diff／提交级验证。
- 之前超时的补充测试子任务已取消，本记录采用新加入并实际运行的回归脚本结果，不依赖该子任务。
