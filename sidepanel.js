// Side Panel 스크립트 - 함수형 프로그래밍 방식

// ==================== 상수 및 유틸리티 ====================
const PLATFORM_COLORS = {
  'naver': '#03c75a',
  'kakao': '#FFE300',
  'google': '#007B8B'
};

const PLATFORM_NAMES = {
  'naver': '네이버지도',
  'kakao': '카카오맵',
  'google': '구글맵'
};

// 함수형 유틸리티
const pipe = (...fns) => (value) => fns.reduce((acc, fn) => fn(acc), value);
const curry = (fn) => (...args) => args.length >= fn.length ? fn(...args) : (...nextArgs) => curry(fn)(...args, ...nextArgs);
const compose = (...fns) => (value) => fns.reduceRight((acc, fn) => fn(acc), value);

// 안전한 객체 접근
const safeGet = curry((path, obj) => {
  const keys = path.split('.');
  return keys.reduce((current, key) => current?.[key], obj);
});

// HTML 이스케이프
const escapeHtml = (text) => {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// 디바운스 함수
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// ==================== 키보드 네비게이션 유틸리티 ====================
const createModalKeyboardHandler = (modal, options = {}) => {
  const {
    onEscape = () => {},
    onEnter = () => {},
    onArrowKeys = null,
    focusSelector = null,
    confirmButtonSelector = null
  } = options;

  const handleKeyDown = (e) => {
    if (!modal || modal.style.display === 'none') return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onEscape();
        break;
      
      case 'Enter':
        if (confirmButtonSelector) {
          const confirmBtn = modal.querySelector(confirmButtonSelector);
          if (confirmBtn && !confirmBtn.disabled) {
            e.preventDefault();
            confirmBtn.click();
          }
        } else if (onEnter) {
          e.preventDefault();
          onEnter();
        }
        break;
      
      case 'ArrowUp':
      case 'ArrowDown':
        if (onArrowKeys) {
          e.preventDefault();
          onArrowKeys(e.key);
        }
        break;
    }
  };

  const setupModal = () => {
    document.addEventListener('keydown', handleKeyDown);
    
    // 자동 포커스
    if (focusSelector) {
      setTimeout(() => {
        const focusElement = modal.querySelector(focusSelector);
        if (focusElement) {
          focusElement.focus();
        }
      }, 100);
    }
  };

  const cleanupModal = () => {
    document.removeEventListener('keydown', handleKeyDown);
  };

  return { setupModal, cleanupModal };
};

// ==================== 테마 관리 (theme-config.js에서 중앙화) ====================

// ==================== 상태 관리 ====================
const createState = () => ({
  lists: {},
  currentListId: null,
  eventListeners: new Map(),
  saveTimeouts: new Map(),
  fieldsModalInitialized: false
});

let state = createState();

// 상태 업데이트 함수들
const updateLists = (newLists) => ({ ...state, lists: newLists });
const updateCurrentListId = (id) => ({ ...state, currentListId: id });

// ==================== 데이터 관리 (순수 함수) ====================
const loadStorageData = async () => {
  try {
    const result = await chrome.storage.local.get(['mapScraperData']);
    return result.mapScraperData || {};
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    return {};
  }
};

const saveStorageData = async (data) => {
  try {
    await chrome.storage.local.set({ mapScraperData: data });
    return { success: true };
  } catch (error) {
    console.error('데이터 저장 실패:', error);
    return { success: false, error: error.message };
  }
};

// ==================== 렌더링 함수들 (순수 함수) ====================
const renderListOptions = (lists, currentListId) => {
  if (!lists || Object.keys(lists).length === 0) {
    return '<option value="">목록이 없습니다</option>';
  }
  
  return Object.entries(lists)
    .map(([id, list]) => 
      `<option value="${id}" ${id === currentListId ? 'selected' : ''}>${escapeHtml(list.name)}</option>`
    )
    .join('');
};

const renderCustomField = (field, place) => {
  const value = safeGet(`customValues.${field.name}`, place) || '';
  
  if (field.type === 'select') {
    return renderSelectField(field, place, value);
  }
  return renderTextField(field, place, value);
};

