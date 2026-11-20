package com.caralert

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.speech.tts.TextToSpeech
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 휴대폰에 뜨는 모든 알림을 받아서 입차/출차 문구를 찾는 서비스 */
class CarNotificationListener : NotificationListenerService() {

    private lateinit var store: Store
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val pendingSpeech = mutableListOf<String>()
    private val recent = HashMap<String, Long>() // 중복 알림 방지

    override fun onCreate() {
        super.onCreate()
        store = Store(this)
        createChannel(this)
        tts = TextToSpeech(this) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                tts?.language = Locale.KOREAN
                pendingSpeech.forEach { speak(it) }
                pendingSpeech.clear()
            }
        }
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return

        val ex = sbn.notification.extras
        val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val body = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        val full = "$title $body".trim()
        if (full.isEmpty()) return

        val appName = appLabel(sbn.packageName)
        store.addRaw("${now()}  [$appName] $full")

        // 앱 필터
        val filters = CarParser.splitList(store.appFilter)
        if (filters.isNotEmpty() && filters.none {
                sbn.packageName.contains(it, true) || appName.contains(it, true)
            }) return

        val ev = CarParser.parse(
            full,
            CarParser.splitList(store.inKeywords),
            CarParser.splitList(store.outKeywords)
        ) ?: return

        // 우리 집 차량이 등록돼 있으면 그 차량만 처리
        val cars = store.cars()
        val car = CarParser.matchCar(ev.plate, cars)
        if (cars.isNotEmpty() && car == null) return

        // 같은 내용이 60초 안에 또 오면 무시 (알림 갱신·중복 대비)
        val key = "${ev.type}|${ev.plate ?: full}"
        val t = System.currentTimeMillis()
        if (t - (recent[key] ?: 0L) < 60_000) return
        recent[key] = t

        if (car != null) store.setState(car, ev.type, now())
        announce(this, store, ev, car, appName, full)
        if (store.ttsOn) speak(spokenText(ev, car, store))
    }

    private fun speak(text: String) {
        if (!ttsReady) { pendingSpeech += text; return }
        tts?.speak(text, TextToSpeech.QUEUE_ADD, null, "car-${System.nanoTime()}")
    }

    private fun appLabel(pkg: String): String = try {
        val pm = packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) { pkg }

    companion object {
        const val CHANNEL = "car_inout"

        fun now(): String = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())

        const val STATUS_ID = 1

        /** 알림 제목: "아빠 입차" */
        fun titleText(ev: CarParser.Event, car: CarParser.Car?): String =
            "${car?.name ?: ev.plate ?: "차량"} ${ev.type.label}"

        /** 음성: "아빠 입차. 현재 아빠가 집에 있습니다." */
        fun spokenText(ev: CarParser.Event, car: CarParser.Car? = null, store: Store? = null): String {
            if (car != null && store != null) return "${titleText(ev, car)}. ${store.summary()}."
            val plate = ev.plate?.let { p ->
                // 뒷자리 4숫자는 하나씩 읽게 띄어쓰기
                p.dropLast(4) + " " + p.takeLast(4).toCharArray().joinToString(" ")
            } ?: "차량"
            return "$plate ${ev.type.label}."
        }

        /** 차량별 마지막 기록: "아빠 08:30 입차 · 엄마 07:50 출차" */
        fun detailText(store: Store): String = store.cars().joinToString(" · ") { car ->
            val st = store.getState(car)
            if (st == null) "${car.name} 기록 없음"
            else "${car.name} ${st.second.substringAfter(' ')} ${st.first.label}"
        }

        /** 알림창에 고정되는 집 현황 알림 */
        fun updateStatus(ctx: Context, store: Store) {
            if (store.cars().isEmpty()) return
            val open = PendingIntent.getActivity(
                ctx, 1, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val n = Notification.Builder(ctx, STATUS_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_myplaces)
                .setContentTitle(store.summary())
                .setContentText(detailText(store))
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build()
            try {
                ctx.getSystemService(NotificationManager::class.java).notify(STATUS_ID, n)
            } catch (_: SecurityException) { }
        }

        const val STATUS_CHANNEL = "home_status"

        fun createChannel(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "입출차 알림", NotificationManager.IMPORTANCE_HIGH)
            )
            nm.createNotificationChannel(
                NotificationChannel(STATUS_CHANNEL, "집 현황 (고정)", NotificationManager.IMPORTANCE_LOW)
            )
        }

        /** 기록 저장 + 알림 표시. 기록 형식: 시각\t이름\t입차/출차 */
        fun announce(
            ctx: Context, store: Store, ev: CarParser.Event,
            car: CarParser.Car?, app: String, raw: String
        ) {
            val who = car?.name ?: ev.plate ?: "번호 없음"
            store.addHistory("${now()}\t$who\t${ev.type.label}")
            updateStatus(ctx, store)

            if (!store.notifyOn) return
            val open = PendingIntent.getActivity(
                ctx, 0, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val body = if (car != null) store.summary() else raw
            val n = Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_directions)
                .setContentTitle(titleText(ev, car))
                .setContentText(body)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try {
                ctx.getSystemService(NotificationManager::class.java)
                    .notify((System.currentTimeMillis() % 1_000_000).toInt() + 10, n)
            } catch (_: SecurityException) { /* 알림 권한 없음 */ }
        }
    }
}
