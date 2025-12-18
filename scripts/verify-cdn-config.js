const https = require('https');
const http = require('http');
const readline = require('readline');

const DOMAIN = 'https://sparkvertex.cn';
const SECRET_KEY = 'spark-vertex-secure-2025'; // 您的密钥
const HEADER_NAME = 'x-source-auth';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\x1b[36m%s\x1b[0m', '=============================================');
console.log('\x1b[36m%s\x1b[0m', '   阿里云 CDN 安全配置验证脚本 (Security Check)   ');
console.log('\x1b[36m%s\x1b[0m', '=============================================');

function makeRequest(url, headers = {}, description) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Security-Check-Script/1.0',
        ...headers
      },
      timeout: 5000 // 5秒超时
    };

    console.log(`\n正在测试: ${description}`);
    console.log(`目标 URL: ${url}`);
    
    const req = client.get(url, options, (res) => {
      resolve({ statusCode: res.statusCode, message: res.statusMessage });
    });

    req.on('error', (e) => {
      resolve({ error: e.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: '请求超时 (Timeout)' });
    });
  });
}

async function runChecks() {
  // 1. 检查正常访问 (通过域名)
  console.log('\n[步骤 1/2] 检查正常域名访问 (验证 CDN 配置是否正确)...');
  const domainResult = await makeRequest(DOMAIN, {}, '访问域名 (不带额外 Header)');
  
  if (domainResult.statusCode === 200) {
    console.log('\x1b[32m%s\x1b[0m', '✅ 域名访问成功 (200 OK)');
    console.log('   -> 说明：CDN 配置正确 (已自动添加 Header) 或者 中间件未生效。');
  } else if (domainResult.statusCode === 403) {
    console.log('\x1b[31m%s\x1b[0m', '❌ 域名访问被拒绝 (403 Forbidden)');
    console.log('   -> 原因：CDN 控制台可能未正确配置回源 Header，导致服务器拒绝了请求。');
    console.log('   -> 解决：请去阿里云 CDN 控制台检查 "回源 HTTP 请求头" 是否设置为 x-source-auth: ' + SECRET_KEY);
    process.exit(1);
  } else {
    console.log(`⚠️  域名访问返回异常状态: ${domainResult.statusCode} ${domainResult.message || domainResult.error}`);
  }

  // 2. 检查源站直连 (通过 IP)
  console.log('\n[步骤 2/2] 检查源站 IP 防护 (验证是否拦截直接攻击)...');
  console.log('请输入您的服务器公网 IP 地址 (如果不输入直接回车，将跳过此步骤):');
  
  rl.question('> ', async (ip) => {
    if (!ip.trim()) {
      console.log('已跳过源站 IP 检查。');
      console.log('\n总结: 只要步骤 1 成功，且您确定服务器 .env 已更新并重启，通常配置就是生效的。');
      rl.close();
      return;
    }

    const targetIp = ip.trim();
    // 通常直接访问 IP 是 HTTP，除非配置了自签名证书
    const url = `http://${targetIp}`; 

    // 测试 A: 无 Header 访问 (应该被拦截)
    const noHeaderResult = await makeRequest(url, {}, '直接访问 IP (无 Header)');
    
    if (noHeaderResult.statusCode === 403) {
      console.log('\x1b[32m%s\x1b[0m', '✅ 拦截成功 (403 Forbidden)');
      console.log('   -> 说明：服务器成功拦截了没有 "通行证" 的直接攻击请求。安全防护已生效！');
    } else if (noHeaderResult.statusCode === 200) {
      console.log('\x1b[31m%s\x1b[0m', '❌ 拦截失败 (200 OK)');
      console.log('   -> 原因：服务器直接放行了请求。可能是：');
      console.log('      1. 服务器 .env 文件中没有设置 CDN_SOURCE_SECRET');
      console.log('      2. 服务器没有重启 (pm2 restart all)');
      console.log('      3. NODE_ENV 不是 production');
    } else {
      console.log(`⚠️  IP 访问返回其他状态: ${noHeaderResult.statusCode} (可能是 Nginx 配置或防火墙原因)`);
    }

    // 测试 B: 伪造 Header 访问 (应该通过)
    // 注意：如果服务器强制 HTTPS，HTTP 请求可能会 301/308 跳转，这也是一种“通过”
    const withHeaderResult = await makeRequest(url, { [HEADER_NAME]: SECRET_KEY }, '模拟 CDN 访问 (带 Header)');
    
    if (withHeaderResult.statusCode === 200 || (withHeaderResult.statusCode >= 300 && withHeaderResult.statusCode < 400)) {
      console.log('\x1b[32m%s\x1b[0m', `✅ 鉴权通过 (${withHeaderResult.statusCode})`);
      console.log('   -> 说明：带上正确 Header 后服务器放行了请求。');
    } else if (withHeaderResult.statusCode === 403) {
      console.log('\x1b[31m%s\x1b[0m', '❌ 鉴权失败 (403 Forbidden)');
      console.log('   -> 原因：即使带了 Header 也被拒绝。可能是密钥不匹配。');
    } else {
      console.log(`ℹ️  带 Header 访问返回: ${withHeaderResult.statusCode}`);
    }

    console.log('\n=============================================');
    console.log('测试完成。');
    rl.close();
  });
}

runChecks();