const renderSelectField = (field, place, value) => `
  <div class="map-custom-field">
    <label class="map-custom-label">${escapeHtml(field.name)}</label>
    <select class="map-custom-select" data-place-id="${place.id}" data-field-name="${field.name}">
      <option value="">선택하세요</option>
      ${field.options.map(option => 
        `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`
      ).join('')}
    </select>
  </div>
`;

const renderTextField = (field, place, value) => `
  <div class="map-custom-field">
    <label class="map-custom-label">${escapeHtml(field.name)}</label>
    <input 
      type="text" 
      class="map-custom-input" 
      data-place-id="${place.id}" 
      data-field-name="${field.name}"
      value="${escapeHtml(value)}"
      placeholder="${escapeHtml(field.name)}을 입력하세요"
    />
  </div>
`;

const renderCustomFields = (place, customFields) => {
  if (!customFields?.length) return '';
  
  return `
    <div class="map-custom-fields">
      ${customFields.map(field => renderCustomField(field, place)).join('')}
    </div>
  `;
};

const renderPlaceCard = (place, customFields) => {
  const platform = place.platform || 'naver';
  const platformColor = PLATFORM_COLORS[platform] || '#666666';
  const platformName = PLATFORM_NAMES[platform] || platform;
  
  return `
    <div class="map-place-card" data-place-id="${place.id}" data-platform="${platform}" draggable="true">
      <div class="map-place-header">
        <div class="map-place-drag-handle">⋮⋮</div>
        <div class="map-place-main-info">
          <h3 class="map-place-name" data-place-id="${place.id}" data-url="${place.url}">${escapeHtml(place.name)}</h3>
          <div class="map-place-meta">
            <span class="map-place-category">${escapeHtml(place.category)}</span>
            <span class="map-place-rating ${place.rating ? 'has-rating' : 'no-rating'}">
              ${place.rating || '별점 정보 없음'}
            </span>
            <span class="map-platform-badge" style="background-color: ${platformColor}">${platformName}</span>
          </div>
        </div>
        <button class="map-delete-btn" data-place-id="${place.id}">×</button>
      </div>
      ${renderCustomFields(place, customFields)}
    </div>
  `;
};

const renderPlaces = (currentList) => {
  if (!currentList) {
    return `
      <div class="map-empty-state">
        <p>저장된 목록이 없습니다.</p>
        <p>새 목록을 추가하거나 장소를 추가해보세요!</p>
      </div>
    `;
  }
  
  if (!currentList.places?.length) {
    return `
      <div class="map-empty-state">
        <p>저장된 장소가 없습니다.</p>
        <p>지도에서 장소를 클릭하고 추가해보세요!</p>
      </div>
    `;
  }

  return currentList.places
    .map(place => renderPlaceCard(place, currentList.customFields))
    .join('');
};

const renderFieldItem = (field, index) => {
  if (!field?.name) return '';
  
  const typeText = field.type === 'select' ? '선택형' : '텍스트형';
  const optionsText = field.type === 'select' && field.options ? 
    `(${field.options.join(', ')})` : '';
  
  return `
    <div class="map-field-item" draggable="true" data-field-index="${index}">
      <div class="map-field-drag-handle">⋮⋮</div>
      <div class="map-field-info">
        <div class="map-field-name">${escapeHtml(field.name)}</div>
        <div class="map-field-details">
          <span class="map-field-type">${typeText}</span>
          ${optionsText ? `<span class="map-field-options">${escapeHtml(optionsText)}</span>` : ''}
        </div>
      </div>
      <div class="map-field-actions">
        <button class="map-edit-field-btn" data-field-index="${index}">수정</button>
        <button class="map-delete-field-btn" data-field-index="${index}">삭제</button>
      </div>
    </div>
  `;
};

// ==================== DOM 업데이트 함수들 ====================
const updateListSelect = (lists, currentListId) => {
  const select = document.getElementById('map-list-select');
  if (select) {
    select.innerHTML = renderListOptions(lists, currentListId);
  }
};

const updatePlacesContainer = (currentList) => {
  const container = document.getElementById('map-places-container');
  if (container) {
    container.innerHTML = renderPlaces(currentList);
    setupPlaceDragAndDrop();
    // setupPlaceEventListeners() 제거 - 이벤트 위임으로 처리
  }
};

