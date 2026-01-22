// 后台脚本：可用于处理跨域请求、监听网络请求等（当前需求暂无需逻辑）
console.log('自动登录插件后台服务已启动');

// 如需处理跨域验证码接口，可在此添加请求转发逻辑
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.type === 'getCaptcha') {
//     // 调用接口并返回结果
//     fetch(request.url, request.options)
//       .then(res => res.json())
//       .then(data => sendResponse(data))
//       .catch(err => sendResponse({ error: err.message }));
//     return true; // 保持通信通道开放
//   }
// });
// background.js
// 监听content script发送的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理验证码接口请求
  if (request.type === 'decode_base64') {
    fetch('http://172.16.89.234:5678/decode_base64', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ base64_str: request.base64Str })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP错误，状态码：${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      sendResponse({ success: true, data: data });
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    // 必须返回true，让sendResponse异步生效
    return true;
  }
});