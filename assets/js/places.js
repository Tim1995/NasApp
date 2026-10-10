/* ============================================================
 * 小脚丫旅行记 · 地点搜索
 * 1) 内置离线地点库：全国主要城市 + 热门景点，断网也能搜到
 * 2) 在线搜索回退：高德（需 Key）→ Photon → Nominatim
 * 坐标统一以 WGS-84 保存。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var Places = (BF.Places = {});

  /* ============================================================
   * 一、离线数据
   * 城市格式：名称|纬度|经度|省份|拼音与首字母
   * 景点格式：名称|纬度|经度|城市|省份
   * ============================================================ */

  var CITY_DATA = [
    '北京|39.9042|116.4074|北京|beijing bj',
    '上海|31.2304|121.4737|上海|shanghai sh',
    '天津|39.0842|117.2009|天津|tianjin tj',
    '重庆|29.5630|106.5516|重庆|chongqing cq',
    '石家庄|38.0428|114.5149|河北|shijiazhuang sjz',
    '唐山|39.6305|118.1802|河北|tangshan ts',
    '秦皇岛|39.9354|119.5999|河北|qinhuangdao qhd',
    '承德|40.9515|117.9634|河北|chengde cd',
    '保定|38.8740|115.4646|河北|baoding bd',
    '张家口|40.7686|114.8869|河北|zhangjiakou zjk',
    '邯郸|36.6253|114.5391|河北|handan hd',
    '太原|37.8706|112.5489|山西|taiyuan ty',
    '大同|40.0768|113.3001|山西|datong dt',
    '平遥|37.1892|112.1756|山西|pingyao py',
    '临汾|36.0880|111.5190|山西|linfen lf',
    '运城|35.0264|111.0075|山西|yuncheng yc',
    '呼和浩特|40.8424|111.7490|内蒙古|huhehaote hhht',
    '包头|40.6574|109.8404|内蒙古|baotou bt',
    '鄂尔多斯|39.6086|109.7810|内蒙古|eerduosi eeds',
    '呼伦贝尔|49.2122|119.7658|内蒙古|hulunbeier hlbe',
    '沈阳|41.8057|123.4315|辽宁|shenyang sy',
    '大连|38.9140|121.6147|辽宁|dalian dl',
    '丹东|40.0006|124.3547|辽宁|dandong dd',
    '锦州|41.0954|121.1270|辽宁|jinzhou jz',
    '长春|43.8171|125.3235|吉林|changchun cc',
    '吉林市|43.8378|126.5494|吉林|jilin jl',
    '延吉|42.9046|129.5091|吉林|yanji yj',
    '哈尔滨|45.8038|126.5349|黑龙江|haerbin heb',
    '齐齐哈尔|47.3546|123.9180|黑龙江|qiqihaer qqhe',
    '牡丹江|44.5514|129.6329|黑龙江|mudanjiang mdj',
    '漠河|52.9722|122.5388|黑龙江|mohe mh',
    '南京|32.0603|118.7969|江苏|nanjing nj',
    '苏州|31.2989|120.5853|江苏|suzhou sz',
    '无锡|31.4912|120.3119|江苏|wuxi wx',
    '常州|31.8107|119.9741|江苏|changzhou cz',
    '武进|31.7020|119.9378|江苏|wujin wj',
    '湖塘|31.7290|119.9434|江苏|hutang ht',
    '金坛|31.7233|119.5825|江苏|jintan jt',
    '溧阳|31.4179|119.4787|江苏|liyang ly',
    '句容|31.9478|119.1634|江苏|jurong jr',
    '遥观|31.7020|120.0291|江苏|yaoguan yg',
    '洛阳|31.6474|120.0716|江苏|luoyang ly',
    '前黄|31.5923|119.9524|江苏|qianhuang qh',
    '雪堰|31.5301|120.0475|江苏|xueyan xy',
    '邹区|31.7942|119.8406|江苏|zouqu zq',
    '奔牛|31.8504|119.8134|江苏|benniu bn',
    '戚墅堰|31.7242|120.0624|江苏|qishuyan qsy',
    '扬州|32.3947|119.4128|江苏|yangzhou yz',
    '镇江|32.1879|119.4250|江苏|zhenjiang zj',
    '南通|31.9802|120.8943|江苏|nantong nt',
    '徐州|34.2058|117.2840|江苏|xuzhou xz',
    '连云港|34.5967|119.2216|江苏|lianyungang lyg',
    '盐城|33.3496|120.1616|江苏|yancheng yc',
    '杭州|30.2741|120.1551|浙江|hangzhou hz',
    '宁波|29.8683|121.5440|浙江|ningbo nb',
    '温州|27.9938|120.6994|浙江|wenzhou wz',
    '绍兴|30.0300|120.5800|浙江|shaoxing sx',
    '嘉兴|30.7522|120.7500|浙江|jiaxing jx',
    '湖州|30.8941|120.0863|浙江|huzhou hz',
    '金华|29.0784|119.6474|浙江|jinhua jh',
    '舟山|29.9853|122.2072|浙江|zhoushan zs',
    '台州|28.6560|121.4207|浙江|taizhou tz',
    '丽水|28.4674|119.9229|浙江|lishui ls',
    '合肥|31.8206|117.2272|安徽|hefei hf',
    '黄山|29.7147|118.3376|安徽|huangshan hs',
    '芜湖|31.3526|118.4331|安徽|wuhu wh',
    '宣城|30.9457|118.7588|安徽|xuancheng xc',
    '池州|30.6600|117.4915|安徽|chizhou cz',
    '安庆|30.5435|117.0631|安徽|anqing aq',
    '福州|26.0745|119.2965|福建|fuzhou fz',
    '厦门|24.4798|118.0894|福建|xiamen xm',
    '泉州|24.8741|118.6757|福建|quanzhou qz',
    '漳州|24.5130|117.6471|福建|zhangzhou zz',
    '龙岩|25.0751|117.0173|福建|longyan ly',
    '南平|26.6436|118.1777|福建|nanping np',
    '南昌|28.6820|115.8579|江西|nanchang nc',
    '九江|29.7051|116.0019|江西|jiujiang jj',
    '景德镇|29.2689|117.1783|江西|jingdezhen jdz',
    '上饶|28.4548|117.9434|江西|shangrao sr',
    '赣州|25.8310|114.9350|江西|ganzhou gz',
    '吉安|27.1138|114.9925|江西|jian ja',
    '济南|36.6512|117.1201|山东|jinan jn',
    '青岛|36.0671|120.3826|山东|qingdao qd',
    '烟台|37.4638|121.4479|山东|yantai yt',
    '威海|37.5128|122.1201|山东|weihai wh',
    '泰安|36.1994|117.0879|山东|taian ta',
    '曲阜|35.5810|116.9865|山东|qufu qf',
    '淄博|36.8131|118.0548|山东|zibo zb',
    '潍坊|36.7069|119.1617|山东|weifang wf',
    '日照|35.4164|119.5269|山东|rizhao rz',
    '郑州|34.7466|113.6254|河南|zhengzhou zz',
    '洛阳|34.6197|112.4540|河南|luoyang ly',
    '开封|34.7971|114.3075|河南|kaifeng kf',
    '安阳|36.1034|114.3931|河南|anyang ay',
    '焦作|35.2159|113.2418|河南|jiaozuo jz',
    '登封|34.4536|113.0205|河南|dengfeng df',
    '新乡|35.3030|113.9268|河南|xinxiang xx',
    '武汉|30.5928|114.3055|湖北|wuhan wh',
    '宜昌|30.6919|111.2865|湖北|yichang yc',
    '襄阳|32.0090|112.1220|湖北|xiangyang xy',
    '恩施|30.2721|109.4881|湖北|enshi es',
    '十堰|32.6290|110.7983|湖北|shiyan sy',
    '长沙|28.2282|112.9388|湖南|changsha cs',
    '张家界|29.1171|110.4791|湖南|zhangjiajie zjj',
    '湘西|28.3119|109.7398|湖南|xiangxi xx',
    '衡阳|26.8940|112.5718|湖南|hengyang hy',
    '岳阳|29.3570|113.1290|湖南|yueyang yy',
    '广州|23.1291|113.2644|广东|guangzhou gz',
    '深圳|22.5431|114.0579|广东|shenzhen sz',
    '珠海|22.2707|113.5767|广东|zhuhai zh',
    '佛山|23.0218|113.1219|广东|foshan fs',
    '东莞|23.0207|113.7518|广东|dongguan dg',
    '惠州|23.1115|114.4161|广东|huizhou hz',
    '汕头|23.3535|116.6820|广东|shantou st',
    '湛江|21.2707|110.3594|广东|zhanjiang zj',
    '肇庆|23.0470|112.4650|广东|zhaoqing zq',
    '南宁|22.8170|108.3665|广西|nanning nn',
    '桂林|25.2736|110.2900|广西|guilin gl',
    '阳朔|24.7784|110.4968|广西|yangshuo ys',
    '北海|21.4733|109.1194|广西|beihai bh',
    '柳州|24.3146|109.4283|广西|liuzhou lz',
    '海口|20.0442|110.1999|海南|haikou hk',
    '三亚|18.2528|109.5119|海南|sanya sy',
    '万宁|18.7953|110.3898|海南|wanning wn',
    '文昌|19.5433|110.7970|海南|wenchang wc',
    '成都|30.5728|104.0668|四川|chengdu cd',
    '绵阳|31.4675|104.6796|四川|mianyang my',
    '乐山|29.5521|103.7657|四川|leshan ls',
    '峨眉山|29.6013|103.4844|四川|emeishan ems',
    '都江堰|30.9880|103.6468|四川|dujiangyan djy',
    '九寨沟|33.2600|103.9180|四川|jiuzhaigou jzg',
    '稻城|29.0378|100.2978|四川|daocheng dc',
    '宜宾|28.7513|104.6308|四川|yibin yb',
    '西昌|27.8816|102.2683|四川|xichang xc',
    '贵阳|26.6470|106.6302|贵州|guiyang gy',
    '遵义|27.7256|106.9274|贵州|zunyi zy',
    '安顺|26.2456|105.9322|贵州|anshun as',
    '凯里|26.5668|107.9813|贵州|kaili kl',
    '铜仁|27.7182|109.1911|贵州|tongren tr',
    '昆明|25.0389|102.7183|云南|kunming km',
    '大理|25.6065|100.2679|云南|dali dl',
    '丽江|26.8721|100.2299|云南|lijiang lj',
    '香格里拉|27.8270|99.7060|云南|xianggelila xgll',
    '景洪|22.0108|100.7978|云南|jinghong jh',
    '腾冲|25.0203|98.4904|云南|tengchong tc',
    '拉萨|29.6520|91.1721|西藏|lasa ls',
    '日喀则|29.2699|88.8804|西藏|rikaze rkz',
    '林芝|29.6503|94.3624|西藏|linzhi lz',
    '西安|34.3416|108.9398|陕西|xian xa',
    '咸阳|34.3330|108.7092|陕西|xianyang xy',
    '宝鸡|34.3613|107.2370|陕西|baoji bj',
    '延安|36.5856|109.4899|陕西|yanan ya',
    '渭南|34.4994|109.5100|陕西|weinan wn',
    '汉中|33.0777|107.0235|陕西|hanzhong hz',
    '兰州|36.0611|103.8343|甘肃|lanzhou lz',
    '敦煌|40.1421|94.6618|甘肃|dunhuang dh',
    '嘉峪关|39.7725|98.2895|甘肃|jiayuguan jyg',
    '张掖|38.9257|100.4499|甘肃|zhangye zy',
    '天水|34.5809|105.7249|甘肃|tianshui ts',
    '西宁|36.6171|101.7782|青海|xining xn',
    '格尔木|36.4067|94.9031|青海|geermu gem',
    '银川|38.4872|106.2309|宁夏|yinchuan yc',
    '中卫|37.5149|105.1967|宁夏|zhongwei zw',
    '乌鲁木齐|43.8256|87.6168|新疆|wulumuqi wlmq',
    '喀什|39.4677|75.9937|新疆|kashi ks',
    '吐鲁番|42.9476|89.1840|新疆|tulufan tlf',
    '伊宁|43.9160|81.3242|新疆|yining yn',
    '阿勒泰|47.8484|88.1400|新疆|aletai alt',
    '库尔勒|41.7259|86.1746|新疆|kuerle kel',
    '香港|22.3193|114.1694|香港|xianggang xg',
    '澳门|22.1987|113.5439|澳门|aomen am',
    '台北|25.0330|121.5654|台湾|taibei tb',
    '高雄|22.6273|120.3014|台湾|gaoxiong gx',
    '花莲|23.9769|121.6016|台湾|hualian hl',
    '屏东|22.6761|120.4942|台湾|pingdong pd',
    '台南|22.9997|120.2270|台湾|tainan tn',
    '台中|24.1477|120.6736|台湾|taizhong tz',
    '新北|25.0114|121.4618|台湾|xinbei xb',
    '桃园|24.9936|121.3010|台湾|taoyuan ty'
  ];

  var SPOT_DATA = [
    '天安门广场|39.9055|116.3976|北京|北京',
    '故宫博物院|39.9163|116.3972|北京|北京',
    '八达岭长城|40.3565|116.0177|北京|北京',
    '颐和园|39.9999|116.2755|北京|北京',
    '天坛公园|39.8822|116.4066|北京|北京',
    '北京动物园|39.9390|116.3370|北京|北京',
    '中国科学技术馆|40.0076|116.3900|北京|北京',
    '国家体育场鸟巢|39.9928|116.3906|北京|北京',
    '北京环球影城|39.8547|116.6747|北京|北京',
    '南锣鼓巷|39.9366|116.4033|北京|北京',
    '圆明园|40.0081|116.2984|北京|北京',
    '北海公园|39.9256|116.3892|北京|北京',
    '国家博物馆|39.9050|116.3970|北京|北京',
    '外滩|31.2397|121.4900|上海|上海',
    '东方明珠广播电视塔|31.2397|121.4998|上海|上海',
    '上海迪士尼乐园|31.1434|121.6576|上海|上海',
    '上海科技馆|31.2243|121.5440|上海|上海',
    '豫园|31.2270|121.4920|上海|上海',
    '南京路步行街|31.2346|121.4750|上海|上海',
    '上海海洋水族馆|31.2404|121.5050|上海|上海',
    '上海自然博物馆|31.2345|121.4680|上海|上海',
    '朱家角古镇|31.1110|121.0540|上海|上海',
    '上海博物馆|31.2300|121.4750|上海|上海',
    '天津之眼|39.1700|117.1870|天津|天津',
    '五大道|39.1150|117.2050|天津|天津',
    '天津古文化街|39.1420|117.2030|天津|天津',
    '天津意式风情区|39.1470|117.2100|天津|天津',
    '洪崖洞|29.5628|106.5818|重庆|重庆',
    '解放碑步行街|29.5570|106.5770|重庆|重庆',
    '磁器口古镇|29.5830|106.4540|重庆|重庆',
    '长江索道|29.5620|106.5860|重庆|重庆',
    '李子坝轻轨穿楼|29.5540|106.5120|重庆|重庆',
    '武隆天生三桥|29.4600|107.9100|重庆|重庆',
    '大足石刻|29.7030|105.7060|重庆|重庆',
    '承德避暑山庄|40.9950|117.9380|承德|河北',
    '山海关|39.9800|119.7700|秦皇岛|河北',
    '北戴河|39.8280|119.5180|秦皇岛|河北',
    '白洋淀|38.9300|115.9800|保定|河北',
    '野三坡|39.6900|115.4800|保定|河北',
    '正定古城|38.1450|114.5700|石家庄|河北',
    '平遥古城|37.2000|112.1740|平遥|山西',
    '云冈石窟|40.1100|113.1350|大同|山西',
    '五台山|39.0080|113.5960|忻州|山西',
    '壶口瀑布|36.1480|110.4470|临汾|山西',
    '乔家大院|37.4020|112.4900|晋中|山西',
    '晋祠|37.7070|112.4400|太原|山西',
    '悬空寺|39.6660|113.7180|大同|山西',
    '呼伦贝尔大草原|49.2800|119.7000|呼伦贝尔|内蒙古',
    '响沙湾|40.3600|109.9500|鄂尔多斯|内蒙古',
    '成吉思汗陵|39.3800|109.7800|鄂尔多斯|内蒙古',
    '希拉穆仁草原|41.3100|111.1800|包头|内蒙古',
    '沈阳故宫|41.7970|123.4550|沈阳|辽宁',
    '沈阳森林动物园|41.8600|123.7300|沈阳|辽宁',
    '大连老虎滩海洋公园|38.8760|121.6600|大连|辽宁',
    '大连发现王国|38.8800|121.6800|大连|辽宁',
    '星海广场|38.8750|121.5900|大连|辽宁',
    '鸭绿江断桥|40.1200|124.3900|丹东|辽宁',
    '长白山天池|42.0000|128.0560|白山|吉林',
    '伪满皇宫博物院|43.9000|125.3500|长春|吉林',
    '长影世纪城|43.7800|125.4300|长春|吉林',
    '松花湖|43.6200|126.7300|吉林市|吉林',
    '雾凇岛|44.0600|126.5200|吉林市|吉林',
    '哈尔滨冰雪大世界|45.8100|126.5900|哈尔滨|黑龙江',
    '中央大街|45.7750|126.6150|哈尔滨|黑龙江',
    '圣索菲亚教堂|45.7710|126.6220|哈尔滨|黑龙江',
    '太阳岛风景区|45.7900|126.5850|哈尔滨|黑龙江',
    '哈尔滨极地馆|45.7750|126.6000|哈尔滨|黑龙江',
    '中国雪乡|44.3300|128.9200|牡丹江|黑龙江',
    '漠河北极村|53.4700|122.3600|漠河|黑龙江',
    '南京中山陵|32.0640|118.8500|南京|江苏',
    '夫子庙秦淮风光带|32.0230|118.7880|南京|江苏',
    '南京博物院|32.0430|118.8350|南京|江苏',
    '总统府|32.0450|118.7930|南京|江苏',
    '红山森林动物园|32.0930|118.8000|南京|江苏',
    '拙政园|31.3250|120.6290|苏州|江苏',
    '苏州博物馆|31.3240|120.6230|苏州|江苏',
    '虎丘|31.3430|120.5720|苏州|江苏',
    '周庄古镇|31.1150|120.8500|苏州|江苏',
    '同里古镇|31.1560|120.7160|苏州|江苏',
    '扬州瘦西湖|32.4100|119.4000|扬州|江苏',
    '无锡鼋头渚|31.5300|120.2200|无锡|江苏',
    '灵山大佛|31.4300|120.0900|无锡|江苏',
    '中华恐龙园|31.8100|119.9800|常州|江苏',
    '淹城春秋乐园|31.7069|119.9262|常州|江苏',
    '天目湖山水园|31.3038|119.4287|溧阳|江苏',
    '南山竹海|31.1707|119.5200|溧阳|江苏',
    '花谷奇缘|31.7335|119.3151|常州|江苏',
    '东方盐湖城|31.7664|119.3372|常州|江苏',
    '长荡湖|31.6131|119.5564|常州|江苏',
    '长荡湖旅游度假区|31.6729|119.5819|常州|江苏',
    '茅山风景区|31.7699|119.2729|镇江|江苏',
    '花果山|34.6500|119.2700|连云港|江苏',
    '杭州西湖|30.2480|120.1400|杭州|浙江',
    '灵隐寺|30.2410|120.1010|杭州|浙江',
    '西溪湿地|30.2650|120.0700|杭州|浙江',
    '千岛湖|29.6050|119.0400|杭州|浙江',
    '杭州动物园|30.2230|120.1210|杭州|浙江',
    '杭州长乔极地海洋公园|30.1800|120.2100|杭州|浙江',
    '乌镇|30.7450|120.4900|嘉兴|浙江',
    '西塘古镇|30.9400|120.8900|嘉兴|浙江',
    '南浔古镇|30.8700|120.4300|湖州|浙江',
    '普陀山|30.0100|122.3900|舟山|浙江',
    '雁荡山|28.3700|121.0300|温州|浙江',
    '横店影视城|29.1500|120.3200|金华|浙江',
    '鲁迅故里|29.9930|120.5860|绍兴|浙江',
    '天一阁|29.8740|121.5400|宁波|浙江',
    '宁波海洋世界|29.8600|121.5500|宁波|浙江',
    '黄山风景区|30.1330|118.1670|黄山|安徽',
    '宏村|29.9100|117.9900|黄山|安徽',
    '西递|29.9000|117.9900|黄山|安徽',
    '九华山|30.4800|117.8100|池州|安徽',
    '天柱山|30.7400|116.4600|安庆|安徽',
    '芜湖方特欢乐世界|31.3700|118.4400|芜湖|安徽',
    '鼓浪屿|24.4470|118.0670|厦门|福建',
    '厦门大学|24.4370|118.0980|厦门|福建',
    '曾厝垵|24.4300|118.1300|厦门|福建',
    '厦门科技馆|24.4830|118.1810|厦门|福建',
    '武夷山|27.7200|118.0300|南平|福建',
    '福建土楼永定景区|24.5900|116.9000|龙岩|福建',
    '三坊七巷|26.0860|119.2960|福州|福建',
    '泉州开元寺|24.9110|118.5900|泉州|福建',
    '平潭岛|25.5000|119.7900|福州|福建',
    '庐山|29.5500|115.9800|九江|江西',
    '婺源|29.2480|117.8600|上饶|江西',
    '三清山|28.9100|118.0600|上饶|江西',
    '滕王阁|28.6820|115.8760|南昌|江西',
    '景德镇古窑民俗博览区|29.2900|117.2000|景德镇|江西',
    '龙虎山|28.1100|116.9800|鹰潭|江西',
    '井冈山|26.5800|114.1700|吉安|江西',
    '泰山|36.2550|117.1000|泰安|山东',
    '青岛栈桥|36.0600|120.3150|青岛|山东',
    '八大关|36.0520|120.3500|青岛|山东',
    '青岛海底世界|36.0570|120.3300|青岛|山东',
    '青岛方特梦幻王国|36.2200|120.3000|青岛|山东',
    '崂山|36.1600|120.6300|青岛|山东',
    '五四广场|36.0630|120.3840|青岛|山东',
    '蓬莱阁|37.8200|120.7600|烟台|山东',
    '烟台山|37.5400|121.3900|烟台|山东',
    '威海刘公岛|37.5000|122.1800|威海|山东',
    '曲阜三孔|35.6000|116.9900|曲阜|山东',
    '趵突泉|36.6600|117.0150|济南|山东',
    '大明湖|36.6740|117.0220|济南|山东',
    '千佛山|36.6330|117.0300|济南|山东',
    '龙门石窟|34.5550|112.4700|洛阳|河南',
    '少林寺|34.5070|112.9350|登封|河南',
    '白马寺|34.7200|112.6000|洛阳|河南',
    '清明上河园|34.8000|114.3100|开封|河南',
    '云台山|35.4300|113.4000|焦作|河南',
    '老君山|33.7500|111.6300|洛阳|河南',
    '殷墟|36.1200|114.3200|安阳|河南',
    '河南博物院|34.7700|113.6700|郑州|河南',
    '郑州方特欢乐世界|34.7200|113.7500|郑州|河南',
    '黄鹤楼|30.5450|114.3020|武汉|湖北',
    '武汉东湖|30.5600|114.3700|武汉|湖北',
    '武汉大学|30.5390|114.3620|武汉|湖北',
    '武汉欢乐谷|30.5200|114.4200|武汉|湖北',
    '湖北省博物馆|30.5600|114.3600|武汉|湖北',
    '三峡大坝|30.8200|111.0000|宜昌|湖北',
    '恩施大峡谷|30.3600|109.4000|恩施|湖北',
    '武当山|32.4000|111.0000|十堰|湖北',
    '神农架|31.7400|110.6800|神农架|湖北',
    '张家界国家森林公园|29.3200|110.4300|张家界|湖南',
    '天门山|29.0500|110.4800|张家界|湖南',
    '凤凰古城|27.9500|109.6000|湘西|湖南',
    '橘子洲|28.1800|112.9600|长沙|湖南',
    '岳麓山|28.1800|112.9400|长沙|湖南',
    '湖南省博物馆|28.2100|112.9900|长沙|湖南',
    '长沙生态动物园|28.0900|112.9900|长沙|湖南',
    '南岳衡山|27.2500|112.7000|衡阳|湖南',
    '岳阳楼|29.3700|113.0900|岳阳|湖南',
    '韶山|27.9100|112.5300|湘潭|湖南',
    '广州塔|23.1060|113.3250|广州|广东',
    '长隆野生动物世界|23.0000|113.3200|广州|广东',
    '长隆欢乐世界|23.0000|113.3300|广州|广东',
    '广州动物园|23.1500|113.3000|广州|广东',
    '广东省博物馆|23.1200|113.3200|广州|广东',
    '深圳世界之窗|22.5400|113.9700|深圳|广东',
    '深圳欢乐谷|22.5500|113.9800|深圳|广东',
    '深圳湾公园|22.5100|113.9400|深圳|广东',
    '珠海长隆海洋王国|22.1200|113.5300|珠海|广东',
    '开平碉楼|22.3700|112.5800|江门|广东',
    '丹霞山|25.0300|113.7500|韶关|广东',
    '漓江|25.1000|110.4000|桂林|广西',
    '象鼻山|25.2600|110.3000|桂林|广西',
    '阳朔西街|24.7780|110.4960|阳朔|广西',
    '遇龙河|24.7800|110.4000|阳朔|广西',
    '龙脊梯田|25.7600|110.1200|桂林|广西',
    '北海银滩|21.4300|109.1500|北海|广西',
    '涠洲岛|21.0400|109.1200|北海|广西',
    '德天瀑布|22.8500|106.7500|崇左|广西',
    '亚龙湾|18.2235|109.6395|三亚|海南',
    '天涯海角|18.2997|109.3519|三亚|海南',
    '南山文化旅游区|18.2793|109.1552|三亚|海南',
    '蜈支洲岛|18.3100|109.7600|三亚|海南',
    '呀诺达雨林|18.4500|109.7000|三亚|海南',
    '分界洲岛|18.5800|110.0000|万宁|海南',
    '海口骑楼老街|20.0450|110.3400|海口|海南',
    '海南热带野生动植物园|19.9000|110.4000|海口|海南',
    '成都大熊猫繁育研究基地|30.7350|104.1450|成都|四川',
    '武侯祠|30.6450|104.0450|成都|四川',
    '锦里|30.6450|104.0400|成都|四川',
    '宽窄巷子|30.6700|104.0550|成都|四川',
    '成都欢乐谷|30.7000|104.0300|成都|四川',
    '西岭雪山|30.8500|103.1800|成都|四川',
    '都江堰|31.0000|103.6100|都江堰|四川',
    '青城山|30.9000|103.5700|都江堰|四川',
    '峨眉山|29.5200|103.3300|峨眉山|四川',
    '乐山大佛|29.5500|103.7700|乐山|四川',
    '九寨沟|33.2600|103.9200|阿坝|四川',
    '黄龙|32.7500|103.8200|阿坝|四川',
    '稻城亚丁|28.4300|100.3300|稻城|四川',
    '黄果树瀑布|25.9900|105.6700|安顺|贵州',
    '西江千户苗寨|26.4900|108.1800|黔东南|贵州',
    '荔波小七孔|25.2600|107.6800|黔南|贵州',
    '青岩古镇|26.3300|106.6800|贵阳|贵州',
    '梵净山|27.9100|108.6900|铜仁|贵州',
    '黔灵山公园|26.5900|106.6900|贵阳|贵州',
    '滇池|24.8000|102.6600|昆明|云南',
    '石林|24.8100|103.3200|昆明|云南',
    '云南民族村|24.9600|102.6200|昆明|云南',
    '大理古城|25.6900|100.1600|大理|云南',
    '洱海|25.7800|100.1900|大理|云南',
    '崇圣寺三塔|25.7000|100.1500|大理|云南',
    '丽江古城|26.8720|100.2300|丽江|云南',
    '玉龙雪山|27.1000|100.1800|丽江|云南',
    '束河古镇|26.9100|100.2100|丽江|云南',
    '泸沽湖|27.7000|100.7800|丽江|云南',
    '普达措国家公园|27.9000|99.9500|香格里拉|云南',
    '松赞林寺|27.8600|99.7000|香格里拉|云南',
    '西双版纳热带植物园|21.9300|101.2500|景洪|云南',
    '野象谷|22.1700|100.8500|景洪|云南',
    '腾冲热海|24.9500|98.4400|腾冲|云南',
    '布达拉宫|29.6580|91.1170|拉萨|西藏',
    '大昭寺|29.6530|91.1320|拉萨|西藏',
    '八廓街|29.6530|91.1330|拉萨|西藏',
    '纳木错|30.7500|90.6000|拉萨|西藏',
    '羊卓雍措|29.1800|90.6000|山南|西藏',
    '扎什伦布寺|29.2700|88.8800|日喀则|西藏',
    '雅鲁藏布大峡谷|29.6000|94.9000|林芝|西藏',
    '秦始皇兵马俑|34.3850|109.2730|西安|陕西',
    '大雁塔|34.2200|108.9600|西安|陕西',
    '大唐不夜城|34.2150|108.9600|西安|陕西',
    '西安城墙|34.2600|108.9400|西安|陕西',
    '回民街|34.2650|108.9400|西安|陕西',
    '陕西历史博物馆|34.2200|108.9500|西安|陕西',
    '秦岭野生动物园|34.0300|108.8700|西安|陕西',
    '华清宫|34.3600|109.2100|西安|陕西',
    '华山|34.4800|110.0800|渭南|陕西',
    '延安革命纪念馆|36.6200|109.4700|延安|陕西',
    '莫高窟|40.0400|94.8100|敦煌|甘肃',
    '鸣沙山月牙泉|40.0900|94.6800|敦煌|甘肃',
    '嘉峪关关城|39.8000|98.2200|嘉峪关|甘肃',
    '张掖七彩丹霞|38.9000|100.1300|张掖|甘肃',
    '崆峒山|35.5400|106.5200|平凉|甘肃',
    '麦积山石窟|34.3500|106.0000|天水|甘肃',
    '青海湖|36.9000|100.1800|海南州|青海',
    '塔尔寺|36.4900|101.5700|西宁|青海',
    '茶卡盐湖|36.7000|99.0900|海西|青海',
    '卓尔山|38.2000|100.2200|海北|青海',
    '大柴旦翡翠湖|37.8500|95.2800|海西|青海',
    '沙坡头|37.5000|104.9500|中卫|宁夏',
    '镇北堡西部影城|38.6200|106.0700|银川|宁夏',
    '西夏王陵|38.4300|105.9900|银川|宁夏',
    '贺兰山岩画|38.7500|105.9500|银川|宁夏',
    '宁夏沙湖|38.8000|106.3500|石嘴山|宁夏',
    '天山天池|43.8900|88.1200|昌吉|新疆',
    '喀纳斯湖|48.7200|87.0200|阿勒泰|新疆',
    '禾木村|48.8000|87.4400|阿勒泰|新疆',
    '可可托海|47.2000|89.7800|阿勒泰|新疆',
    '那拉提草原|43.2900|84.0300|伊犁|新疆',
    '赛里木湖|44.6000|81.2000|博尔塔拉|新疆',
    '火焰山|42.9500|89.5000|吐鲁番|新疆',
    '葡萄沟|42.9800|89.2000|吐鲁番|新疆',
    '喀什古城|39.4700|75.9800|喀什|新疆',
    '新疆国际大巴扎|43.7900|87.6200|乌鲁木齐|新疆',
    '香港迪士尼乐园|22.3130|114.0410|香港|香港',
    '香港海洋公园|22.2390|114.1710|香港|香港',
    '太平山顶|22.2740|114.1500|香港|香港',
    '维多利亚港|22.2930|114.1710|香港|香港',
    '香港科学馆|22.3010|114.1780|香港|香港',
    '澳门大三巴牌坊|22.1970|113.5410|澳门|澳门',
    '澳门威尼斯人|22.1450|113.5630|澳门|澳门',
    '澳门旅游塔|22.1800|113.5370|澳门|澳门',
    '台北101|25.0330|121.5650|台北|台湾',
    '台北故宫博物院|25.1020|121.5490|台北|台湾',
    '台北市立动物园|24.9980|121.5810|台北|台湾',
    '日月潭|23.8600|120.9100|南投|台湾',
    '阿里山|23.5100|120.8000|嘉义|台湾',
    '垦丁国家公园|21.9500|120.7700|屏东|台湾',
    '太鲁阁峡谷|24.1600|121.6200|花莲|台湾',
    '九份老街|25.1100|121.8400|新北|台湾',
    '奇美博物馆|22.9000|120.2500|台南|台湾'
  ];

  /* ============================================================
   * 二、索引
   * ============================================================ */

  var cities = [];
  var spots = [];

  function build() {
    CITY_DATA.forEach(function (line) {
      var p = line.split('|');
      if (p.length < 5) return;
      cities.push({
        name: p[0],
        lat: parseFloat(p[1]),
        lng: parseFloat(p[2]),
        prov: p[3],
        pinyin: p[4],
        type: 'city'
      });
    });
    SPOT_DATA.forEach(function (line) {
      var p = line.split('|');
      if (p.length < 5) return;
      var city = p[3];
      var prov = p[4];
      var pin = '';
      for (var i = 0; i < cities.length; i++) {
        if (cities[i].name === city) {
          pin = cities[i].pinyin;
          break;
        }
      }
      spots.push({
        name: p[0],
        lat: parseFloat(p[1]),
        lng: parseFloat(p[2]),
        city: city,
        prov: prov,
        pinyin: pin,
        type: 'spot'
      });
    });
  }
  build();
  Places.cities = cities;
  Places.spots = spots;
  Places.count = cities.length + spots.length;

  /* ============================================================
   * 三、本地搜索
   * ============================================================ */

  /** 去掉「区/县/市/镇」这类行政后缀，让带后缀的写法也能命中不带后缀的库条目 */
  function bare(s) {
    return String(s || '').replace(/(特别行政区|自治州|自治区|新区|地区|城区|街道|镇|区|县|市)$/, '');
  }

  function score(item, kw) {
    var name = item.name;
    if (name === kw) return 120;
    if (name.indexOf(kw) === 0) return 100;
    if (name.indexOf(kw) > 0) return 82;

    // 主体一致、只是后缀不同（「XX」↔「XX 区」）
    var bn = bare(name);
    var bk = bare(kw);
    if (bn && bk && bn === bk) return 114;
    if (bn && bk && bn.indexOf(bk) === 0) return 94;

    var city = item.city || item.prov || '';
    if (city === kw) return 70;
    if (city.indexOf(kw) === 0) return 62;
    if (city.indexOf(kw) > 0) return 52;
    if (item.prov && item.prov.indexOf(kw) >= 0) return 44;
    // 拼音按「词」匹配，避免 changzhou 被 hangzhou 误命中
    if (item.pinyin) {
      var lower = kw.toLowerCase();
      var tokens = item.pinyin.split(' ');
      for (var i = 0; i < tokens.length; i++) {
        if (tokens[i] === lower) return 40;
        if (tokens[i].indexOf(lower) === 0) return 34;
      }
    }
    return 0;
  }

  function localSearch(kw, limit) {
    kw = (kw || '').trim();
    if (!kw) return [];
    var out = [];
    var pool = spots.concat(cities);
    for (var i = 0; i < pool.length; i++) {
      var s = score(pool[i], kw);
      if (s > 0) {
        var item = pool[i];
        out.push({
          name: item.name,
          lat: item.lat,
          lng: item.lng,
          city: item.city || item.name,
          prov: item.prov,
          type: item.type,
          source: 'local',
          score: s + (item.type === 'spot' ? 3 : 0)
        });
      }
    }
    out.sort(function (a, b) {
      return b.score - a.score;
    });
    return out.slice(0, limit || 12);
  }
  Places.localSearch = localSearch;

  /* ============================================================
   * 四、在线搜索（多源回退）
   * ============================================================ */

  var amapKey = ''; // 存在这台设备上的 Key
  var serverHasKey = false; // 服务器上是否已经配置过

  /** 是否配置了高德 Key（配了就能秒出结果，且覆盖最全） */
  Places.hasKey = function () {
    return (BF.DB.mode === 'server' && serverHasKey) || !!amapKey;
  };

  /** 在线搜索是否可用：服务器代理 / 浏览器直连 Photon 都算 */
  Places.onlineReady = function () {
    return true;
  };

  Places.onlineStatus = function () {
    return {
      mode: BF.DB.mode,
      serverHasKey: serverHasKey,
      localKey: !!amapKey,
      hasKey: Places.hasKey(),
      ready: Places.onlineReady()
    };
  };

  Places.setAmapKey = function (key) {
    amapKey = (key || '').trim();
  };
  Places.getAmapKey = function () {
    return amapKey;
  };

  Places.loadKey = function () {
    var serverCheck =
      BF.DB.mode === 'server'
        ? fetch('/api/config', { cache: 'no-store' })
            .then(function (r) {
              return r.ok ? r.json() : {};
            })
            .catch(function () {
              return {};
            })
        : Promise.resolve({});

    return Promise.all([BF.DB.kvGet('amapKey', ''), serverCheck]).then(function (res) {
      amapKey = (res[0] || '').trim();
      serverHasKey = !!(res[1] && res[1].hasAmapKey);
      return amapKey;
    });
  };

  /**
   * 保存 Key：
   *   - 服务端模式下同时写到服务器，这样家里其他设备不用再各配一遍
   *   - 本机也留一份，万一服务器模式临时不可用还能兜住
   */
  Places.saveKey = function (key) {
    amapKey = (key || '').trim();
    return BF.DB.kvSet('amapKey', amapKey).then(function () {
      if (BF.DB.mode !== 'server') return null;
      return fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amapKey: amapKey })
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          serverHasKey = !!(res && res.hasAmapKey);
          return res;
        })
        .catch(function () {
          return null;
        });
    });
  };

  function fetchJSON(url, timeout) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeout || 6000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        return data;
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function makeErr(reason, message) {
    var err = new Error(message);
    err.reason = reason;
    err.friendly = message;
    return err;
  }

  function friendlyAmapInfo(info) {
    switch (info) {
      case 'INVALID_USER_KEY':
        return 'Key 无效，请检查是否复制完整（类型必须是「Web服务」）';
      case 'DAILY_QUERY_OVER_LIMIT':
        return '今天的高德调用额度已经用完，明天会自动恢复';
      case 'USER_KEY_PLATFORM_ERROR':
        return 'Key 类型不对，请创建「Web服务」类型的 Key';
      case 'SERVICE_NOT_AVAILABLE':
        return '这个 Key 没有开通「搜索服务」，请到高德控制台勾选';
      default:
        return '高德返回：' + (info || '未知错误');
    }
  }

  /** 高德官方接口（最准，需要自己申请 Key；支持跨域，可直接在浏览器里调） */
  function searchAmap(kw) {
    if (!amapKey) return Promise.reject(makeErr('no-key', '没有配置高德 Key'));
    var url =
      'https://restapi.amap.com/v3/place/text?key=' +
      encodeURIComponent(amapKey) +
      '&keywords=' +
      encodeURIComponent(kw) +
      '&offset=15&page=1&extensions=base';
    return fetchJSON(url, 8000).then(function (data) {
      if (!data || data.status !== '1') {
        throw makeErr('amap-error', friendlyAmapInfo(data && data.info));
      }
      return (data.pois || [])
        .filter(function (poi) {
          return poi.location && String(poi.location).indexOf(',') > 0;
        })
        .map(function (poi) {
          var parts = String(poi.location).split(',');
          // 高德返回 GCJ-02，转回 WGS-84 保存
          var w = BF.Geo.gcj02ToWgs84(parseFloat(parts[0]), parseFloat(parts[1]));
          return {
            name: poi.name,
            lat: w[1],
            lng: w[0],
            city: poi.cityname && poi.cityname !== '[]' ? poi.cityname : poi.adname || '',
            prov: poi.pname && poi.pname !== '[]' ? poi.pname : '',
            type: 'spot',
            source: 'amap'
          };
        })
        .filter(function (p) {
          return BF.Geo.valid(p.lat, p.lng);
        });
    });
  }

  /** 走自家服务器代理搜索：Key 留在服务器上，浏览器也不受跨域限制 */
  function searchViaServer(kw, bias) {
    var url = '/api/search?q=' + encodeURIComponent(kw);
    if (bias && isFinite(bias.lat) && isFinite(bias.lng)) {
      url += '&lat=' + bias.lat + '&lng=' + bias.lng;
    }
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw makeErr('server-error', '搜索服务返回 ' + r.status);
        return r.json();
      })
      .then(function (res) {
        if (!res || !res.ok) {
          throw makeErr((res && res.reason) || 'server-error', (res && res.message) || '搜索服务不可用');
        }
        if (BF.DB.mode === 'server' && res.hasKey) serverHasKey = true;
        return res.results || [];
      });
  }

  /**
   * Photon（免费、无需 Key，国内可达）
   * 覆盖度很好——景区、小镇、湖泊都能搜到；缺点是慢，正常要 6~15 秒，
   * 所以超时必须给够，否则会在拿到结果前自己把请求掐掉。
   */
  function searchPhoton(kw, bias) {
    var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(kw) + '&limit=15';
    if (bias && isFinite(bias.lat) && isFinite(bias.lng)) {
      url += '&lat=' + bias.lat + '&lon=' + bias.lng;
    }
    return fetchJSON(url, 26000)
      .catch(function () {
        throw makeErr('unreachable', '在线地点服务暂时不可用');
      })
      .then(function (data) {
        if (!data || !data.features) throw makeErr('unreachable', '在线地点服务返回异常');
        return rankList(
          data.features
            .map(function (f) {
              var pr = f.properties || {};
              var c = f.geometry && f.geometry.coordinates;
              if (!c) return null;
              var title = pr.name || pr.street || pr.city || '';
              if (!title) return null;
              return {
                name: title,
                lat: c[1],
                lng: c[0],
                city: (pr.city || pr.district || pr.county || '').trim(),
                prov: (pr.state || '').trim(),
                osmValue: pr.osm_value || pr.type || '',
                type: 'spot',
                source: 'photon'
              };
            })
            .filter(Boolean)
        );
      });
  }

  /* 类型重要度：把行政区排在车站前面，把道路类过滤掉（权重 ≤12 丢弃） */
  var TYPE_WEIGHT = {
    city: 100, municipality: 100, county: 96, district: 95, town: 90, state: 60,
    village: 72, hamlet: 58, suburb: 62, quarter: 48, neighbourhood: 48, locality: 52,
    theme_park: 96, attraction: 96, water_park: 92, zoo: 90, aquarium: 90, museum: 86,
    viewpoint: 82, nature_reserve: 82, lake: 80, park: 78, garden: 78, beach: 76,
    peak: 70, resort: 70, farmyard: 62, camp_site: 60, hotel: 55, wetland: 55,
    administrative: 45, wood: 42, forest: 42, river: 46, canal: 46, water: 46, stream: 40,
    residential: 26, commercial: 22, house: 8, aerodrome: 32, station: 28, halt: 24,
    bus_stop: 16, stop: 12,
    motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 0, unclassified: 0,
    living_street: 0, pedestrian: 0, service: 0, track: 0, path: 0, footway: 0,
    cycleway: 0, steps: 0, road: 0, street: 0, motorway_junction: 6, yes: 0, no: 0
  };

  function weightOf(osmValue) {
    var w = TYPE_WEIGHT[osmValue];
    return w === undefined ? 40 : w;
  }

  /** 过滤掉马路之类的结果，按重要度排序 */
  function rankList(list) {
    var seen = {};
    return list
      .map(function (p) {
        p._w = weightOf(p.osmValue);
        return p;
      })
      .filter(function (p) {
        return p._w > 12;
      })
      .filter(function (p) {
        var k = Math.round(p.lat * 400) + ':' + Math.round(p.lng * 400);
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      })
      .sort(function (a, b) {
        return b._w - a._w;
      });
  }

  /**
   * 综合搜索：先出内置库结果（同步、立刻可见），再异步补充在线结果
   * @param kw 关键词
   * @param opts { bias: {lat, lng} } 参考点，让附近的结果靠前
   * @returns {Promise<{keyword, local, online, merged, errors, hasKey, mode}>}
   */
  Places.search = function (kw, opts) {
    opts = opts || {};
    var bias = opts.bias || null;
    var local = localSearch(kw, 12);
    var chain = Promise.resolve([]);
    var errs = [];

    function step(fn, tag) {
      chain = chain.then(function (acc) {
        if (acc.length >= 10) return acc;
        return fn(kw, bias)
          .then(function (list) {
            return acc.concat(list || []);
          })
          .catch(function (err) {
            errs.push({
              source: tag,
              message: (err && (err.friendly || err.message)) || '搜索失败',
              reason: (err && err.reason) || 'error'
            });
            return acc;
          });
      });
    }

    // 服务端模式优先走服务器代理：Key 存在服务器上，全家设备通用，也不受跨域限制
    if (BF.DB.mode === 'server') {
      step(searchViaServer, 'server');
      if (amapKey) step(searchAmap, 'amap');
    } else if (amapKey) {
      step(searchAmap, 'amap');
      step(searchPhoton, 'photon');
    } else {
      step(searchPhoton, 'photon');
    }

    return chain.then(function (online) {
      // 按坐标去重（约 200 米内视为同一地点）
      var seen = {};
      var merged = [];
      local.concat(online).forEach(function (item) {
        if (!BF.Geo.valid(item.lat, item.lng)) return;
        if (!item.name) return;
        var key = Math.round(item.lat * 200) + ':' + Math.round(item.lng * 200);
        if (seen[key]) return;
        seen[key] = true;
        merged.push(item);
      });
      return {
        keyword: kw,
        local: local,
        online: online,
        merged: merged.slice(0, 20),
        errors: errs,
        hasKey: Places.hasKey(),
        mode: BF.DB.mode
      };
    });
  };

  /** 拼音/中文都能匹配的简单判断，用于给用户兜底提示 */
  Places.hasAnyOnlineSource = function () {
    return true;
  };

})(window);