const updateFieldsList = (customFields) => {
  const fieldsList = document.getElementById('map-fields-list');
  if (!fieldsList) return;
  
  if (!customFields?.length) {
    fieldsList.innerHTML = '<p class="map-no-fields">설정된 커스텀 필드가 없습니다.</p>';
    return;
  }
  
  fieldsList.innerHTML = customFields
    .filter(field => field?.name)
    .map((field, index) => renderFieldItem(field, index))
    .join('');
    
  setupFieldsDragAndDrop();
  setupFieldsEventListeners();
};

// ==================== 이벤트 핸들러들 ====================
const handleSettingsClick = () => {
  // popup.html을 새 창으로 열기
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 650,
    height: 450,
    focused: true
  });
};

const handleListChange = async (e) => {
  state.currentListId = e.target.value;
  const currentList = state.lists[state.currentListId];
  updatePlacesContainer(currentList);
};

const handleAddCurrentPlace = async () => {
  // background script에 현재 장소 데이터 요청
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'requestCurrentPlaceData' 
    });
    
    if (!response?.success) {
      console.warn('장소 추가 실패:', response?.error);
      // background.js에서 이미 알림을 표시하므로 여기서는 추가 알림 X
    }
    // 성공 시에는 background.js가 sidepanel에 addPlace 메시지를 보내므로
    // 여기서 별도 처리할 필요 없음
  } catch (error) {
    console.error('장소 추가 요청 실패:', error);
    showNotification('장소 정보를 가져오는 중 오류가 발생했습니다.', 'error');
  }
};

const handleDeletePlace = async (placeId) => {
  if (!confirm('이 장소를 삭제하시겠습니까?')) return;

  const currentList = state.lists[state.currentListId];
  if (currentList) {
    currentList.places = currentList.places.filter(p => p.id !== placeId);
    await saveData();
    updatePlacesContainer(currentList);
  }
};

const handleCustomFieldChange = debounce(async (placeId, fieldName, value) => {
  const currentList = state.lists[state.currentListId];
  if (!currentList) return;
  
  const place = currentList.places.find(p => p.id === placeId);
  if (place) {
    if (!place.customValues) place.customValues = {};
    place.customValues[fieldName] = value;
    await saveData();
  }
}, 500);

// ==================== 비즈니스 로직 함수들 ====================
const loadData = async () => {
  const data = await loadStorageData();
  state.lists = data;
  
  // 첫 번째 목록을 현재 목록으로 설정
  const listIds = Object.keys(data);
  state.currentListId = listIds.length > 0 ? listIds[0] : null;
};

const saveData = async () => {
  return await saveStorageData(state.lists);
};

const addPlace = async (placeData) => {
  let currentList = state.lists[state.currentListId];
  
  // 목록이 없으면 새 목록 생성
  if (!currentList) {
    const newListId = Date.now().toString();
    state.lists[newListId] = {
      name: '새 목록',
      customFields: [{ name: 'memo', type: 'text' }],
      places: []
    };
    state.currentListId = newListId;
    currentList = state.lists[newListId];
    updateListSelect(state.lists, state.currentListId);
  }
  
  // 중복 체크
  if (currentList.places.some(p => p.id === placeData.id)) {
    showNotification('이미 저장된 장소입니다.', 'warning');
    return;
  }

  currentList.places.push(placeData);
  await saveData();
  updatePlacesContainer(currentList);
  showNotification('장소가 저장되었습니다!', 'success');
};

const showNotification = (message, type = 'info') => {
  chrome.runtime.sendMessage({
    action: 'showNotification',
    message: message,
    type: type
  });
};

// ==================== 모달 관리 ====================
const showFieldsModal = () => {
  const modal = document.getElementById('map-fields-modal');
  if (!modal) return;
  
  const currentList = state.lists[state.currentListId];
  if (!currentList) return;
  
  // 필드 목록 렌더링
  updateFieldsList(currentList.customFields);
  modal.style.display = 'block';
  
  // 모달 이벤트 리스너 설정 (한 번만)
  if (!state.fieldsModalInitialized) {
    setupFieldsModalEventListeners();
    state.fieldsModalInitialized = true;
  }
};

