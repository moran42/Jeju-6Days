# 제주 여행 코스 (5박 6일)

해쭈 유튜브 · 네이버/카카오맵 저장 장소 기반 제주 일정 플래너입니다.

## GitHub Pages 배포

1. 이 repo를 GitHub에 push
2. **Settings → Pages → Source**: `main` 브랜치 / `/ (root)`
3. `https://<username>.github.io/<repo>/` 링크 공유

## 저장 / 동기화 방식 (3단계)

| 방식 | 설정 | 메이트 공유 |
|------|------|-------------|
| **① 이 기기 저장** | 없음 | 같은 폰/PC에서만 유지 |
| **② JSON 공유** | 없음 | **공유** → 카톡 → **가져오기** |
| **③ Supabase 자동** | 1회 (아래) | 링크만 공유, 2초마다 자동 반영 |

> Firebase는 제거했습니다. 설정 없이도 **② JSON 공유**만으로 메이트와 일정을 맞출 수 있어요.

### JSON 공유 (가장 간단)

1. 편집 후 **공유** 클릭 → 클립보드 복사
2. 카톡으로 메이트에게 전송
3. 메이트가 **가져오기** → 붙여넣기

### Supabase 자동 동기화 (선택, 5분 설정)

[target-checklist](https://jung-shin-young.github.io/target-checklist)와 같은 방식입니다.

1. [Supabase](https://supabase.com/) 무료 프로젝트 생성
2. SQL Editor에서 실행:

```sql
create table if not exists trip_data (
  trip_id text primary key,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table trip_data enable row level security;

create policy "trip read" on trip_data for select using (true);
create policy "trip insert" on trip_data for insert with check (true);
create policy "trip update" on trip_data for update using (true);
```

3. **Settings → API** 에서 Project URL, `anon` key 복사
4. `supabase-config.js` 수정 후 push:

```js
const SUPABASE_CONFIG = {
  url: "https://xxxx.supabase.co",
  anonKey: "eyJ...",
  tripId: "jeju-2026",
};
```

헤더에 **🟢 자동 동기화 중**이 보이면 메이트와 자동 공유됩니다.

## 사용 방법

| 기능 | 설명 |
|------|------|
| **타임라인** | 일정 보기 |
| **코스 편집** | 시간·장소 블록 수정 |
| **공유 / 가져오기** | JSON으로 메이트와 일정 주고받기 |
| **↻ 링크에서 업데이트** | 카카오·네이버 저장 폴더에서 미배정 장소 가져오기 |
| **지도** | 날짜별 동선 + 카테고리 필터 |

## 주의

- Git push는 **코드 배포**용입니다. 일정 편집은 Git과 무관해요.
- Supabase 없이도 이 기기 저장 + JSON 공유로 충분히 협업할 수 있습니다.
