// 核心：等待指定元素出现的工具函数（轮询检测）
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`等待元素超时（${timeout}ms）：${selector}`));
      } else {
        setTimeout(checkElement, 100);
      }
    };
    checkElement();
  });
}

/**
 * 新增：校验当前页面是否是登录页面（核心！）
 * @returns {boolean} 是否为登录页面
 */
function isLoginPage() {
  // 同时检测账号、密码、验证码输入框 + 登录按钮是否存在
  const hasAccountInput = !!document.querySelector('input.ouryun-input__inner[type="text"]');
  const hasPasswordInput = !!document.querySelector('input.ouryun-input__inner[type="password"]');
  const hasCaptchaInput = !!document.querySelector('input[placeholder*="请输入图片中的字符"]');
  const hasLoginBtn = !!document.querySelector('button.ouryun-button.ouryun-button--primary.ouryun-button--large.ouryun-button-custom');

  // 必须同时满足所有条件，才判定为登录页面
  const result = hasAccountInput && hasPasswordInput && hasCaptchaInput && hasLoginBtn;
  if (!result) {
    // console.log('当前页面不是登录页面，跳过自动登录');
    return false;
  }
  return result;
}

/**
 * 增强版：将图片元素转为Base64编码（禁止误触点击事件）
 * @param {HTMLElement} imgElement 验证码图片元素
 * @returns {Promise<string>} Base64字符串
 */
async function convertImgToBase64(imgElement) {
  return new Promise(async (resolve) => {
    // 先禁用图片的所有点击/鼠标事件（防止误触刷新）
    imgElement.style.pointerEvents = 'none';

    // 等待图片本身加载完成
    await waitForImageLoad(imgElement, 5000);

    // 保存当前验证码的src（用于校验是否被切换）
    const originalSrc = imgElement.src;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      // 处理跨域 + 防缓存
      img.crossOrigin = 'anonymous';
      img.src = originalSrc + '?t=' + new Date().getTime();

      img.onload = function () {
        try {
          // 校验src是否被切换（如果变了，说明验证码刷新了，直接返回失败）
          if (imgElement.src !== originalSrc) {
            console.warn('验证码图片已刷新，放弃当前转换');
            resolve('');
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          console.log('Canvas转Base64成功，验证码src未变化');
          resolve(base64);
        } catch (e) {
          console.warn('Canvas转Base64失败，尝试Fetch方案：', e);
          fetchImageToBase64(originalSrc).then(base64 => {
            resolve(base64 || '');
          });
        } finally {
          // 恢复图片的点击事件
          imgElement.style.pointerEvents = 'auto';
        }
      };

      img.onerror = function (e) {
        console.warn('Image加载失败，尝试Fetch方案：', e);
        fetchImageToBase64(originalSrc).then(base64 => {
          resolve(base64 || '');
        }).finally(() => {
          imgElement.style.pointerEvents = 'auto';
        });
      };
    } catch (e) {
      console.error('转Base64核心逻辑异常：', e);
      imgElement.style.pointerEvents = 'auto';
      resolve('');
    }
  });
}

/**
 * 辅助函数：等待图片元素本身加载完成
 * @param {HTMLElement} imgElement 图片元素
 * @param {number} timeout 超时时间
 * @returns {Promise<void>}
 */
function waitForImageLoad(imgElement, timeout = 5000) {
  return new Promise((resolve) => {
    if (imgElement.complete) {
      resolve();
      return;
    }
    const startTime = Date.now();
    const checkLoad = () => {
      if (imgElement.complete) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        resolve(); // 超时放行
      } else {
        setTimeout(checkLoad, 100);
      }
    };
    checkLoad();
  });
}

/**
 * 辅助函数：通过fetch获取图片并转Base64（绕过跨域限制）
 * @param {string} imgUrl 图片地址
 * @returns {Promise<string>}
 */
async function fetchImageToBase64(imgUrl) {
  try {
    const response = await fetch(imgUrl, {
      method: 'GET',
      mode: 'no-cors', // 忽略跨域
      cache: 'no-cache'
    });
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Fetch转Base64失败：', e);
    return '';
  }
}

/**
 * 调用验证码识别接口（通过background转发）
 * @param {string} base64Str 验证码图片Base64
 * @returns {Promise<string>} 识别后的验证码值
 */
