package com.caralert

/** 알림 문구에서 입차/출차와 차량번호를 뽑아내는 순수 로직 */
object CarParser {

    enum class Type(val label: String) { IN("입차"), OUT("출차") }

    data class Event(val type: Type, val plate: String?)

    // 12가3456, 123가 4567, 서울12가3456 등
    private val PLATE = Regex("""(?:[가-힣]{2}\s?)?(\d{2,3})\s?([가-힣])\s?(\d{4})""")

    fun splitList(s: String): List<String> =
        s.split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }

    fun parse(text: String, inKeywords: List<String>, outKeywords: List<String>): Event? {
        // '입출차 알림' 같은 제목 때문에 둘 다 걸리는 것 방지
        val t = text.replace("입출차", " ").replace("입·출차", " ")

        val inPos = inKeywords.mapNotNull { k -> t.indexOf(k).takeIf { it >= 0 } }.minOrNull()
        val outPos = outKeywords.mapNotNull { k -> t.indexOf(k).takeIf { it >= 0 } }.minOrNull()

        val type = when {
            inPos == null && outPos == null -> return null
            outPos == null -> Type.IN
            inPos == null -> Type.OUT
            else -> if (inPos <= outPos) Type.IN else Type.OUT
        }
        return Event(type, extractPlate(text))
    }

    fun extractPlate(text: String): String? =
        PLATE.find(text)?.let { it.groupValues[1] + it.groupValues[2] + it.groupValues[3] }

    /** 등록 차량: 번호(또는 뒷 4자리)와 이름 */
    data class Car(val plate: String, val name: String) {
        val key get() = plate
    }

    /** "12가3456=아빠, 5678=엄마" → Car 목록 */
    fun parseCars(s: String): List<Car> = splitList(s).map { item ->
        val parts = item.split('=', ':')
        val plate = parts[0].replace(" ", "")
        val name = parts.getOrNull(1)?.trim()?.ifEmpty { null } ?: plate
        Car(plate, name)
    }

    /** 알림에서 뽑은 번호가 등록 차량 중 어느 것인지 (뒷 4자리만 등록해도 매칭) */
    fun matchCar(plate: String?, cars: List<Car>): Car? {
        if (plate == null) return null
        val p = plate.replace(" ", "")
        return cars.firstOrNull { p == it.plate || p.endsWith(it.plate) }
    }
}
