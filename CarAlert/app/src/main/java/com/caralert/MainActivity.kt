package com.caralert

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

class MainActivity : Activity() {

    // ── 색상 ──
    private val BG = Color.parseColor("#F2F3F5")
    private val CARD = Color.WHITE
    private val TEXT = Color.parseColor("#111111")
    private val SUB = Color.parseColor("#6B7280")
    private val LINE = Color.parseColor("#E5E7EB")
    private val HOME = Color.parseColor("#16A34A")
    private val AWAY = Color.parseColor("#9CA3AF")
    private val WARN = Color.parseColor("#DC2626")

    private lateinit var store: Store
    private var tts: TextToSpeech? = null

    private lateinit var summaryView: TextView
    private lateinit var detailView: TextView
    private lateinit var permCard: LinearLayout
    private lateinit var familyBox: LinearLayout
    private lateinit var historyBox: LinearLayout
    private lateinit var rawView: TextView
    private lateinit var advancedBox: LinearLayout

    private val prefListener = SharedPreferences.OnSharedPreferenceChangeListener { _, k ->
        if (k == "history" || k == "raw" || k == "my_plates" || k?.startsWith("state_") == true)
            runOnUiThread { refresh() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        CarNotificationListener.createChannel(this)
        tts = TextToSpeech(this) { if (it == TextToSpeech.SUCCESS) tts?.language = Locale.KOREAN }

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        window.statusBarColor = BG
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(28), dp(18), dp(48))
        }
        setContentView(ScrollView(this).apply {
            setBackgroundColor(BG)
            isVerticalScrollBarEnabled = false
            addView(root)
            // 안드로이드 15 전체화면 대응: 상태바·내비바 높이만큼 여백
            setOnApplyWindowInsetsListener { _, insets ->
                @Suppress("DEPRECATION")
                root.setPadding(dp(18), dp(20) + insets.systemWindowInsetTop,
                                dp(18), dp(40) + insets.systemWindowInsetBottom)
                insets
            }
        })

        // ── 헤더: 현재 상황 ──
        root.addView(label("입출차 알리미", 14f, SUB).pad(4, 0, 4, 6))
        summaryView = label("", 26f, TEXT, bold = true).pad(4, 0, 4, 4)
        detailView = label("", 14f, SUB).pad(4, 0, 4, 20)
        root.addView(summaryView); root.addView(detailView)

        // ── 권한 경고 (꺼져 있을 때만) ──
        permCard = card(root).apply {
            addView(label("알림 접근이 꺼져 있습니다", 16f, WARN, bold = true))
            addView(label("아파트 앱 알림을 읽으려면 권한이 필요합니다.", 14f, SUB).pad(0, 4, 0, 12))
            addView(primaryButton("알림 접근 허용") {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            })
        }

        // ── 가족 현황 ──
        card(root).apply {
            addView(title("가족 현황"))
            familyBox = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
            addView(familyBox)
            addView(label("알림을 놓쳐 상태가 틀리면 직접 바꿔 주세요.", 12f, SUB).pad(0, 10, 0, 0))
        }

        // ── 기록 ──
        card(root).apply {
            val head = row()
            head.addView(title("기록").weight())
            head.addView(textButton("지우기") { store.clearHistory() })
            addView(head)
            historyBox = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
            addView(historyBox)
        }

        // ── 설정 ──
        val inKw: EditText; val outKw: EditText; val app: EditText; val plates: EditText
        val ttsSw: Switch; val notiSw: Switch
        card(root).apply {
            addView(title("설정"))
            plates = field(this, "우리 집 차량", "12가3456=아빠, 5678=엄마", store.myPlates)
            app = field(this, "감시할 앱 (비우면 전체)", "아파트아이", store.appFilter)
            inKw = field(this, "입차 키워드", "입차, 들어왔", store.inKeywords)
            outKw = field(this, "출차 키워드", "출차, 나갔", store.outKeywords)
            ttsSw = switch(this, "음성으로 읽어주기", store.ttsOn)
            notiSw = switch(this, "알림 띄우기", store.notifyOn)
            addView(primaryButton("저장") {
                store.inKeywords = inKw.text.toString()
                store.outKeywords = outKw.text.toString()
                store.appFilter = app.text.toString()
                store.myPlates = plates.text.toString()
                store.ttsOn = ttsSw.isChecked
                store.notifyOn = notiSw.isChecked
                CarNotificationListener.updateStatus(this@MainActivity, store)
                toast("저장했습니다")
            }.margin(top = 12))
            addView(secondaryButton("배터리 최적화 해제") {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }.margin(top = 8))
        }

