const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/style.css');
let css = fs.readFileSync(filePath, 'utf8');

// Replace remaining #ffffff text colors
css = css.replace(/color:\s*#ffffff\s*!important;/g, 'color: var(--foreground) !important;');
css = css.replace(/color:\s*#ffffff;/g, 'color: var(--foreground);');

// Replace white borders and white overlays with moss equivalents
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.16\)/g, 'rgba(40, 53, 36, 0.16)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.14\)/g, 'rgba(40, 53, 36, 0.14)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.12\)/g, 'rgba(40, 53, 36, 0.12)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.08\)/g, 'rgba(40, 53, 36, 0.08)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.05\)/g, 'rgba(40, 53, 36, 0.05)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.06\)/g, 'rgba(40, 53, 36, 0.06)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.25\)/g, 'rgba(40, 53, 36, 0.22)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.28\)/g, 'rgba(40, 53, 36, 0.28)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.45\)/g, 'rgba(40, 53, 36, 0.55)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.18\)/g, 'rgba(40, 53, 36, 0.18)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.22\)/g, 'rgba(40, 53, 36, 0.22)');
css = css.replace(/rgba\(255,\s*255,\s*255,\s*0\.1\)/g, 'rgba(40, 53, 36, 0.1)');

// Replace black shadows with soft moss shadows
css = css.replace(/rgba\(0,\s*0,\s*0,\s*0\.6\)/g, 'rgba(40, 53, 36, 0.08)');
css = css.replace(/rgba\(0,\s*0,\s*0,\s*0\.5\)/g, 'rgba(40, 53, 36, 0.06)');
css = css.replace(/rgba\(0,\s*0,\s*0,\s*0\.4\)/g, 'rgba(40, 53, 36, 0.06)');
css = css.replace(/rgba\(0,\s*0,\s*0,\s*0\.25\)/g, 'rgba(40, 53, 36, 0.04)');

// Dark surfaces
css = css.replace(/#11171e/g, '#daf070');
css = css.replace(/#10161c/g, '#d4ec65');
css = css.replace(/#14171f/g, '#daf070');
css = css.replace(/#141c24/g, '#daf070');
css = css.replace(/#121820/g, '#daf070');
css = css.replace(/#202b34/g, '#283524');

// Tabs active button
css = css.replace(/background:\s*#c5ff4a\s*!important;\s*color:\s*#000000\s*!important;/g, 'background: #283524 !important; color: #E5F683 !important;');

// Invest button
css = css.replace(/background:\s*var\(--positive\)\s*!important;\s*color:\s*#000000\s*!important;/g, 'background: #283524 !important; color: #E5F683 !important;');

// Holding-data background
css = css.replace(/background:\s*radial-gradient\(120% 120% at 50% 100%,[^;]+;/g, 'background: #daf070;');

fs.writeFileSync(filePath, css);
console.log('style.css updated successfully!');
