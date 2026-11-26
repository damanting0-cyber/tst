package com.caralert

import java.util.TimeZone

/**
 * Rust 코어(libcaralert_core.so) 호출부.
 * 알림 해석·차량 매칭·상태 문구·음성 문구는 모두 CarAlert/core (Rust) 에서 처리합니다.
 */
object Core {
    init { System.loadLibrary("caralert_core") }

    @JvmStatic external fun process(text: String, inKw: String, outKw: String, cars: String): String
    @JvmStatic external fun statusText(cars: String, states: String, now: Long, tz: Int): String
    @JvmStatic external fun summary(cars: String, states: String): String
    @JvmStatic external fun spoken(title: String, known: Boolean, summary: String): String
    @JvmStatic external fun cars(cfg: String): String
    @JvmStatic external fun fmtTime(ms: Long, now: Long, tz: Int): String
    @JvmStatic external fun outTitle(name: String, ms: Long, now: Long, tz: Int): String

    /** 현재 시간대 오프셋(분), 한국 = 540 */
    fun tz(): Int = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000

    data class Car(val plate: String, val name: String)

    /** Rust 가 해석한 알림: type = "IN" / "OUT", index = 등록 차량 번호 (-1 = 미등록) */
    data class Hit(val type: String, val plate: String, val index: Int, val title: String) {
        val isIn get() = type == "IN"
    }

    fun carList(cfg: String): List<Car> =
        cars(cfg).split('\n').filter { it.isNotEmpty() }.map {
            val (p, n) = it.split('\t', limit = 2)
            Car(p, n)
        }

    fun parse(text: String, inKw: String, outKw: String, cars: String): Hit? {
        val r = process(text, inKw, outKw, cars)
        if (r.isEmpty()) return null
        val f = r.split('\t', limit = 4)
        return Hit(f[0], f[1], f[2].toInt(), f[3])
    }
}
