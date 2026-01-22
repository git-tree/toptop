// 等待页面完全加载（避免元素未渲染）
window.addEventListener('load', async () => {
  try {
    // 1. 定位账号/密码/验证码输入框（根据实际页面调整选择器）
    // 通用选择器：可根据name/id/type匹配，你需要根据目标页面调整
    const accountInput =  document.querySelector('input.ouryun-input__inner[type="text"]');
    const passwordInput = document.querySelector('input.ouryun-input__inner[type="password"]');
    const captchaInput = document.querySelector('input[placeholder*="请输入图片中的字符"]');
    const captchaImg = document.querySelector('img.captcha-img, .captcha-img'); // 验证码图片元素
    const loginBtn = document.querySelector('button.ouryun-button.ouryun-button--primary.ouryun-button--large.ouryun-button-custom');

    // 校验关键元素是否存在
    if (!accountInput || !passwordInput || !captchaInput || !captchaImg || !loginBtn) {
      console.log('自动登录：未找到登录相关元素，请检查选择器是否匹配');
      return;
    }

    // 2. 自动填充账号密码
    accountInput.value = 'admin';
    passwordInput.value = 'root123.';

    // 3. 处理验证码：图片转Base64 → 调用接口 → 填充验证码
    const captchaBase64 = await convertImgToBase64(captchaImg);
    if (!captchaBase64) {
      console.log('自动登录：验证码图片转Base64失败');
      return;
    }

    // 调用验证码识别接口（替换为你的实际接口地址）
    const captchaCode = await getCaptchaFromApi(captchaBase64);
    if (captchaCode) {
      captchaInput.value = captchaCode; // 填充验证码
      console.log('自动登录：验证码填充成功，值为：', captchaCode);
    } else {
      console.log('自动登录：验证码识别接口返回空');
      return;
    }

    // 4. 触发登录（模拟点击登录按钮）
    setTimeout(() => {
      loginBtn.click();
      console.log('自动登录：已点击登录按钮');
    }, 500); // 延迟500ms，避免页面响应不及时

  } catch (error) {
    console.error('自动登录执行失败：', error);
  }
});

/**
 * 将图片元素转为Base64编码
 * @param {HTMLElement} imgElement 验证码图片元素
 * @returns {Promise<string>} Base64字符串
 */
function convertImgToBase64(imgElement) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // 处理跨域图片（如果需要）
    img.crossOrigin = 'anonymous';
    img.src = imgElement.src;

    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const base64 = canvas.toDataURL('image/png'); // 转为PNG格式Base64
      resolve(base64);
    };

    img.onerror = function () {
      resolve(''); // 加载失败返回空
    };
  });
}
function getCaptchaFromApi(base64Str) {
  return new Promise((resolve, reject) => {
    // 向background发送消息，由background转发请求
    chrome.runtime.sendMessage({
      type: 'decode_base64',
      base64Str: base64Str
    }, (response) => {
      if (response.success) {
        // 接口返回成功
        if (response.data.success) {
          resolve(response.data.result);
        } else {
          reject(new Error(`接口解码失败：${response.data.error}`));
        }
      } else {
        // 请求本身失败
        reject(new Error(`调用验证码接口失败：${response.error}`));
      }
    });
  });
}
/**
 * 调用验证码识别接口
 * @param {string} base64 验证码图片Base64
 * @returns {Promise<string>} 识别后的验证码值
 */
// async function getCaptchaFromApi(base64) {
//   try {
//     // 替换为你的实际验证码接口地址
//     const response = await fetch('http://172.16.89.234:5678/decode_base64', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         base64_str: base64, // 传递Base64图片
//         // 其他接口所需参数（如type、appId等）
//       })
//     });
//
//     const result = await response.json();
//     // 假设接口返回格式：{code: 200, data: {captcha: '1234'}}
//     // 根据实际接口返回结构调整
//     if (result.code === 200) {
//       return result.result
//     } else {
//       console.log('验证码接口返回异常：', result);
//       return '';
//     }
//   } catch (error) {
//     console.error('调用验证码接口失败：', error);
//     return '';
//   }
// }