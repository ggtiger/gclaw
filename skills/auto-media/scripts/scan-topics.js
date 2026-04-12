#!/usr/bin/env node

/**
 * 热点扫描脚本
 * 从微博/抖音/百度风云榜抓取实时热点
 */

const fs = require('fs');
const path = require('path');

// 配置
const DATA_DIR = path.join(__dirname, '../data');
const HOT_TOPICS_FILE = path.join(DATA_DIR, 'hot-topics.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * 爬取微博热搜
 * 使用百度实时热点API(无需认证)
 */
async function fetchWeiboHot() {
  try {
    // 百度风云榜API
    const response = await fetch('https://top.baidu.com/api/board?tab=realtime');
    const data = await response.json();

    if (data.success && data.data && data.data.cards) {
      const topics = [];
      const cards = data.data.cards[0];

      if (cards && cards.content) {
        cards.content.forEach((item, index) => {
          topics.push({
            id: `weibo_${Date.now()}_${index}`,
            title: item.word || item.title,
            source: 'weibo',
            heat: item.hotScore || item.score || 0,
            url: item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || item.title)}`,
            content: item.desc || '',
            tags: ['微博热搜'],
            rank: index + 1
          });
        });
      }

      return topics;
    }

    return [];
  } catch (error) {
    console.error('微博热搜抓取失败:', error.message);
    return [];
  }
}

/**
 * 爬取抖音热点
 * 使用备用数据源
 */
async function fetchDouyinHot() {
  try {
    // 抖音热梗API(第三方聚合)
    const response = await fetch('https://api.vvhan.com/api/hotlist/douyinHot');
    const data = await response.json();

    if (data.success && data.data) {
      const topics = data.data.map((item, index) => ({
        id: `douyin_${Date.now()}_${index}`,
        title: item.title,
        source: 'douyin',
        heat: item.hot || item.score || 0,
        url: item.url || `https://www.douyin.com/search/${encodeURIComponent(item.title)}`,
        content: item.desc || '',
        tags: ['抖音热点'],
        rank: index + 1
      }));

      return topics;
    }

    return [];
  } catch (error) {
    console.error('抖音热点抓取失败:', error.message);
    return [];
  }
}

/**
 * 爬取百度风云榜
 */
async function fetchBaiduHot() {
  try {
    const response = await fetch('https://top.baidu.com/api/board?tab=realtime');
    const data = await response.json();

    if (data.success && data.data && data.data.cards) {
      const topics = [];
      const cards = data.data.cards[0];

      if (cards && cards.content) {
        cards.content.forEach((item, index) => {
          topics.push({
            id: `baidu_${Date.now()}_${index}`,
            title: item.word || item.title,
            source: 'baidu',
            heat: item.hotScore || item.score || 0,
            url: item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || item.title)}`,
            content: item.desc || '',
            tags: ['百度风云榜'],
            rank: index + 1
          });
        });
      }

      return topics;
    }

    return [];
  } catch (error) {
    console.error('百度风云榜抓取失败:', error.message);
    return [];
  }
}

/**
 * 合并去重热点
 * 按热度排序,取Top 15
 */
function mergeTopics(weiboTopics, douyinTopics, baiduTopics) {
  const allTopics = [...weiboTopics, ...douyinTopics, ...baiduTopics];

  // 按标题简单去重(保留热度最高的)
  const topicMap = new Map();
  allTopics.forEach(topic => {
    const key = topic.title;
    if (!topicMap.has(key) || topicMap.get(key).heat < topic.heat) {
      topicMap.set(key, topic);
    }
  });

  // 按热度排序,取Top 15
  const sortedTopics = Array.from(topicMap.values())
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 15)
    .map(topic => ({
      ...topic,
      createdAt: new Date().toISOString()
    }));

  return sortedTopics;
}

/**
 * 保存热点数据到JSON文件
 */
function saveTopics(topics) {
  const data = {
    updateTime: new Date().toISOString(),
    total: topics.length,
    topics: topics
  };

  fs.writeFileSync(HOT_TOPICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ 热点数据已保存: ${HOT_TOPICS_FILE}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('🔥 开始扫描热点...\n');

  // 并行抓取三大平台
  const [weiboTopics, douyinTopics, baiduTopics] = await Promise.all([
    fetchWeiboHot(),
    fetchDouyinHot(),
    fetchBaiduHot()
  ]);

  console.log(`✅ 微博热搜: ${weiboTopics.length}条`);
  console.log(`✅ 抖音热点: ${douyinTopics.length}条`);
  console.log(`✅ 百度风云榜: ${baiduTopics.length}条\n`);

  // 合并去重
  const mergedTopics = mergeTopics(weiboTopics, douyinTopics, baiduTopics);

  console.log(`📊 合并后热点Top ${mergedTopics.length}:\n`);
  mergedTopics.forEach((topic, index) => {
    console.log(`${index + 1}. [${topic.source}] ${topic.title} (热度: ${topic.heat})`);
  });

  // 保存到文件
  saveTopics(mergedTopics);

  // 输出JSON结果
  console.log('\n✅ 热点扫描完成!');
  console.log(JSON.stringify({
    success: true,
    total: mergedTopics.length,
    updateTime: new Date().toISOString(),
    dataFile: HOT_TOPICS_FILE
  }, null, 2));
}

// 运行
main().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
