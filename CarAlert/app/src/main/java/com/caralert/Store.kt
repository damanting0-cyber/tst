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

    fun cars(): List<Core.Car> = Core.carList(myPlates)

    // 차량별 현재 상태 "IN|시각(ms)": 마지막이 입차면 집, 출차면 외출
    fun setState(car: Core.Car, isIn: Boolean, ms: Long = System.currentTimeMillis()) =
        prefs.edit().putString("state_${car.plate}", "${if (isIn) "IN" else "OUT"}|$ms").apply()

    /** (집에 있음?, 시각ms 또는 null) / 기록 없으면 null */
    fun getState(car: Core.Car): Pair<Boolean, Long?>? {
        val v = prefs.getString("state_${car.plate}", null) ?: return null
        val (t, time) = (v.split('|', limit = 2) + "").take(2)
        return (t == "IN") to time.toLongOrNull()
    }

    /** 등록 차량 순서대로 상태를 한 줄씩 (Rust 에 넘기는 형식) */
    fun statesText(): String =
        cars().joinToString("\n") { prefs.getString("state_${it.plate}", "")!! }

    fun anyoneHome(): Boolean = cars().any { getState(it)?.first == true }

    /** "현재 아빠가 집에 있습니다" */
    fun summary(): String = Core.summary(myPlates, statesText())

    /** ["아빠 : X ( 16:08~ )", "엄마 : O ( 13:47~ )"] */
    fun statusLines(): List<String> =
        Core.statusText(myPlates, statesText(), System.currentTimeMillis(), Core.tz())
            .split('\n').filter { it.isNotEmpty() }

    companion object {
        private const val SEP = "\u001E"
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

}