const hideFieldsModal = () => {
  const modal = document.getElementById('map-fields-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

const setupFieldsModalEventListeners = () => {
  const modal = document.getElementById('map-fields-modal');
  const closeBtn = document.getElementById('map-fields-modal-close');
  const addFieldBtn = document.getElementById('map-add-field-btn');
  
  closeBtn?.addEventListener('click', hideFieldsModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) hideFieldsModal();
  });
  addFieldBtn?.addEventListener('click', addCustomField);
  
  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.style.display === 'block') {
      hideFieldsModal();
    }
  });
};

const addCustomField = async () => {
  // 먼저 필드 타입 선택
  const fieldType = await showFieldTypeModal();
  if (!fieldType) return;
  
  const fieldName = await showInputModal('새 필드 추가', '필드 이름을 입력하세요:');
  if (!fieldName?.trim()) return;
  
  const currentList = state.lists[state.currentListId];
  if (!currentList.customFields) {
    currentList.customFields = [];
  }
  
  // 중복 필드명 검사
  if (currentList.customFields.some(f => f.name === fieldName.trim())) {
    alert('이미 존재하는 필드 이름입니다.');
    return;
  }
  
  const fieldData = {
    name: fieldName.trim(),
    type: fieldType
  };
  
  // 선택형 필드인 경우 옵션 설정
  if (fieldType === 'select') {
    const options = await showInputModal('선택 옵션 설정', '옵션을 쉼표(,)로 구분하여 입력하세요:');
    if (!options?.trim()) return;
    fieldData.options = options.split(',').map(opt => opt.trim()).filter(opt => opt);
  }
  
  currentList.customFields.push(fieldData);
  await saveData();
  updateFieldsList(currentList.customFields);
  updatePlacesContainer(currentList);
};

