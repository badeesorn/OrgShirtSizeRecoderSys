export const content = [
  './views/**/*.ejs', // ครอบคลุมไฟล์ ejs
  './public/**/*.html', // ถ้ามีไฟล์ HTML ใน public
  './public/**/*.js', // ถ้าใช้ไฟล์ JS
];
export const theme = {
  extend: {},
};
export const plugins = [require('daisyui')];
