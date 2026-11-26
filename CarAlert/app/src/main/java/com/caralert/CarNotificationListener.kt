package com.caralert

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.widget.RemoteViews
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.speech.tts.TextToSpeech
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 휴대폰 알림을 받아 Rust 코어에 넘기는 서비스.
 * (안드로이드에서 다른 앱 알림을 읽는 클래스는 Kotlin/Java 로만 만들 수 있어 이 부분만 Kotlin)
 */
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
        store.addRaw("${stamp()}  [$appName] $full")

        // 앱 필터
        val filters = store.appFilter.split(',').map { it.trim() }.filter { it.isNotEmpty() }
        if (filters.isNotEmpty() && filters.none {
                sbn.packageName.contains(it, true) || appName.contains(it, true)
            }) return

        // 해석은 Rust 코어에서
        val hit = Core.parse(full, store.inKeywords, store.outKeywords, store.myPlates) ?: return
        val cars = store.cars()
        if (cars.isNotEmpty() && hit.index < 0) return   // 등록 차량만

        // 같은 내용이 60초 안에 또 오면 무시
        val key = "${hit.type}|${hit.plate.ifEmpty { full }}"
        val t = System.currentTimeMillis()
        if (t - (recent[key] ?: 0L) < 60_000) return
        recent[key] = t

        val car = cars.getOrNull(hit.index)
        if (car != null) store.setState(car, hit.isIn, t)
        if (!hit.isIn) store.setLastOut(car?.name ?: hit.plate.ifEmpty { "차량" }, t)
        store.addHistory("${stamp()}\t${hit.title.substringBeforeLast(' ')}\t${hit.title.substringAfterLast(' ')}")

        if (store.notifyOn) {
            postStatus(this, store, alert = true)
        }
        if (store.ttsOn) speak(Core.spoken(hit.title, car != null, store.summary()))
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
        private const val STATUS_ID = 1

        fun stamp(): String = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date())

        fun createChannel(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "입출차 알림", NotificationManager.IMPORTANCE_HIGH)
            )
            nm.deleteNotificationChannel("home_status") // 예전 버전의 별도 현황 채널 정리
        }

        private fun openApp(ctx: Context) = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        /**
         * 직접 디자인한 알림 (항상 한 개만 유지)
         *   제목: 가장 최근 출차   "16:08 아빠 출차"
         *   내용: 집에 있는 사람   "현재 아빠가 집에 있습니다"
         * alert = 새 입출차 인식 → 기존 알림을 지우고 새로 띄움(소리/진동)
         * alert = false → 기존 알림 내용만 조용히 갱신 (앱에서 수동 변경 등)
         */
        fun postStatus(ctx: Context, store: Store, alert: Boolean = false) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            val title = store.lastOutTitle()
            val text = store.summary()
            val icon = if (store.anyoneHome()) R.drawable.ic_large_home else R.drawable.ic_large_away

            val view = RemoteViews(ctx.packageName, R.layout.notif_status).apply {
                setTextViewText(R.id.n_title, title)
                setTextViewText(R.id.n_text, text)
                setImageViewResource(R.id.n_icon, icon)
            }
            val n = Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_car)
                .setColor(if (store.anyoneHome()) 0xFF16A34A.toInt() else 0xFF475569.toInt())
                .setStyle(Notification.DecoratedCustomViewStyle())
                .setCustomContentView(view)
                .setCustomBigContentView(view)
                .setContentTitle(title)   // 잠금화면·워치 등 기본 표시용
                .setContentText(text)
                .setContentIntent(openApp(ctx))
                .setOngoing(true)
                .setShowWhen(alert)
                .setOnlyAlertOnce(!alert)
                .build()
            try {
                if (alert) nm.cancelAll()   // 이 앱이 띄운 기존 알림 모두 삭제 후 새로
                nm.notify(STATUS_ID, n)
            } catch (_: SecurityException) { /* 알림 권한 없음 */ }
        }
    }
}
