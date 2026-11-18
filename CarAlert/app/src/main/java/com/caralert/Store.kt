package com.caralert

import android.content.Context
import android.content.SharedPreferences

/** 설정과 기록 저장 (휴대폰 안에만 저장, 외부 전송 없음) */
class Store(ctx: Context) {
    val prefs: SharedPreferences = ctx.getSharedPreferences("caralert", Context.MODE_PRIVATE)

    var inKeywords: String
        get() = prefs.getString("in_kw", "입차,들어왔,진입하였")!!
        set(v) = prefs.edit().putString("in_kw", v).apply()

    var outKeywords: String
        get() = prefs.getString("out_kw", "출차,나갔,출구")!!
        set(v) = prefs.edit().putString("out_kw", v).apply()

    /** 감시할 앱 (앱 이름 또는 패키지명 일부, 쉼표 구분). 비우면 모든 앱 */
    var appFilter: String
        get() = prefs.getString("app_filter", "")!!
        set(v) = prefs.edit().putString("app_filter", v).apply()

    /** 우리 집 차량 "번호=이름" (쉼표 구분, 뒷 4자리만도 가능). 비우면 모든 차량 알림 */
    var myPlates: String
        get() = prefs.getString("my_plates", "")!!
        set(v) = prefs.edit().putString("my_plates", v).apply()

    fun cars() = CarParser.parseCars(myPlates)

    // 차량별 현재 상태: 마지막이 입차면 집, 출차면 외출
    fun setState(car: CarParser.Car, type: CarParser.Type, time: String) =
        prefs.edit().putString("state_${car.key}", "${type.name}|$time").apply()

    /** (타입, 시각) 또는 기록 없음이면 null */
    fun getState(car: CarParser.Car): Pair<CarParser.Type, String>? {
        val v = prefs.getString("state_${car.key}", null) ?: return null
        val (t, time) = v.split('|', limit = 2)
        return CarParser.Type.valueOf(t) to time
    }

    fun isHome(car: CarParser.Car) = getState(car)?.first == CarParser.Type.IN

    /** "집: 아빠 · 외출: 엄마" 형태 요약 */
    fun summary(): String {
        val cars = cars()
        if (cars.isEmpty()) return "등록된 차량이 없습니다"
        val home = cars.filter { isHome(it) }.map { it.name }
        val out = cars.filter { getState(it)?.first == CarParser.Type.OUT }.map { it.name }
        val unknown = cars.filter { getState(it) == null }.map { it.name }
        return buildList {
            add("🏠 집: " + home.joinToString(", ").ifEmpty { "아무도 없음" })
            if (out.isNotEmpty()) add("🚗 외출: " + out.joinToString(", "))
            if (unknown.isNotEmpty()) add("❔ 기록 없음: " + unknown.joinToString(", "))
        }.joinToString("  ·  ")
    }

    var ttsOn: Boolean
        get() = prefs.getBoolean("tts", true)
        set(v) = prefs.edit().putBoolean("tts", v).apply()

    var notifyOn: Boolean
        get() = prefs.getBoolean("notify", true)
        set(v) = prefs.edit().putBoolean("notify", v).apply()

    // 기록: 최신이 위, 최대 200건
    fun history(): List<String> = readList("history")
    fun addHistory(line: String) = pushList("history", line, 200)
    fun clearHistory() = prefs.edit().remove("history").apply()

    // 진단용: 최근 받은 모든 알림 20건 (어떤 문구로 오는지 확인용)
    fun recentRaw(): List<String> = readList("raw")
    fun addRaw(line: String) = pushList("raw", line, 20)

    private fun readList(key: String): List<String> =
        prefs.getString(key, "")!!.split(SEP).filter { it.isNotEmpty() }

    private fun pushList(key: String, line: String, max: Int) {
        val list = (listOf(line.replace(SEP, " ")) + readList(key)).take(max)
        prefs.edit().putString(key, list.joinToString(SEP)).apply()
    }

    companion object { private const val SEP = "\u001E" }
}
