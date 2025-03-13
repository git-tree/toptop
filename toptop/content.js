// 创建按钮元素
const scrollButton = document.createElement('div');
scrollButton.className = 'back-to-top';
scrollButton.innerHTML = '↑';

// 插入到页面
document.body.appendChild(scrollButton);

// 滚动事件监听
window.addEventListener('scroll', () => {
  if (window.scrollY > 300) {
    scrollButton.classList.add('show');
  } else {
    scrollButton.classList.remove('show');
  }
});

// 点击返回顶部
scrollButton.addEventListener('click', () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});
// 动态计算显示阈值（适配不同屏幕）
const threshold = Math.min(500, window.innerHeight * 0.3);
if (scrollY > threshold) {
  button.classList.add('show');
}