function getCaptchaFromApi(base64Str) {
  return new Promise((resolve, reject) => {
    if (!base64Str) {
      reject(new Error('Base64字符串为空'));
      return;
    }
    chrome.runtime.sendMessage({
      type: 'decode_base64',
      base64Str: base64Str
    }, (response) => {
      if (response.success) {
        if (response.data.success) {
          resolve(response.data.result);
        } else {
          reject(new Error(`接口解码失败：${response.data.error}`));
        }
      } else {
        reject(new Error(`调用验证码接口失败：${response.error}`));
      }
    });
  });
}

// 全局标记：防止autoLogin重复执行 + 标记是否已执行过一次
let isAutoLoginRunning = false;
let hasAutoLoginExecuted = false;

// 主逻辑：自动登录（仅在登录页面执行一次）
async function autoLogin() {
  // 1. 先校验是否是登录页面
  if (!isLoginPage()) {
    return;
  }
  // 2. 如果已有执行中的流程，或已执行过一次，直接返回
  if (isAutoLoginRunning || hasAutoLoginExecuted) {
    console.log('自动登录流程已执行/正在执行，跳过');
    return;
  }

  isAutoLoginRunning = true;
  try {
    console.log('开始执行自动登录，等待关键元素加载...');

    // 3. 等待所有登录相关元素加载完成
    const accountInput = await waitForElement('input.ouryun-input__inner[type="text"]');
    const passwordInput = await waitForElement('input.ouryun-input__inner[type="password"]');
    const captchaInput = await waitForElement('input[placeholder*="请输入图片中的字符"]');
    const captchaImg = await waitForElement('img.captcha-img, .captcha-img');
    const loginBtn = await waitForElement('button.ouryun-button.ouryun-button--primary.ouryun-button--large.ouryun-button-custom');

    console.log('所有登录元素加载完成，开始填充信息');

    // 4. 填充账号密码（触发input事件）
    accountInput.value = 'admin';
    accountInput.dispatchEvent(new Event('input', { bubbles: true }));

    passwordInput.value = 'root123.';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    // 5. 处理验证码
    const captchaBase64 = await convertImgToBase64(captchaImg);
    if (!captchaBase64) {
      console.log('自动登录：验证码图片转Base64失败');
      isAutoLoginRunning = false;
      return;
    }

    // 识别验证码
    const captchaCode = await getCaptchaFromApi(captchaBase64);
    if (captchaCode) {
      captchaInput.value = captchaCode;
      captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('自动登录：验证码填充成功，值为：', captchaCode);
    } else {
      console.log('自动登录：验证码识别接口返回空');
      isAutoLoginRunning = false;
      return;
    }

    // 6. 触发登录（延迟1秒，确保值同步）
    setTimeout(() => {
      loginBtn.click();
      console.log('自动登录：已点击登录按钮');
      // 标记为已执行，后续不再重复执行
      hasAutoLoginExecuted = true;
      isAutoLoginRunning = false;
    }, 1000);

  } catch (error) {
    console.error('自动登录执行失败：', error);
    isAutoLoginRunning = false;
  }
}

// 启动逻辑：仅在登录页面执行一次
window.addEventListener('load', () => {
  // 先校验是否是登录页面，再执行
  if (isLoginPage() && !hasAutoLoginExecuted) {
    autoLogin();
  }
});

// 弱化DOM监听：仅在「登录页面 + 未执行过 + 无执行流程」时触发，且仅触发一次
const observer = new MutationObserver((mutations) => {
  // 过滤重复触发：500ms内只处理一次
  let isObserverProcessing = false;
  if (isObserverProcessing) return;
  isObserverProcessing = true;

  setTimeout(() => {
    // 仅满足以下所有条件才执行：
    // 1. 是登录页面 2. 未执行过自动登录 3. 无正在执行的流程
    if (isLoginPage() && !hasAutoLoginExecuted && !isAutoLoginRunning) {
      autoLogin();
    }
    isObserverProcessing = false;
  }, 1000); // 进一步降低触发频率
});

// 仅监听body（或登录框父容器），且只监听子节点变化
const loginContainer = document.querySelector('body');
if (loginContainer) {
  observer.observe(loginContainer, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
}

// 额外：监听页面跳转/刷新，重置执行标记（可选）
window.addEventListener('beforeunload', () => {
  hasAutoLoginExecuted = false; // 页面跳转后重置，新页面可重新执行
});