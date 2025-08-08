// 지도 장소 스크랩 Background Script

// ==================== 초기화 ====================
chrome.runtime.onInstalled.addListener(() => {
  console.log('지도 장소 스크랩 익스텐션이 설치되었습니다.');
  
  // Side Panel 설정
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
  
  // 컨텍스트 메뉴 생성
  createContextMenus();
});

// ==================== Side Panel 관리 ====================
// Side Panel은 setPanelBehavior({ openPanelOnActionClick: true })로 자동 처리됨

// 키보드 단축키 처리
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-side-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.error('Side Panel 토글 실패:', error);
    }
  } else if (command === 'add-current-place') {
    // 현재 탭이 지도 사이트인지 확인
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isMapSite = tab.url && (
      tab.url.includes('map.naver.com') || 
      tab.url.includes('map.kakao.com') || 
      tab.url.includes('place.map.kakao.com')
    );
    
    if (!isMapSite) {
      showNotification('지도 사이트에서만 장소를 추가할 수 있습니다.', 'warning');
      return;
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'getCurrentPlaceData' 
      });
      
      if (response?.success && response.placeData) {
        // Side Panel에 장소 추가 요청
        chrome.runtime.sendMessage({
          action: 'addPlaceFromShortcut',
          placeData: response.placeData
        });
        showNotification('장소가 저장되었습니다!', 'success');
      } else {
        showNotification('현재 선택된 장소 정보를 찾을 수 없습니다.', 'error');
      }
    } catch (error) {
      console.error('단축키 장소 추가 실패:', error);
      showNotification('장소 추가 중 오류가 발생했습니다.', 'error');
    }
  }
});


// ==================== 컨텍스트 메뉴 관리 ====================
function createContextMenus() {
  chrome.contextMenus.create({
    id: 'save-current-place',
    title: '현재 장소 저장하기',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://map.naver.com/*',
      'https://map.kakao.com/*',
      'https://place.map.kakao.com/*'
    ]
  });
  
  chrome.contextMenus.create({
    id: 'open-settings',
    title: '설정 열기',
    contexts: ['action']
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-current-place') {
    // content script에 장소 저장 요청
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'getCurrentPlaceData' 
      });
      
      if (response?.success && response.placeData) {
        // Side Panel에 장소 추가 알림
        chrome.runtime.sendMessage({
          action: 'addPlace',
          placeData: response.placeData
        });
        
        // 성공 알림
        showNotification('장소가 저장되었습니다!', 'success');
      } else {
        showNotification('현재 선택된 장소 정보를 찾을 수 없습니다.', 'error');
      }
    } catch (error) {
      console.error('컨텍스트 메뉴 장소 저장 실패:', error);
      showNotification('장소 저장 중 오류가 발생했습니다.', 'error');
    }
  } else if (info.menuItemId === 'open-settings') {
    // 설정 창 열기
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 350,
      height: 600,
      focused: true
    });
  }
});

// ==================== 알림 관리 ====================
function showNotification(message, type = 'info') {
  const iconPath = type === 'error' ? 'icons/icon48.png' : 'icons/icon48.png';
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: 'CustomPlaceDB',
    message: message,
    silent: type === 'success' // 성공 시에는 소리 없음
  });
  
  // 3초 후 자동 제거
  setTimeout(() => {
    chrome.notifications.getAll((notifications) => {
      Object.keys(notifications).forEach(id => {
        chrome.notifications.clear(id);
      });
    });
  }, 3000);
}

// ==================== 메시지 처리 ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get-storage') {
    chrome.storage.local.get(request.key, (result) => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === 'set-storage') {
    chrome.storage.local.set(request.data, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'fetchPlaceInfo') {
    console.log('Background script에서 API 호출:', request.url);
    
    fetch(request.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      console.log('Background script API 응답 성공');
      sendResponse({ success: true, data: html });
    })
    .catch(error => {
      console.error('Background script API 오류:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // 비동기 응답을 위해 true 반환
  }
  
  if (request.action === 'showNotification') {
    showNotification(request.message, request.type || 'info');
    sendResponse({ success: true });
    return true;
  }
});

// ==================== 탭 관리 ====================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isMapSite = tab.url.includes('map.naver.com') || 
                     tab.url.includes('map.kakao.com');
    
    if (isMapSite) {
      console.log('지도 페이지가 로드되었습니다:', tab.url);
      // Side Panel은 manifest.json의 side_panel.default_path 설정으로 모든 탭에서 사용 가능
    }
  }
});