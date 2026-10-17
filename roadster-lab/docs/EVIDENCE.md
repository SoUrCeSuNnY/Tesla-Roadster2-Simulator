# 图片资料、内构依据与喷口标注

研究日期：2026-10-17。对象为新版白色楔形 Roadster 的 Rocket 配置；不采用早期红色 2+2 概念车外形。

## 原始来源

| ID | 来源 | 可用于什么 |
| --- | --- | --- |
| S1 | [Tesla Roadster 官方页面](https://www.tesla.com/roadster) | 车身、金色玻璃、座舱、悬架细节、尾部四孔、抽吸风扇和车型定义 |
| S2 | [Top Gear 第一手实车访问，2026-10-16](https://www.topgear.com/car-news/electric/tesla-roadster-has-finally-landed-thrusters-0-60mph-059s-and-flight) | 四个尾喷口、后部储气区域、Rocket 附加储气瓶与增加六个推进器、双后电机布局 |
| S3 | [Hagerty 原始工程师访谈](https://www.youtube.com/watch?v=22rvpUecLts) | Lars Moravy 实车工程讲解；供读者进一步核对，本项目未逐帧测量视频 |
| S4 | [Top Gear 原始实车讲解](https://www.youtube.com/watch?v=JdkIOhFmbKI) | 设计与工程负责人访谈；与 S2 的文字报道交叉参照 |

S1 官方文字区分双座 Thrust 与单座 Rocket，描述后者具有周向冷气推进器，可提供向前、向上及侧向旋转运动。S2 的第一手访问说明四个尾部主喷口及后部 200 L 储气瓶，Rocket 用额外 400 L 瓶替代副驾并增加六个推进器。具体容量是公开描述，不用于推算本模型的瓶壁、压力、口径或机械强度。

## 图片索引

下列六图为 S1 当前公开页面的官方素材。离线包内保存了缩放版本；原图版权归 Tesla。

| 图像 | 作用 | 官方原图 |
| --- | --- | --- |
| 新版外观 | 楔形车头、深色座舱 | [Roadster-08-End-Desktop.jpg](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-08-End-Desktop.jpg) |
| 侧面 | 轮位、车顶、腰线比例 | [Roadster-02-Pilot-Desktop.jpg](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-02-Pilot-Desktop.jpg) |
| 尾部主喷口 | 可辨认四个圆形喷口；与下方风扇区分 | [Roadster-07-Augments-Desktop.jpg](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-07-Augments-Desktop.jpg) |
| 座舱 | 驾驶位、方向盘、屏幕的简化参考；此图是双座展示车 | [Roadster-03-Carousel-Slide-4-Desktop.jpg](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-4-Desktop.jpg) |
| 悬架 | 弹簧、杆件的视觉参考 | [Roadster-03-Carousel-Slide-5-Desktop.jpg](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-5-Desktop.jpg) |
| 底部及推进演示 | 候选区域观察，不能视为精确安装图 | [Roadster-06-Gravity-Desktop.jpg](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-06-Gravity-Desktop.jpg) |

## 内构的公开程度

| 系统 | 公开依据 | 本模型采用的示意 |
| --- | --- | --- |
| 座舱后方储气瓶 | S2 给出 200 L 与后部区域 | 低多边形瓶体、约束带和支架的形状与大小 |
| 副驾区域附加储气瓶 | S2 描述额外 400 L 取代副驾 | 横置长形体块；非实测瓶体轮廓 |
| 双后电机 | S2 描述后轴内侧两台电机 | 圆柱壳体、逆变器、传动轴和间距 |
| 底部电池包 | S2 确认车身内的大电池 | 底板体块、八道视觉分隔；不表示真实模块数量或容量 |
| 悬架、车架 | S1 有局部照片 | 杆件、横向弹簧与梁；未复原真实铰点 |
| 尾部抽吸风扇 | S1 / S2 描述抽吸系统 | 四个风扇的简化叶轮与位置 |
| 管路与阀块 | 未取得完整公开管路图 | 橙色连线仅解释储气到喷口的逻辑；不是可制造布管方案 |

## 喷口候选位置

下表所有坐标都属于艺术模型。+X 指向车头，+Y 向上，+Z 指向车身左侧；原点在车身中部的地平面附近。排气方向与车身受力方向相反。

| 编号 | 区域 | 模型坐标 (X,Y,Z) | 排气方向 | 证据等级 |
| --- | --- | --- | --- | --- |
| R1 | 尾部第 1 孔 | (-2.51,0.66,-0.69) | -X，向后 | 外观可见；坐标近似 |
| R2 | 尾部四孔 | (-2.51,0.66,-0.23) | -X，向后 | 外观可见；坐标近似 |
| R3 | 尾部四孔 | (-2.51,0.66,0.23) | -X，向后 | 外观可见；坐标近似 |
| R4 | 尾部第 4 孔 | (-2.51,0.66,0.69) | -X，向后 | 外观可见；坐标近似 |
| L1 | 左前角下表面 | (1.93,0.34,0.87) | -Y，向下 | 四角升力方案推断 |
| L2 | 右前角下表面 | (1.93,0.34,-0.87) | -Y，向下 | 对称布局推断 |
| L3 | 左后角下表面 | (-1.97,0.34,0.87) | -Y，向下 | 四角升力方案推断 |
| L4 | 右后角下表面 | (-1.97,0.34,-0.87) | -Y，向下 | 对称布局推断 |
| Y1 | 左前侧围 | (1.98,0.61,1.02) | +Z，向左 | 前部侧向 / 偏航方案推断 |
| Y2 | 右前侧围 | (1.98,0.61,-1.02) | -Z，向右 | 对称布局推断 |

四个尾部主喷口的存在与横列可从官方图像核对。新增六个点的区域有公开功能描述；“四角向下 + 前部两侧向外”是本项目可解释升力与偏航的一种候选方案。没有证据证明其精确点位、转动角度、转向机构或朝向与实车一致，因此均以琥珀色虚线标记。这里不声称固定朝向能复现发布演示的全部机动。

## 限制

没有取得或验证完整 CAD、工程剖面、安装坐标、全车精确尺寸和完整管路图。所有视图、爆炸位移、压力容器外形、喷口口径、梁和悬架都只能用于视觉讲解，不用于结构分析或制造。模型没有真实推力、气流、质量、重心或飞行控制仿真。

旧版“车牌后隐藏喷口”构想与新版公开四孔不同，未混用。气流采用淡色锥体与箭头，不使用燃烧火焰来表现冷气推进。
