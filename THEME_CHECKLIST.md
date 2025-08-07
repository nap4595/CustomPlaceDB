# 테마 추가 체크리스트

새로운 테마를 추가할 때 반드시 확인해야 할 항목들입니다.

## 1. 색상 정의 (4개 색상 필수)
- [ ] **주요 배경색** (main-bg): 버튼, 헤더 등의 주 색상
- [ ] **보조 배경색** (sub-bg): 카드, 입력창 등의 배경
- [ ] **강조색** (accent): 호버, 포커스 등의 강조 표현
- [ ] **테두리색** (border): 테두리, 구분선 등

## 2. CSS 파일 수정
### sidepanel.css
- [ ] `:root` 섹션에 새 테마 색상 정의 추가
  ```css
  /* 테마X 색상 - 설명 */
  --themeX-main-bg: #XXXXXX;
  --themeX-main-bg-rgb: R, G, B;
  --themeX-sub-bg: #XXXXXX;
  --themeX-accent: #XXXXXX;
  --themeX-border: #XXXXXX;
  ```
- [ ] `[data-theme="themeX"]` 선택자 추가
  ```css
  [data-theme="themeX"] {
    --primary-color: var(--themeX-main-bg);
    --primary-color-rgb: var(--themeX-main-bg-rgb);
    --secondary-color: var(--themeX-sub-bg);
    --accent-color: var(--themeX-accent);
    --background-color: var(--themeX-border);
    --text-color: #적절한색상;
  }
  ```

### popup.html
- [ ] `:root` 섹션에 새 테마 색상 정의 추가 (sidepanel.css와 동일)
- [ ] `[data-theme="themeX"]` 선택자 추가 (sidepanel.css와 동일)

## 3. JavaScript 파일 수정
### popup.js
- [ ] `THEME_COLORS` 객체에 새 테마 추가
  ```javascript
  themeX: { main: '#XXXXXX', sub: '#XXXXXX', accent: '#XXXXXX', border: '#XXXXXX' }
  ```

### sidepanel.js
- [ ] `THEME_COLORS` 객체에 새 테마 추가 (popup.js와 동일)

## 4. UI 업데이트
### popup.html
- [ ] `theme-select` 드롭다운에 새 옵션 추가
  ```html
  <option value="themeX">테마 X - 설명</option>
  ```

## 5. RGB 값 계산
- [ ] 16진수 색상을 RGB 값으로 변환
  - 예: `#1A2A80` → `26, 42, 128`
  - [색상 변환 도구](https://www.rapidtables.com/convert/color/hex-to-rgb.html) 활용

## 6. 텍스트 색상 설정
- [ ] 주요 배경색에 맞는 가독성 좋은 텍스트 색상 선택
  - 밝은 배경: 어두운 텍스트 (#2c2c2c, #333 등)
  - 어두운 배경: 밝은 텍스트 (white, #f0f0f0 등)

## 7. 하드코딩 색상 확인
- [ ] CSS에서 하드코딩된 색상이 없는지 확인
- [ ] `rgba()` 함수에서 CSS 변수 올바르게 사용
  - ❌ `rgba(var(--primary-color), 0.2)`
  - ✅ `rgba(var(--primary-color-rgb), 0.2)`

## 8. 테스트
- [ ] 설정창에서 새 테마 선택 가능
- [ ] 사이드패널에서 테마가 올바르게 적용
- [ ] 색상 미리보기가 올바르게 표시
- [ ] 브라우저 콘솔에서 검증 메시지 확인
- [ ] localStorage에 테마 설정이 저장됨

## 9. 검증
- [ ] 브라우저 개발자 도구에서 CSS 변수 값 확인
- [ ] 모든 UI 요소가 새 테마 색상으로 변경됨
- [ ] hover, focus 상태의 색상 변경 확인
- [ ] 테마 전환 시 애니메이션 정상 작동

## 10. 문서 업데이트
- [ ] 이 체크리스트에 새 테마 정보 반영
- [ ] README 등 관련 문서에 새 테마 소개

---

## 주의사항
1. **일관성 유지**: 모든 파일에서 동일한 색상 값 사용
2. **접근성 고려**: 충분한 대비율 확보 (WCAG 2.1 AA 기준)
3. **브랜딩**: 테마명과 색상이 앱의 정체성에 부합
4. **성능**: CSS 변수를 활용하여 런타임 성능 최적화

## 테마 명명 규칙
- `themeX` (X는 숫자)
- 설명적 이름 (예: "올리브 그린", "딥 네이비")
- 색상의 주요 특징을 반영