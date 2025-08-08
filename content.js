// 지도 장소 스크랩 Content Script - 리팩토링 버전
// 데이터 수집 및 통신만 담당, UI 로직은 Side Panel로 이전

// 설정 상수
const CONFIG = {
  PLATFORMS: {
    NAVER: 'naver',
    KAKAO: 'kakao',
    UNKNOWN: 'unknown'
  },
  PLATFORM_COLORS: {
    naver: '#03c75a',
    kakao: '#FFE300',
    default: '#666666'
  },
  PLATFORM_NAMES: {
    naver: '네이버지도',
    kakao: '카카오맵'
  },
  STORAGE_KEYS: {
    MAIN_DATA: 'mapScraperData'
  }
};

// 디버그 모드 설정 (프로덕션에서는 false로 설정)
const DEBUG_MODE = false;

// 로깅 유틸리티
const Logger = {
  log: (...args) => DEBUG_MODE && console.log('[CustomPlaceDB]', ...args),
  error: (...args) => console.error('[CustomPlaceDB Error]', ...args),
  warn: (...args) => DEBUG_MODE && console.warn('[CustomPlaceDB Warning]', ...args)
};

// ==================== 플랫폼 감지 클래스 ====================
class PlatformDetector {
  static detectCurrentPlatform() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    if (hostname.includes('naver.com') && (pathname.includes('/map') || hostname.includes('map.naver.com'))) {
      return CONFIG.PLATFORMS.NAVER;
    } else if (hostname.includes('kakao.com')) {
      return CONFIG.PLATFORMS.KAKAO;
    }
    
    return CONFIG.PLATFORMS.UNKNOWN;
  }
  
  static getSupportedPlatforms() {
    return [CONFIG.PLATFORMS.NAVER, CONFIG.PLATFORMS.KAKAO];
  }
  
  static getPlatformDisplayName(platform) {
    return CONFIG.PLATFORM_NAMES[platform] || platform;
  }
  
  static getPlatformColor(platform) {
    return CONFIG.PLATFORM_COLORS[platform] || CONFIG.PLATFORM_COLORS.default;
  }
}

// ==================== 기본 지도 데이터 추출기 클래스 ====================
class BaseMapExtractor {
  constructor() {
    this.platform = 'unknown';
  }
  
  async extractPlaceData() {
    throw new Error('extractPlaceData method must be implemented');
  }
  
  canExtract() {
    return false;
  }
  
  getPlatform() {
    return this.platform;
  }
}

// ==================== 네이버지도 데이터 추출기 ====================
class NaverMapExtractor extends BaseMapExtractor {
  constructor() {
    super();
    this.platform = 'naver';
  }
  
  canExtract() {
    return PlatformDetector.detectCurrentPlatform() === 'naver' && 
           window.location.href.match(/\/place\/(\d+)/);
  }
  
  async extractPlaceData() {
    try {
      const placeId = this.extractPlaceIdFromURL();
      if (!placeId) return null;

      const placeInfo = await this.fetchPlaceInfo(placeId);
      if (!placeInfo) return null;

      return {
        id: placeId,
        name: placeInfo.name,
        platform: this.platform,
        category: placeInfo.category,
        rating: placeInfo.rating,
        url: window.location.href,
        customValues: {}
      };
    } catch (error) {
      Logger.error('네이버지도 데이터 추출 실패:', error);
      return null;
    }
  }
  
  extractPlaceIdFromURL() {
    const urlMatch = window.location.href.match(/\/place\/(\d+)/);
    return urlMatch ? urlMatch[1] : null;
  }
  
  async fetchPlaceInfo(placeId) {
    try {
      const apiUrl = `https://pcmap.place.naver.com/place/${placeId}`;
      const response = await chrome.runtime.sendMessage({
        action: 'fetchPlaceInfo',
        url: apiUrl
      });

      if (response && response.success) {
        return this.parseHtmlForPlaceInfo(response.data);
      }
      return null;
    } catch (error) {
      Logger.error('네이버지도 API 요청 실패:', error);
      return null;
    }
  }
  
  parseHtmlForPlaceInfo(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const nameSelectors = ['#_title .GHAhO', '.GHAhO', '.LylZZ .GHAhO'];
    const categorySelectors = ['#_title .lnJFt', '.lnJFt', '.LylZZ .lnJFt'];
    
    const name = this.extractTextFromSelectors(doc, nameSelectors);
    const category = this.extractTextFromSelectors(doc, categorySelectors);
    const rating = this.extractRating(doc);
    
    return {
      name: name || '이름 없음',
      category: category || '카테고리 없음',
      rating: rating
    };
  }
  
  extractTextFromSelectors(doc, selectors) {
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    return null;
  }
  
  extractRating(doc) {
    const ratingElement = doc.querySelector('.PXMot.LXIwF');
    if (ratingElement) {
      const ratingMatch = ratingElement.textContent.match(/별점(\d+\.?\d*)/);
      return ratingMatch ? parseFloat(ratingMatch[1]) : null;
    }
    return null;
  }
}

