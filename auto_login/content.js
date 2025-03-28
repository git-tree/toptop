function autoLogin() {
  // 查找账号输入框
  const usernameInput = document.querySelector('input.ouryun-input__inner[type="text"]');
  // 查找密码输入框
  const passwordInput = document.querySelector('input.ouryun-input__inner[type="password"]');
  // 查找登录按钮
  const loginButton = document.querySelector('button.ouryun-button.ouryun-button--primary.ouryun-button--large.ouryun-button-custom');

  if (usernameInput && passwordInput && loginButton) {
    // 输入账号
    usernameInput.value = 'admin';
    // 触发input事件确保框架能捕获到值变化
    usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 输入密码
    passwordInput.value = 'root123.';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 点击登录按钮（添加延时确保值已更新）
    setTimeout(() => {
      loginButton.click();
      console.log('自动登录已完成');
    }, 100);
  }
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', autoLogin);

// 针对动态加载的页面增加定时检查
let retryCount = 0;
const maxRetry = 5;
const checkInterval = setInterval(() => {
  if (retryCount >= maxRetry) {
    clearInterval(checkInterval);
    return;
  }
  
  const inputsExist = document.querySelector('input.ouryun-input__inner[type="text"], input.ouryun-input__inner[type="password"], button.ouryun-button.ouryun-button--primary');
  
  if (inputsExist) {
    clearInterval(checkInterval);
    autoLogin();
  }
  
  retryCount++;
}, 500);