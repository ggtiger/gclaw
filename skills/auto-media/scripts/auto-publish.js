#!/usr/bin/env node

/**
 * 自动发布脚本
 * 支持一键全流程:扫描热点→生成文案→发布到平台
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

// 配置
const SCRIPTS_DIR = __dirname;
const DATA_DIR = path.join(__dirname, '../data');
const GENERATED_CONTENT_FILE = path.join(DATA_DIR, 'generated-content.json');

/**
 * 执行热点扫描
 */
async function runScanTopics() {
  console.log('🔥 步骤1: 扫描热点...\n');
  try {
    await execPromise(`node ${path.join(SCRIPTS_DIR, 'scan-topics.js')}`);
    // 从文件读取结果
    const hotTopicsFile = path.join(DATA_DIR, 'hot-topics.json');
    const data = JSON.parse(fs.readFileSync(hotTopicsFile, 'utf-8'));
    return {
      success: true,
      total: data.total,
      updateTime: data.updateTime
    };
  } catch (error) {
    console.error('❌ 热点扫描失败:', error.message);
    throw error;
  }
}

/**
 * 执行文案生成
 */
async function runGenerateContent() {
  console.log('\n✍️ 步骤2: 生成文案...\n');
  try {
    await execPromise(`node ${path.join(SCRIPTS_DIR, 'generate-content.js')}`);
    // 从文件读取结果
    const data = JSON.parse(fs.readFileSync(GENERATED_CONTENT_FILE, 'utf-8'));
    return {
      success: true,
      total: data.total,
      updateTime: data.updateTime
    };
  } catch (error) {
    console.error('❌ 文案生成失败:', error.message);
    throw error;
  }
}

/**
 * 模拟发布到平台
 * 实际使用时需要配置平台的API/Cookie
 */
async function publishToPlatform(platform, content) {
  console.log(`\n📤 发布到${platform}...`);

  // TODO: 实际发布逻辑
  // 小红书: 需要Cookie + 调用发布API
  // 抖音: 需要Token + 上传视频API
  // 视频号: 需要微信登录Cookie

  console.log(`   ⏳ [模拟] 标题: ${content.title}`);
  console.log(`   ⏳ [模拟] 内容: ${content.content.substring(0, 50)}...`);

  // 模拟延迟
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`   ✅ [模拟] 发布成功!`);

  return {
    platform,
    success: true,
    publishedAt: new Date().toISOString(),
    url: `https://example.com/${platform}/${content.topic_id}`
  };
}

/**
 * 批量发布到所有平台
 */
async function publishAllPlatforms(contents) {
  const results = [];

  for (const item of contents) {
    console.log(`\n📝 发布热点: ${item.topic_title}`);

    // 发布到小红书
    const xhsResult = await publishToPlatform('小红书', item.platforms.xiaohongshu);
    results.push(xhsResult);

    // 发布到抖音
    const dyResult = await publishToPlatform('抖音', item.platforms.douyin);
    results.push(dyResult);

    // 发布到视频号
    const vaResult = await publishToPlatform('视频号', item.platforms.videoaccount);
    results.push(vaResult);
  }

  return results;
}

/**
 * 全流程模式
 */
async function runFullPipeline() {
  console.log('🚀 启动一键全流程...\n');
  console.log('=' .repeat(50));

  // 步骤1: 扫描热点
  const scanResult = await runScanTopics();
  if (!scanResult.success) {
    throw new Error('热点扫描失败');
  }

  // 步骤2: 生成文案
  const genResult = await runGenerateContent();
  if (!genResult.success) {
    throw new Error('文案生成失败');
  }

  // 步骤3: 读取生成的文案
  const contentData = JSON.parse(fs.readFileSync(GENERATED_CONTENT_FILE, 'utf-8'));

  // 步骤4: 发布到平台
  console.log('\n📤 步骤3: 发布到平台...\n');
  const publishResults = await publishAllPlatforms(contentData.contents);

  // 总结
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ 全流程完成!\n');
  console.log(`📊 统计:`);
  console.log(`   - 热点扫描: ${scanResult.total}条`);
  console.log(`   - 文案生成: ${genResult.total}条`);
  console.log(`   - 平台发布: ${publishResults.length}条\n`);

  return {
    success: true,
    scanResult,
    genResult,
    publishResults,
    completedAt: new Date().toISOString()
  };
}

/**
 * 主函数
 */
async function main() {
  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let params = {};

    if (args.length > 0) {
      try {
        params = JSON.parse(args[0]);
      } catch (e) {
        console.error('❌ 参数格式错误,请使用JSON格式');
        process.exit(1);
      }
    }

    let result;

    if (params.mode === 'full') {
      // 全流程模式
      result = await runFullPipeline();
    } else if (params.platform && params.topic_id) {
      // 单条发布模式
      console.log(`📤 发布${params.platform}内容: ${params.topic_id}`);
      // TODO: 实现单条发布逻辑
      result = { success: true, message: '单条发布功能待实现' };
    } else {
      // 默认:全流程
      result = await runFullPipeline();
    }

    console.log('\n✅ 任务完成!');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    process.exit(1);
  }
}

// 运行
main();