const showInputModal = async (title, message, defaultValue = '') => {
  return new Promise((resolve) => {
    const modal = document.getElementById('map-input-modal');
    const titleEl = document.getElementById('map-input-modal-title');
    const messageEl = document.getElementById('map-input-modal-message');
    const inputEl = document.getElementById('map-input-modal-input');
    const confirmBtn = document.getElementById('map-input-modal-confirm');
    const cancelBtn = document.getElementById('map-input-modal-cancel');
    const closeBtn = document.getElementById('map-input-modal-close');

    titleEl.textContent = title;
    messageEl.textContent = message;
    inputEl.value = defaultValue;
    modal.style.display = 'block';

    const onConfirm = () => {
      const value = inputEl.value.trim();
      cleanup();
      resolve(value || null);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    // 키보드 네비게이션 설정
    const keyboardHandler = createModalKeyboardHandler(modal, {
      onEscape: onCancel,
      onEnter: onConfirm,
      focusSelector: '#map-input-modal-input',
      confirmButtonSelector: '#map-input-modal-confirm'
    });

    const cleanup = () => {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      keyboardHandler.cleanupModal();
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    keyboardHandler.setupModal();
  });
};

const showFieldTypeModal = async () => {
  return new Promise((resolve) => {
    const modal = document.getElementById('map-field-type-modal');
    const closeBtn = document.getElementById('map-field-type-modal-close');
    const cancelBtn = document.getElementById('map-field-type-cancel');
    const typeOptions = modal.querySelectorAll('.map-field-type-option');

    modal.style.display = 'block';
    
    let selectedIndex = 0; // 방향키 네비게이션용

    const updateSelection = () => {
      typeOptions.forEach((option, index) => {
        option.classList.toggle('keyboard-selected', index === selectedIndex);
      });
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onTypeSelect = (e) => {
      const option = e.currentTarget;
      const type = option.getAttribute('data-type');
      cleanup();
      resolve(type);
    };

    const selectCurrentOption = () => {
      const selectedOption = typeOptions[selectedIndex];
      if (selectedOption) {
        const type = selectedOption.getAttribute('data-type');
        cleanup();
        resolve(type);
      }
    };

    // 키보드 네비게이션 설정
    const keyboardHandler = createModalKeyboardHandler(modal, {
      onEscape: onCancel,
      onEnter: selectCurrentOption,
      onArrowKeys: (key) => {
        if (key === 'ArrowDown') {
          selectedIndex = (selectedIndex + 1) % typeOptions.length;
        } else if (key === 'ArrowUp') {
          selectedIndex = selectedIndex === 0 ? typeOptions.length - 1 : selectedIndex - 1;
        }
        updateSelection();
      }
    });

    const cleanup = () => {
      modal.style.display = 'none';
      closeBtn.removeEventListener('click', onCancel);
      cancelBtn.removeEventListener('click', onCancel);
      typeOptions.forEach(option => {
        option.removeEventListener('click', onTypeSelect);
        option.classList.remove('keyboard-selected');
      });
      keyboardHandler.cleanupModal();
    };

    closeBtn.addEventListener('click', onCancel);
    cancelBtn.addEventListener('click', onCancel);
    typeOptions.forEach(option => {
      option.addEventListener('click', onTypeSelect);
    });
    
    // 초기 선택 상태 설정
    updateSelection();
    keyboardHandler.setupModal();
  });
};

const setupPlaceDragAndDrop = () => {
  const placeCards = document.querySelectorAll('.map-place-card');
  let draggedElement = null;

  placeCards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedElement = card;
      card.style.opacity = '0.5';
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      if (draggedElement) {
        draggedElement.style.opacity = '';
        draggedElement.classList.remove('dragging');
        draggedElement = null;
      }
      // 모든 드롭 인디케이터 제거
      document.querySelectorAll('.map-place-card').forEach(c => {
        c.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedElement || draggedElement === card) return;
      
      e.dataTransfer.dropEffect = 'move';
      
      // 드롭 위치 시각적 표시
      const rect = card.getBoundingClientRect();
      const mouseY = e.clientY;
      const cardMiddle = rect.top + rect.height / 2;
      
      // 모든 카드에서 drag-over 클래스 제거
      document.querySelectorAll('.map-place-card').forEach(c => {
        c.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      
      // 마우스 위치에 따라 위/아래 표시
      if (mouseY < cardMiddle) {
        card.classList.add('drag-over-top');
      } else {
        card.classList.add('drag-over-bottom');
      }
    });

    card.addEventListener('dragleave', (e) => {
      // 카드 영역을 완전히 벗어났을 때만 제거
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!draggedElement || draggedElement === card) return;

      const currentList = state.lists[state.currentListId];
      if (!currentList?.places) return;

      const draggedId = draggedElement.getAttribute('data-place-id');
      const targetId = card.getAttribute('data-place-id');

      const draggedIndex = currentList.places.findIndex(p => p.id === draggedId);
      const targetIndex = currentList.places.findIndex(p => p.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        // 드롭 위치 계산 (위/아래)
        const rect = card.getBoundingClientRect();
        const mouseY = e.clientY;
        const cardMiddle = rect.top + rect.height / 2;
        const insertIndex = mouseY < cardMiddle ? targetIndex : targetIndex + 1;

        // 배열에서 순서 변경
        const [draggedPlace] = currentList.places.splice(draggedIndex, 1);
        const adjustedIndex = draggedIndex < insertIndex ? insertIndex - 1 : insertIndex;
        currentList.places.splice(adjustedIndex, 0, draggedPlace);

        await saveData();
        updatePlacesContainer(currentList);
      }
    });
  });
};

// setupPlaceEventListeners 함수 제거 - 이벤트 위임으로 대체됨

const setupFieldsDragAndDrop = () => {
  const fieldItems = document.querySelectorAll('.map-field-item');
  let draggedElement = null;

  fieldItems.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedElement = item;
      item.style.opacity = '0.5';
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      if (draggedElement) {
        draggedElement.style.opacity = '';
        draggedElement.classList.remove('dragging');
        draggedElement = null;
      }
      // 모든 드롭 인디케이터 제거
      document.querySelectorAll('.map-field-item').forEach(i => {
        i.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedElement || draggedElement === item) return;
      
      e.dataTransfer.dropEffect = 'move';
      
      // 드롭 위치 시각적 표시
      const rect = item.getBoundingClientRect();
      const mouseY = e.clientY;
      const itemMiddle = rect.top + rect.height / 2;
      
      // 모든 아이템에서 drag-over 클래스 제거
      document.querySelectorAll('.map-field-item').forEach(i => {
        i.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      
      // 마우스 위치에 따라 위/아래 표시
      if (mouseY < itemMiddle) {
        item.classList.add('drag-over-top');
      } else {
        item.classList.add('drag-over-bottom');
      }
    });

    item.addEventListener('dragleave', (e) => {
      // 아이템 영역을 완전히 벗어났을 때만 제거
      if (!item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!draggedElement || draggedElement === item) return;

      const currentList = state.lists[state.currentListId];
      if (!currentList?.customFields) return;

      const draggedIndex = parseInt(draggedElement.getAttribute('data-field-index'));
      const targetIndex = parseInt(item.getAttribute('data-field-index'));

      if (!isNaN(draggedIndex) && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
        // 드롭 위치 계산 (위/아래)
        const rect = item.getBoundingClientRect();
        const mouseY = e.clientY;
        const itemMiddle = rect.top + rect.height / 2;
        const insertIndex = mouseY < itemMiddle ? targetIndex : targetIndex + 1;

        // 배열에서 순서 변경
        const [draggedField] = currentList.customFields.splice(draggedIndex, 1);
        const adjustedIndex = draggedIndex < insertIndex ? insertIndex - 1 : insertIndex;
        currentList.customFields.splice(adjustedIndex, 0, draggedField);

        await saveData();
        updateFieldsList(currentList.customFields);
        updatePlacesContainer(currentList);
      }
    });
  });
};

