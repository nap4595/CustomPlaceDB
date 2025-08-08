// 중앙화된 테마 설정 및 관리 파일

// 테마 관리 상수
const THEME_STORAGE_KEY = 'customplacedb-theme';

// 테마 색상 정의
const THEME_COLORS = {
  theme1: { main: '#3E3F29', sub: '#F8F7F3', accent: '#BCA88D', border: '#7D8D86' },
  theme2: { main: '#1C352D', sub: '#F9F6F3', accent: '#A6B28B', border: '#F5C9B0' },
  theme3: { main: '#8AA624', sub: '#FFFFF0', accent: '#DBE4C9', border: '#FEA405' },
  theme4: { main: '#663399', sub: '#F8F4FF', accent: '#9966CC', border: '#D1C4E9' },
  theme5: { main: '#5B6BC0', sub: '#E8EAF6', accent: '#9FA8DA', border: '#7986CB' }
};

// 테마 관리자 객체
const themeManager = {
  getCurrentTheme() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'theme1';
  },
  
  setTheme(theme) {
    if (!THEME_COLORS[theme]) {
      console.warn(`Unknown theme: ${theme}`);
      return false;
    }
    
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    
    // 테마 적용 검증
    setTimeout(() => {
      if (!this.validateThemeApplied(theme)) {
        console.error(`Theme ${theme} was not applied correctly`);
        return false;
      }
      console.log(`Theme ${theme} applied successfully`);
    }, 50);
    
    return true;
  },
  
  getAllThemes() {
    return Object.keys(THEME_COLORS);
  },
  
  getThemeColors(theme) {
    return THEME_COLORS[theme] || THEME_COLORS.theme1;
  },
  
  // 테마 적용 검증
  validateThemeApplied(theme) {
    const expectedColors = THEME_COLORS[theme];
    if (!expectedColors) return false;
    
    const computedStyle = getComputedStyle(document.body);
    const primaryColor = computedStyle.getPropertyValue('--primary-color').trim();
    
    return primaryColor === expectedColors.main;
  },
  
  // 테마 무결성 검사
  validateThemeIntegrity() {
    const missingThemes = [];
    const requiredSelectors = ['theme1', 'theme2', 'theme3', 'theme4', 'theme5'];
    
    requiredSelectors.forEach(theme => {
      if (!THEME_COLORS[theme]) {
        missingThemes.push(theme);
      }
    });
    
    if (missingThemes.length > 0) {
      console.error('Missing theme definitions:', missingThemes);
      return false;
    }
    
    console.log('All themes are properly defined');
    return true;
  },
  
  // 동적 테마 추가
  addTheme(themeName, colors) {
    if (THEME_COLORS[themeName]) {
      console.warn(`Theme ${themeName} already exists, will be overwritten`);
    }
    
    return createThemeFromColors(themeName, colors);
  },
  
  // 테마 제거
  removeTheme(themeName) {
    if (['theme1', 'theme2', 'theme3', 'theme4', 'theme5'].includes(themeName)) {
      console.error('Cannot remove built-in themes');
      return false;
    }
    
    delete THEME_COLORS[themeName];
    const styleElement = document.getElementById(`theme-${themeName}`);
    if (styleElement) {
      styleElement.remove();
    }
    
    return true;
  },
  
  // 테마 내보내기
  exportTheme(themeName) {
    const themeData = THEME_COLORS[themeName];
    if (!themeData) {
      console.error(`Theme ${themeName} not found`);
      return null;
    }
    
    return {
      name: themeName,
      colors: themeData,
      created: new Date().toISOString()
    };
  },
  
  // 테마 가져오기
  importTheme(themeData) {
    if (!themeData.name || !themeData.colors) {
      console.error('Invalid theme data format');
      return false;
    }
    
    return this.addTheme(themeData.name, themeData.colors);
  },
  
  // 테마 초기화
  init() {
    // 테마 무결성 검사
    if (!this.validateThemeIntegrity()) {
      console.error('Theme integrity check failed');
    }
    
    const currentTheme = this.getCurrentTheme();
    document.body.setAttribute('data-theme', currentTheme);
    
    // 테마 적용 검증
    setTimeout(() => {
      if (!this.validateThemeApplied(currentTheme)) {
        console.error(`Initial theme ${currentTheme} validation failed`);
      }
    }, 100);
    
    return currentTheme;
  }
};

// 유틸리티 함수들

// 테마 미리보기 업데이트 (popup에서 사용)
function updateThemePreview(theme) {
  const colors = themeManager.getThemeColors(theme);
  const previewElements = [
    { id: 'main-bg-preview', colorKey: 'main' },
    { id: 'sub-bg-preview', colorKey: 'sub' },
    { id: 'accent-preview', colorKey: 'accent' },
    { id: 'border-preview', colorKey: 'border' }
  ];
  
  previewElements.forEach(({ id, colorKey }) => {
    const element = document.getElementById(id);
    if (element && colors[colorKey]) {
      element.style.backgroundColor = colors[colorKey];
      element.title = `${colorKey}: ${colors[colorKey]}`;
    }
  });
}

// 동적 테마 로딩을 위한 유틸리티 함수
function createThemeFromColors(themeName, colors) {
  if (!colors.main || !colors.sub || !colors.accent || !colors.border) {
    console.error('Theme creation failed: missing required colors');
    return false;
  }
  
  // RGB 값 계산
  const mainRgb = hexToRgb(colors.main);
  if (!mainRgb) {
    console.error('Invalid main color format');
    return false;
  }
  
  // 런타임에서 CSS 변수로 테마 등록
  const style = document.createElement('style');
  style.id = `theme-${themeName}`;
  style.textContent = `
    [data-theme="${themeName}"] {
      --primary-color: ${colors.main};
      --primary-color-rgb: ${mainRgb.r}, ${mainRgb.g}, ${mainRgb.b};
      --secondary-color: ${colors.sub};
      --accent-color: ${colors.accent};
      --background-color: ${colors.border};
      --text-color: ${getContrastColor(colors.main)};
    }
  `;
  document.head.appendChild(style);
  
  // THEME_COLORS에 추가
  THEME_COLORS[themeName] = colors;
  
  return true;
}

// 16진수 색상을 RGB로 변환
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// 대비 색상 계산 (텍스트 색상용)
function getContrastColor(hexColor) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return '#333';
  
  // 밝기 계산 (0-255)
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 128 ? '#2c2c2c' : '#ffffff';
}