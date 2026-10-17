// All positions are artistic model coordinates, not Tesla engineering dimensions.
export const SOURCES = [
  {id:'S1',title:'Tesla · Roadster 官方页面',url:'https://www.tesla.com/roadster',kind:'官方图片 / 车型定义',note:'新版楔形外观、金色玻璃、座舱、悬架、尾部喷口与风扇；Rocket 为单座、周向冷气推进。'},
  {id:'S2',title:'Top Gear · 实车访问与 25 张照片',url:'https://www.topgear.com/car-news/electric/tesla-roadster-has-finally-landed-thrusters-0-60mph-059s-and-flight',kind:'第一手实车报道 · 2026-10-16',note:'四个尾喷口、后部 200 L 储气瓶；Rocket 版以额外 400 L 储气瓶替代副驾，并增加六个推进器。'},
  {id:'S3',title:'Hagerty · Lars Moravy 工程讲解',url:'https://www.youtube.com/watch?v=22rvpUecLts',kind:'原始工程师访谈 · 2026-10-16',note:'供继续核对工程细节的原始视频。此项目没有逐帧测量视频，也不将转述的坐标视作官方布置。'},
  {id:'S4',title:'Top Gear · 设计与工程负责人讲解',url:'https://www.youtube.com/watch?v=JdkIOhFmbKI',kind:'原始实车讲解 · 2026-10-16',note:'外观、动力、气动与推进系统的公开实车讲解。'}
];
export const THRUSTERS = [
  ...[-.69,-.23,.23,.69].map((z,i)=>({id:`R${i+1}`,name:`尾部主喷口 ${i+1}`,position:[-2.51,.66,z],exhaust:[-1,0,0],level:'observed',area:'尾部 / 四孔横列',role:'向后排气 → 车身向前受力',evidence:'S1 官方尾部图可辨认四个主喷口；S2 第一手报道确认数量。坐标与口径按外观简化。',source:'S1 · S2'})),
  {id:'L1',name:'左前升力喷口',position:[1.93,.34,.87],exhaust:[0,-1,0],level:'inferred',area:'左前角 / 下表面',role:'向下排气 → 向上受力；可参与姿态控制',evidence:'S1 确认周向推进器可产生向上加速度，S2 描述增加六个前部及侧面推进器。四角升力布局是功能性推断，开口与转动角度未公开确认。',source:'S1 · S2'},
  {id:'L2',name:'右前升力喷口',position:[1.93,.34,-.87],exhaust:[0,-1,0],level:'inferred',area:'右前角 / 下表面',role:'向下排气 → 向上受力；可参与姿态控制',evidence:'与 L1 对称布置用于说明升力与姿态力矩。精确点位、数量分配与喷口朝向均为示意。',source:'S1 · S2'},
  {id:'L3',name:'左后升力喷口',position:[-1.97,.34,.87],exhaust:[0,-1,0],level:'inferred',area:'左后角 / 下表面',role:'向下排气 → 向上受力；可参与姿态控制',evidence:'与前部升力点配合，可示意俯仰和横滚控制。此处不是官方安装坐标。',source:'S1 · S2'},
  {id:'L4',name:'右后升力喷口',position:[-1.97,.34,-.87],exhaust:[0,-1,0],level:'inferred',area:'右后角 / 下表面',role:'向下排气 → 向上受力；可参与姿态控制',evidence:'与 L3 对称的候选位置。具体转向机构、结构避让和管路未公开，均未复原。',source:'S1 · S2'},
  {id:'Y1',name:'左前侧向喷口',position:[1.98,.61,1.02],exhaust:[0,0,1],level:'inferred',area:'前部左侧 / 侧围',role:'向左排气 → 向右受力；可产生偏航力矩',evidence:'S1 描述侧向旋转运动，S2 提到前部及侧面额外推进器。将一对侧向喷口放在前侧是可解释偏航的候选布局。',source:'S1 · S2'},
  {id:'Y2',name:'右前侧向喷口',position:[1.98,.61,-1.02],exhaust:[0,0,-1],level:'inferred',area:'前部右侧 / 侧围',role:'向右排气 → 向左受力；可产生偏航力矩',evidence:'与 Y1 对称的候选位置。未将早期“车牌后隐藏喷口”说法套用到新版。',source:'S1 · S2'}
];
export const PARTS = [
 {id:'tankRear',name:'后部储气瓶',label:'200 L · 公开容量',level:'public',source:'S2',note:'位于座舱后方 / 行李舱区域。低多边形外形、安装支架与尺寸为示意。'},
 {id:'tankPassenger',name:'Rocket 附加储气瓶',label:'400 L · 公开容量',level:'public',source:'S2',note:'替代副驾座位，因此本模型只保留驾驶位。瓶体轮廓与固定方式为示意。'},
 {id:'battery',name:'底部电池包',label:'体块与分区示意',level:'schematic',source:'S2',note:'公开资料确认电池位于长轴距车身内；容量、模块数量和本模型中的分区没有公开依据。'},
 {id:'motors',name:'双后电机',label:'公开布局 / 简化外形',level:'public',source:'S2',note:'两个电机位于后轴内侧。壳体、逆变器、传动轴和空间关系均作低模概括。'},
 {id:'suspension',name:'悬架与车架',label:'官方细节图 / 结构示意',level:'schematic',source:'S1',note:'参考官方悬架照片的横向弹簧与杆件视觉特征；连杆、铰点和承载结构没有工程级复原。'},
 {id:'fans',name:'底部抽吸风扇',label:'与推进喷口分开标示',level:'public',source:'S1 · S2',note:'尾部下方的深色风扇用于底部抽吸。它们不是四个主推进喷口；叶轮和风道为示意。'}
];
export const GALLERY = [
 {file:'Roadster-08-End-Desktop.jpg',title:'01 / 新版外观',caption:'楔形车头、低矮座舱与直线车身',source:'S1'},
 {file:'Roadster-02-Pilot-Desktop.jpg',title:'02 / 侧面比例',caption:'参考轮位、车顶和腰线；未用于尺寸标定',source:'S1'},
 {file:'Roadster-07-Augments-Desktop.jpg',title:'03 / 四个尾部主喷口',caption:'横列圆形喷口；下方抽吸风扇是独立系统',source:'S1'},
 {file:'Roadster-03-Carousel-Slide-4-Desktop.jpg',title:'04 / 公开座舱',caption:'此图为双座展示车；模型采用单座 Rocket 布局',source:'S1'},
 {file:'Roadster-03-Carousel-Slide-5-Desktop.jpg',title:'05 / 公开悬架细节',caption:'可供简化杆件与弹簧的视觉参考',source:'S1'},
 {file:'Roadster-06-Gravity-Desktop.jpg',title:'06 / 底部与推进演示',caption:'官方宣传图用于观察，不能直接当作安装图',source:'S1'}
];