const setupFieldsEventListeners = () => {
  // 필드 수정 버튼 이벤트
  document.querySelectorAll('.map-edit-field-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-field-index'));
      const currentList = state.lists[state.currentListId];
      if (!currentList?.customFields?.[index]) return;

      const field = currentList.customFields[index];
      const newName = await showInputModal('필드 이름 변경', '새 필드 이름을 입력하세요:', field.name);
      if (!newName?.trim()) return;

      field.name = newName.trim();
      await saveData();
      updateFieldsList(currentList.customFields);
      updatePlacesContainer(currentList);
    });
  });

  // 필드 삭제 버튼 이벤트
  document.querySelectorAll('.map-delete-field-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.getAttribute('data-field-index'));
      const currentList = state.lists[state.currentListId];
      if (!currentList?.customFields?.[index]) return;

      const field = currentList.customFields[index];
      if (!confirm(`'${field.name}' 필드를 삭제하시겠습니까?`)) return;

      currentList.customFields.splice(index, 1);
      await saveData();
      updateFieldsList(currentList.customFields);
      updatePlacesContainer(currentList);
    });
  });
};

// ==================== 이벤트 리스너 설정 ====================
const setupEventListeners = () => {
  // 설정 버튼
  document.getElementById('map-settings-btn')?.addEventListener('click', handleSettingsClick);
  
  // 목록 선택
  document.getElementById('map-list-select')?.addEventListener('change', handleListChange);
  
  // 현재 장소 추가
  document.getElementById('map-add-current-btn')?.addEventListener('click', handleAddCurrentPlace);
  
  // 목록 관리 버튼들
  document.getElementById('map-add-list-btn')?.addEventListener('click', async () => {
    const name = await showInputModal('새 목록 추가', '새 목록 이름을 입력하세요:');
    if (name) {
      const id = Date.now().toString();
      state.lists[id] = {
        name: name,
        customFields: [{ name: 'memo', type: 'text' }],
        places: []
      };
      await saveData();
      state.currentListId = id;
      updateListSelect(state.lists, state.currentListId);
      updatePlacesContainer(state.lists[id]);
    }
  });
  
  // 목록 수정
  document.getElementById('map-edit-list-btn')?.addEventListener('click', async () => {
    if (!state.currentListId) {
      alert('편집할 목록이 없습니다.');
      return;
    }
    
    const currentList = state.lists[state.currentListId];
    if (!currentList) {
      alert('목록을 찾을 수 없습니다.');
      return;
    }
    
    const newName = await showInputModal('목록 이름 변경', '새로운 목록 이름을 입력하세요:', currentList.name);
    if (!newName?.trim()) return;
    
    const trimmedName = newName.trim();
    
    // 중복 이름 검사
    const isDuplicate = Object.entries(state.lists).some(([id, list]) => 
      id !== state.currentListId && list.name === trimmedName
    );
    
    if (isDuplicate) {
      alert('이미 존재하는 목록 이름입니다.');
      return;
    }
    
    currentList.name = trimmedName;
    await saveData();
    updateListSelect(state.lists, state.currentListId);
  });
  
  // 목록 삭제
  document.getElementById('map-delete-list-btn')?.addEventListener('click', async () => {
    if (!state.currentListId) {
      alert('삭제할 목록이 없습니다.');
      return;
    }
    
    if (!confirm('정말로 이 목록을 삭제하시겠습니까?')) return;

    delete state.lists[state.currentListId];
    
    // 남은 목록이 있으면 첫 번째 목록으로 이동, 없으면 null
    const remainingListIds = Object.keys(state.lists);
    state.currentListId = remainingListIds.length > 0 ? remainingListIds[0] : null;
    
    await saveData();
    updateListSelect(state.lists, state.currentListId);
    updatePlacesContainer(state.lists[state.currentListId]);
  });
  
  // 필드 관리
  document.getElementById('map-manage-fields-btn')?.addEventListener('click', () => {
    if (!state.currentListId) {
      alert('필드를 관리할 목록이 없습니다.');
      return;
    }
    showFieldsModal();
  });
  
  // 장소 컨테이너 이벤트 위임
  document.getElementById('map-places-container')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('map-delete-btn')) {
      const placeId = e.target.dataset.placeId;
      handleDeletePlace(placeId);
    } else if (e.target.classList.contains('map-place-name')) {
      const url = e.target.dataset.url;
      if (url) {
        chrome.tabs.create({ url });
      }
    }
  });
  
  // 커스텀 필드 변경 이벤트 위임 (input과 change 모두 처리)
  document.getElementById('map-places-container')?.addEventListener('input', (e) => {
    if (e.target.classList.contains('map-custom-input') || 
        e.target.classList.contains('map-custom-select')) {
      const placeId = e.target.dataset.placeId;
      const fieldName = e.target.dataset.fieldName;
      handleCustomFieldChange(placeId, fieldName, e.target.value);
    }
  });
  
  document.getElementById('map-places-container')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('map-custom-select')) {
      const placeId = e.target.dataset.placeId;
      const fieldName = e.target.dataset.fieldName;
      handleCustomFieldChange(placeId, fieldName, e.target.value);
    }
  });
};

