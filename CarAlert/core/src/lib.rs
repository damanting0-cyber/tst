//! 입출차 알리미 Rust 코어 + 안드로이드(JNI) 연결부
//! Kotlin 쪽 `com.caralert.Core` 의 external 함수들과 1:1 대응합니다.

pub mod logic;

use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jint, jlong, jstring};
use jni::JNIEnv;
use logic::*;

fn get(env: &mut JNIEnv, s: &JString) -> String {
    env.get_string(s).map(|s| s.into()).unwrap_or_default()
}

fn ret(env: &mut JNIEnv, s: String) -> jstring {
    env.new_string(s).map(|j| j.into_raw()).unwrap_or(std::ptr::null_mut())
}

/// 등록 차량 순서대로 한 줄씩 들어온 상태 문자열 → 상태 목록
fn states_of(s: &str, n: usize) -> Vec<Option<State>> {
    let mut v: Vec<Option<State>> = s.split('\n').map(parse_state).collect();
    v.resize(n, None);
    v
}

// ── 순수 함수 버전 (테스트하기 쉽게 문자열 → 문자열) ──

pub fn process_str(text: &str, in_kw: &str, out_kw: &str, cars_cfg: &str) -> String {
    let cars = parse_cars(cars_cfg);
    let Some(ev) = parse(text, &split_list(in_kw), &split_list(out_kw)) else {
        return String::new();
    };
    let idx = match_car(ev.plate.as_deref(), &cars);
    let t = title(&ev, idx.map(|i| &cars[i]));
    format!(
        "{}\t{}\t{}\t{}",
        ev.kind.code(),
        ev.plate.unwrap_or_default(),
        idx.map(|i| i as i64).unwrap_or(-1),
        t
    )
}

pub fn status_str(cars_cfg: &str, states: &str, now: i64, tz: i32) -> String {
    let cars = parse_cars(cars_cfg);
    status_lines(&cars, &states_of(states, cars.len()), now, tz).join("\n")
}

pub fn summary_str(cars_cfg: &str, states: &str) -> String {
    let cars = parse_cars(cars_cfg);
    summary(&cars, &states_of(states, cars.len()))
}

pub fn cars_str(cars_cfg: &str) -> String {
    parse_cars(cars_cfg)
        .iter()
        .map(|c| format!("{}\t{}", c.plate, c.name))
        .collect::<Vec<_>>()
        .join("\n")
}

// ── JNI ──

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_process<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>,
    text: JString<'l>, in_kw: JString<'l>, out_kw: JString<'l>, cars: JString<'l>,
) -> jstring {
    let (t, i, o, c) = (get(&mut env, &text), get(&mut env, &in_kw), get(&mut env, &out_kw), get(&mut env, &cars));
    ret(&mut env, process_str(&t, &i, &o, &c))
}

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_statusText<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>,
    cars: JString<'l>, states: JString<'l>, now: jlong, tz: jint,
) -> jstring {
    let (c, s) = (get(&mut env, &cars), get(&mut env, &states));
    ret(&mut env, status_str(&c, &s, now, tz))
}

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_summary<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>, cars: JString<'l>, states: JString<'l>,
) -> jstring {
    let (c, s) = (get(&mut env, &cars), get(&mut env, &states));
    ret(&mut env, summary_str(&c, &s))
}

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_spoken<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>, title: JString<'l>, known: jboolean, summary: JString<'l>,
) -> jstring {
    let (t, s) = (get(&mut env, &title), get(&mut env, &summary));
    ret(&mut env, spoken(&t, known != 0, &s))
}

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_cars<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>, cars: JString<'l>,
) -> jstring {
    let c = get(&mut env, &cars);
    ret(&mut env, cars_str(&c))
}

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_fmtTime<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>, ms: jlong, now: jlong, tz: jint,
) -> jstring {
    ret(&mut env, fmt_time(ms, now, tz))
}

#[no_mangle]
pub extern "system" fn Java_com_caralert_Core_outTitle<'l>(
    mut env: JNIEnv<'l>, _c: JClass<'l>, name: JString<'l>, ms: jlong, now: jlong, tz: jint,
) -> jstring {
    let n = get(&mut env, &name);
    let ms = if ms > 0 { Some(ms) } else { None };
    ret(&mut env, out_title(&n, ms, now, tz))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_api() {
        let cars = "12가3456=아빠, 5678=엄마";
        assert_eq!(
            process_str("12가3456 차량이 입차하였습니다", "입차", "출차", cars),
            "IN\t12가3456\t0\t아빠 입차"
        );
        assert_eq!(process_str("11나1111 출차", "입차", "출차", cars), "OUT\t11나1111\t-1\t11나1111 출차");
        assert_eq!(process_str("광고입니다", "입차", "출차", cars), "");
        assert_eq!(summary_str(cars, "IN|0\nIN|0"), "현재 아빠, 엄마가 집에 있습니다");
        assert_eq!(summary_str(cars, ""), "현재 집에 아무도 없습니다");
        assert_eq!(cars_str(cars), "12가3456\t아빠\n5678\t엄마");
    }
}
