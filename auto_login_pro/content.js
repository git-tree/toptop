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
 * 增强版：将图片元素转为Base64编码（解决跨域/加载超时问题）
 * @param {HTMLElement} imgElement 验证码图片元素
 * @returns {Promise<string>} Base64字符串
 */
async function convertImgToBase64(imgElement) {
  return new Promise(async (resolve) => {
    // 先等待图片本身加载完成（确保src有效且图片渲染）
    await waitForImageLoad(imgElement, 5000);

    // 方案1：优先用canvas（常规方案，处理跨域）
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      // 处理跨域：兼容不同的跨域配置
      img.crossOrigin = 'anonymous';
      // 防止缓存导致的加载失败
      img.src = imgElement.src + '?t=' + new Date().getTime();

      img.onload = function () {
        try {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          console.log('方案1：Canvas转Base64成功');
          resolve(base64);
        } catch (e) {
          console.warn('Canvas转Base64失败，尝试方案2：', e);
          // 方案2：直接读取图片元素的src（如果src本身就是Base64）
          if (imgElement.src.startsWith('data:image/')) {
            console.log('方案2：直接使用图片src的Base64');
            resolve(imgElement.src);
          } else {
            // 方案3：使用fetch获取图片再转Base64（绕过跨域）
            fetchImageToBase64(imgElement.src).then(base64 => {
              if (base64) {
                console.log('方案3：Fetch转Base64成功');
                resolve(base64);
              } else {
                console.error('所有转Base64方案均失败');
                resolve('');
              }
            });
          }
        }
      };

      img.onerror = function (e) {
        console.warn('Image加载失败，尝试方案2/3：', e);
        // 方案2：直接读取src的Base64
        if (imgElement.src.startsWith('data:image/')) {
          resolve(imgElement.src);
        } else {
          // 方案3：fetch兜底
          fetchImageToBase64(imgElement.src).then(base64 => resolve(base64 || ''));
        }
      };
    } catch (e) {
      console.error('转Base64核心逻辑异常：', e);
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
        resolve(); // 超时也放行，避免卡住
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
      mode: 'no-cors', // 忽略跨域（关键）
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

// 主逻辑：自动登录
async function autoLogin() {
  try {
    console.log('开始执行自动登录，等待关键元素加载...');

    // 1. 等待所有登录相关元素加载完成
    const accountInput = await waitForElement('input.ouryun-input__inner[type="text"]');
    const passwordInput = await waitForElement('input.ouryun-input__inner[type="password"]');
    const captchaInput = await waitForElement('input[placeholder*="请输入图片中的字符"]');
    const captchaImg = await waitForElement('img.captcha-img, .captcha-img');
    const loginBtn = await waitForElement('button.ouryun-button.ouryun-button--primary.ouryun-button--large.ouryun-button-custom');

    console.log('所有登录元素加载完成，开始填充信息');

    // 2. 填充账号密码（触发input事件）
    accountInput.value = 'admin';
    accountInput.dispatchEvent(new Event('input', { bubbles: true }));

    passwordInput.value = 'root123.';
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    // 3. 处理验证码（增加重试逻辑）
    let captchaBase64 = '';
    let retryCount = 0;
    // 最多重试3次
    while (!captchaBase64 && retryCount < 3) {
      captchaBase64 = await convertImgToBase64(captchaImg);
      if (!captchaBase64) {
        retryCount++;
        console.log(`验证码转Base64失败，第${retryCount}次重试...`);
        // 重试前刷新验证码（如果有刷新按钮，可取消注释启用）
        // const refreshBtn = document.querySelector('.captcha-refresh');
        // if (refreshBtn) refreshBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!captchaBase64) {
      console.log('自动登录：验证码图片转Base64失败（重试3次仍失败）');
      return;
    }

    const captchaCode = await getCaptchaFromApi(captchaBase64);
    if (captchaCode) {
      captchaInput.value = captchaCode;
      captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('自动登录：验证码填充成功，值为：', captchaCode);
    } else {
      console.log('自动登录：验证码识别接口返回空');
      return;
    }

    // 4. 触发登录
    setTimeout(() => {
      loginBtn.click();
      console.log('自动登录：已点击登录按钮');
    }, 500);

  } catch (error) {
    console.error('自动登录执行失败：', error);
  }
}

// 启动逻辑
window.addEventListener('load', () => {
  autoLogin();
});

// 监听DOM变化，应对页面动态刷新
const observer = new MutationObserver((mutations) => {
  mutations.forEach(() => {
    const accountInput = document.querySelector('input.ouryun-input__inner[type="text"]');
    if (accountInput && !accountInput.value) {
      autoLogin();
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true
});