//! 입출차 알리미 핵심 로직 (안드로이드와 무관한 순수 Rust)

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    In,
    Out,
}

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Kind::In => "입차",
            Kind::Out => "출차",
        }
    }
    pub fn code(self) -> &'static str {
        match self {
            Kind::In => "IN",
            Kind::Out => "OUT",
        }
    }
    pub fn from_code(s: &str) -> Option<Kind> {
        match s {
            "IN" => Some(Kind::In),
            "OUT" => Some(Kind::Out),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    pub kind: Kind,
    pub plate: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Car {
    pub plate: String,
    pub name: String,
}

/// 차량별 마지막 상태 ("IN|1732600000000")
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct State {
    pub kind: Kind,
    pub since_ms: Option<i64>,
}

// ───────── 입력 정리 ─────────

/// "입차, 들어왔" → ["입차", "들어왔"]
pub fn split_list(s: &str) -> Vec<String> {
    s.split([',', '\n'])
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .collect()
}

/// "12가3456=아빠, 5678=엄마" → 차량 목록 (뒷 4자리만 적어도 됨)
pub fn parse_cars(cfg: &str) -> Vec<Car> {
    split_list(cfg)
        .into_iter()
        .map(|item| {
            let mut it = item.splitn(2, ['=', ':']);
            let plate: String = it.next().unwrap_or("").chars().filter(|c| !c.is_whitespace()).collect();
            let name = it.next().map(str::trim).filter(|n| !n.is_empty()).unwrap_or(&plate).to_string();
            Car { plate, name }
        })
        .filter(|c| !c.plate.is_empty())
        .collect()
}

pub fn parse_state(s: &str) -> Option<State> {
    let mut it = s.splitn(2, '|');
    let kind = Kind::from_code(it.next()?.trim())?;
    let since_ms = it.next().and_then(|t| t.trim().parse::<i64>().ok());
    Some(State { kind, since_ms })
}

// ───────── 알림 해석 ─────────

fn is_hangul(c: char) -> bool {
    ('가'..='힣').contains(&c)
}

/// 문장에서 차량번호(12가3456, 123나 4567, 서울12가3456) 추출
pub fn extract_plate(text: &str) -> Option<String> {
    let cs: Vec<char> = text.chars().collect();
    let n = cs.len();
    let mut i = 0;
    while i < n {
        if cs[i].is_ascii_digit() && (i == 0 || !cs[i - 1].is_ascii_digit()) {
            let mut j = i;
            while j < n && cs[j].is_ascii_digit() {
                j += 1;
            }
            let front = j - i;
            if (2..=3).contains(&front) {
                let mut k = j;
                if k < n && cs[k] == ' ' {
                    k += 1;
                }
                if k < n && is_hangul(cs[k]) {
                    let mid = cs[k];
                    k += 1;
                    if k < n && cs[k] == ' ' {
                        k += 1;
                    }
                    let start = k;
                    while k < n && cs[k].is_ascii_digit() {
                        k += 1;
                    }
                    if k - start == 4 {
                        let mut p: String = cs[i..j].iter().collect();
                        p.push(mid);
                        p.extend(&cs[start..k]);
                        return Some(p);
                    }
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    None
}

/// 알림 문구 → 입차/출차 이벤트 (키워드가 먼저 나온 쪽)
pub fn parse(text: &str, in_kw: &[String], out_kw: &[String]) -> Option<Event> {
    let t = text.replace("입출차", " ").replace("입·출차", " ");
    let first = |kws: &[String]| kws.iter().filter_map(|k| t.find(k.as_str())).min();
    let kind = match (first(in_kw), first(out_kw)) {
        (None, None) => return None,
        (Some(_), None) => Kind::In,
        (None, Some(_)) => Kind::Out,
        (Some(a), Some(b)) => if a <= b { Kind::In } else { Kind::Out },
    };
    Some(Event { kind, plate: extract_plate(text) })
}

/// 번호가 등록 차량 중 몇 번째인지
pub fn match_car(plate: Option<&str>, cars: &[Car]) -> Option<usize> {
    let p: String = plate?.chars().filter(|c| !c.is_whitespace()).collect();
    cars.iter().position(|c| p == c.plate || p.ends_with(&c.plate))
}

// ───────── 문구 만들기 ─────────

/// 받침 유무에 따라 이/가
pub fn josa(word: &str) -> &'static str {
    let batchim = match word.trim().chars().last() {
        Some(c) if is_hangul(c) => (c as u32 - '가' as u32) % 28 != 0,
        Some(c) if c.is_ascii_digit() => "013678".contains(c), // 영 일 삼 육 칠 팔
        _ => false,
    };
    if batchim { "이" } else { "가" }
}

/// 알림 제목: "아빠 입차" / "12가3456 출차"
pub fn title(ev: &Event, car: Option<&Car>) -> String {
    let who = car
        .map(|c| c.name.as_str())
        .or(ev.plate.as_deref())
        .unwrap_or("차량");
    format!("{} {}", who, ev.kind.label())
}

/// "현재 아빠가 집에 있습니다"
pub fn summary(cars: &[Car], states: &[Option<State>]) -> String {
    if cars.is_empty() {
        return "등록된 차량이 없습니다".into();
    }
    let home: Vec<&str> = cars
        .iter()
        .zip(states.iter().chain(std::iter::repeat(&None)))
        .filter(|(_, s)| matches!(s, Some(State { kind: Kind::In, .. })))
        .map(|(c, _)| c.name.as_str())
        .collect();
    if home.is_empty() {
        return "현재 집에 아무도 없습니다".into();
    }
    let names = home.join(", ");
    format!("현재 {}{} 집에 있습니다", names, josa(&names))
}

/// 시각 표시: 오늘이면 "16:08", 아니면 "11/25 16:08"
pub fn fmt_time(ms: i64, now_ms: i64, tz_offset_min: i32) -> String {
    let local = |m: i64| m.div_euclid(1000) + tz_offset_min as i64 * 60;
    let (t, now) = (local(ms), local(now_ms));
    let (day, now_day) = (t.div_euclid(86_400), now.div_euclid(86_400));
    let secs = t.rem_euclid(86_400);
    let hm = format!("{:02}:{:02}", secs / 3600, (secs % 3600) / 60);
    if day == now_day {
        hm
    } else {
        let (_, m, d) = civil_from_days(day);
        format!("{}/{} {}", m, d, hm)
    }
}

/// 1970-01-01 기준 일수 → (년, 월, 일)  (Howard Hinnant 알고리즘)
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d)
}

/// 알림 본문 한 줄: "아빠 : O ( 13:47~ )"
pub fn status_line(car: &Car, state: Option<&State>, now_ms: i64, tz: i32) -> String {
    match state {
        None => format!("{} : - ( 기록 없음 )", car.name),
        Some(s) => {
            let mark = if s.kind == Kind::In { "O" } else { "X" };
            match s.since_ms {
                Some(ms) => format!("{} : {} ( {}~ )", car.name, mark, fmt_time(ms, now_ms, tz)),
                None => format!("{} : {}", car.name, mark),
            }
        }
    }
}

pub fn status_lines(cars: &[Car], states: &[Option<State>], now_ms: i64, tz: i32) -> Vec<String> {
    cars.iter()
        .enumerate()
        .map(|(i, c)| status_line(c, states.get(i).and_then(|s| s.as_ref()), now_ms, tz))
        .collect()
}

/// 알림 제목: 가장 최근 출차 "16:08 아빠 출차" (기록 없으면 "출차 기록 없음")
pub fn out_title(name: &str, ms: Option<i64>, now_ms: i64, tz: i32) -> String {
    match ms {
        Some(ms) if !name.is_empty() => format!("{} {} 출차", fmt_time(ms, now_ms, tz), name),
        _ => "출차 기록 없음".into(),
    }
}

/// 음성: "아빠 입차. 현재 아빠가 집에 있습니다." (모르는 차는 번호를 한 자씩)
pub fn spoken(title: &str, known_car: bool, summary: &str) -> String {
    if known_car {
        return format!("{}. {}.", title, summary);
    }
    // "12가3456 입차" → "12가 3 4 5 6 입차"
    let mut parts = title.splitn(2, ' ');
    let who = parts.next().unwrap_or("");
    let rest = parts.next().unwrap_or("");
    let cs: Vec<char> = who.chars().collect();
    let spoken_who = if cs.len() > 4 && cs[cs.len() - 4..].iter().all(|c| c.is_ascii_digit()) {
        let head: String = cs[..cs.len() - 4].iter().collect();
        let tail: Vec<String> = cs[cs.len() - 4..].iter().map(|c| c.to_string()).collect();
        format!("{} {}", head, tail.join(" "))
    } else {
        who.to_string()
    };
    format!("{} {}.", spoken_who, rest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kw(s: &str) -> Vec<String> {
        split_list(s)
    }

    #[test]
    fn parses_events() {
        let (i, o) = (kw("입차,들어왔,진입하였"), kw("출차,나갔,출구"));
        let e = parse("[아파트] 12가3456 차량이 입차하였습니다.", &i, &o).unwrap();
        assert_eq!((e.kind, e.plate.as_deref()), (Kind::In, Some("12가3456")));
        let e = parse("입출차 알림 123나 4567 출차", &i, &o).unwrap();
        assert_eq!((e.kind, e.plate.as_deref()), (Kind::Out, Some("123나4567")));
        let e = parse("서울12가3456 정문 출차", &i, &o).unwrap();
        assert_eq!(e.plate.as_deref(), Some("12가3456"));
        assert!(parse("택배가 도착했습니다", &i, &o).is_none());
        let e = parse("[아파트아이] 차량 입차 알림 - 34러 1234 (정문)", &i, &o).unwrap();
        assert_eq!(e.plate.as_deref(), Some("34러1234"));
        assert_eq!(extract_plate("12가34** 입차"), None);
    }

    #[test]
    fn cars_and_match() {
        let cars = parse_cars("12가3456=아빠, 5678=엄마, 99하9999");
        assert_eq!(cars.len(), 3);
        assert_eq!(cars[2].name, "99하9999");
        assert_eq!(match_car(Some("12가3456"), &cars), Some(0));
        assert_eq!(match_car(Some("34나5678"), &cars), Some(1));
        assert_eq!(match_car(Some("11가1111"), &cars), None);
        assert_eq!(match_car(None, &cars), None);
    }

    #[test]
    fn josa_works() {
        assert_eq!(josa("아빠"), "가");
        assert_eq!(josa("형"), "이");
        assert_eq!(josa("아빠, 엄마"), "가");
        assert_eq!(josa("3456"), "이");
        assert_eq!(josa("1234"), "가");
    }

    #[test]
    fn lines_and_summary() {
        let cars = parse_cars("12가3456=아빠, 5678=엄마");
        // 2026-11-26 16:08 KST = 07:08 UTC
        let now = 1_795_676_880_000i64; // 2026-11-26 07:08 UTC
        let st = vec![
            Some(State { kind: Kind::Out, since_ms: Some(now) }),
            Some(State { kind: Kind::In, since_ms: Some(now - (2 * 3600 + 21 * 60) * 1000) }),
        ];
        let lines = status_lines(&cars, &st, now, 540);
        assert_eq!(lines, vec!["아빠 : X ( 16:08~ )", "엄마 : O ( 13:47~ )"]);
        assert_eq!(summary(&cars, &st), "현재 엄마가 집에 있습니다");
        // 어제 기록은 날짜 표시
        let y = fmt_time(now - 86_400_000, now, 540);
        assert_eq!(y, "11/25 16:08");
        assert_eq!(status_line(&cars[0], None, now, 540), "아빠 : - ( 기록 없음 )");
        assert_eq!(parse_state("IN|123"), Some(State { kind: Kind::In, since_ms: Some(123) }));
        assert_eq!(parse_state("OUT|11/20 08:00"), Some(State { kind: Kind::Out, since_ms: None }));
    }

    #[test]
    fn out_title_text() {
        let now = 1_795_676_880_000i64;
        assert_eq!(out_title("아빠", Some(now), now, 540), "16:08 아빠 출차");
        assert_eq!(out_title("엄마", Some(now - 86_400_000), now, 540), "11/25 16:08 엄마 출차");
        assert_eq!(out_title("", None, now, 540), "출차 기록 없음");
    }

    #[test]
    fn spoken_text() {
        assert_eq!(spoken("아빠 입차", true, "현재 아빠가 집에 있습니다"), "아빠 입차. 현재 아빠가 집에 있습니다.");
        assert_eq!(spoken("12가3456 출차", false, ""), "12가 3 4 5 6 출차.");
    }
}
