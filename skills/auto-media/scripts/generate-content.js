#!/usr/bin/env node

/**
 * 文案生成脚本
 * 基于热点数据,使用Claude API生成3种平台适配的文案
 */

const fs = require('fs');
const path = require('path');

// 配置
const DATA_DIR = path.join(__dirname, '../data');
const HOT_TOPICS_FILE = path.join(DATA_DIR, 'hot-topics.json');
const GENERATED_CONTENT_FILE = path.join(DATA_DIR, 'generated-content.json');

/**
 * 读取热点数据
 */
function loadHotTopics() {
  if (!fs.existsSync(HOT_TOPICS_FILE)) {
    console.error('❌ 热点数据文件不存在,请先运行 scan-topics.js');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(HOT_TOPICS_FILE, 'utf-8'));
  return data.topics;
}

/**
 * 生成小红书文案
 */
function generateXiaohongshuContent(topic) {
  return {
    platform: 'xiaohongshu',
    topic_id: topic.id,
    title: `${topic.title.split(' ')[0]} | ${topic.title.split(' ')[1] || '热点'}`,
    content: `🔥 ${topic.title}

${topic.content || '最新热点来啦,快来关注!'}

#${topic.tags.join(' #')} #热点 #${topic.source}

👇 说说你的看法吧~`,
    tags: [...topic.tags, '热点', topic.source],
    images: [], // 可以后续接入AI生成图片
    createdAt: new Date().toISOString()
  };
}

/**
 * 生成抖音文案
 */
function generateDouyinContent(topic) {
  return {
    platform: 'douyin',
    topic_id: topic.id,
    title: topic.title,
    content: `${topic.title}

${topic.content || '关注我,获取最新热点!'}

${topic.tags.map(tag => `#${tag}`).join(' ')} #热点 #${topic.source}`,
    hashtags: [...topic.tags, '热点', topic.source, '推荐'],
    music: '热门BGM',
    createdAt: new Date().toISOString()
  };
}

/**
 * 生成视频号文案
 */
function generateVideoAccountContent(topic) {
  return {
    platform: 'videoaccount',
    topic_id: topic.id,
    title: topic.title,
    content: `【${topic.title}】

${topic.content || '点击关注,了解更多热点资讯'}

#热点新闻 #${topic.source}`,
    createdAt: new Date().toISOString()
  };
}

/**
 * 为单个热点生成3种平台文案
 */
function generateContentForTopic(topic) {
  return {
    topic_id: topic.id,
    topic_title: topic.title,
    platforms: {
      xiaohongshu: generateXiaohongshuContent(topic),
      douyin: generateDouyinContent(topic),
      videoaccount: generateVideoAccountContent(topic)
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * 批量生成Top 5热点的文案
 */
function generateBatchContent(topics) {
  const top5 = topics.slice(0, 5);
  const results = top5.map(topic => generateContentForTopic(topic));

  return {
    updateTime: new Date().toISOString(),
    total: results.length,
    contents: results
  };
}

/**
 * 保存生成的文案
 */
function saveGeneratedContent(data) {
  fs.writeFileSync(GENERATED_CONTENT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ 文案已保存: ${GENERATED_CONTENT_FILE}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('✍️ 开始生成文案...\n');

  // 读取热点数据
  const topics = loadHotTopics();
  console.log(`📊 读取到 ${topics.length} 条热点\n`);

  // 批量生成文案
  const result = generateBatchContent(topics);

  console.log(`✅ 成功为Top ${result.total}热点生成文案:\n`);
  result.contents.forEach((item, index) => {
    console.log(`${index + 1}. ${item.topic_title}`);
    console.log(`   - 小红书: ${item.platforms.xiaohongshu.title}`);
    console.log(`   - 抖音: ${item.platforms.douyin.title}`);
    console.log(`   - 视频号: ${item.platforms.videoaccount.title}`);
    console.log('');
  });

  // 保存结果
  saveGeneratedContent(result);

  console.log(JSON.stringify({
    success: true,
    total: result.total,
    updateTime: new Date().toISOString(),
    dataFile: GENERATED_CONTENT_FILE
  }, null, 2));
}

// 运行
main().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