// ==================== 초기화 ====================
const init = async () => {
  // 테마 초기화
  themeManager.init();
  
  await loadData();
  
  // UI 업데이트
  updateListSelect(state.lists, state.currentListId);
  updatePlacesContainer(state.lists[state.currentListId]);
  
  // 이벤트 리스너 설정
  setupEventListeners();
  
  console.log('Side Panel 초기화 완료');
};

// 메시지 리스너 (테마 업데이트)
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'updateTheme') {
    // 커스텀 테마인 경우 CSS를 먼저 재로드
    if (themeManager.isCustomTheme(message.theme)) {
      themeManager.loadCustomThemeStyles();
    }
    themeManager.setTheme(message.theme);
  } else if (message.action === 'addPlace') {
    // 컨텍스트 메뉴나 다른 곳에서 장소 추가 요청
    await addPlace(message.placeData);
  }
});

// Storage 변경 감지 리스너 (데이터 가져오기 후 자동 새로고침)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.mapScraperData) {
    console.log('Storage data changed, refreshing sidepanel...');
    
    // 현재 선택된 목록 ID 저장
    const previousListId = state.currentListId;
    
    // 데이터 다시 로드
    await loadData();
    
    // 이전에 선택된 목록이 여전히 존재하면 유지, 아니면 첫 번째 목록 선택
    if (previousListId && state.lists[previousListId]) {
      state.currentListId = previousListId;
    } else {
      const listIds = Object.keys(state.lists);
      state.currentListId = listIds.length > 0 ? listIds[0] : null;
    }
    
    // UI 업데이트
    updateListSelect(state.lists, state.currentListId);
    updatePlacesContainer(state.lists[state.currentListId]);
  }
});

// DOM 로드 완료 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}