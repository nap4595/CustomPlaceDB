// 지도 장소 스크랩 Content Script

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
  UI: {
    SIDEBAR_WIDTH: 400,
    SIDEBAR_HEIGHT: '90vh',
    SIDEBAR_RIGHT_OFFSET: 120,
    ANIMATION_DURATION: 500,
    DEBOUNCE_DELAY: 1000,
    Z_INDEX: 10000
  },
  STORAGE_KEYS: {
    MAIN_DATA: 'mapScraperData'
  },
  DEFAULT_FIELD: {
    name: 'memo',
    type: 'text'
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

// 플랫폼 감지 클래스
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

// 기본 지도 데이터 추출기 클래스
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

// 네이버지도 데이터 추출기
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

// 추출기 팩토리 클래스
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

// 카카오맵 데이터 추출기
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


class MapScraper {
  constructor() {
    this.sidebar = null;
    this.currentPlaceData = null;
    this.currentListId = 'default';
    this.lists = {};
    this.fieldsModalInitialized = false;
    this.saveTimeouts = new Map(); // 디바운싱용 타이머들
    this.isSelfUpdate = false; // 자체 업데이트 플래그
    this.eventListeners = new Map(); // 이벤트 리스너 관리
    this.init();
  }

  async init() {
    await this.loadData();
    this.createSidebar();
    this.setupEventListeners();
    this.startObserving();
  }

  // ==================== 데이터 관리 ====================
  async loadData() {
    try {
      const result = await chrome.storage.local.get([CONFIG.STORAGE_KEYS.MAIN_DATA]);
      if (result[CONFIG.STORAGE_KEYS.MAIN_DATA]) {
        this.lists = result[CONFIG.STORAGE_KEYS.MAIN_DATA];
        
        // 기존 목록이 있다면 첫 번째 목록을 현재 목록으로 설정
        const listIds = Object.keys(this.lists);
        if (listIds.length > 0) {
          this.currentListId = listIds[0];
          Logger.log('첫 번째 목록 로드:', this.currentListId, this.lists[this.currentListId].name);
        } else {
          this.currentListId = null;
          Logger.log('저장된 목록이 없습니다.');
        }
      } else {
        this.lists = {};
        this.currentListId = null;
        Logger.log('초기 상태: 목록이 없습니다.');
      }
    } catch (error) {
      Logger.error('데이터 로드 실패:', error);
      this.lists = {};
      this.currentListId = null;
    }
  }

  async saveData() {
    try {
      this.isSelfUpdate = true; // 자체 업데이트 플래그 설정
      await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.MAIN_DATA]: this.lists });
      
      // Promise를 사용한 더 안전한 플래그 해제
      await new Promise(resolve => {
        setTimeout(() => {
          this.isSelfUpdate = false;
          resolve();
        }, 100);
      });
    } catch (error) {
      Logger.error('데이터 저장 실패:', error);
      this.isSelfUpdate = false;
    }
  }

  applyPlatformColors() {
    const platform = PlatformDetector.detectCurrentPlatform();
    const color = PlatformDetector.getPlatformColor(platform);
    
    Logger.log(`${platform} 플랫폼 색상 적용:`, color);
    
    // CSS 커스텀 속성으로 플랫폼 색상 설정
    document.documentElement.style.setProperty('--platform-color', color);
    
    // 동적으로 스타일 적용
    const style = document.createElement('style');
    style.textContent = `
      .map-sidebar-header {
        background-color: ${color} !important;
      }
      .map-list-select:focus {
        border-color: ${color} !important;
        box-shadow: 0 0 0 2px ${color}33 !important;
      }
      .map-list-btn {
        border-color: ${color} !important;
        color: ${color} !important;
      }
      .map-list-btn:hover {
        background-color: ${color} !important;
        color: white !important;
      }
      .map-add-current-btn {
        background-color: ${color} !important;
      }
      .map-add-current-btn:hover {
        background-color: ${color}dd !important;
      }
      .map-memo-textarea:focus {
        border-color: ${color} !important;
      }
      .map-custom-input:focus,
      .map-custom-select:focus {
        border-color: ${color} !important;
      }
      .map-modal-header {
        background-color: ${color} !important;
      }
      .map-add-field-btn {
        background-color: ${color} !important;
      }
      .map-add-field-btn:hover {
        background-color: ${color}dd !important;
      }
      .map-input-field:focus {
        border-color: ${color} !important;
        box-shadow: 0 0 0 2px ${color}33 !important;
      }
      .map-btn-primary {
        background-color: ${color} !important;
      }
      .map-btn-primary:hover {
        background-color: ${color}dd !important;
      }
    `;
    
    // 기존 플랫폼 스타일 제거
    const existingStyle = document.getElementById('map-platform-style');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    style.id = 'map-platform-style';
    document.head.appendChild(style);
  }

  // ==================== UI 생성 ====================
  createSidebar() {
    this.createSidebarContainer();
    this.applyPlatformColors();
  }



  createSidebarContainer() {
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'map-scraper-sidebar';
    this.sidebar.classList.add('open'); // 초기에 열려있지만 숨김 상태로 설정
    this.sidebar.innerHTML = this.getSidebarHTML();
    document.body.appendChild(this.sidebar);
    
    // 초기 상태 설정
    setTimeout(() => {
      const toggleBtn = document.getElementById('map-toggle-visibility-btn');
      if (toggleBtn) toggleBtn.textContent = '⬆';
    }, 100);
  }

  getSidebarHTML() {
    return `
      <div class="map-sidebar-header">
        <div class="map-drag-handle" id="map-drag-handle"></div>
        <button class="map-toggle-visibility-btn" id="map-toggle-visibility-btn">━</button>
      </div>
      <div class="map-list-manager">
        <div class="map-list-display">
          <select class="map-list-select" id="map-list-select">
            ${this.renderListOptions()}
          </select>
        </div>
        <div class="map-list-actions">
          <button class="map-list-btn" id="map-add-list-btn">추가</button>
          <button class="map-list-btn" id="map-edit-list-btn">수정</button>
          <button class="map-list-btn" id="map-delete-list-btn">삭제</button>
          <button class="map-list-btn" id="map-manage-fields-btn">필드</button>
        </div>
        <button class="map-add-current-btn" id="map-add-current-btn">
          현재 보고 있는 장소 추가
        </button>
      </div>
      <div class="map-places-container" id="map-places-container">
        ${this.renderPlaces()}
      </div>
      ${this.getFieldsModalHTML()}
    `;
  }

  getFieldsModalHTML() {
    return `
      <!-- 커스텀 필드 관리 모달 -->
      <div class="map-modal" id="map-fields-modal" style="display: none;">
        <div class="map-modal-content">
          <div class="map-modal-header">
            <h3>커스텀 필드 설정</h3>
            <button class="map-modal-close" id="map-fields-modal-close">×</button>
          </div>
          <div class="map-modal-body">
            <div class="map-fields-list" id="map-fields-list">
              <!-- 필드 목록이 여기에 렌더링됨 -->
            </div>
            <button class="map-add-field-btn" id="map-add-field-btn">새 필드 추가</button>
          </div>
        </div>
      </div>
      
      <!-- 입력 모달 -->
      <div class="map-modal" id="map-input-modal" style="display: none;">
        <div class="map-modal-content">
          <div class="map-modal-header">
            <h3 id="map-input-modal-title">입력</h3>
            <button class="map-modal-close" id="map-input-modal-close">×</button>
          </div>
          <div class="map-modal-body">
            <p id="map-input-modal-message"></p>
            <input type="text" id="map-input-modal-input" class="map-input-field" />
            <div class="map-modal-buttons">
              <button class="map-btn map-btn-primary" id="map-input-modal-confirm">확인</button>
              <button class="map-btn map-btn-secondary" id="map-input-modal-cancel">취소</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 필드 타입 선택 모달 -->
      <div class="map-modal" id="map-field-type-modal" style="display: none;">
        <div class="map-modal-content">
          <div class="map-modal-header">
            <h3>필드 타입 선택</h3>
            <button class="map-modal-close" id="map-field-type-modal-close">×</button>
          </div>
          <div class="map-modal-body">
            <p>생성할 필드의 타입을 선택하세요:</p>
            <div class="map-field-type-options">
              <div class="map-field-type-option" data-type="text">
                <div class="map-field-type-icon">📝</div>
                <div class="map-field-type-info">
                  <h4>텍스트형</h4>
                  <p>자유롭게 텍스트를 입력할 수 있는 필드</p>
                </div>
              </div>
              <div class="map-field-type-option" data-type="select">
                <div class="map-field-type-icon">📋</div>
                <div class="map-field-type-info">
                  <h4>선택형</h4>
                  <p>미리 정의된 옵션 중에서 선택하는 필드</p>
                </div>
              </div>
            </div>
            <div class="map-modal-buttons">
              <button class="map-btn map-btn-secondary" id="map-field-type-cancel">취소</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 렌더링 메서드 ====================
  renderListOptions() {
    if (!this.lists || Object.keys(this.lists).length === 0) {
      return '<option value="">목록이 없습니다</option>';
    }
    
    return Object.entries(this.lists)
      .map(([id, list]) => `<option value="${id}" ${id === this.currentListId ? 'selected' : ''}>${list.name}</option>`)
      .join('');
  }

  renderPlaces() {
    const currentList = this.getCurrentList();
    
    // 목록이 아예 없는 경우
    if (!currentList) {
      return this.getNoListsStateHTML();
    }
    
    // 목록은 있지만 장소가 없는 경우
    if (!currentList.places || currentList.places.length === 0) {
      return this.getEmptyStateHTML();
    }

    return currentList.places.map(place => this.renderPlaceCard(place)).join('');
  }

  renderPlaceCard(place) {
    const platform = place.platform || 'naver'; // 기존 데이터 호환성
    const platformColor = PlatformDetector.getPlatformColor(platform);
    const platformName = PlatformDetector.getPlatformDisplayName(platform);
    
    return `
      <div class="map-place-card" data-place-id="${place.id}" data-platform="${platform}" draggable="true">
        <div class="map-place-header">
          <div class="map-place-drag-handle">⋮⋮</div>
          <div class="map-place-main-info">
            <h3 class="map-place-name" data-place-id="${place.id}" data-url="${place.url}">${place.name}</h3>
            <div class="map-place-meta">
              <span class="map-place-category">${place.category}</span>
              <span class="map-place-rating ${place.rating ? 'has-rating' : 'no-rating'}">
                ${place.rating ? place.rating : '별점 정보 없음'}
              </span>
              <span class="map-platform-badge" style="background-color: ${platformColor}">${platformName}</span>
            </div>
          </div>
          <button class="map-delete-btn" data-place-id="${place.id}">×</button>
        </div>
        ${this.renderCustomFields(place)}
      </div>
    `;
  }

  getEmptyStateHTML() {
    return `
      <div class="map-empty-state">
        <p>저장된 장소가 없습니다.</p>
        <p>지도에서 장소를 클릭하고 추가해보세요!</p>
      </div>
    `;
  }

  getNoListsStateHTML() {
    return `
      <div class="map-empty-state">
        <p>저장된 목록이 없습니다.</p>
        <p>새 목록을 추가하거나 장소를 추가해보세요!</p>
      </div>
    `;
  }

  renderCustomFields(place) {
    const currentList = this.getCurrentList();
    if (!currentList?.customFields?.length) {
      return '';
    }

    return `
      <div class="map-custom-fields">
        ${currentList.customFields.map(field => this.renderCustomField(field, place)).join('')}
      </div>
    `;
  }

  renderCustomField(field, place) {
    const value = place.customValues?.[field.name] || '';
    
    if (field.type === 'select') {
      return this.renderSelectField(field, place, value);
    } else {
      return this.renderTextField(field, place, value);
    }
  }


  renderSelectField(field, place, value) {
    return `
      <div class="map-custom-field">
        <label class="map-custom-label">${field.name}</label>
        <select class="map-custom-select" data-place-id="${place.id}" data-field-name="${field.name}">
          <option value="">선택하세요</option>
          ${field.options.map(option => 
            `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`
          ).join('')}
        </select>
      </div>
    `;
  }

  renderTextField(field, place, value) {
    return `
      <div class="map-custom-field">
        <label class="map-custom-label">${field.name}</label>
        <input 
          type="text" 
          class="map-custom-input" 
          data-place-id="${place.id}" 
          data-field-name="${field.name}"
          value="${value}"
          placeholder="${field.name}을 입력하세요"
        />
      </div>
    `;
  }

  // ==================== 이벤트 리스너 설정 ====================
  setupEventListeners() {
    // 기존 이벤트 리스너 정리
    this.removeAllEventListeners();
    
    this.setupSidebarEventListeners();
    this.setupPlacesContainerEventListeners();
  }

  removeAllEventListeners() {
    // 저장된 이벤트 리스너들 제거
    this.eventListeners.forEach((listener, key) => {
      const [element, event] = key.split('|');
      const el = element === 'window' ? window : document.querySelector(element);
      if (el) {
        el.removeEventListener(event, listener);
      }
    });
    this.eventListeners.clear();
  }

  addEventListenerSafe(selector, event, handler) {
    const element = selector === 'window' ? window : 
                   selector.startsWith('#') ? document.querySelector(selector) :
                   this.sidebar.querySelector(selector);
    
    if (element) {
      const key = `${selector}|${event}`;
      // 기존 리스너가 있다면 제거
      if (this.eventListeners.has(key)) {
        element.removeEventListener(event, this.eventListeners.get(key));
      }
      
      element.addEventListener(event, handler);
      this.eventListeners.set(key, handler);
    }
  }

  setupSidebarEventListeners() {
    this.addEventListenerSafe('#map-toggle-visibility-btn', 'click', () => this.toggleSidebarVisibility());
    this.addEventListenerSafe('#map-drag-handle', 'mousedown', (e) => this.handleDragStart(e));
    this.addEventListenerSafe('#map-list-select', 'change', (e) => this.handleListChange(e));
    this.addEventListenerSafe('#map-add-list-btn', 'click', () => this.addNewList());
    this.addEventListenerSafe('#map-edit-list-btn', 'click', () => this.editListName());
    this.addEventListenerSafe('#map-delete-list-btn', 'click', () => this.deleteList());
    this.addEventListenerSafe('#map-manage-fields-btn', 'click', () => this.showFieldsModal());
    this.addEventListenerSafe('#map-add-current-btn', 'click', (e) => this.handleAddCurrentPlace(e));
  }

  setupPlacesContainerEventListeners() {
    this.addEventListenerSafe('#map-places-container', 'click', (e) => this.handlePlacesContainerClick(e));
    this.addEventListenerSafe('#map-places-container', 'input', (e) => this.handlePlacesContainerInput(e));
    this.addEventListenerSafe('#map-places-container', 'change', (e) => this.handlePlacesContainerInput(e));
    
    // 장소 드래그 앤 드롭 설정
    this.setupPlaceDragAndDrop();
  }

  handlePlacesContainerClick(e) {
    // 드래그 핸들 클릭 시에는 다른 동작 수행하지 않음
    if (e.target.classList.contains('map-place-drag-handle')) {
      return;
    }
    
    if (e.target.classList.contains('map-delete-btn')) {
      const placeId = e.target.dataset.placeId;
      this.deletePlace(placeId);
    } else if (e.target.classList.contains('map-place-name')) {
      const url = e.target.dataset.url;
      const placeCard = e.target.closest('.map-place-card');
      const placePlatform = placeCard?.dataset.platform || 'naver';
      const currentPlatform = PlatformDetector.detectCurrentPlatform();
      
      if (url) {
        // 같은 플랫폼이면 현재 탭에서 이동, 다른 플랫폼이면 새 탭으로 열기
        if (placePlatform === currentPlatform) {
          window.location.href = url;
        } else {
          window.open(url, '_blank');
        }
      }
    }
  }

  handlePlacesContainerInput(e) {
    const placeId = e.target.dataset.placeId;
    
    if (e.target.classList.contains('map-custom-input') || 
        e.target.classList.contains('map-custom-select')) {
      const fieldName = e.target.dataset.fieldName;
      this.saveCustomValue(placeId, fieldName, e.target.value);
    }
  }

  handleListChange(e) {
    this.currentListId = e.target.value;
    this.updatePlacesContainer();
  }

  handleAddCurrentPlace(e) {
    Logger.log('현재 장소 추가 버튼 클릭됨');
    e.preventDefault();
    e.stopPropagation();
    this.addCurrentPlace();
  }

  setupPlaceDragAndDrop() {
    const placesContainer = document.getElementById('map-places-container');
    if (!placesContainer) return;

    let draggedElement = null;
    let draggedIndex = null;
    let dropIndicator = null;

    // 드롭 인디케이터 생성
    const createDropIndicator = () => {
      const indicator = document.createElement('div');
      indicator.className = 'map-drop-indicator';
      indicator.style.cssText = `
        height: 3px;
        background-color: #007bff;
        border-radius: 2px;
        margin: 4px 0;
        opacity: 0.8;
        box-shadow: 0 0 4px rgba(0, 123, 255, 0.5);
        transition: all 0.2s ease;
      `;
      return indicator;
    };

    // 가장 가까운 장소 카드와 삽입 위치 찾기
    const getClosestPlaceCard = (y) => {
      const placeCards = Array.from(placesContainer.querySelectorAll('.map-place-card:not([style*="opacity: 0.5"])'));
      
      let closest = null;
      let closestDistance = Infinity;
      let insertAfter = false;

      placeCards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const cardCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(y - cardCenterY);

        if (distance < closestDistance) {
          closestDistance = distance;
          closest = card;
          insertAfter = y > cardCenterY;
        }
      });

      return { closest, insertAfter };
    };

    // 드롭 인디케이터 위치 업데이트
    const updateDropIndicator = (y) => {
      if (!dropIndicator) {
        dropIndicator = createDropIndicator();
      }

      const { closest, insertAfter } = getClosestPlaceCard(y);
      
      if (closest) {
        // 기존 인디케이터 제거
        const existingIndicator = placesContainer.querySelector('.map-drop-indicator');
        if (existingIndicator) {
          existingIndicator.remove();
        }

        // 새 위치에 인디케이터 삽입
        if (insertAfter) {
          closest.insertAdjacentElement('afterend', dropIndicator);
        } else {
          closest.insertAdjacentElement('beforebegin', dropIndicator);
        }
      }
    };

    // 드롭 인디케이터 제거
    const removeDropIndicator = () => {
      const indicator = placesContainer.querySelector('.map-drop-indicator');
      if (indicator) {
        indicator.remove();
      }
      dropIndicator = null;
    };

    placesContainer.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('map-place-card')) {
        draggedElement = e.target;
        const placeId = e.target.dataset.placeId;
        const currentList = this.getCurrentList();
        if (currentList) {
          draggedIndex = currentList.places.findIndex(p => p.id === placeId);
        }
        
        e.target.style.opacity = '0.5';
        e.target.style.transform = 'rotate(1deg)';
        e.dataTransfer.effectAllowed = 'move';
        
        document.body.style.cursor = 'grabbing';
      }
    });

    placesContainer.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('map-place-card')) {
        e.target.style.opacity = '';
        e.target.style.transform = '';
        document.body.style.cursor = '';
        removeDropIndicator();
        draggedElement = null;
        draggedIndex = null;
      }
    });

    placesContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (draggedElement) {
        updateDropIndicator(e.clientY);
      }
    });

    placesContainer.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });

    placesContainer.addEventListener('dragleave', (e) => {
      // 컨테이너 영역을 완전히 벗어날 때만 인디케이터 제거
      if (!placesContainer.contains(e.relatedTarget)) {
        removeDropIndicator();
      }
    });

    placesContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      
      if (!draggedElement || draggedIndex === null) return;

      const { closest, insertAfter } = getClosestPlaceCard(e.clientY);
      
      if (closest) {
        const targetPlaceId = closest.dataset.placeId;
        const currentList = this.getCurrentList();
        
        if (currentList) {
          const targetIndex = currentList.places.findIndex(p => p.id === targetPlaceId);
          let newIndex = targetIndex;
          
          if (insertAfter) {
            newIndex = targetIndex + 1;
          }
          
          // 드래그한 요소가 목적지보다 위에 있으면 인덱스 조정
          if (draggedIndex < newIndex) {
            newIndex = newIndex - 1;
          }
          
          // 같은 위치가 아닐 때만 순서 변경
          if (newIndex !== draggedIndex) {
            this.reorderPlaces(draggedIndex, newIndex);
          }
        }
      }
      
      removeDropIndicator();
    });
  }

  reorderPlaces(fromIndex, toIndex) {
    const currentList = this.getCurrentList();
    if (!currentList || !currentList.places) return;

    const places = currentList.places;
    
    // 인덱스 유효성 검사
    if (fromIndex < 0 || fromIndex >= places.length) {
      Logger.error('유효하지 않은 fromIndex:', fromIndex);
      return;
    }
    
    // toIndex를 유효한 범위로 제한
    toIndex = Math.max(0, Math.min(toIndex, places.length - 1));
    
    // 같은 위치면 변경하지 않음
    if (fromIndex === toIndex) {
      return;
    }

    Logger.log(`장소 순서 변경: ${fromIndex} -> ${toIndex}`);

    // 배열에서 아이템을 이동
    const movedPlace = places.splice(fromIndex, 1)[0];
    places.splice(toIndex, 0, movedPlace);

    // 데이터 저장 및 UI 업데이트
    this.saveData();
    this.updatePlacesContainer();
  }

  // ==================== 사이드바 조작 ====================
  toggleSidebarVisibility() {
    const isVisible = this.sidebar.classList.contains('visible');
    if (isVisible) {
      this.hideSidebar();
    } else {
      this.showSidebar();
    }
  }

  showSidebar() {
    this.sidebar.classList.remove('collapsing');
    this.sidebar.classList.add('visible');
    const toggleBtn = document.getElementById('map-toggle-visibility-btn');
    if (toggleBtn) toggleBtn.textContent = '━';
  }

  hideSidebar() {
    this.sidebar.classList.add('collapsing');
    this.sidebar.classList.remove('visible');
    const toggleBtn = document.getElementById('map-toggle-visibility-btn');
    if (toggleBtn) toggleBtn.textContent = '⬆';
    
    // 애니메이션 완료 후 collapsing 클래스 제거
    setTimeout(() => {
      this.sidebar.classList.remove('collapsing');
    }, 400);
  }

  // ==================== 드래그 기능 ====================
  handleDragStart(e) {
    e.preventDefault();
    this.dragData = {
      startY: e.clientY,
      startTime: Date.now(),
      isVisible: this.sidebar.classList.contains('visible')
    };
    
    // 전역 이벤트 리스너 추가
    this.boundMouseMove = this.handleDragMove.bind(this);
    this.boundMouseUp = this.handleDragEnd.bind(this);
    
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    
    // 드래그 중 텍스트 선택 방지
    document.body.style.userSelect = 'none';
  }

  handleDragMove(e) {
    if (!this.dragData) return;
    
    const deltaY = e.clientY - this.dragData.startY;
    const threshold = 30; // 최소 드래그 거리
    
    // 위로 드래그 시 확장, 아래로 드래그 시 축소
    if (deltaY < -threshold && !this.dragData.isVisible) {
      this.showSidebar();
      this.dragData.isVisible = true;
    } else if (deltaY > threshold && this.dragData.isVisible) {
      this.hideSidebar();
      this.dragData.isVisible = false;
    }
  }

  handleDragEnd(e) {
    if (!this.dragData) return;
    
    const deltaY = e.clientY - this.dragData.startY;
    const dragTime = Date.now() - this.dragData.startTime;
    
    // 빠른 스와이프 감지 (속도 기반)
    if (dragTime < 300) {
      const velocity = Math.abs(deltaY) / dragTime;
      if (velocity > 0.5) {
        if (deltaY < 0) {
          this.showSidebar();
        } else {
          this.hideSidebar();
        }
      }
    }
    
    // 정리
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    document.body.style.userSelect = '';
    this.dragData = null;
  }

  updateListSelect() {
    const select = document.getElementById('map-list-select');
    select.innerHTML = this.renderListOptions();
  }

  updatePlacesContainer() {
    const container = document.getElementById('map-places-container');
    
    // 포커스된 요소 정보 저장
    const focusInfo = this.saveFocusState();
    
    // DOM 업데이트
    container.innerHTML = this.renderPlaces();
    
    // 포커스 복원
    this.restoreFocusState(focusInfo);
  }

  saveFocusState() {
    const activeElement = document.activeElement;
    if (!activeElement || !this.sidebar.contains(activeElement)) {
      return null;
    }
    
    const focusInfo = {
      placeId: activeElement.dataset?.placeId,
      fieldName: activeElement.dataset?.fieldName,
      className: activeElement.className,
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
      value: activeElement.value
    };
    
    return focusInfo;
  }

  restoreFocusState(focusInfo) {
    if (!focusInfo || !focusInfo.placeId) return;
    
    // 같은 요소를 찾아서 포커스 복원
    let selector;
    if (focusInfo.fieldName) {
      // 커스텀 필드
      selector = `.map-custom-input[data-place-id="${focusInfo.placeId}"][data-field-name="${focusInfo.fieldName}"], .map-custom-select[data-place-id="${focusInfo.placeId}"][data-field-name="${focusInfo.fieldName}"]`;
    }
    
    if (selector) {
      const element = this.sidebar.querySelector(selector);
      if (element) {
        element.focus();
        if (typeof focusInfo.selectionStart === 'number') {
          element.setSelectionRange(focusInfo.selectionStart, focusInfo.selectionEnd);
        }
      }
    }
  }

  // ==================== 리스트 관리 ====================
  async addNewList() {
    const name = await this.showInputModal('새 목록 추가', '새 목록 이름을 입력하세요:');
    if (!name?.trim()) return;

    const id = Date.now().toString();
    this.lists[id] = {
      name: name.trim(),
      customFields: [
        {
          name: CONFIG.DEFAULT_FIELD.name,
          type: CONFIG.DEFAULT_FIELD.type
        }
      ],
      places: []
    };
    
    this.saveData();
    this.updateListSelect();
    this.currentListId = id;
    document.getElementById('map-list-select').value = id;
    this.updatePlacesContainer();
  }

  async editListName() {
    if (!this.currentListId) {
      alert('편집할 목록이 없습니다.');
      return;
    }
    
    const currentList = this.getCurrentList();
    if (!currentList) {
      alert('목록을 찾을 수 없습니다.');
      return;
    }
    
    const newName = await this.showInputModal('목록 이름 변경', '새로운 목록 이름을 입력하세요:', currentList.name);
    if (!newName?.trim()) return;
    
    const trimmedName = newName.trim();
    
    // 중복 이름 검사 (현재 목록 제외)
    const isDuplicate = Object.entries(this.lists).some(([id, list]) => 
      id !== this.currentListId && list.name === trimmedName
    );
    
    if (isDuplicate) {
      alert('이미 존재하는 목록 이름입니다.');
      return;
    }
    
    // 이름 변경
    currentList.name = trimmedName;
    this.saveData();
    this.updateListSelect();
    
    // 선택된 값 유지
    const listSelect = document.getElementById('map-list-select');
    if (listSelect) {
      listSelect.value = this.currentListId;
    }
  }

  deleteList() {
    if (!confirm('정말로 이 목록을 삭제하시겠습니까?')) return;

    delete this.lists[this.currentListId];
    
    // 남은 목록이 있으면 첫 번째 목록으로 이동, 없으면 null
    const remainingListIds = Object.keys(this.lists);
    this.currentListId = remainingListIds.length > 0 ? remainingListIds[0] : null;
    
    this.saveData();
    this.updateListSelect();
    this.updatePlacesContainer();
  }

  // ==================== 장소 관리 ====================
  async addCurrentPlace() {
    Logger.log('addCurrentPlace 함수 실행됨');
    
    try {
      const currentPlatform = PlatformDetector.detectCurrentPlatform();
      Logger.log('감지된 플랫폼:', currentPlatform);
      
      const extractor = ExtractorFactory.getExtractor(currentPlatform);
      if (!extractor) {
        alert(`현재 플랫폼(${PlatformDetector.getPlatformDisplayName(currentPlatform)})은 아직 지원되지 않습니다.`);
        return;
      }
      
      if (!extractor.canExtract()) {
        alert('현재 선택된 장소 정보를 찾을 수 없습니다. 지도에서 장소를 클릭해주세요.');
        return;
      }
      
      const placeData = await extractor.extractPlaceData();
      Logger.log('추출된 장소 데이터:', placeData);
      
      if (placeData) {
        this.addPlace(placeData);
      } else {
        alert('장소 정보를 가져오는 중 문제가 발생했습니다.');
      }
    } catch (error) {
      Logger.error('장소 추가 중 오류:', error);
      alert('장소 정보를 가져오는 중 오류가 발생했습니다.');
    }
  }


  addPlace(placeData) {
    let currentList = this.getCurrentList();
    
    // 목록이 없으면 기본 목록 자동 생성
    if (!currentList) {
      Logger.log('목록이 없어서 새 목록을 생성합니다.');
      const newListId = Date.now().toString();
      this.lists[newListId] = {
        name: '새 목록',
        customFields: [
          {
            name: 'memo',
            type: 'text'
          }
        ],
        places: []
      };
      this.currentListId = newListId;
      currentList = this.lists[newListId];
      
      // UI 업데이트
      this.updateListSelect();
      document.getElementById('map-list-select').value = newListId;
    }
    
    if (this.isPlaceAlreadyExists(currentList, placeData.id)) {
      alert('이미 저장된 장소입니다.');
      return;
    }

    currentList.places.push(placeData);
    this.saveData();
    this.updatePlacesContainer();
    this.showSuccessMessage('장소가 저장되었습니다!');
  }

  isPlaceAlreadyExists(list, placeId) {
    return list.places.some(p => p.id === placeId);
  }

  deletePlace(placeId) {
    if (!confirm('이 장소를 삭제하시겠습니까?')) return;

    const currentList = this.getCurrentList();
    currentList.places = currentList.places.filter(p => p.id !== placeId);
    this.saveData();
    this.updatePlacesContainer();
  }


  saveCustomValue(placeId, fieldName, value) {
    const place = this.findPlaceById(placeId);
    if (place) {
      if (!place.customValues) {
        place.customValues = {};
      }
      place.customValues[fieldName] = value;
      this.debouncedSave(`custom_${placeId}_${fieldName}`);
    }
  }

  // ==================== 유틸리티 함수들 ====================
  
  // 디바운싱 유틸리티
  createDebouncer(func, delay = 500) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  debouncedSave(key, delay = 500) {
    // 기존 타이머 취소
    if (this.saveTimeouts.has(key)) {
      clearTimeout(this.saveTimeouts.get(key));
    }
    
    // 새 타이머 설정
    const timeoutId = setTimeout(async () => {
      await this.saveData();
      this.saveTimeouts.delete(key);
    }, delay);
    
    this.saveTimeouts.set(key, timeoutId);
  }

  // 문자열 이스케이프 유틸리티 (XSS 방지)
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // CSS 선택자 이스케이프 유틸리티
  escapeCssSelector(selector) {
    if (typeof selector !== 'string') return '';
    return selector.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  }

  // 입력값 검증 유틸리티
  validateInput(value, type = 'text', maxLength = 100) {
    if (!value || typeof value !== 'string') return '';
    
    // 길이 제한
    let cleaned = value.slice(0, maxLength);
    
    // 타입별 검증
    switch (type) {
      case 'listName':
        // 목록 이름: 특수문자 제한
        cleaned = cleaned.replace(/[<>\"'&]/g, '');
        break;
      case 'placeName':
        // 장소 이름: HTML 태그 제거
        cleaned = this.escapeHtml(cleaned);
        break;
      case 'memo':
        // 메모: 기본 이스케이프
        cleaned = this.escapeHtml(cleaned);
        break;
    }
    
    return cleaned.trim();
  }

  // 모달 입력 다이얼로그
  async showInputModal(title, message, defaultValue = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('map-input-modal');
      const titleEl = document.getElementById('map-input-modal-title');
      const messageEl = document.getElementById('map-input-modal-message');
      const inputEl = document.getElementById('map-input-modal-input');
      const confirmBtn = document.getElementById('map-input-modal-confirm');
      const cancelBtn = document.getElementById('map-input-modal-cancel');
      const closeBtn = document.getElementById('map-input-modal-close');

      // 모달 설정
      titleEl.textContent = title;
      messageEl.textContent = message;
      inputEl.value = defaultValue;
      modal.style.display = 'block';
      inputEl.focus();
      inputEl.select();

      // 이벤트 핸들러
      const cleanup = () => {
        modal.style.display = 'none';
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        inputEl.removeEventListener('keydown', onKeydown);
        modal.removeEventListener('click', onModalClick);
      };

      const onConfirm = () => {
        const value = inputEl.value.trim();
        cleanup();
        resolve(value || null);
      };

      const onCancel = () => {
        cleanup();
        resolve(null);
      };

      const onKeydown = (e) => {
        if (e.key === 'Enter') {
          onConfirm();
        } else if (e.key === 'Escape') {
          onCancel();
        }
      };

      const onModalClick = (e) => {
        if (e.target === modal) {
          onCancel();
        }
      };

      // 이벤트 리스너 등록
      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      inputEl.addEventListener('keydown', onKeydown);
      modal.addEventListener('click', onModalClick);
    });
  }

  // ==================== 커스텀 필드 관리 ====================
  showFieldsModal() {
    const modal = document.getElementById('map-fields-modal');
    this.renderFieldsList();
    modal.style.display = 'block';
    
    this.setupFieldsModalEventListeners(modal);
  }

  setupFieldsModalEventListeners(modal) {
    if (this.fieldsModalInitialized) return;
    this.fieldsModalInitialized = true;
    
    const closeBtn = document.getElementById('map-fields-modal-close');
    const addFieldBtn = document.getElementById('map-add-field-btn');
    const fieldsList = document.getElementById('map-fields-list');
    
    closeBtn.addEventListener('click', () => this.hideFieldsModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hideFieldsModal();
    });
    addFieldBtn.addEventListener('click', () => this.addCustomField());
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'block') {
        this.hideFieldsModal();
      }
    });
    
    // 이벤트 위임으로 수정/삭제 버튼 처리
    fieldsList.addEventListener('click', (e) => {
      if (e.target.classList.contains('map-delete-field-btn')) {
        e.stopPropagation();
        const fieldIndex = parseInt(e.target.dataset.fieldIndex);
        this.deleteCustomField(fieldIndex);
      } else if (e.target.classList.contains('map-edit-field-btn')) {
        e.stopPropagation();
        const fieldIndex = parseInt(e.target.dataset.fieldIndex);
        this.editCustomField(fieldIndex);
      }
    });
    
    // 드래그 앤 드롭 이벤트 처리
    this.setupFieldDragAndDrop(fieldsList);
  }

  hideFieldsModal() {
    const modal = document.getElementById('map-fields-modal');
    modal.style.display = 'none';
  }

  setupFieldDragAndDrop(fieldsList) {
    let draggedElement = null;
    let draggedIndex = null;
    let dropIndicator = null;

    // 드롭 인디케이터 생성
    const createDropIndicator = () => {
      const indicator = document.createElement('div');
      indicator.className = 'map-drop-indicator';
      indicator.style.cssText = `
        height: 3px;
        background-color: #007bff;
        border-radius: 2px;
        margin: 2px 0;
        opacity: 0.8;
        box-shadow: 0 0 4px rgba(0, 123, 255, 0.5);
        transition: all 0.2s ease;
      `;
      return indicator;
    };

    // 가장 가까운 필드 아이템과 삽입 위치 찾기
    const getClosestFieldItem = (y) => {
      const fieldItems = Array.from(fieldsList.querySelectorAll('.map-field-item:not([style*="opacity: 0.5"])'));
      
      let closest = null;
      let closestDistance = Infinity;
      let insertAfter = false;

      fieldItems.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(y - itemCenterY);

        if (distance < closestDistance) {
          closestDistance = distance;
          closest = item;
          // 마우스가 아이템 중앙보다 아래에 있으면 아이템 다음에 삽입
          insertAfter = y > itemCenterY;
        }
      });

      return { closest, insertAfter };
    };

    // 드롭 인디케이터 위치 업데이트
    const updateDropIndicator = (y) => {
      if (!dropIndicator) {
        dropIndicator = createDropIndicator();
      }

      const { closest, insertAfter } = getClosestFieldItem(y);
      
      if (closest) {
        // 기존 인디케이터 제거
        const existingIndicator = fieldsList.querySelector('.map-drop-indicator');
        if (existingIndicator) {
          existingIndicator.remove();
        }

        // 새 위치에 인디케이터 삽입
        if (insertAfter) {
          closest.insertAdjacentElement('afterend', dropIndicator);
        } else {
          closest.insertAdjacentElement('beforebegin', dropIndicator);
        }
      }
    };

    // 드롭 인디케이터 제거
    const removeDropIndicator = () => {
      const indicator = fieldsList.querySelector('.map-drop-indicator');
      if (indicator) {
        indicator.remove();
      }
      dropIndicator = null;
    };

    fieldsList.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('map-field-item')) {
        draggedElement = e.target;
        draggedIndex = parseInt(e.target.dataset.fieldIndex);
        e.target.style.opacity = '0.5';
        e.target.style.transform = 'rotate(2deg)';
        e.dataTransfer.effectAllowed = 'move';
        
        // 드래그 시작 시 커서 변경
        document.body.style.cursor = 'grabbing';
      }
    });

    fieldsList.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('map-field-item')) {
        e.target.style.opacity = '';
        e.target.style.transform = '';
        document.body.style.cursor = '';
        removeDropIndicator();
        draggedElement = null;
        draggedIndex = null;
      }
    });

    // 전체 필드 리스트에서 dragover 처리 (넓은 드롭 영역)
    fieldsList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (draggedElement) {
        updateDropIndicator(e.clientY);
      }
    });

    fieldsList.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });

    fieldsList.addEventListener('dragleave', (e) => {
      // 필드 리스트 영역을 완전히 벗어날 때만 인디케이터 제거
      if (!fieldsList.contains(e.relatedTarget)) {
        removeDropIndicator();
      }
    });

    fieldsList.addEventListener('drop', (e) => {
      e.preventDefault();
      
      if (!draggedElement) return;

      const { closest, insertAfter } = getClosestFieldItem(e.clientY);
      
      if (closest) {
        const targetIndex = parseInt(closest.dataset.fieldIndex);
        let newIndex = targetIndex;
        
        // 삽입 위치 계산
        if (insertAfter) {
          newIndex = targetIndex + 1;
        }
        
        // 드래그한 요소가 목적지보다 위에 있으면 인덱스 조정
        if (draggedIndex < newIndex) {
          newIndex = newIndex - 1;
        }
        
        // 같은 위치가 아닐 때만 순서 변경
        if (newIndex !== draggedIndex) {
          this.reorderCustomFields(draggedIndex, newIndex);
        }
      }
      
      removeDropIndicator();
    });
  }

  reorderCustomFields(fromIndex, toIndex) {
    const currentList = this.getCurrentList();
    if (!currentList || !currentList.customFields) return;

    const fields = currentList.customFields;
    
    // 인덱스 유효성 검사
    if (fromIndex < 0 || fromIndex >= fields.length) {
      Logger.error('유효하지 않은 fromIndex:', fromIndex);
      return;
    }
    
    // toIndex를 유효한 범위로 제한
    toIndex = Math.max(0, Math.min(toIndex, fields.length - 1));
    
    // 같은 위치면 변경하지 않음
    if (fromIndex === toIndex) {
      return;
    }

    Logger.log(`필드 순서 변경: ${fromIndex} -> ${toIndex}`);

    // 배열에서 아이템을 이동
    const movedField = fields.splice(fromIndex, 1)[0];
    fields.splice(toIndex, 0, movedField);

    // 데이터 저장 및 UI 업데이트
    this.saveData();
    this.renderFieldsList();
    this.updatePlacesContainer(); // 장소 카드들의 커스텀 필드 순서도 업데이트
  }

  renderFieldsList() {
    const currentList = this.getCurrentList();
    const fieldsList = document.getElementById('map-fields-list');
    
    if (!fieldsList) {
      Logger.error('필드 목록 요소를 찾을 수 없습니다.');
      return;
    }
    
    if (!currentList || !currentList.customFields?.length) {
      fieldsList.innerHTML = '<p class="map-no-fields">설정된 커스텀 필드가 없습니다.</p>';
      return;
    }
    
    fieldsList.innerHTML = currentList.customFields
      .filter(field => field && field.name) // 유효한 필드만 필터링
      .map((field, index) => this.renderFieldItem(field, index))
      .join('');
  }

  renderFieldItem(field, index) {
    if (!field || !field.name) {
      Logger.error('유효하지 않은 필드 데이터:', field);
      return '';
    }
    
    const typeText = field.type === 'select' ? '선택형' : '텍스트형';
    const optionsText = field.type === 'select' && field.options ? `(${field.options.join(', ')})` : '';
    
    return `
      <div class="map-field-item" draggable="true" data-field-index="${index}">
        <div class="map-field-drag-handle">⋮⋮</div>
        <div class="map-field-info">
          <div class="map-field-name">${field.name}</div>
          <div class="map-field-details">
            <span class="map-field-type">${typeText}</span>
            ${optionsText ? `<span class="map-field-options">${optionsText}</span>` : ''}
          </div>
        </div>
        <div class="map-field-actions">
          <button class="map-edit-field-btn" data-field-index="${index}">수정</button>
          <button class="map-delete-field-btn" data-field-index="${index}">삭제</button>
        </div>
      </div>
    `;
  }

  async addCustomField() {
    const fieldData = await this.getFieldDataFromUser();
    if (!fieldData) return;

    const currentList = this.getCurrentList();
    if (!currentList.customFields) {
      currentList.customFields = [];
    }

    if (this.isFieldNameExists(currentList, fieldData.name)) {
      alert('이미 존재하는 필드 이름입니다.');
      return;
    }

    currentList.customFields.push(fieldData);
    this.saveData();
    this.renderFieldsList();
    this.updatePlacesContainer();
  }

  async getFieldDataFromUser(existingField = null) {
    const isEdit = !!existingField;
    const title = isEdit ? '필드 수정' : '필드 추가';
    const defaultName = existingField?.name || '';
    
    const name = await this.showInputModal(title, '필드 이름을 입력하세요:', defaultName);
    if (!name?.trim()) return null;

    const type = isEdit ? existingField.type : await this.showFieldTypeModal();
    if (!type) return null;
    
    const field = { name: name.trim(), type };
    
    if (type === 'select') {
      const defaultOptions = existingField?.options || [];
      const options = await this.getSelectOptionsFromUser(defaultOptions);
      if (!options) return null;
      field.options = options;
    }
    
    return field;
  }

  async showFieldTypeModal() {
    return new Promise((resolve) => {
      const modal = document.getElementById('map-field-type-modal');
      const closeBtn = document.getElementById('map-field-type-modal-close');
      const cancelBtn = document.getElementById('map-field-type-cancel');
      const options = modal.querySelectorAll('.map-field-type-option');

      modal.style.display = 'block';

      const cleanup = () => {
        modal.style.display = 'none';
        closeBtn.removeEventListener('click', onCancel);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onModalClick);
        options.forEach(option => {
          option.removeEventListener('click', onOptionClick);
        });
        document.removeEventListener('keydown', onKeydown);
      };

      const onCancel = () => {
        cleanup();
        resolve(null);
      };

      const onOptionClick = (e) => {
        const type = e.currentTarget.dataset.type;
        cleanup();
        resolve(type);
      };

      const onModalClick = (e) => {
        if (e.target === modal) {
          onCancel();
        }
      };

      const onKeydown = (e) => {
        if (e.key === 'Escape') {
          onCancel();
        }
      };

      closeBtn.addEventListener('click', onCancel);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onModalClick);
      options.forEach(option => {
        option.addEventListener('click', onOptionClick);
      });
      document.addEventListener('keydown', onKeydown);
    });
  }

  async getSelectOptionsFromUser(defaultOptions = []) {
    const defaultValue = defaultOptions.length > 0 ? defaultOptions.join(', ') : '';
    const optionsStr = await this.showInputModal(
      '선택 옵션 설정', 
      '선택 옵션들을 쉼표(,)로 구분해서 입력하세요:\n예: O,X 또는 좋음,보통,나쁨',
      defaultValue
    );
    if (!optionsStr) return null;
    
    const options = optionsStr.split(',').map(opt => opt.trim()).filter(opt => opt);
    if (options.length === 0) {
      alert('유효한 옵션을 입력해주세요.');
      return null;
    }
    
    return options;
  }

  async editCustomField(fieldIndex) {
    const currentList = this.getCurrentList();
    
    if (!currentList || !currentList.customFields || fieldIndex >= currentList.customFields.length) {
      Logger.error('유효하지 않은 필드 인덱스:', fieldIndex);
      return;
    }

    const existingField = currentList.customFields[fieldIndex];
    const fieldData = await this.getFieldDataFromUser(existingField);
    if (!fieldData) return;

    // 이름이 바뀌었는지 확인하고 중복 검사
    if (fieldData.name !== existingField.name && this.isFieldNameExists(currentList, fieldData.name, fieldIndex)) {
      alert('이미 존재하는 필드 이름입니다.');
      return;
    }

    // 기존 필드 데이터를 새 데이터로 업데이트
    const oldFieldName = existingField.name;
    currentList.customFields[fieldIndex] = fieldData;

    // 필드 이름이 바뀌었다면 모든 장소의 커스텀 값도 업데이트
    if (fieldData.name !== oldFieldName) {
      this.updateFieldNameInAllPlaces(currentList, oldFieldName, fieldData.name);
    }

    this.saveData();
    this.renderFieldsList();
    this.updatePlacesContainer();
  }

  updateFieldNameInAllPlaces(list, oldFieldName, newFieldName) {
    list.places.forEach(place => {
      if (place.customValues && place.customValues[oldFieldName] !== undefined) {
        place.customValues[newFieldName] = place.customValues[oldFieldName];
        delete place.customValues[oldFieldName];
      }
    });
  }

  isFieldNameExists(list, fieldName, excludeIndex = -1) {
    return list.customFields.some((f, index) => {
      return f.name === fieldName && index !== excludeIndex;
    });
  }

  deleteCustomField(fieldIndex) {
    const currentList = this.getCurrentList();
    
    // 유효성 검사
    if (!currentList || !currentList.customFields || !Array.isArray(currentList.customFields)) {
      console.error('현재 목록 또는 커스텀 필드가 유효하지 않습니다.');
      return;
    }
    
    if (fieldIndex < 0 || fieldIndex >= currentList.customFields.length) {
      Logger.error('유효하지 않은 필드 인덱스:', fieldIndex);
      return;
    }
    
    const field = currentList.customFields[fieldIndex];
    if (!field || !field.name) {
      console.error('필드 데이터가 유효하지 않습니다:', field);
      return;
    }
    
    const confirmResult = confirm(`"${field.name}" 필드를 삭제하시겠습니까?\n모든 장소의 해당 필드 데이터가 함께 삭제됩니다.`);
    if (!confirmResult) return;

    // 모든 장소에서 해당 커스텀 필드 값 제거
    this.removeFieldFromAllPlaces(currentList, field.name);
    
    // 필드 삭제
    currentList.customFields.splice(fieldIndex, 1);
    this.saveData();
    this.renderFieldsList();
    this.updatePlacesContainer();
  }

  removeFieldFromAllPlaces(list, fieldName) {
    list.places.forEach(place => {
      if (place.customValues?.[fieldName]) {
        delete place.customValues[fieldName];
      }
    });
  }

  // ==================== 유틸리티 메서드 ====================
  getCurrentList() {
    if (!this.lists || typeof this.lists !== 'object') {
      return null;
    }
    return this.lists[this.currentListId] || null;
  }

  findPlaceById(placeId) {
    if (!placeId) return null;
    
    const currentList = this.getCurrentList();
    if (!currentList?.places || !Array.isArray(currentList.places)) {
      return null;
    }
    
    return currentList.places.find(p => p && p.id === placeId) || null;
  }

  // 안전한 배열 접근 유틸리티
  safeArrayAccess(array, index) {
    if (!Array.isArray(array) || index < 0 || index >= array.length) {
      return null;
    }
    return array[index];
  }

  // 안전한 객체 속성 접근 유틸리티
  safeObjectAccess(obj, path) {
    if (!obj || typeof obj !== 'object') return null;
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return null;
      }
      current = current[key];
    }
    
    return current;
  }

  showSuccessMessage(message) {
    const platform = PlatformDetector.detectCurrentPlatform();
    const platformColor = PlatformDetector.getPlatformColor(platform);
    
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${platformColor};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 10002;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-weight: bold;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      if (document.body.contains(messageDiv)) {
        document.body.removeChild(messageDiv);
      }
    }, 3000);
  }

  // ==================== 데이터 동기화 ====================
  async reloadDataAndUpdateUI() {
    // 자체 업데이트로 인한 변경이면 UI 업데이트 스킵
    if (this.isSelfUpdate) {
      console.log('자체 업데이트로 인한 변경, UI 업데이트 스킵');
      return;
    }
    
    console.log('외부 Storage 변경 감지, 데이터 다시 로드 중...');
    
    // 데이터 다시 로드
    await this.loadData();
    
    // 현재 선택된 리스트가 삭제되었는지 확인
    if (this.currentListId && !this.lists[this.currentListId]) {
      console.log('현재 리스트가 삭제됨, 첫 번째 리스트로 이동');
      const remainingListIds = Object.keys(this.lists);
      this.currentListId = remainingListIds.length > 0 ? remainingListIds[0] : null;
    }
    
    // UI 업데이트
    this.updateListSelect();
    this.updatePlacesContainer();
    
    // 리스트 선택기 값도 동기화
    const listSelect = document.getElementById('map-list-select');
    if (listSelect) {
      listSelect.value = this.currentListId || '';
    }
    
    console.log('데이터 동기화 완료');
  }

  setupStorageChangeListener() {
    // Chrome Storage 변경 감지
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.mapScraperData) {
        console.log('mapScraperData 변경 감지됨');
        this.reloadDataAndUpdateUI();
      }
    });
  }

  // ==================== 옵저버 설정 ====================
  startObserving() {
    // URL 변경 감지를 위한 최적화된 방법
    let currentURL = window.location.href;
    
    // URL 변경 체크 함수
    const checkURLChange = () => {
      const newURL = window.location.href;
      if (currentURL !== newURL) {
        currentURL = newURL;
        this.applyPlatformColors(); // 플랫폼이 변경될 수 있으므로 색상 재적용
        this.updateCurrentPlaceData();
      }
    };

    // 주기적으로 URL 변경 체크 (더 효율적)
    setInterval(checkURLChange, 1000);
    
    // popstate 이벤트도 감지 (뒤로가기/앞으로가기)
    window.addEventListener('popstate', () => {
      setTimeout(this.updateCurrentPlaceData.bind(this), 100);
    });
    
    // 초기 상태 설정
    this.updateCurrentPlaceData();
    
    // Storage 변경 리스너 설정
    this.setupStorageChangeListener();
  }

  updateCurrentPlaceData() {
    try {
      const currentPlatform = PlatformDetector.detectCurrentPlatform();
      const extractor = ExtractorFactory.getExtractor(currentPlatform);
      
      let hasPlaceData = false;
      if (extractor && extractor.canExtract()) {
        const placeId = extractor.extractPlaceIdFromURL();
        this.currentPlaceData = placeId ? { id: placeId } : null;
        hasPlaceData = !!placeId;
      } else {
        this.currentPlaceData = null;
      }
      
      const addCurrentBtn = document.getElementById('map-add-current-btn');
      if (addCurrentBtn) {
        addCurrentBtn.disabled = !hasPlaceData;
      }
    } catch (error) {
      console.error('데이터 감지 오류:', error);
    }
  }
}

// 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MapScraper();
  });
} else {
  new MapScraper();
}