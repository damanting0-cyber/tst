package com.caralert

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Icon
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
        store.addHistory("${stamp()}\t${hit.title.substringBeforeLast(' ')}\t${hit.title.substringAfterLast(' ')}")

        if (store.notifyOn) {
            if (car != null) postStatus(this, store, event = hit.title)
            else postSingle(this, hit.title, full)
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

        private fun bitmap(ctx: Context, res: Int): Bitmap {
            val d = ctx.getDrawable(res)!!
            val size = (64 * ctx.resources.displayMetrics.density).toInt()
            return Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).also {
                d.setBounds(0, 0, size, size)
                d.draw(Canvas(it))
            }
        }

        private fun openApp(ctx: Context) = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        /**
         * 집 현황 알림 (한 개를 계속 갱신)
         *   아빠 : X ( 16:08~ )
         *   엄마 : O ( 13:47~ )
         * event 가 있으면 소리/진동, 없으면(수동 변경) 조용히 갱신
         */
        fun postStatus(ctx: Context, store: Store, event: String? = null) {
            val lines = store.statusLines()
            if (lines.isEmpty()) return
            val large = if (store.anyoneHome()) R.drawable.ic_large_home else R.drawable.ic_large_away
            val rest = lines.drop(1).joinToString("\n")
            val b = Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_car)
                .setLargeIcon(Icon.createWithBitmap(bitmap(ctx, large)))
                .setColor(if (store.anyoneHome()) 0xFF16A34A.toInt() else 0xFF475569.toInt())
                .setContentTitle(lines[0])
                .setContentText(rest)
                .setContentIntent(openApp(ctx))
                .setOngoing(true)
                .setShowWhen(event != null)
                .setOnlyAlertOnce(event == null)
            if (lines.size > 2) b.setStyle(Notification.BigTextStyle().bigText(rest))
            if (event != null) b.setSubText(event)
            try {
                ctx.getSystemService(NotificationManager::class.java).notify(STATUS_ID, b.build())
            } catch (_: SecurityException) { /* 알림 권한 없음 */ }
        }

        /** 차량 미등록 상태에서 들어온 입출차 알림 */
        private fun postSingle(ctx: Context, title: String, raw: String) {
            val n = Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_car)
                .setLargeIcon(Icon.createWithBitmap(bitmap(ctx, R.drawable.ic_large_away)))
                .setContentTitle(title)
                .setContentText(raw)
                .setContentIntent(openApp(ctx))
                .setAutoCancel(true)
                .build()
            try {
                ctx.getSystemService(NotificationManager::class.java)
                    .notify((System.currentTimeMillis() % 1_000_000).toInt() + 10, n)
            } catch (_: SecurityException) { }
        }
    }
}