// ==================== 카카오맵 데이터 추출기 ====================
class KakaoMapExtractor extends BaseMapExtractor {
  constructor() {
    super();
    this.platform = 'kakao';
  }
  
  canExtract() {
    return PlatformDetector.detectCurrentPlatform() === 'kakao' && 
           window.location.href.includes('place.map.kakao.com');
  }
  
  async extractPlaceData() {
    try {
      const placeId = this.extractPlaceIdFromURL();
      const placeInfo = this.extractPlaceInfoFromDOM();
      
      if (!placeInfo.name) return null;
      
      return {
        id: placeId || Date.now().toString(),
        name: placeInfo.name,
        platform: this.platform,
        category: placeInfo.category,
        rating: placeInfo.rating,
        url: window.location.href,
        customValues: {}
      };
    } catch (error) {
      Logger.error('카카오맵 데이터 추출 실패:', error);
      return null;
    }
  }
  
  extractPlaceIdFromURL() {
    const url = window.location.href;
    const match = url.match(/place\.map\.kakao\.com\/(\d+)/);
    return match ? match[1] : null;
  }
  
  extractPlaceInfoFromDOM() {
    // 장소명: <h3 class="tit_place"><span class="screen_out">장소명</span>공원칼국수</h3>
    const nameElement = document.querySelector('.tit_place');
    const name = nameElement ? nameElement.textContent.replace('장소명', '').trim() : null;
    
    // 카테고리: <span class="info_cate"><span class="screen_out">장소 카테고리</span>칼국수</span>
    const categoryElement = document.querySelector('.info_cate');
    const category = categoryElement ? categoryElement.textContent.replace('장소 카테고리', '').trim() : null;
    
    // 별점: div.unit_info > a.link_info > span.starred_grade > span.num_star
    const ratingElement = document.querySelector('div.unit_info > a.link_info > span.starred_grade > span.num_star');
    const rating = ratingElement ? parseFloat(ratingElement.textContent) : null;
    
    return {
      name: name || '이름 없음',
      category: category || '카테고리 없음',
      rating: rating
    };
  }
}

// ==================== 추출기 팩토리 클래스 ====================
class ExtractorFactory {
  static getExtractor(platform = null) {
    const targetPlatform = platform || PlatformDetector.detectCurrentPlatform();
    
    switch (targetPlatform) {
      case 'naver':
        return new NaverMapExtractor();
      case 'kakao':
        return new KakaoMapExtractor();
      default:
        Logger.warn('지원하지 않는 플랫폼입니다:', targetPlatform);
        return null;
    }
  }
}

// ==================== 메인 컨트롤러 클래스 ====================
class ContentScriptController {
  constructor() {
    this.currentPlaceData = null;
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.startObserving();
    console.log('Content Script 컨트롤러 초기화 완료');
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getCurrentPlaceData') {
        this.handleGetCurrentPlaceData(sendResponse);
        return true; // 비동기 응답을 위해 true 반환
      }
    });
  }

  async handleGetCurrentPlaceData(sendResponse) {
    try {
      const currentPlatform = PlatformDetector.detectCurrentPlatform();
      const extractor = ExtractorFactory.getExtractor(currentPlatform);
      
      if (!extractor || !extractor.canExtract()) {
        sendResponse({ 
          success: false, 
          error: '현재 선택된 장소 정보를 찾을 수 없습니다.' 
        });
        return;
      }
      
      const placeData = await extractor.extractPlaceData();
      
      if (placeData) {
        sendResponse({ success: true, placeData });
      } else {
        sendResponse({ 
          success: false, 
          error: '장소 정보를 가져오는 중 문제가 발생했습니다.' 
        });
      }
    } catch (error) {
      console.error('장소 데이터 추출 오류:', error);
      sendResponse({ 
        success: false, 
        error: '장소 정보를 가져오는 중 오류가 발생했습니다.' 
      });
    }
  }

  // ==================== 옵저버 설정 ====================
  startObserving() {
    // URL 변경 감지
    let currentURL = window.location.href;
    
    const checkURLChange = () => {
      const newURL = window.location.href;
      if (currentURL !== newURL) {
        currentURL = newURL;
        this.updateCurrentPlaceData();
      }
    };

    // 주기적으로 URL 변경 체크
    setInterval(checkURLChange, 1000);
    
    // popstate 이벤트도 감지 (뒤로가기/앞으로가기)
    window.addEventListener('popstate', () => {
      setTimeout(() => this.updateCurrentPlaceData(), 100);
    });
    
    // 초기 상태 설정
    this.updateCurrentPlaceData();
  }

  updateCurrentPlaceData() {
    try {
      const currentPlatform = PlatformDetector.detectCurrentPlatform();
      const extractor = ExtractorFactory.getExtractor(currentPlatform);
      
      if (extractor && extractor.canExtract()) {
        const placeId = extractor.extractPlaceIdFromURL();
        this.currentPlaceData = placeId ? { id: placeId } : null;
      } else {
        this.currentPlaceData = null;
      }
    } catch (error) {
      console.error('데이터 감지 오류:', error);
      this.currentPlaceData = null;
    }
  }
}

// ==================== 초기화 ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScriptController();
  });
} else {
  new ContentScriptController();
}