package com.caralert

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

class MainActivity : Activity() {

    private lateinit var store: Store
    private lateinit var status: TextView
    private lateinit var historyView: TextView
    private lateinit var rawView: TextView
    private var tts: TextToSpeech? = null

    private val prefListener = SharedPreferences.OnSharedPreferenceChangeListener { _, k ->
        if (k == "history" || k == "raw" || k == "my_plates" || k?.startsWith("state_") == true)
            runOnUiThread { refreshLists() }
    }
    private lateinit var homeBox: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        CarNotificationListener.createChannel(this)
        tts = TextToSpeech(this) { if (it == TextToSpeech.SUCCESS) tts?.language = Locale.KOREAN }

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(40))
        }
        setContentView(ScrollView(this).apply { addView(root) })

        root.addView(text("🚗 입출차 알리미", 24f, bold = true))
        root.addView(text("아파트 앱 알림에서 입차·출차를 찾아 음성과 알림으로 알려줍니다.", 14f, Color.GRAY))

        // ── 지금 집에 누가 ──
        section(root, "🏠 지금 집에 누가 있나")
        homeBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(homeBox)
        root.addView(text("알림을 놓쳐서 틀렸으면 '집/외출' 버튼으로 직접 고치세요.", 12f, Color.GRAY))

        // ── 권한 ──
        section(root, "1. 권한")
        status = text("", 15f).also { root.addView(it) }
        root.addView(button("알림 접근 허용하러 가기") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        })
        root.addView(button("배터리 최적화 해제 (꺼짐 방지)") {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        })

        // ── 설정 ──
        section(root, "2. 설정")
        val inKw = field(root, "입차 키워드 (쉼표 구분)", store.inKeywords)
        val outKw = field(root, "출차 키워드 (쉼표 구분)", store.outKeywords)
        val app = field(root, "감시할 앱 이름 (예: 아파트아이, 아파트너) · 비우면 전체", store.appFilter)
        val plates = field(root, "우리 집 차량 '번호=이름' (예: 12가3456=아빠, 5678=엄마)", store.myPlates)
        val ttsSw = Switch(this).apply { text = "음성으로 읽어주기"; isChecked = store.ttsOn }
        val notiSw = Switch(this).apply { text = "알림으로 다시 띄우기"; isChecked = store.notifyOn }
        root.addView(ttsSw); root.addView(notiSw)
        root.addView(button("저장") {
            store.inKeywords = inKw.text.toString()
            store.outKeywords = outKw.text.toString()
            store.appFilter = app.text.toString()
            store.myPlates = plates.text.toString()
            store.ttsOn = ttsSw.isChecked
            store.notifyOn = notiSw.isChecked
            CarNotificationListener.updateStatus(this, store)
            toast("저장했습니다")
        })

        // ── 테스트 ──
        section(root, "3. 테스트")
        val sample = field(root, "알림 문구를 넣어 인식되는지 확인", "[아파트] 12가3456 차량이 입차하였습니다.")
        root.addView(button("인식 테스트") {
            val ev = CarParser.parse(
                sample.text.toString(),
                CarParser.splitList(inKw.text.toString()),
                CarParser.splitList(outKw.text.toString())
            )
            if (ev == null) toast("입차/출차 키워드를 찾지 못했습니다")
            else {
                val msg = CarNotificationListener.spokenText(ev)
                toast("인식됨: ${ev.type.label} / 번호 ${ev.plate ?: "없음"}")
                if (ttsSw.isChecked) tts?.speak(msg, TextToSpeech.QUEUE_FLUSH, null, "test")
            }
        })

        // ── 기록 ──
        section(root, "4. 입출차 기록")
        historyView = text("", 14f).also { root.addView(it) }
        root.addView(button("기록 지우기") { store.clearHistory() })

        section(root, "5. 최근 받은 알림 (진단용)")
        root.addView(text("아파트 앱 알림이 어떤 문구로 오는지 여기서 확인하고 키워드·앱 이름을 맞추세요.", 13f, Color.GRAY))
        rawView = text("", 12f, Color.DKGRAY).also { root.addView(it) }
    }

    override fun onResume() {
        super.onResume()
        store.prefs.registerOnSharedPreferenceChangeListener(prefListener)
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?.contains(packageName) == true
        status.text = if (enabled) "✅ 알림 접근 허용됨 — 감시 중" else "⚠️ 알림 접근이 꺼져 있습니다. 아래 버튼으로 허용해 주세요."
        status.setTextColor(if (enabled) Color.rgb(0, 130, 60) else Color.rgb(200, 60, 0))
        refreshLists()
    }

    override fun onPause() {
        store.prefs.unregisterOnSharedPreferenceChangeListener(prefListener)
        super.onPause()
    }

    override fun onDestroy() { tts?.shutdown(); super.onDestroy() }

    private fun refreshHome() {
        homeBox.removeAllViews()
        val cars = store.cars()
        if (cars.isEmpty()) {
            homeBox.addView(text("아래 설정에 '번호=이름'으로 차량 2대를 등록하세요.", 15f, Color.GRAY))
            return
        }
        for (car in cars) {
            val st = store.getState(car)
            val (label, color) = when (st?.first) {
                CarParser.Type.IN -> "🏠 ${car.name} — 집 (${st!!.second} 입차)" to Color.rgb(0, 130, 60)
                CarParser.Type.OUT -> "🚗 ${car.name} — 외출 (${st!!.second} 출차)" to Color.rgb(200, 90, 0)
                null -> "❔ ${car.name} — 기록 없음" to Color.GRAY
            }
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(text(label, 17f, color, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            row.addView(button("집") { setManual(car, CarParser.Type.IN) })
            row.addView(button("외출") { setManual(car, CarParser.Type.OUT) })
            homeBox.addView(row)
        }
    }

    private fun setManual(car: CarParser.Car, type: CarParser.Type) {
        store.setState(car, type, CarNotificationListener.now() + " 수동")
        CarNotificationListener.updateStatus(this, store)
    }

    private fun refreshLists() {
        refreshHome()
        historyView.text = store.history().joinToString("\n").ifEmpty { "아직 기록이 없습니다." }
        rawView.text = store.recentRaw().joinToString("\n\n").ifEmpty { "아직 받은 알림이 없습니다." }
    }

    // ── 간단 UI 헬퍼 ──
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float, color: Int = Color.BLACK, bold: Boolean = false) =
        TextView(this).apply {
            text = s; textSize = size; setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(4), 0, dp(4))
        }

    private fun section(root: LinearLayout, title: String) {
        root.addView(View(this).apply {
            setBackgroundColor(Color.LTGRAY)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1))
                .apply { topMargin = dp(20); bottomMargin = dp(8) }
        })
        root.addView(text(title, 18f, bold = true))
    }

    private fun field(root: LinearLayout, label: String, value: String): EditText {
        root.addView(text(label, 13f, Color.GRAY))
        return EditText(this).apply {
            setText(value)
            inputType = InputType.TYPE_CLASS_TEXT
        }.also { root.addView(it) }
    }

    private fun button(label: String, onClick: () -> Unit) =
        Button(this).apply { text = label; setOnClickListener { onClick() } }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