        // ── 고급 (접힘) ──
        val advToggle = textButton("고급 설정 보기") {}
        root.addView(advToggle.apply { gravity = Gravity.CENTER }.margin(top = 4, bottom = 8))
        advancedBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
        }
        root.addView(advancedBox)
        advToggle.setOnClickListener {
            val show = advancedBox.visibility != View.VISIBLE
            advancedBox.visibility = if (show) View.VISIBLE else View.GONE
            advToggle.text = if (show) "고급 설정 숨기기" else "고급 설정 보기"
        }

        card(advancedBox).apply {
            addView(title("인식 테스트"))
            val sample = field(this, "알림 문구", "", "[아파트] 12가3456 차량이 입차하였습니다.")
            addView(secondaryButton("테스트") {
                val ev = CarParser.parse(
                    sample.text.toString(),
                    CarParser.splitList(inKw.text.toString()),
                    CarParser.splitList(outKw.text.toString())
                )
                if (ev == null) toast("입차/출차 키워드를 찾지 못했습니다")
                else {
                    val car = CarParser.matchCar(ev.plate, CarParser.parseCars(plates.text.toString()))
                    val title = CarNotificationListener.titleText(ev, car)
                    toast("인식됨: $title")
                    if (ttsSw.isChecked) tts?.speak(title, TextToSpeech.QUEUE_FLUSH, null, "test")
                }
            }.margin(top = 8))
        }
        card(advancedBox).apply {
            addView(title("최근 받은 알림"))
            addView(label("아파트 앱이 어떤 문구로 보내는지 확인하고 키워드를 맞추세요.", 12f, SUB).pad(0, 0, 0, 8))
            rawView = label("", 12f, SUB)
            addView(rawView)
        }
    }

    override fun onResume() {
        super.onResume()
        store.prefs.registerOnSharedPreferenceChangeListener(prefListener)
        refresh()
    }

    override fun onPause() {
        store.prefs.unregisterOnSharedPreferenceChangeListener(prefListener)
        super.onPause()
    }

    override fun onDestroy() { tts?.shutdown(); super.onDestroy() }

    // ── 화면 갱신 ──
    private fun refresh() {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            ?.contains(packageName) == true
        permCard.visibility = if (enabled) View.GONE else View.VISIBLE

        summaryView.text = store.summary()
        detailView.text = if (store.cars().isEmpty()) "아래 설정에서 차량을 등록하세요"
                          else CarNotificationListener.detailText(store)

        // 가족 현황
        familyBox.removeAllViews()
        val cars = store.cars()
        if (cars.isEmpty()) familyBox.addView(label("등록된 차량이 없습니다.", 14f, SUB).pad(0, 8, 0, 0))
        cars.forEachIndexed { i, car ->
            if (i > 0) familyBox.addView(divider())
            val st = store.getState(car)
            val home = st?.first == CarParser.Type.IN
            val r = row().pad(0, 12, 0, 12)
            r.addView(View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(if (st == null) LINE else if (home) HOME else AWAY)
                }
                layoutParams = LinearLayout.LayoutParams(dp(10), dp(10)).apply { rightMargin = dp(12) }
            })
            val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            texts.addView(label(car.name, 17f, TEXT, bold = true))
            texts.addView(label(
                when {
                    st == null -> "기록 없음"
                    home -> "집 · ${st.second} 입차"
                    else -> "외출 · ${st.second} 출차"
                }, 13f, SUB
            ))
            r.addView(texts.weight())
            r.addView(segmented(home, st != null,
                onHome = { setManual(car, CarParser.Type.IN) },
                onAway = { setManual(car, CarParser.Type.OUT) }))
            familyBox.addView(r)
        }

        // 기록 (새 형식만 표시: 시각 \t 이름 \t 입차/출차)
        historyBox.removeAllViews()
        val hist = store.history().filter { it.count { c -> c == '\t' } == 2 }.take(30)
        if (hist.isEmpty()) historyBox.addView(label("아직 기록이 없습니다.", 14f, SUB).pad(0, 8, 0, 0))
        hist.forEachIndexed { i, line ->
            if (i > 0) historyBox.addView(divider())
            val (time, who, type) = line.split('\t')
            val r = row().pad(0, 10, 0, 10)
            r.addView(label(time, 13f, SUB).apply {
                layoutParams = LinearLayout.LayoutParams(dp(96), WRAP_CONTENT)
            })
            r.addView(label(who, 15f, TEXT, bold = true).weight())
            r.addView(label(type, 14f, if (type == "입차") HOME else SUB, bold = true))
            historyBox.addView(r)
        }

        rawView.text = store.recentRaw().joinToString("\n\n").ifEmpty { "아직 받은 알림이 없습니다." }
    }

    private fun setManual(car: CarParser.Car, type: CarParser.Type) {
        store.setState(car, type, CarNotificationListener.now())
        CarNotificationListener.updateStatus(this, store)
    }

    // ── UI 헬퍼 ──
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun rounded(color: Int, radius: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
        stroke?.let { setStroke(dp(1), it) }
    }

    private fun ripple(bg: GradientDrawable) =
        RippleDrawable(ColorStateList.valueOf(Color.parseColor("#22000000")), bg, null)

    private fun label(s: String, size: Float, color: Int, bold: Boolean = false) =
        TextView(this).apply {
            text = s; textSize = size; setTextColor(color)
            if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            setLineSpacing(0f, 1.15f)
        }

    private fun title(s: String) = label(s, 18f, TEXT, bold = true).pad(0, 0, 0, 6)

    private fun card(parent: LinearLayout) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = rounded(CARD, 18)
        elevation = dp(1).toFloat()
        setPadding(dp(18), dp(16), dp(18), dp(16))
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = dp(14) }
        parent.addView(this)
    }

    private fun row() = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }

    private fun divider() = View(this).apply {
        setBackgroundColor(LINE)
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, dp(1))
    }

    private fun primaryButton(s: String, onClick: () -> Unit) = TextView(this).apply {
        text = s; textSize = 15f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
        typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        background = ripple(rounded(TEXT, 12))
        setPadding(0, dp(14), 0, dp(14))
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        setOnClickListener { onClick() }
    }

    private fun secondaryButton(s: String, onClick: () -> Unit) = TextView(this).apply {
        text = s; textSize = 15f; setTextColor(TEXT); gravity = Gravity.CENTER
        background = ripple(rounded(Color.parseColor("#F3F4F6"), 12))
        setPadding(0, dp(13), 0, dp(13))
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        setOnClickListener { onClick() }
    }

    private fun textButton(s: String, onClick: () -> Unit) = TextView(this).apply {
        text = s; textSize = 14f; setTextColor(SUB)
        setPadding(dp(8), dp(6), dp(8), dp(6))
        setOnClickListener { onClick() }
    }

    /** 집 / 외출 두 칸 토글 */
    private fun segmented(home: Boolean, known: Boolean, onHome: () -> Unit, onAway: () -> Unit) =
        row().apply {
            background = rounded(Color.parseColor("#F3F4F6"), 10)
            setPadding(dp(3), dp(3), dp(3), dp(3))
            fun seg(s: String, active: Boolean, click: () -> Unit) = TextView(this@MainActivity).apply {
                text = s; textSize = 13f; gravity = Gravity.CENTER
                setTextColor(if (active) TEXT else SUB)
                if (active) {
                    typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
                    background = rounded(Color.WHITE, 8)
                    elevation = dp(1).toFloat()
                }
                setPadding(dp(14), dp(6), dp(14), dp(6))
                setOnClickListener { click() }
            }
            addView(seg("집", known && home, onHome))
            addView(seg("외출", known && !home, onAway))
        }

    private fun field(parent: LinearLayout, labelText: String, hint: String, value: String): EditText {
        parent.addView(label(labelText, 13f, SUB).pad(0, 12, 0, 6))
        return EditText(this).apply {
            setText(value); this.hint = hint; textSize = 15f
            setTextColor(TEXT); setHintTextColor(Color.parseColor("#B0B5BD"))
            inputType = InputType.TYPE_CLASS_TEXT
            background = rounded(Color.parseColor("#F9FAFB"), 10, LINE)
            setPadding(dp(12), dp(11), dp(12), dp(11))
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        }.also { parent.addView(it) }
    }

    private fun switch(parent: LinearLayout, s: String, checked: Boolean) = Switch(this).apply {
        text = s; textSize = 15f; setTextColor(TEXT); isChecked = checked
        setPadding(0, dp(10), 0, dp(4))
        thumbTintList = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(Color.WHITE, Color.WHITE)
        )
        trackTintList = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(TEXT, Color.parseColor("#D1D5DB"))
        )
    }.also { parent.addView(it) }

    private fun <T : View> T.pad(l: Int, t: Int, r: Int, b: Int): T =
        apply { setPadding(dp(l), dp(t), dp(r), dp(b)) }

    private fun <T : View> T.weight(): T = apply {
        layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
    }

    private fun <T : View> T.margin(top: Int = 0, bottom: Int = 0): T = apply {
        val lp = (layoutParams as? LinearLayout.LayoutParams)
            ?: LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
        lp.topMargin = dp(top); lp.bottomMargin = dp(bottom)
        layoutParams = lp
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
