// CAO Service Worker — 保持长连接端口，防止 SW 被闲置杀掉
chrome.runtime.onConnect.addListener(function(port) {
  // 来自 content script 的心跳连接，什么都不做，SW 就不会被终止
  port.onDisconnect.addListener(function() {});
});
